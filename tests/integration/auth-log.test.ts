import { afterAll, describe, expect, test } from 'bun:test'
import { authLog, EVENT_CODES, EVENT_TYPES, log } from '@/lib/auth/auth-log'
import { createRateLimit } from '@/lib/auth/rate-limit'
import { signInWithPassword } from '@/lib/auth/sign-in'
import { openWithPassword } from '@/lib/auth/token'
import { runDailyTasks } from '@/lib/tasks/daily'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

/**
 * The journal of the authentication events (ticket 077). Who may read it is in the access matrix
 * (tests/integration/payload-access.test.ts); here, what is written, never what must not be, and the
 * purge.
 */

afterAll(async () => {
	await emptyBase()
})

const PASSWORD = 'aaaaaaaa'
const rateLimit = createRateLimit({ nom: 'essai-journal-int', limite: 1000, fenetreMs: 60_000 })
let n = 0
const url = () => new Headers({ 'x-forwarded-for': `192.0.2.${100 + (n++ % 100)}` })

async function lines() {
	const payload = await testPayload()
	return (await payload.find({ collection: 'auth-events', depth: 0, limit: 1000, pagination: false, sort: 'id' })).docs
}

async function openBy(payloadHeaders: Headers, email: unknown, password: unknown) {
	const payload = await testPayload()
	return signInWithPassword({
		ouvrir: data => openWithPassword(payload, 'pros', data),
		headers: payloadHeaders,
		email,
		password,
		frein: rateLimit,
		journal: authLog(payload),
	})
}

describe('une ligne par connexion, réussie ou refusée', () => {
	test('par le formulaire : une ligne « ok », une ligne « identifiants-invalides », et la date de dernière connexion', async () => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		const payload = await testPayload()
		const before = (await lines()).length

		const succeeded = await openBy(url(), account.email, PASSWORD)
		const refused = await openBy(url(), account.email, 'mauvais')

		expect(succeeded.ok).toBe(true)
		expect(refused).toEqual({ ok: false, code: 'identifiants-invalides' })
		const fresh = (await lines()).slice(before)
		expect(fresh.map(({ type, code }) => [type, code])).toEqual([
			['sign-in', 'ok'],
			['sign-in', 'identifiants-invalides'],
		])
		for (const line of fresh) {
			expect(typeof line.durationMs).toBe('number')
			expect(Number.isNaN(Date.parse(line.date))).toBe(false)
			expect(EVENT_CODES).toContain(line.code)
			expect(EVENT_TYPES).toContain(line.type)
		}
		const read = await payload.findByID({ collection: 'pros', id: account.id, depth: 0 })
		expect(Date.now() - Date.parse(read.lastSignInAt ?? '')).toBeLessThan(60_000)
	})

	test('par l’API REST : une ligne « ok », une « identifiants-invalides », une « trop-de-tentatives » quand le frein ferme', async () => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		const before = (await lines()).length
		const rest = (password: string, ip: string) =>
			callRest('POST', '/api/pros/login', {
				corps: { email: account.email, password },
				enTetes: { 'x-forwarded-for': ip },
			})

		expect((await rest(PASSWORD, '198.51.100.201')).statut).toBe(200)
		expect((await rest('mauvais', '198.51.100.201')).statut).toBe(401)
		for (let i = 0; i < 10; i++) await rest('mauvais', '198.51.100.202')
		expect((await rest('mauvais', '198.51.100.202')).statut).toBe(429)

		const codes = (await lines()).slice(before).map(({ code }) => code)
		expect(codes.filter(code => code === 'ok')).toHaveLength(1)
		expect(codes.filter(code => code === 'identifiants-invalides')).toHaveLength(11)
		expect(codes.filter(code => code === 'trop-de-tentatives')).toHaveLength(1)
		expect(codes).toHaveLength(13)
	})

	test('la date de dernière connexion est mise à jour par l’API REST aussi', async () => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		const payload = await testPayload()
		await payload.update({ collection: 'pros', id: account.id, data: { lastSignInAt: '2020-01-01T00:00:00.000Z' } })

		const response = await callRest('POST', '/api/pros/login', {
			corps: { email: account.email, password: PASSWORD },
			enTetes: { 'x-forwarded-for': '198.51.100.203' },
		})

		expect(response.statut).toBe(200)
		const read = await payload.findByID({ collection: 'pros', id: account.id, depth: 0 })
		expect(Date.now() - Date.parse(read.lastSignInAt ?? '')).toBeLessThan(60_000)
	})
})

