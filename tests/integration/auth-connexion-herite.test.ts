import { afterEach, describe, expect, test } from 'bun:test'
import { connecter } from '@/lib/auth/connexion'
import { creerFrein } from '@/lib/auth/frein'
import { remplacerLeHashHerite } from '@/lib/auth/herite'
import { ouvrirParMotDePasse } from '@/lib/auth/jeton'
import { journalDe } from '@/lib/auth/journal'
import { creerCompte, MOT_DE_PASSE_HERITE_DE_FIXTURE } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'

/**
 * The sign-in of an account of the old site (tickets 087 and 088; plan 02 I15). The browser side,
 * the Server Action and the cookie are played by tests/e2e/connexion-heritee.spec.ts (E73).
 */

afterEach(viderLaBase)

const adresse = (n: number) => new Headers({ 'x-forwarded-for': `192.0.2.${n}` })

async function brancher(nomDuFrein: string) {
	const payload = await payloadDeTest()
	const appels = { herite: 0 }
	return {
		payload,
		appels,
		frein: creerFrein({ nom: nomDuFrein, limite: 100, fenetreMs: 60_000 }),
		entrees: {
			ouvrir: (data: { email: string; password: string }) => ouvrirParMotDePasse(payload, 'pros', data),
			herite: (data: { email: string; password: string }) => {
				appels.herite++
				return remplacerLeHashHerite(payload, data)
			},
			journal: journalDe(payload),
		},
	}
}

interface Ligne {
	id: number
	legacyBcrypt?: string | null
	hash?: string
	salt?: string
}

async function ligneDuCompte(id: number | string): Promise<Ligne> {
	const ligne = await (await payloadDeTest()).db.findOne<Ligne>({ collection: 'pros', where: { id: { equals: id } } })
	if (!ligne) throw new Error('le compte n’est pas en base')
	return ligne
}

const rangees = async (code: string) =>
	(await (await payloadDeTest()).find({ collection: 'auth-evenements', depth: 0, where: { code: { equals: code } } }))
		.docs

