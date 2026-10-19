import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { GET } from '@/app/api/stats/weekly/route'
import { remplacerLeHashHerite } from '@/lib/auth/herite'
import { type EvenementAuth, journaliser } from '@/lib/auth/journal'
import { stockageDePayload } from '@/lib/contact/envoi-payload'
import { StatsHebdo } from '@/lib/stats-hebdo'
import { adresseDuJeu, TYPES_DU_JEU } from '../fixtures/comptes'
import { poserLeJeuDuBanc } from '../fixtures/jeu-du-banc'
import { MOT_DE_PASSE_HERITE_DE_FIXTURE, TYPES_DE_COMPTE } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { viderLeStockage } from '../outils/s3'

/**
 * Ticket 169 (plan 04 §3.6; plan 01 §2.4 M6): the contact messages, the sign-ins and the inherited
 * hashes in GET /api/stats/weekly, on the set of the bench. One message in each state, sign-ins with
 * known durations, and the hashes the set promises.
 */

const JETON = 'jeton-de-service-du-banc-0123456789abcdef'
const avant = process.env.STATS_TOKEN
const ENTETES = { authorization: `Bearer ${JETON}` }

const lire = async (debut: Date, fin: Date) => {
	const url = `http://localhost/api/stats/weekly?from=${debut.toISOString()}&to=${fin.toISOString()}`
	const reponse = await GET(new Request(url, { headers: ENTETES }))
	expect(reponse.status).toBe(200)
	return StatsHebdo.parse(await reponse.json())
}

const autour = () => [new Date(Date.now() - 3_600_000), new Date(Date.now() + 3_600_000)] as const

/** The sign-ins written below: one duration each, 100 to 1 000 ms. */
const CONNEXIONS: EvenementAuth[] = [
	...Array.from({ length: 6 }, (_, i): EvenementAuth => ({ type: 'sign-in', code: 'ok', durationMs: 100 * (i + 1) })),
	{ type: 'sign-in', code: 'heritee', durationMs: 700 },
	{ type: 'sign-in', code: 'identifiants-invalides', durationMs: 800 },
	{ type: 'sign-in', code: 'identifiants-invalides', durationMs: 900 },
	{ type: 'sign-in', code: 'trop-de-tentatives', durationMs: 1000 },
]

beforeAll(async () => {
	process.env.STATS_TOKEN = JETON
	const payload = await payloadDeTest()
	await Promise.all([viderLaBase(), viderLeStockage()])
	await poserLeJeuDuBanc()
	// Creating the accounts of the set opened sessions: the journal and the messages start from zero.
	await payload.delete({ collection: 'auth-events', where: { id: { exists: true } }, overrideAccess: true })
	await payload.delete({ collection: 'contact-requests', where: { id: { exists: true } }, overrideAccess: true })

	const stockage = stockageDePayload(payload)
	const message = {
		prenom: 'Léa',
		nom: 'Témoin',
		email: 'visiteuse@example.test',
		telephone: '0199001234',
		message: 'Bonjour.',
	}
	const nouvelle = await stockage.creer(message)
	const transmise = await stockage.creer(message)
	const repondue = await stockage.creer(message)
	const spam = await stockage.creer(message)
	await stockage.marquer(transmise, 'sent', 'forwarded')
	await stockage.marquer(repondue, 'sent', 'answered')
	await stockage.marquer(spam, 'failed', 'spam')
	expect(nouvelle).toBeGreaterThan(0)

	for (const evenement of [...CONNEXIONS, { type: 'sign-out', code: 'ok', durationMs: 20_000 } as const])
		await journaliser(payload, evenement)
	// A row of 2020 and a sign-in with no duration: the first is out of the period, the second counts without a duration.
	await payload.create({
		collection: 'auth-events',
		data: { type: 'sign-in', code: 'ok', durationMs: 60_000, date: '2020-01-02T10:00:00.000Z' },
		overrideAccess: true,
	})
	await journaliser(payload, { type: 'sign-in', code: 'service-indisponible' })
}, 120_000)

afterAll(async () => {
	if (avant === undefined) delete process.env.STATS_TOKEN
	else process.env.STATS_TOKEN = avant
	await Promise.all([viderLaBase(), viderLeStockage()])
}, 60_000)

