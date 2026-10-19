import { afterAll, describe, expect, test } from 'bun:test'
import { connecter } from '@/lib/auth/connexion'
import { creerFrein } from '@/lib/auth/frein'
import { ouvrirParMotDePasse } from '@/lib/auth/jeton'
import { CODES_EVENEMENT, journalDe, journaliser, TYPES_EVENEMENT } from '@/lib/auth/journal'
import { lancerLesTachesQuotidiennes } from '@/lib/taches/quotidiennes'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'

/**
 * The journal of the authentication events (ticket 077). Who may read it is in the access matrix
 * (tests/integration/payload-acces.test.ts); here, what is written, never what must not be, and the
 * purge.
 */

afterAll(async () => {
	await viderLaBase()
})

const MOT_DE_PASSE = 'aaaaaaaa'
const frein = creerFrein({ nom: 'essai-journal-int', limite: 1000, fenetreMs: 60_000 })
let n = 0
const adresse = () => new Headers({ 'x-forwarded-for': `192.0.2.${100 + (n++ % 100)}` })

async function lignes() {
	const payload = await payloadDeTest()
	return (await payload.find({ collection: 'auth-events', depth: 0, limit: 1000, pagination: false, sort: 'id' })).docs
}

async function ouvrirPar(payloadHeaders: Headers, email: unknown, password: unknown) {
	const payload = await payloadDeTest()
	return connecter({
		ouvrir: data => ouvrirParMotDePasse(payload, 'pros', data),
		headers: payloadHeaders,
		email,
		password,
		frein,
		journal: journalDe(payload),
	})
}

describe('une ligne par connexion, réussie ou refusée', () => {
	test('par le formulaire : une ligne « ok », une ligne « identifiants-invalides », et la date de dernière connexion', async () => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		const payload = await payloadDeTest()
		const avant = (await lignes()).length

		const reussie = await ouvrirPar(adresse(), compte.email, MOT_DE_PASSE)
		const refusee = await ouvrirPar(adresse(), compte.email, 'mauvais')

		expect(reussie.ok).toBe(true)
		expect(refusee).toEqual({ ok: false, code: 'identifiants-invalides' })
		const nouvelles = (await lignes()).slice(avant)
		expect(nouvelles.map(({ type, code }) => [type, code])).toEqual([
			['sign-in', 'ok'],
			['sign-in', 'identifiants-invalides'],
		])
		for (const ligne of nouvelles) {
			expect(typeof ligne.durationMs).toBe('number')
			expect(Number.isNaN(Date.parse(ligne.date))).toBe(false)
			expect(CODES_EVENEMENT).toContain(ligne.code)
			expect(TYPES_EVENEMENT).toContain(ligne.type)
		}
		const lecture = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0 })
		expect(Date.now() - Date.parse(lecture.lastSignInAt ?? '')).toBeLessThan(60_000)
	})

	test('par l’API REST : une ligne « ok », une « identifiants-invalides », une « trop-de-tentatives » quand le frein ferme', async () => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		const avant = (await lignes()).length
		const rest = (password: string, ip: string) =>
			appelerRest('POST', '/api/pros/login', {
				corps: { email: compte.email, password },
				enTetes: { 'x-forwarded-for': ip },
			})

		expect((await rest(MOT_DE_PASSE, '198.51.100.201')).statut).toBe(200)
		expect((await rest('mauvais', '198.51.100.201')).statut).toBe(401)
		for (let i = 0; i < 10; i++) await rest('mauvais', '198.51.100.202')
		expect((await rest('mauvais', '198.51.100.202')).statut).toBe(429)

		const codes = (await lignes()).slice(avant).map(({ code }) => code)
		expect(codes.filter(code => code === 'ok')).toHaveLength(1)
		expect(codes.filter(code => code === 'identifiants-invalides')).toHaveLength(11)
		expect(codes.filter(code => code === 'trop-de-tentatives')).toHaveLength(1)
		expect(codes).toHaveLength(13)
	})

	test('la date de dernière connexion est mise à jour par l’API REST aussi', async () => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		const payload = await payloadDeTest()
		await payload.update({ collection: 'pros', id: compte.id, data: { lastSignInAt: '2020-01-01T00:00:00.000Z' } })

		const reponse = await appelerRest('POST', '/api/pros/login', {
			corps: { email: compte.email, password: MOT_DE_PASSE },
			enTetes: { 'x-forwarded-for': '198.51.100.203' },
		})

		expect(reponse.statut).toBe(200)
		const lecture = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0 })
		expect(Date.now() - Date.parse(lecture.lastSignInAt ?? '')).toBeLessThan(60_000)
	})
})