describe('I15 : un compte migré (bcrypt) se connecte, son hash est remplacé, la seconde connexion est en pbkdf2', () => {
	test('le mot de passe habituel ouvre le compte, une fois, puis le hash hérité n’existe plus', async () => {
		const compte = await creerCompte('reprise-avec-hash')
		const { entrees, appels, frein } = await brancher('essai-int-herite-1')
		const avant = await ligneDuCompte(compte.id)
		expect(avant.legacyBcrypt).toStartWith('$2a$10$')

		const premiere = await connecter({
			...entrees,
			headers: adresse(21),
			email: compte.email,
			password: MOT_DE_PASSE_HERITE_DE_FIXTURE,
			frein,
		})

		expect(premiere.ok).toBe(true)
		expect(appels.herite).toBe(1)
		const apres = await ligneDuCompte(compte.id)
		expect(apres.legacyBcrypt ?? null).toBeNull()
		// Payload's own format now: a new salt and a new hash, not the random ones of the import.
		expect(apres.hash).not.toBe(avant.hash)
		expect(apres.salt).not.toBe(avant.salt)
		expect(await rangees('heritee')).toHaveLength(1)

		// The second sign-in is Payload's own: the old-hash path is not asked.
		const seconde = await connecter({
			...entrees,
			headers: adresse(21),
			email: compte.email,
			password: MOT_DE_PASSE_HERITE_DE_FIXTURE,
			frein,
		})
		expect(seconde.ok).toBe(true)
		expect(appels.herite).toBe(1)
		expect((await rangees('heritee')).length).toBe(1)
		expect((await rangees('ok')).length).toBe(1)
	})

	test('un mauvais mot de passe : message générique, hash hérité et mot de passe Payload intacts', async () => {
		const compte = await creerCompte('reprise-avec-hash')
		const { entrees, frein } = await brancher('essai-int-herite-2')
		const avant = await ligneDuCompte(compte.id)

		const r = await connecter({ ...entrees, headers: adresse(22), email: compte.email, password: 'pas-le-bon', frein })

		expect(r).toEqual({ ok: false, code: 'identifiants-invalides' })
		const apres = await ligneDuCompte(compte.id)
		expect(apres).toEqual(avant)
		expect(await rangees('heritee')).toEqual([])
		expect((await rangees('identifiants-invalides')).length).toBe(1)
	})

	test('l’adresse s’écrit comme on veut : casse et espaces de bord', async () => {
		const compte = await creerCompte('reprise-avec-hash')
		const { entrees, frein } = await brancher('essai-int-herite-3')
		const r = await connecter({
			...entrees,
			headers: adresse(23),
			email: ` ${compte.email.toUpperCase()} `,
			password: MOT_DE_PASSE_HERITE_DE_FIXTURE,
			frein,
		})
		expect(r.ok).toBe(true)
	})

	test('un compte Google avec hash se connecte aussi par son ancien mot de passe ; sans hash, il est refusé', async () => {
		const [avecHash, sansHash] = await Promise.all([
			creerCompte('reprise-google-avec-hash'),
			creerCompte('reprise-google'),
		])
		const { entrees, frein } = await brancher('essai-int-herite-4')
		const juste = await connecter({
			...entrees,
			headers: adresse(24),
			email: avecHash.email,
			password: MOT_DE_PASSE_HERITE_DE_FIXTURE,
			frein,
		})
		const refus = await connecter({
			...entrees,
			headers: adresse(24),
			email: sansHash.email,
			password: MOT_DE_PASSE_HERITE_DE_FIXTURE,
			frein,
		})
		expect(juste.ok).toBe(true)
		expect(refus).toEqual({ ok: false, code: 'identifiants-invalides' })
	})

	test('le hash hérité ne sort ni par REST ni par l’API locale, pour un admin comme pour la propriétaire', async () => {
		const [admin, compte] = await Promise.all([creerCompte('admin'), creerCompte('reprise-avec-hash')])
		const hash = (await ligneDuCompte(compte.id)).legacyBcrypt ?? ''
		expect(hash).not.toBe('')

		const rest = await appelerRest('GET', `/api/pros/${compte.id}`, { enTetes: admin.session.enTetes })
		const liste = await appelerRest('GET', '/api/pros?limit=100', { enTetes: admin.session.enTetes })
		const payload = await payloadDeTest()
		const locale = await payload.findByID({
			collection: 'pros',
			id: compte.id,
			depth: 0,
			overrideAccess: false,
			user: { ...(await payload.findByID({ collection: 'admins', id: admin.id, depth: 0 })), collection: 'admins' },
		})
		const dump = JSON.stringify([rest.texte, liste.texte, locale])
		expect(dump).not.toContain(hash)
		expect(dump).not.toContain('legacyBcrypt')
		expect(dump).not.toContain('$2a$')
	})

	test('la porte REST native ne connaît pas le chemin hérité : le compte y reçoit un refus', async () => {
		const compte = await creerCompte('reprise-avec-hash')
		const { statut } = await appelerRest('POST', '/api/pros/login', {
			corps: { email: compte.email, password: MOT_DE_PASSE_HERITE_DE_FIXTURE },
			enTetes: { 'x-forwarded-for': '192.0.2.25' },
		})
		expect(statut).toBe(401)
		expect((await ligneDuCompte(compte.id)).legacyBcrypt).toStartWith('$2a$10$')
	})
})

describe('088 : la porte REST répond aux refus avec le même plancher et la même réponse', () => {
	test('adresse inconnue, mauvais mot de passe, compte hérité : 401, même corps, jamais avant 300 ms', async () => {
		const [connu, herite] = await Promise.all([creerCompte('maquilleuse'), creerCompte('reprise-avec-hash')])
		const essais = ['personne@example.test', connu.email, herite.email]
		const reponses: { statut: number; texte: string; duree: number }[] = []
		for (const email of essais) {
			const debut = performance.now()
			const { statut, texte } = await appelerRest('POST', '/api/pros/login', {
				corps: { email, password: 'pas-le-bon' },
				enTetes: { 'x-forwarded-for': '192.0.2.26' },
			})
			reponses.push({ statut, texte, duree: performance.now() - debut })
		}

		expect(reponses.map(r => r.statut)).toEqual([401, 401, 401])
		expect(new Set(reponses.map(r => r.texte)).size).toBe(1)
		// A lower bound only: a timer may fire a hair early, and the work itself may take longer.
		for (const { duree } of reponses) expect(duree).toBeGreaterThanOrEqual(290)
	})
})
