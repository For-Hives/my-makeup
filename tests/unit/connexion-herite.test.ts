import { beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import bcrypt from 'bcryptjs'
import { AuthenticationError } from 'payload'
import { signInWithPassword, type Clock, REFUSAL_FLOOR_MS } from '@/lib/auth/sign-in'
import { createRateLimit } from '@/lib/auth/rate-limit'
import {
	isBcryptHash,
	FAKE_HASH,
	hashPassword,
	PAYLOAD_PBKDF2,
	replaceLegacyHash,
	fakeVerificationWork,
} from '@/lib/auth/legacy'
import type { AuthEvent } from '@/lib/auth/auth-log'
import { equalizeRestWork, rememberRestFailures } from '@/lib/auth/equal-time-payload'

/**
 * The sign-in of an account of the old site (ticket 087; plan 02 U72, U74) and the equal time of
 * every refusal (ticket 088; U73). No database, no real wait: the clock of the sign-in is a fake one.
 */

const frein = createRateLimit({ nom: 'essai-connexion-herite', limite: 1000, fenetreMs: 15 * 60_000 })
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
function fauxPayload(ligne: { id: number; legacyBcrypt?: unknown; hash?: unknown; salt?: unknown } | undefined) {
	const lectures: unknown[] = []
	const ecritures: Ecriture[] = []
	return {
		lectures,
		ecritures,
		payload: {
			db: {
				findOne: (args: unknown) => {
					lectures.push(args)
					// A known account holds a password of Payload's, unless the test says it does not.
					return Promise.resolve(ligne ? { hash: 'h', salt: 's', ...ligne } : null)
				},
			},
			update: (args: Ecriture) => {
				ecritures.push(args)
				return Promise.resolve({})
			},
		} as unknown as Parameters<typeof replaceLegacyHash>[0],
	}
}

describe('U72 : le hash hérité est accepté, puis remplacé', () => {
	test('le bon mot de passe est accepté, écrit dans le format de Payload, et le hash hérité est mis à null', async () => {
		const { payload, ecritures, lectures } = fauxPayload({ id: 7, legacyBcrypt: HASH })

		const accepte = await replaceLegacyHash(payload, { email: '  Lea@Example.TEST ', password: MOT_DE_PASSE })

		expect(accepte).toBe(true)
		expect(ecritures).toHaveLength(1)
		expect(ecritures[0]).toMatchObject({ id: 7, data: { password: MOT_DE_PASSE, legacyBcrypt: null } })
		expect(JSON.stringify(lectures[0])).toContain('lea@example.test')
	})

	test('un mauvais mot de passe est refusé et ne touche à rien', async () => {
		const { payload, ecritures } = fauxPayload({ id: 7, legacyBcrypt: HASH })
		expect(await replaceLegacyHash(payload, { email: 'lea@example.test', password: 'pas-le-bon' })).toBe(false)
		expect(ecritures).toEqual([])
	})

	test('une adresse inconnue et un compte sans hash sont refusés sans rien écrire', async () => {
		for (const ligne of [undefined, { id: 1 }, { id: 1, legacyBcrypt: null }]) {
			const { payload, ecritures } = fauxPayload(ligne)
			expect(await replaceLegacyHash(payload, { email: 'a@example.test', password: MOT_DE_PASSE })).toBe(false)
			expect(ecritures).toEqual([])
		}
	})
})

describe('U73 : le travail d’une adresse inconnue est celui de Payload pour un compte connu', () => {
	test('les paramètres de PBKDF2 sont ceux que Payload utilise (garde contre une mise à jour)', () => {
		const source = readFileSync('node_modules/payload/dist/auth/strategies/local/generatePasswordSaltHash.js', 'utf8')
		expect(source).toContain(`currentPasswordHashIterations = ${PAYLOAD_PBKDF2.iterations}`)
		expect(source).toContain(`currentPasswordHashKeyLength = ${PAYLOAD_PBKDF2.longueur}`)
		expect(source).toContain("'sha256'")
	})

	test('le travail fictif se termine, sans exception, pour tout texte', async () => {
		for (const texte of ['x', '', 'é'.repeat(500)]) await fakeVerificationWork(texte)
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

	test('aucun ne passe pour un hash bcrypt', async () => {
		for (const hash of MAL_FORMES) expect(isBcryptHash(hash)).toBe(false)
		expect(isBcryptHash(HASH)).toBe(true)
		expect(isBcryptHash(await FAKE_HASH)).toBe(true)
	})

	test('la comparaison rend faux, sans exception, même avec le bon mot de passe', async () => {
		for (const hash of MAL_FORMES) expect(await hashPassword(MOT_DE_PASSE, hash)).toBe(false)
	})

	test('un compte au hash mal formé est refusé et rien n’est écrit', async () => {
		for (const hash of MAL_FORMES) {
			const { payload, ecritures } = fauxPayload({ id: 3, legacyBcrypt: hash })
			expect(await replaceLegacyHash(payload, { email: 'a@example.test', password: MOT_DE_PASSE })).toBe(false)
			expect(ecritures).toEqual([])
		}
	})

	test('le hash fictif ne s’ouvre pour aucun mot de passe', async () => {
		for (const motDePasse of [MOT_DE_PASSE, 'x', 'password', ''])
			expect(await hashPassword(motDePasse, await FAKE_HASH)).toBe(false)
	})
})

const t = (cle: string) => cle as unknown as never
const refuse = () => Promise.reject(new AuthenticationError(t as never))

describe('connecter : le chemin du hash hérité', () => {
	function entrees(options: { ouvrir: () => Promise<{ token?: string }>; herite?: () => Promise<boolean> }) {
		const evenements: AuthEvent[] = []
		return {
			evenements,
			entrees: {
				ouvrir: options.ouvrir,
				herite: options.herite,
				headers: adresse(1),
				email: 'lea@example.test',
				password: MOT_DE_PASSE,
				frein,
				journal: (e: AuthEvent) => {
					evenements.push(e)
					return Promise.resolve()
				},
				horloge: instantanee(),
			},
		}
	}

	test('Payload refuse, le hash hérité accepte : la maquilleuse est connectée et le journal dit « heritee »', async () => {
		let appels = 0
		const { entrees: e, evenements } = entrees({
			ouvrir: () => (++appels === 1 ? refuse() : Promise.resolve({ token: 'jeton' })),
			herite: () => Promise.resolve(true),
		})
		expect(await signInWithPassword(e)).toEqual({ ok: true, token: 'jeton' })
		expect(appels).toBe(2)
		expect(evenements).toMatchObject([{ type: 'sign-in', code: 'heritee' }])
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
		expect((await signInWithPassword(e)).ok).toBe(true)
		expect(herite).toBe(0)
		expect(evenements[0]?.code).toBe('ok')
	})

	test('le hash hérité refuse : le message est générique', async () => {
		const { entrees: e, evenements } = entrees({ ouvrir: refuse, herite: () => Promise.resolve(false) })
		expect(await signInWithPassword(e)).toEqual({ ok: false, code: 'identifiants-invalides' })
		expect(evenements[0]?.code).toBe('identifiants-invalides')
	})

	test('une panne du chemin hérité n’est pas dite comme un refus', async () => {
		const { entrees: e } = entrees({ ouvrir: refuse, herite: () => Promise.reject(new Error('base injoignable')) })
		expect(await signInWithPassword(e)).toEqual({ ok: false, code: 'service-indisponible' })
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
		await signInWithPassword(e)
		expect(herite).toBe(1)
	})
})

/** A clock that never waits: `connecter` only asks it for the time. */
function instantanee(): Clock {
	let maintenant = 0
	return {
		maintenant: () => maintenant,
		attendre: ms => {
			maintenant += ms
			return Promise.resolve()
		},
	}
}

/**
 * A clock of the test: the time only moves when the work "costs" some (`travail`) or when the
 * sign-in waits. No real time passes, so the test is the same on a slow runner.
 */
function horlogeSimulee() {
	let maintenant = 1_000_000
	const horloge: Clock = {
		maintenant: () => maintenant,
		attendre: ms => {
			maintenant += ms
			return Promise.resolve()
		},
	}
	return {
		horloge,
		travail: (ms: number) => {
			maintenant += ms
		},
		depuis: (debut: number) => maintenant - debut,
	}
}

describe('U73 : un refus prend le même temps, quel que soit le compte', () => {
	// What each case costs before the floor: the comparison to a hash, the lookup, the Payload login.
	const CAS = {
		'adresse inconnue': { payload: 4, herite: 71 },
		'mauvais mot de passe': { payload: 38, herite: 70 },
		'compte hérité, mauvais mot de passe': { payload: 36, herite: 74 },
		'compte sans mot de passe': { payload: 37, herite: 69 },
	}

	test('les quatre refus durent 300 ms, à 50 ms près, sans attente réelle', async () => {
		const durees: number[] = []
		const reponses: unknown[] = []
		for (const cout of Object.values(CAS)) {
			const { horloge, travail, depuis } = horlogeSimulee()
			const debut = horloge.maintenant()
			const r = await signInWithPassword({
				ouvrir: () => (travail(cout.payload), refuse()),
				herite: () => (travail(cout.herite), Promise.resolve(false)),
				headers: adresse(2),
				email: 'a@example.test',
				password: 'pas-le-bon',
				frein,
				horloge,
			})
			durees.push(depuis(debut))
			reponses.push(r)
		}
		expect(Math.max(...durees) - Math.min(...durees)).toBeLessThanOrEqual(50)
		for (const duree of durees) expect(duree).toBeGreaterThanOrEqual(REFUSAL_FLOOR_MS)
		expect(new Set(reponses.map(r => JSON.stringify(r))).size).toBe(1)
		expect(reponses[0]).toEqual({ ok: false, code: 'identifiants-invalides' })
	})

	test('un refus déjà plus long que le plancher n’attend pas de plus', async () => {
		const { horloge, travail, depuis } = horlogeSimulee()
		const debut = horloge.maintenant()
		await signInWithPassword({
			ouvrir: () => (travail(450), refuse()),
			herite: () => Promise.resolve(false),
			headers: adresse(3),
			email: 'a@example.test',
			password: 'x',
			frein,
			horloge,
		})
		expect(depuis(debut)).toBe(450)
	})

	test('le plancher vaut pour le refus après le chemin hérité aussi, et le journal garde la durée', async () => {
		const { horloge } = horlogeSimulee()
		const durees: (number | undefined)[] = []
		await signInWithPassword({
			ouvrir: refuse,
			herite: () => Promise.resolve(false),
			headers: adresse(4),
			email: 'a@example.test',
			password: 'x',
			frein,
			horloge,
			journal: e => (durees.push(e.durationMs), Promise.resolve()),
		})
		expect(durees[0]).toBe(REFUSAL_FLOOR_MS)
	})

	test('une connexion réussie n’attend pas le plancher', async () => {
		const { horloge, depuis } = horlogeSimulee()
		const debut = horloge.maintenant()
		const r = await signInWithPassword({
			ouvrir: () => Promise.resolve({ token: 'jeton' }),
			headers: adresse(5),
			email: 'a@example.test',
			password: 'x',
			frein,
			horloge,
		})
		expect(r.ok).toBe(true)
		expect(depuis(debut)).toBe(0)
	})
})

describe('U73 : l’adresse sans compte paie le travail de Payload', () => {
	test('remplacerLeHashHerite : une adresse inconnue ou sans mot de passe de Payload fait le travail fictif, un compte connu non', async () => {
		const travaux: string[] = []
		const travailFictif = (motDePasse: string) => {
			travaux.push(motDePasse)
			return Promise.resolve()
		}

		await replaceLegacyHash(
			fauxPayload(undefined).payload,
			{ email: 'a@example.test', password: 'un' },
			travailFictif
		)
		await replaceLegacyHash(
			fauxPayload({ id: 1, legacyBcrypt: HASH }).payload,
			{ email: 'a@example.test', password: 'deux' },
			travailFictif
		)
		// An account with a hash of the old site and no password of Payload's: Payload checks nothing.
		await replaceLegacyHash(
			fauxPayload({ id: 1, legacyBcrypt: HASH, hash: null, salt: null }).payload,
			{ email: 'a@example.test', password: 'trois' },
			travailFictif
		)
		await replaceLegacyHash(
			fauxPayload({ id: 1, hash: undefined, salt: 's' }).payload,
			{ email: 'a@example.test', password: 'quatre' },
			travailFictif
		)

		expect(travaux).toEqual(['un', 'trois', 'quatre'])
	})
})

describe('U73 : la porte REST de la connexion', () => {
	const contexte = (api = 'REST') => ({ payloadAPI: api, context: {} as Record<string, unknown> })
	const compteConnu = { hash: 'h', salt: 's' }

	function requete(api: string, trouve: unknown) {
		const req = {
			...contexte(api),
			payload: { db: { findOne: () => Promise.resolve(trouve) } },
		}
		return req as unknown as Parameters<ReturnType<typeof equalizeRestWork>>[0]['req']
	}
	const appel = (data: unknown, req: unknown) =>
		({ args: { data }, collection: { slug: 'pros' }, operation: 'login', req }) as never

	test('une adresse sans compte fait le travail fictif ; un compte connu, un compte sans mot de passe lisible et une saisie vide non', async () => {
		const travaux: string[] = []
		const hook = equalizeRestWork({
			travailFictif: motDePasse => {
				travaux.push(motDePasse)
				return Promise.resolve()
			},
		})
		const saisie = { email: 'A@Example.test ', password: 'secret' }

		await hook(appel(saisie, requete('REST', null)))
		await hook(appel(saisie, requete('REST', compteConnu)))
		await hook(appel(saisie, requete('REST', { id: 1 })))
		await hook(appel({ email: '', password: 'x' }, requete('REST', null)))
		await hook(appel({ email: 'a@example.test', password: '  ' }, requete('REST', null)))
		await hook(appel(saisie, requete('local', null)))

		// The unknown address, and the account with no hash and salt to check: Payload does nothing for them.
		expect(travaux).toEqual(['secret', 'secret'])
	})

	test('un refus des identifiants attend le plancher, sur une horloge simulée ; un autre échec non', async () => {
		const { horloge, depuis } = horlogeSimulee()
		const req = requete('REST', null)
		const debut = horloge.maintenant()
		await equalizeRestWork({ horloge, travailFictif: () => Promise.resolve() })(
			appel({ email: 'a@example.test', password: 'x' }, req)
		)
		const apres = rememberRestFailures({ horloge })

		await apres({ error: new AuthenticationError(t as never), req } as never)
		expect(depuis(debut)).toBe(REFUSAL_FLOOR_MS)

		// Later than the floor already: no more wait.
		await apres({ error: new AuthenticationError(t as never), req } as never)
		expect(depuis(debut)).toBe(REFUSAL_FLOOR_MS)

		// A brake (429) says nothing about the account: it answers at once.
		const autre = requete('REST', null)
		autre.context.plancherDeLaConnexion = horloge.maintenant() + 1000
		await apres({ error: Object.assign(new Error('frein'), { status: 429 }), req: autre } as never)
		expect(depuis(debut)).toBe(REFUSAL_FLOOR_MS)
	})
})
