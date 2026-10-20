import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import {
	AUTH_LOG_RETENTION_DAYS,
	type AuthEvent,
	authLogRow,
	EVENT_CODES,
	EVENT_TYPES,
	log,
	purgeThreshold,
} from '@/lib/auth/auth-log'
import { createRateLimit } from '@/lib/auth/rate-limit'
import { signInWithPassword } from '@/lib/auth/sign-in'
import { type DailyTask, runDailyTasks } from '@/lib/tasks/daily'
import { scheduleDailyTasks } from '@/lib/tasks/scheduler'

/** Tickets 077: the rows of the authentication journal, and the daily task that purges it. */

const MOMENT = new Date('2026-10-14T10:00:00.000Z')

describe('ligneDeJournal : un type, une issue, une durée, une date, rien d’autre', () => {
	test('une ligne porte quatre champs', () => {
		const line = authLogRow({ type: 'sign-in', code: 'ok', durationMs: 41.6 }, MOMENT)
		expect(line).toEqual({ type: 'sign-in', code: 'ok', durationMs: 42, date: MOMENT.toISOString() })
	})

	test('un code hors de la liste devient « inconnu », jamais copié tel quel', () => {
		const slid = 'intruse@example.test 203.0.113.9 jeton-secret' as unknown as AuthEvent['code']
		const line = authLogRow({ type: 'sign-in', code: slid }, MOMENT)
		expect(line.code).toBe('inconnu')
		expect(JSON.stringify(line)).not.toMatch(/intruse|203\.0\.113|jeton/)
	})

	test('un champ de plus dans l’événement n’entre pas dans la ligne', () => {
		const event = { type: 'sign-in', code: 'ok', email: 'a@example.test', ip: '192.0.2.1', nom: 'Léa' }
		const line = authLogRow(event as AuthEvent, MOMENT)
		expect(Object.keys(line).sort()).toEqual(['code', 'date', 'type'])
	})

	test('une durée absente, négative ou illisible est omise', () => {
		for (const durationMs of [undefined, -1, Number.NaN, Number.POSITIVE_INFINITY, '12' as unknown as number])
			expect('durationMs' in authLogRow({ type: 'sign-out', code: 'ok', durationMs }, MOMENT)).toBe(false)
	})

	test('les deux listes sont fermées et sans doublon', () => {
		expect(new Set(EVENT_TYPES).size).toBe(EVENT_TYPES.length)
		expect(new Set(EVENT_CODES).size).toBe(EVENT_CODES.length)
		for (const code of ['identifiants-invalides', 'trop-de-tentatives', 'service-indisponible'])
			expect(EVENT_CODES).toContain(code as never)
	})
})

describe('journaliser : un échec du journal ne remonte jamais', () => {
	const written: string[] = []
	const payloadInFailure = {
		create: () => Promise.reject(new Error('insert into auth_events : intruse@example.test')),
		logger: { error: (ligne: { msg: string }) => written.push(ligne.msg) },
	} as unknown as Pick<Payload, 'create' | 'logger'>

	test('l’erreur est avalée, la ligne de log ne dit rien de la ligne ni de l’erreur', async () => {
		await log(payloadInFailure, { type: 'sign-in', code: 'ok' })
		expect(written).toHaveLength(1)
		expect(written[0]).not.toContain('intruse')
		expect(written[0]).not.toContain('insert')
	})

	test('même un journal de log qui casse ne remonte pas', async () => {
		const broken = {
			create: () => Promise.reject(new Error('panne')),
			logger: {
				error: () => {
					throw new Error('log cassé')
				},
			},
		} as unknown as Pick<Payload, 'create' | 'logger'>
		await log(broken, { type: 'sign-in', code: 'ok' })
	})
})

