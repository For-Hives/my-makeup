import { beforeEach, describe, expect, test } from 'bun:test'
import bcrypt from 'bcryptjs'
import { AuthenticationError } from 'payload'
import { connecter } from '@/lib/auth/connexion'
import { creerFrein } from '@/lib/auth/frein'
import { estUnHashBcrypt, HASH_FICTIF, motDePasseDuHash, remplacerLeHashHerite } from '@/lib/auth/herite'
import type { EvenementAuth } from '@/lib/auth/journal'

/**
 * The sign-in of an account of the old site (ticket 087; plan 02 U72, U74). No database.
 */

const frein = creerFrein({ nom: 'essai-connexion-herite', limite: 1000, fenetreMs: 15 * 60_000 })
beforeEach(() => frein.vider())

const MOT_DE_PASSE = 'fixture-ancien-site-des-tests'
// Version 2a and cost 10 like every hash of the old site; made here for the test, never a real one.
const HASH = bcrypt.hashSync(MOT_DE_PASSE, '$2a$10$FabriqueDeComptesDuBa.')
const adresse = (n: number) => new Headers({ 'x-forwarded-for': `192.0.2.${n}` })

interface Ecriture {
	id: unknown
	data: Record<string, unknown>
}

/** The two things `remplacerLeHashHerite` touches: the raw read of the account, and the update. */
function fauxPayload(ligne: { id: number; legacyBcrypt?: unknown } | undefined) {
	const lectures: unknown[] = []
	const ecritures: Ecriture[] = []
	return {
		lectures,
		ecritures,
		payload: {
			db: {
				findOne: (args: unknown) => {
					lectures.push(args)
					return Promise.resolve(ligne ?? null)
				},
			},
			update: (args: Ecriture) => {
				ecritures.push(args)
				return Promise.resolve({})
			},
		} as unknown as Parameters<typeof remplacerLeHashHerite>[0],
	}
}

describe('U72 : le hash hérité est accepté, puis remplacé', () => {
	test('le bon mot de passe est accepté, écrit dans le format de Payload, et le hash hérité est mis à null', async () => {
		const { payload, ecritures, lectures } = fauxPayload({ id: 7, legacyBcrypt: HASH })

		const accepte = await remplacerLeHashHerite(payload, { email: '  Lea@Example.TEST ', password: MOT_DE_PASSE })

		expect(accepte).toBe(true)
		expect(ecritures).toHaveLength(1)
		expect(ecritures[0]).toMatchObject({ id: 7, data: { password: MOT_DE_PASSE, legacyBcrypt: null } })
		expect(JSON.stringify(lectures[0])).toContain('lea@example.test')
	})

	test('un mauvais mot de passe est refusé et ne touche à rien', async () => {
		const { payload, ecritures } = fauxPayload({ id: 7, legacyBcrypt: HASH })
		expect(await remplacerLeHashHerite(payload, { email: 'lea@example.test', password: 'pas-le-bon' })).toBe(false)
		expect(ecritures).toEqual([])
	})

	test('une adresse inconnue et un compte sans hash sont refusés sans rien écrire', async () => {
		for (const ligne of [undefined, { id: 1 }, { id: 1, legacyBcrypt: null }]) {
			const { payload, ecritures } = fauxPayload(ligne)
			expect(await remplacerLeHashHerite(payload, { email: 'a@example.test', password: MOT_DE_PASSE })).toBe(false)
			expect(ecritures).toEqual([])
		}
	})
})