describe('aucune donnée personnelle dans le journal, même glissée dans la saisie', () => {
	test('un email, un nom, un jeton, une IP et un mot de passe saisis ne laissent rien dans les lignes', async () => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		const slidMany = [
			'intruse.test@example.test',
			'Léa Intruse',
			'jeton-eyJhbGciOiJIUzI1NiJ9-secret',
			'203.0.113.77',
			'2001:db8:abcd:12::77',
			'mot-de-passe-glisse-12345',
		]
		const before = (await lines()).length

		// Through the form: the typed values, the address header, the account's own address.
		for (const slid of slidMany) {
			await openBy(new Headers({ 'x-forwarded-for': slid.includes('.') ? slid : '192.0.2.9' }), slid, slid)
			await openBy(url(), account.email, slid)
		}
		await openBy(url(), account.email, PASSWORD)
		// Through REST: the same values in the body and in the headers.
		for (const slid of slidMany)
			await callRest('POST', '/api/pros/login', {
				corps: { email: slid, password: slid },
				enTetes: { 'x-forwarded-for': '198.51.100.204', 'user-agent': slid, referer: `https://x.test/${slid}` },
			})
		// Written directly, with a value out of the list in each field.
		await log((await testPayload()) as never, { type: 'sign-in', code: slidMany[0] as never, durationMs: 3 } as never)

		const fresh = (await lines()).slice(before)
		expect(fresh.length).toBeGreaterThanOrEqual(20)
		const text = JSON.stringify(fresh)
		for (const slid of [...slidMany, account.email, String(account.id).padStart(8, '#')])
			expect(text).not.toContain(slid)
		for (const line of fresh)
			expect(Object.keys(line).sort()).toEqual(
				['code', 'date', 'durationMs', 'id', 'method', 'type'].filter(cle => cle in line)
			)
		expect(fresh.some(({ code }) => code === 'inconnu')).toBe(true)
		// About thirty sign-in attempts, each held back by the 300 ms floor: more than the 5 s default of bun.
	}, 60_000)
})

describe('un échec d’écriture du journal ne fait pas échouer la connexion', () => {
	test('la ligne ne peut pas s’écrire : la session est ouverte quand même', async () => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		const payload = await testPayload()
		const down = Object.assign(Object.create(payload), {
			create: () => Promise.reject(new Error('la table du journal est absente')),
		}) as typeof payload
		const before = (await lines()).length

		const result = await signInWithPassword({
			ouvrir: data => openWithPassword(payload, 'pros', data),
			headers: url(),
			email: account.email,
			password: PASSWORD,
			frein: rateLimit,
			journal: authLog(down),
		})

		expect(result.ok).toBe(true)
		expect((await lines()).length).toBe(before)
	})
})

describe('la purge à 90 jours, sur une horloge simulée', () => {
	const daysBefore = (maintenant: Date, jours: number, minutes = 0) =>
		new Date(maintenant.getTime() - jours * 86_400_000 - minutes * 60_000).toISOString()

	test('une ligne de 91 jours part, une de 89 jours reste ; une seconde passe ne change rien', async () => {
		const payload = await testPayload()
		const now = new Date()
		const write = (date: string) =>
			payload.create({ collection: 'auth-events', data: { type: 'sign-in', code: 'ok', date } })
		const old = await write(daysBefore(now, 91))
		const limit = await write(daysBefore(now, 90, 1))
		const recent = await write(daysBefore(now, 89))
		const today = await write(now.toISOString())

		const first = await runDailyTasks(payload, now)
		const remaining = (await lines()).map(({ id }) => id)

		expect(first).toContainEqual({ nom: 'purge-journal-authentification', supprimes: 2 })
		expect(remaining).not.toContain(old.id)
		expect(remaining).not.toContain(limit.id)
		expect(remaining).toContain(recent.id)
		expect(remaining).toContain(today.id)
		const second = await runDailyTasks(payload, now)
		expect(second).toContainEqual({ nom: 'purge-journal-authentification', supprimes: 0 })
	})
})