describe('connecter : une ligne pour chaque tentative, et le journal ne décide de rien', () => {
	const rateLimit = createRateLimit({ nom: 'essai-journal', limite: 100, fenetreMs: 60_000 })
	const url = new Headers({ 'x-forwarded-for': '192.0.2.50' })

	test('une connexion réussie et une connexion refusée : une ligne chacune, avec leur code', async () => {
		const lines: AuthEvent[] = []
		const logValue = (evenement: AuthEvent) => {
			lines.push(evenement)
			return Promise.resolve()
		}
		await signInWithPassword({
			ouvrir: () => Promise.resolve({ token: 'jeton' }),
			headers: url,
			email: 'a@example.test',
			password: 'x',
			frein: rateLimit,
			journal: logValue,
		})
		await signInWithPassword({
			ouvrir: () => Promise.reject(Object.assign(new Error('refus'), { status: 401 })),
			headers: url,
			email: 'a@example.test',
			password: 'mauvais',
			frein: rateLimit,
			journal: logValue,
		})
		expect(lines.map(({ type, code }) => [type, code])).toEqual([
			['sign-in', 'ok'],
			['sign-in', 'identifiants-invalides'],
		])
		for (const line of lines) expect(typeof line.durationMs).toBe('number')
	})

	test('un échec d’écriture du journal ne fait pas échouer la connexion', async () => {
		const result = await signInWithPassword({
			ouvrir: () => Promise.resolve({ token: 'jeton' }),
			headers: url,
			email: 'a@example.test',
			password: 'x',
			frein: rateLimit,
			journal: () => Promise.reject(new Error('journal en panne')),
		})
		expect(result).toEqual({ ok: true, token: 'jeton' })
	})

	test('le frein et les champs vides laissent aussi leur ligne', async () => {
		const lines: string[] = []
		const logValue = (evenement: AuthEvent) => {
			lines.push(evenement.code)
			return Promise.resolve()
		}
		const smallRateLimit = createRateLimit({ nom: 'essai-journal-frein', limite: 2, fenetreMs: 60_000 })
		const base = {
			ouvrir: () => Promise.reject(Object.assign(new Error('x'), { status: 401 })),
			headers: url,
			journal: logValue,
		}
		await signInWithPassword({ ...base, email: '', password: '', frein: smallRateLimit })
		await signInWithPassword({ ...base, email: 'a@example.test', password: 'x', frein: smallRateLimit })
		await signInWithPassword({ ...base, email: 'a@example.test', password: 'x', frein: smallRateLimit })
		expect(lines).toEqual(['identifiants-invalides', 'identifiants-invalides', 'trop-de-tentatives'])
	})
})

describe('la purge à 90 jours', () => {
	test('le seuil est 90 jours avant l’horloge qu’on lui donne', () => {
		expect(AUTH_LOG_RETENTION_DAYS).toBe(90)
		expect(purgeThreshold(new Date('2026-10-14T10:00:00.000Z')).toISOString()).toBe('2026-07-16T10:00:00.000Z')
	})
})

describe('les tâches quotidiennes', () => {
	const logBook: string[] = []
	const payload = {
		logger: {
			info: (l: { msg: string }) => logBook.push(l.msg),
			error: (l: { msg: string }) => logBook.push(l.msg),
		},
	} as unknown as Payload

	test('elles tournent l’une après l’autre, avec l’horloge donnée, et une tâche en échec ne bloque pas la suivante', async () => {
		const seen: Date[] = []
		const tasks: DailyTask[] = [
			{ nom: 'cassee', executer: () => Promise.reject(new Error('secret@example.test')) },
			{
				nom: 'bonne',
				executer: (_p, maintenant) => {
					seen.push(maintenant)
					return Promise.resolve(3)
				},
			},
		]
		const results = await runDailyTasks(payload, MOMENT, tasks)
		expect(results).toEqual([
			{ nom: 'cassee', echec: true },
			{ nom: 'bonne', supprimes: 3 },
		])
		expect(seen).toEqual([MOMENT])
		expect(logBook.join('\n')).not.toContain('secret@example.test')
	})

	test('le planificateur lance une première fois après le délai, puis à chaque intervalle, sans doubler une exécution en cours', async () => {
		let launches = 0
		let release: () => void = () => undefined
		const stop = scheduleDailyTasks({
			lancer: () => {
				launches++
				return new Promise<void>(resolve => {
					release = resolve
				})
			},
			delaiInitialMs: 5,
			intervalleMs: 5,
		})
		await new Promise(resolve => setTimeout(resolve, 40))
		// The first run has not finished: the next ticks do not start another.
		expect(launches).toBe(1)
		release()
		await new Promise(resolve => setTimeout(resolve, 20))
		expect(launches).toBeGreaterThanOrEqual(2)
		stop()
		const after = launches
		await new Promise(resolve => setTimeout(resolve, 20))
		expect(launches).toBeLessThanOrEqual(after + 1)
	})

	test('un arrêt avant le premier lancement ne lance rien', async () => {
		let launches = 0
		const stop = scheduleDailyTasks({
			lancer: () => {
				launches++
				return Promise.resolve()
			},
			delaiInitialMs: 20,
		})
		stop()
		await new Promise(resolve => setTimeout(resolve, 40))
		expect(launches).toBe(0)
	})
})