describe('Les statistiques hebdomadaires : messages de contact, connexions, comptes hérités', () => {
	test('un message par état : les nombres exacts, et zéro hors de la période', async () => {
		const stats = await lire(...autour())
		expect(stats.contact).toEqual({
			total: 4,
			parStatut: { nouvelle: 1, transmise: 1, repondue: 1, spam: 1 },
			parEtatMail: { 'en-attente': 1, envoye: 2, echec: 1 },
		})
		const ancien = await lire(new Date('2020-02-01T00:00:00Z'), new Date('2020-02-08T00:00:00Z'))
		expect(ancien.contact?.total).toBe(0)
		expect(Object.values(ancien.contact?.parStatut ?? {}).every(n => n === 0)).toBe(true)
	}, 60_000)

	test('les connexions par code et leur 95e centile ; les autres événements à part', async () => {
		const { auth } = await lire(...autour())
		const connexions = auth?.connexions
		expect(connexions?.total).toBe(CONNEXIONS.length + 1)
		expect(connexions?.parCode).toMatchObject({
			ok: 6,
			heritee: 1,
			'identifiants-invalides': 2,
			'trop-de-tentatives': 1,
			'service-indisponible': 1,
			'compte-bloque': 0,
		})
		// Ten durations, 100 to 1 000: the nearest rank of the 95th percentile is the tenth. The row of 2020, the
		// sign-out and the sign-in with no duration do not move it.
		expect(connexions?.dureeP95Ms).toBe(1000)
		expect(auth?.parType.connexion).toBe(CONNEXIONS.length + 1)
		expect(auth?.parType.deconnexion).toBe(1)
		expect(auth?.parType.inscription).toBe(0)
	}, 60_000)

	test('une période sans connexion : zéro, et pas de centile', async () => {
		const { auth } = await lire(new Date('2020-02-01T00:00:00Z'), new Date('2020-02-08T00:00:00Z'))
		expect(auth?.connexions.total).toBe(0)
		expect(auth?.connexions.dureeP95Ms).toBeNull()
		const du2janvier = await lire(new Date('2020-01-02T00:00:00Z'), new Date('2020-01-03T00:00:00Z'))
		expect(du2janvier.auth?.connexions).toMatchObject({ total: 1, dureeP95Ms: 60_000 })
	}, 60_000)

	test('ni IP, ni email, ni 9 chiffres dans les nouvelles clés', async () => {
		const { contact, auth, herites } = await lire(...autour())
		const texte = JSON.stringify({ contact, auth, herites })
		expect(texte).not.toContain('@')
		expect(texte).not.toMatch(/\d{9}/)
		expect(texte).not.toMatch(/\d+\.\d+\.\d+\.\d+/)
		for (const mot of ['visiteuse', 'Léa', 'Témoin', 'Bonjour', 'example.test']) expect(texte).not.toContain(mot)
	}, 60_000)

	test('les hash hérités restants et les comptes sans mot de passe, par fournisseur d’origine', async () => {
		const promis = Object.values(TYPES_DE_COMPTE).flatMap(type =>
			'reprise' in type && type.reprise ? [type.reprise] : []
		)
		const attenduSansHash = (fournisseur: 'google' | 'facebook') =>
			promis.filter(reprise => reprise.fournisseur === fournisseur && !reprise.hashHerite).length

		const { herites } = await lire(...autour())
		expect(herites?.hashRestants).toBe(promis.filter(reprise => reprise.hashHerite).length)
		expect(herites?.sansMotDePasseParFournisseur).toEqual({
			google: attenduSansHash('google'),
			facebook: attenduSansHash('facebook'),
			autre: 0,
		})
		// The fixed set holds every type of account once.
		expect(TYPES_DU_JEU.length).toBe(Object.keys(TYPES_DE_COMPTE).length)
	}, 60_000)

	test('la première connexion avec l’ancien mot de passe fait baisser le nombre de hash restants, et rien d’autre', async () => {
		const payload = await payloadDeTest()
		const avantLaConnexion = (await lire(...autour())).herites
		const accepte = await remplacerLeHashHerite(payload, {
			email: adresseDuJeu('reprise-avec-hash'),
			password: MOT_DE_PASSE_HERITE_DE_FIXTURE,
		})
		expect(accepte).toBe(true)
		const apres = (await lire(...autour())).herites
		expect(apres?.hashRestants).toBe((avantLaConnexion?.hashRestants ?? 0) - 1)
		expect(apres?.sansMotDePasseParFournisseur).toEqual(avantLaConnexion?.sansMotDePasseParFournisseur)
	}, 60_000)
})