describe('U74 : un hash mal formé est refusé sans exception', () => {
	const MAL_FORMES: unknown[] = [
		'',
		'pas-un-hash',
		'$2a$10$trop-court',
		`${HASH}x`,
		HASH.replace('$2a$10$', '$2a$99$'),
		HASH.replace('$2a$', '$3a$'),
		`${HASH.slice(0, 40)}\u0000${HASH.slice(41)}`,
		12345,
		{ hash: HASH },
		[HASH],
	]

	test('aucun ne passe pour un hash bcrypt', () => {
		for (const hash of MAL_FORMES) expect(estUnHashBcrypt(hash)).toBe(false)
		expect(estUnHashBcrypt(HASH)).toBe(true)
		expect(estUnHashBcrypt(HASH_FICTIF)).toBe(true)
	})

	test('la comparaison rend faux, sans exception, même avec le bon mot de passe', async () => {
		for (const hash of MAL_FORMES) expect(await motDePasseDuHash(MOT_DE_PASSE, hash)).toBe(false)
	})

	test('un compte au hash mal formé est refusé et rien n’est écrit', async () => {
		for (const hash of MAL_FORMES) {
			const { payload, ecritures } = fauxPayload({ id: 3, legacyBcrypt: hash })
			expect(await remplacerLeHashHerite(payload, { email: 'a@example.test', password: MOT_DE_PASSE })).toBe(false)
			expect(ecritures).toEqual([])
		}
	})

	test('le hash fictif ne s’ouvre pour aucun mot de passe', async () => {
		for (const motDePasse of [MOT_DE_PASSE, 'x', 'password', ''])
			expect(await motDePasseDuHash(motDePasse, HASH_FICTIF)).toBe(false)
	})
})

const t = (cle: string) => cle as unknown as never
const refuse = () => Promise.reject(new AuthenticationError(t as never))

describe('connecter : le chemin du hash hérité', () => {
	function entrees(options: { ouvrir: () => Promise<{ token?: string }>; herite?: () => Promise<boolean> }) {
		const evenements: EvenementAuth[] = []
		return {
			evenements,
			entrees: {
				ouvrir: options.ouvrir,
				herite: options.herite,
				headers: adresse(1),
				email: 'lea@example.test',
				password: MOT_DE_PASSE,
				frein,
				journal: (e: EvenementAuth) => {
					evenements.push(e)
					return Promise.resolve()
				},
			},
		}
	}

	test('Payload refuse, le hash hérité accepte : la maquilleuse est connectée et le journal dit « heritee »', async () => {
		let appels = 0
		const { entrees: e, evenements } = entrees({
			ouvrir: () => (++appels === 1 ? refuse() : Promise.resolve({ token: 'jeton' })),
			herite: () => Promise.resolve(true),
		})
		expect(await connecter(e)).toEqual({ ok: true, token: 'jeton' })
		expect(appels).toBe(2)
		expect(evenements).toMatchObject([{ type: 'connexion', code: 'heritee' }])
	})

	test('un mot de passe juste pour Payload ne passe pas par le hash hérité', async () => {
		let herite = 0
		const { entrees: e, evenements } = entrees({
			ouvrir: () => Promise.resolve({ token: 'jeton' }),
			herite: () => {
				herite++
				return Promise.resolve(true)
			},
		})
		expect((await connecter(e)).ok).toBe(true)
		expect(herite).toBe(0)
		expect(evenements[0]?.code).toBe('ok')
	})

	test('le hash hérité refuse : le message est générique', async () => {
		const { entrees: e, evenements } = entrees({ ouvrir: refuse, herite: () => Promise.resolve(false) })
		expect(await connecter(e)).toEqual({ ok: false, code: 'identifiants-invalides' })
		expect(evenements[0]?.code).toBe('identifiants-invalides')
	})

	test('une panne du chemin hérité n’est pas dite comme un refus', async () => {
		const { entrees: e } = entrees({ ouvrir: refuse, herite: () => Promise.reject(new Error('base injoignable')) })
		expect(await connecter(e)).toEqual({ ok: false, code: 'service-indisponible' })
	})

	test('tout refus du compte par Payload (4xx) passe par le hash hérité', async () => {
		let herite = 0
		const { entrees: e } = entrees({
			ouvrir: () => Promise.reject(Object.assign(new Error('x'), { status: 403 })),
			herite: () => {
				herite++
				return Promise.resolve(false)
			},
		})
		await connecter(e)
		expect(herite).toBe(1)
	})
})
