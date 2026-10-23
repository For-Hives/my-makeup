import { beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import bcrypt from 'bcryptjs'
import { AuthenticationError } from 'payload'
import type { AuthEvent } from '@/lib/auth/auth-log'
import { equalizeRestWork, rememberRestFailures } from '@/lib/auth/equal-time-payload'
import {
	FAKE_HASH,
	fakeVerificationWork,
	hashPassword,
	isBcryptHash,
	PAYLOAD_PBKDF2,
	replaceLegacyHash,
} from '@/lib/auth/legacy'
import { createRateLimit } from '@/lib/auth/rate-limit'
import { type Clock, REFUSAL_FLOOR_MS, signInWithPassword } from '@/lib/auth/sign-in'

/**
 * The sign-in of an account of the old site (ticket 087; plan 02 U72, U74) and the equal time of
 * every refusal (ticket 088; U73). No database, no real wait: the clock of the sign-in is a fake one.
 */

const rateLimit = createRateLimit({ nom: 'essai-connexion-herite', limite: 1000, fenetreMs: 15 * 60_000 })
beforeEach(() => rateLimit.vider())

const PASSWORD = 'fixture-ancien-site-des-tests'
// Version 2a and cost 10 like every hash of the old site; made here for the test, never a real one.
const HASH = bcrypt.hashSync(PASSWORD, '$2a$10$FabriqueDeComptesDuBa.')
const url = (n: number) => new Headers({ 'x-forwarded-for': `192.0.2.${n}` })

interface Write {
	id: unknown
	data: Record<string, unknown>
}

/** The two things `replaceLegacyHash` touches: the raw read of the account, and the update. */
function fakePayload(ligne: { id: number; legacyBcrypt?: unknown; hash?: unknown; salt?: unknown } | undefined) {
	const readings: unknown[] = []
	const writes: Write[] = []
	return {
		lectures: readings,
		ecritures: writes,
		payload: {
			db: {
				findOne: (args: unknown) => {
					readings.push(args)
					// A known account holds a password of Payload's, unless the test says it does not.
					return Promise.resolve(ligne ? { hash: 'h', salt: 's', ...ligne } : null)
				},
			},
			update: (args: Write) => {
				writes.push(args)
				return Promise.resolve({})
			},
		} as unknown as Parameters<typeof replaceLegacyHash>[0],
	}
}

describe('U72 : le hash hérité est accepté, puis remplacé', () => {
	test('le bon mot de passe est accepté, écrit dans le format de Payload, et le hash hérité est mis à null', async () => {
		const { payload, ecritures: writes, lectures: readings } = fakePayload({ id: 7, legacyBcrypt: HASH })

		const accepted = await replaceLegacyHash(payload, { email: '  Lea@Example.TEST ', password: PASSWORD })

		expect(accepted).toBe(true)
		expect(writes).toHaveLength(1)
		expect(writes[0]).toMatchObject({ id: 7, data: { password: PASSWORD, legacyBcrypt: null } })
		expect(JSON.stringify(readings[0])).toContain('lea@example.test')
	})

	test('un mauvais mot de passe est refusé et ne touche à rien', async () => {
		const { payload, ecritures: writes } = fakePayload({ id: 7, legacyBcrypt: HASH })
		expect(await replaceLegacyHash(payload, { email: 'lea@example.test', password: 'pas-le-bon' })).toBe(false)
		expect(writes).toEqual([])
	})

	test('une adresse inconnue et un compte sans hash sont refusés sans rien écrire', async () => {
		for (const line of [undefined, { id: 1 }, { id: 1, legacyBcrypt: null }]) {
			const { payload, ecritures: writes } = fakePayload(line)
			expect(await replaceLegacyHash(payload, { email: 'a@example.test', password: PASSWORD })).toBe(false)
			expect(writes).toEqual([])
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
		for (const text of ['x', '', 'é'.repeat(500)]) await fakeVerificationWork(text)
	})
})

describe('U74 : un hash mal formé est refusé sans exception', () => {
	const BADLY_FORMS: unknown[] = [
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
		for (const hash of BADLY_FORMS) expect(isBcryptHash(hash)).toBe(false)
		expect(isBcryptHash(HASH)).toBe(true)
		expect(isBcryptHash(await FAKE_HASH)).toBe(true)
	})

	test('la comparaison rend faux, sans exception, même avec le bon mot de passe', async () => {
		for (const hash of BADLY_FORMS) expect(await hashPassword(PASSWORD, hash)).toBe(false)
	})

	test('un compte au hash mal formé est refusé et rien n’est écrit', async () => {
		for (const hash of BADLY_FORMS) {
			const { payload, ecritures: writes } = fakePayload({ id: 3, legacyBcrypt: hash })
			expect(await replaceLegacyHash(payload, { email: 'a@example.test', password: PASSWORD })).toBe(false)
			expect(writes).toEqual([])
		}
	})

	test('le hash fictif ne s’ouvre pour aucun mot de passe', async () => {
		for (const password of [PASSWORD, 'x', 'password', ''])
			expect(await hashPassword(password, await FAKE_HASH)).toBe(false)
	})
})

const t = (cle: string) => cle as unknown as never
const refuse = () => Promise.reject(new AuthenticationError(t as never))

describe('connecter : le chemin du hash hérité', () => {
	function entries(options: { ouvrir: () => Promise<{ token?: string }>; herite?: () => Promise<boolean> }) {
		const events: AuthEvent[] = []
		return {
			evenements: events,
			entrees: {
				ouvrir: options.ouvrir,
				herite: options.herite,
				headers: url(1),
				email: 'lea@example.test',
				password: PASSWORD,
				frein: rateLimit,
				journal: (e: AuthEvent) => {
					events.push(e)
					return Promise.resolve()
				},
				horloge: instant(),
			},
		}
	}

	test('Payload refuse, le hash hérité accepte : la maquilleuse est connectée et le journal dit « heritee »', async () => {
		let calls = 0
		const { entrees: e, evenements: events } = entries({
			ouvrir: () => (++calls === 1 ? refuse() : Promise.resolve({ token: 'jeton' })),
			herite: () => Promise.resolve(true),
		})
		expect(await signInWithPassword(e)).toEqual({ ok: true, token: 'jeton' })
		expect(calls).toBe(2)
		expect(events).toMatchObject([{ type: 'sign-in', code: 'heritee' }])
	})

	test('un mot de passe juste pour Payload ne passe pas par le hash hérité', async () => {
		let legacy = 0
		const { entrees: e, evenements: events } = entries({
			ouvrir: () => Promise.resolve({ token: 'jeton' }),
			herite: () => {
				legacy++
				return Promise.resolve(true)
			},
		})
		expect((await signInWithPassword(e)).ok).toBe(true)
		expect(legacy).toBe(0)
		expect(events[0]?.code).toBe('ok')
	})

	test('le hash hérité refuse : le message est générique', async () => {
		const { entrees: e, evenements: events } = entries({ ouvrir: refuse, herite: () => Promise.resolve(false) })
		expect(await signInWithPassword(e)).toEqual({ ok: false, code: 'identifiants-invalides' })
		expect(events[0]?.code).toBe('identifiants-invalides')
	})

	test('une panne du chemin hérité n’est pas dite comme un refus', async () => {
		const { entrees: e } = entries({ ouvrir: refuse, herite: () => Promise.reject(new Error('base injoignable')) })
		expect(await signInWithPassword(e)).toEqual({ ok: false, code: 'service-indisponible' })
	})

	test('tout refus du compte par Payload (4xx) passe par le hash hérité', async () => {
		let legacy = 0
		const { entrees: e } = entries({
			ouvrir: () => Promise.reject(Object.assign(new Error('x'), { status: 403 })),
			herite: () => {
				legacy++
				return Promise.resolve(false)
			},
		})
		await signInWithPassword(e)
		expect(legacy).toBe(1)
	})
})

/** A clock that never waits: `signInWithPassword` only asks it for the time. */
function instant(): Clock {
	let now = 0
	return {
		maintenant: () => now,
		attendre: ms => {
			now += ms
			return Promise.resolve()
		},
	}
}

/**
 * A clock of the test: the time only moves when the work "costs" some (`travail`) or when the
 * sign-in waits. No real time passes, so the test is the same on a slow runner.
 */
function simulatedClock() {
	let now = 1_000_000
	const clock: Clock = {
		maintenant: () => now,
		attendre: ms => {
			now += ms
			return Promise.resolve()
		},
	}
	return {
		horloge: clock,
		travail: (ms: number) => {
			now += ms
		},
		depuis: (debut: number) => now - debut,
	}
}

describe('U73 : un refus prend le même temps, quel que soit le compte', () => {
	// What each case costs before the floor: the comparison to a hash, the lookup, the Payload login.
	const CASE = {
		'adresse inconnue': { payload: 4, herite: 71 },
		'mauvais mot de passe': { payload: 38, herite: 70 },
		'compte hérité, mauvais mot de passe': { payload: 36, herite: 74 },
		'compte sans mot de passe': { payload: 37, herite: 69 },
	}

	test('les quatre refus durent 300 ms, à 50 ms près, sans attente réelle', async () => {
		const durations: number[] = []
		const responses: unknown[] = []
		for (const cost of Object.values(CASE)) {
			const { horloge: clock, travail: work, depuis: since } = simulatedClock()
			const startedAt = clock.maintenant()
			const r = await signInWithPassword({
				ouvrir: () => (work(cost.payload), refuse()),
				herite: () => (work(cost.herite), Promise.resolve(false)),
				headers: url(2),
				email: 'a@example.test',
				password: 'pas-le-bon',
				frein: rateLimit,
				horloge: clock,
			})
			durations.push(since(startedAt))
			responses.push(r)
		}
		expect(Math.max(...durations) - Math.min(...durations)).toBeLessThanOrEqual(50)
		for (const duration of durations) expect(duration).toBeGreaterThanOrEqual(REFUSAL_FLOOR_MS)
		expect(new Set(responses.map(r => JSON.stringify(r))).size).toBe(1)
		expect(responses[0]).toEqual({ ok: false, code: 'identifiants-invalides' })
	})

	test('un refus déjà plus long que le plancher n’attend pas de plus', async () => {
		const { horloge: clock, travail: work, depuis: since } = simulatedClock()
		const startedAt = clock.maintenant()
		await signInWithPassword({
			ouvrir: () => (work(450), refuse()),
			herite: () => Promise.resolve(false),
			headers: url(3),
			email: 'a@example.test',
			password: 'x',
			frein: rateLimit,
			horloge: clock,
		})
		expect(since(startedAt)).toBe(450)
	})

	test('le plancher vaut pour le refus après le chemin hérité aussi, et le journal garde la durée', async () => {
		const { horloge: clock } = simulatedClock()
		const durations: (number | undefined)[] = []
		await signInWithPassword({
			ouvrir: refuse,
			herite: () => Promise.resolve(false),
			headers: url(4),
			email: 'a@example.test',
			password: 'x',
			frein: rateLimit,
			horloge: clock,
			journal: e => (durations.push(e.durationMs), Promise.resolve()),
		})
		expect(durations[0]).toBe(REFUSAL_FLOOR_MS)
	})

	test('une connexion réussie n’attend pas le plancher', async () => {
		const { horloge: clock, depuis: since } = simulatedClock()
		const startedAt = clock.maintenant()
		const r = await signInWithPassword({
			ouvrir: () => Promise.resolve({ token: 'jeton' }),
			headers: url(5),
			email: 'a@example.test',
			password: 'x',
			frein: rateLimit,
			horloge: clock,
		})
		expect(r.ok).toBe(true)
		expect(since(startedAt)).toBe(0)
	})
})

describe('U73 : l’adresse sans compte paie le travail de Payload', () => {
	test('remplacerLeHashHerite : une adresse inconnue ou sans mot de passe de Payload fait le travail fictif, un compte connu non', async () => {
		const jobs: string[] = []
		const fakeWork = (motDePasse: string) => {
			jobs.push(motDePasse)
			return Promise.resolve()
		}

		await replaceLegacyHash(fakePayload(undefined).payload, { email: 'a@example.test', password: 'un' }, fakeWork)
		await replaceLegacyHash(
			fakePayload({ id: 1, legacyBcrypt: HASH }).payload,
			{ email: 'a@example.test', password: 'deux' },
			fakeWork
		)
		// An account with a hash of the old site and no password of Payload's: Payload checks nothing.
		await replaceLegacyHash(
			fakePayload({ id: 1, legacyBcrypt: HASH, hash: null, salt: null }).payload,
			{ email: 'a@example.test', password: 'trois' },
			fakeWork
		)
		await replaceLegacyHash(
			fakePayload({ id: 1, hash: undefined, salt: 's' }).payload,
			{ email: 'a@example.test', password: 'quatre' },
			fakeWork
		)

		expect(jobs).toEqual(['un', 'trois', 'quatre'])
	})
})

describe('U73 : la porte REST de la connexion', () => {
	const context = (api = 'REST') => ({ payloadAPI: api, context: {} as Record<string, unknown> })
	const knownAccount = { hash: 'h', salt: 's' }

	function request(api: string, trouve: unknown) {
		const req = {
			...context(api),
			payload: { db: { findOne: () => Promise.resolve(trouve) } },
		}
		return req as unknown as Parameters<ReturnType<typeof equalizeRestWork>>[0]['req']
	}
	const call = (data: unknown, req: unknown) =>
		({ args: { data }, collection: { slug: 'pros' }, operation: 'login', req }) as never

	test('une adresse sans compte fait le travail fictif ; un compte connu, un compte sans mot de passe lisible et une saisie vide non', async () => {
		const jobs: string[] = []
		const hook = equalizeRestWork({
			travailFictif: motDePasse => {
				jobs.push(motDePasse)
				return Promise.resolve()
			},
		})
		const input = { email: 'A@Example.test ', password: 'secret' }

		await hook(call(input, request('REST', null)))
		await hook(call(input, request('REST', knownAccount)))
		await hook(call(input, request('REST', { id: 1 })))
		await hook(call({ email: '', password: 'x' }, request('REST', null)))
		await hook(call({ email: 'a@example.test', password: '  ' }, request('REST', null)))
		await hook(call(input, request('local', null)))

		// The unknown address, and the account with no hash and salt to check: Payload does nothing for them.
		expect(jobs).toEqual(['secret', 'secret'])
	})

	test('un refus des identifiants attend le plancher, sur une horloge simulée ; un autre échec non', async () => {
		const { horloge: clock, depuis: since } = simulatedClock()
		const req = request('REST', null)
		const startedAt = clock.maintenant()
		await equalizeRestWork({ horloge: clock, travailFictif: () => Promise.resolve() })(
			call({ email: 'a@example.test', password: 'x' }, req)
		)
		const after = rememberRestFailures({ horloge: clock })

		await after({ error: new AuthenticationError(t as never), req } as never)
		expect(since(startedAt)).toBe(REFUSAL_FLOOR_MS)

		// Later than the floor already: no more wait.
		await after({ error: new AuthenticationError(t as never), req } as never)
		expect(since(startedAt)).toBe(REFUSAL_FLOOR_MS)

		// A brake (429) says nothing about the account: it answers at once.
		const other = request('REST', null)
		other.context.plancherDeLaConnexion = clock.maintenant() + 1000
		await after({ error: Object.assign(new Error('frein'), { status: 429 }), req: other } as never)
		expect(since(startedAt)).toBe(REFUSAL_FLOOR_MS)
	})
})