describe('aucune donnée personnelle dans le journal, même glissée dans la saisie', () => {
	test('un email, un nom, un jeton, une IP et un mot de passe saisis ne laissent rien dans les lignes', async () => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		const glisses = [
			'intruse.test@example.test',
			'Léa Intruse',
			'jeton-eyJhbGciOiJIUzI1NiJ9-secret',
			'203.0.113.77',
			'2001:db8:abcd:12::77',
			'mot-de-passe-glisse-12345',
		]
		const avant = (await lignes()).length

		// Through the form: the typed values, the address header, the account's own address.
		for (const glisse of glisses) {
			await ouvrirPar(new Headers({ 'x-forwarded-for': glisse.includes('.') ? glisse : '192.0.2.9' }), glisse, glisse)
			await ouvrirPar(adresse(), compte.email, glisse)
		}
		await ouvrirPar(adresse(), compte.email, MOT_DE_PASSE)
		// Through REST: the same values in the body and in the headers.
		for (const glisse of glisses)
			await appelerRest('POST', '/api/pros/login', {
				corps: { email: glisse, password: glisse },
				enTetes: { 'x-forwarded-for': '198.51.100.204', 'user-agent': glisse, referer: `https://x.test/${glisse}` },
			})
		// Written directly, with a value out of the list in each field.
		await journaliser(
			(await payloadDeTest()) as never,
			{ type: 'sign-in', code: glisses[0] as never, durationMs: 3 } as never
		)

		const nouvelles = (await lignes()).slice(avant)
		expect(nouvelles.length).toBeGreaterThanOrEqual(20)
		const texte = JSON.stringify(nouvelles)
		for (const glisse of [...glisses, compte.email, String(compte.id).padStart(8, '#')])
			expect(texte).not.toContain(glisse)
		for (const ligne of nouvelles)
			expect(Object.keys(ligne).sort()).toEqual(
				['code', 'date', 'durationMs', 'id', 'method', 'type'].filter(cle => cle in ligne)
			)
		expect(nouvelles.some(({ code }) => code === 'inconnu')).toBe(true)
		// About thirty sign-in attempts, each held back by the 300 ms floor: more than the 5 s default of bun.
	}, 60_000)
})

describe('un échec d’écriture du journal ne fait pas échouer la connexion', () => {
	test('la ligne ne peut pas s’écrire : la session est ouverte quand même', async () => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		const payload = await payloadDeTest()
		const enPanne = Object.assign(Object.create(payload), {
			create: () => Promise.reject(new Error('la table du journal est absente')),
		}) as typeof payload
		const avant = (await lignes()).length

		const resultat = await connecter({
			ouvrir: data => ouvrirParMotDePasse(payload, 'pros', data),
			headers: adresse(),
			email: compte.email,
			password: MOT_DE_PASSE,
			frein,
			journal: journalDe(enPanne),
		})

		expect(resultat.ok).toBe(true)
		expect((await lignes()).length).toBe(avant)
	})
})

describe('la purge à 90 jours, sur une horloge simulée', () => {
	const joursAvant = (maintenant: Date, jours: number, minutes = 0) =>
		new Date(maintenant.getTime() - jours * 86_400_000 - minutes * 60_000).toISOString()

	test('une ligne de 91 jours part, une de 89 jours reste ; une seconde passe ne change rien', async () => {
		const payload = await payloadDeTest()
		const maintenant = new Date()
		const ecrire = (date: string) =>
			payload.create({ collection: 'auth-events', data: { type: 'sign-in', code: 'ok', date } })
		const vieille = await ecrire(joursAvant(maintenant, 91))
		const limite = await ecrire(joursAvant(maintenant, 90, 1))
		const recente = await ecrire(joursAvant(maintenant, 89))
		const aujourdhui = await ecrire(maintenant.toISOString())

		const premiere = await lancerLesTachesQuotidiennes(payload, maintenant)
		const restantes = (await lignes()).map(({ id }) => id)

		expect(premiere).toContainEqual({ nom: 'purge-journal-authentification', supprimes: 2 })
		expect(restantes).not.toContain(vieille.id)
		expect(restantes).not.toContain(limite.id)
		expect(restantes).toContain(recente.id)
		expect(restantes).toContain(aujourdhui.id)
		const seconde = await lancerLesTachesQuotidiennes(payload, maintenant)
		expect(seconde).toContainEqual({ nom: 'purge-journal-authentification', supprimes: 0 })
	})
})
