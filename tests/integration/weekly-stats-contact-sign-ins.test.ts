import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { GET } from '@/app/api/stats/weekly/route'
import { type AuthEvent, log } from '@/lib/auth/auth-log'
import { replaceLegacyHash } from '@/lib/auth/legacy'
import { payloadStorage } from '@/lib/contact/payload-send'
import { WeeklyStats } from '@/lib/weekly-stats'
import { DATASET_TYPES, datasetUrl } from '../fixtures/accounts'
import { setBenchDataset } from '../fixtures/bench-dataset'
import { ACCOUNT_TYPES, FIXTURE_LEGACY_PASSWORD } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { emptyStorage } from '../support/s3'

/**
 * Ticket 169 (plan 04 §3.6; plan 01 §2.4 M6): the contact messages, the sign-ins and the inherited
 * hashes in GET /api/stats/weekly, on the set of the bench. One message in each state, sign-ins with
 * known durations, and the hashes the set promises.
 */

const TOKEN = 'jeton-de-service-du-banc-0123456789abcdef'
const before = process.env.STATS_TOKEN
const HEADERS = { authorization: `Bearer ${TOKEN}` }

const read = async (debut: Date, fin: Date) => {
	const url = `http://localhost/api/stats/weekly?from=${debut.toISOString()}&to=${fin.toISOString()}`
	const response = await GET(new Request(url, { headers: HEADERS }))
	expect(response.status).toBe(200)
	return WeeklyStats.parse(await response.json())
}

const around = () => [new Date(Date.now() - 3_600_000), new Date(Date.now() + 3_600_000)] as const

/** The sign-ins written below: one duration each, 100 to 1 000 ms. */
const SIGN_INS: AuthEvent[] = [
	...Array.from({ length: 6 }, (_, i): AuthEvent => ({ type: 'sign-in', code: 'ok', durationMs: 100 * (i + 1) })),
	{ type: 'sign-in', code: 'heritee', durationMs: 700 },
	{ type: 'sign-in', code: 'identifiants-invalides', durationMs: 800 },
	{ type: 'sign-in', code: 'identifiants-invalides', durationMs: 900 },
	{ type: 'sign-in', code: 'trop-de-tentatives', durationMs: 1000 },
]

beforeAll(async () => {
	process.env.STATS_TOKEN = TOKEN
	const payload = await testPayload()
	await Promise.all([emptyBase(), emptyStorage()])
	await setBenchDataset()
	// Creating the accounts of the set opened sessions: the journal and the messages start from zero.
	await payload.delete({ collection: 'auth-events', where: { id: { exists: true } }, overrideAccess: true })
	await payload.delete({ collection: 'contact-requests', where: { id: { exists: true } }, overrideAccess: true })

	const storage = payloadStorage(payload)
	const message = {
		prenom: 'Léa',
		nom: 'Témoin',
		email: 'visiteuse@example.test',
		telephone: '0199001234',
		message: 'Bonjour.',
	}
	const fresh = await storage.creer(message)
	const forwarded = await storage.creer(message)
	const answered = await storage.creer(message)
	const spam = await storage.creer(message)
	await storage.marquer(forwarded, 'sent', 'forwarded')
	await storage.marquer(answered, 'sent', 'answered')
	await storage.marquer(spam, 'failed', 'spam')
	expect(fresh).toBeGreaterThan(0)

	for (const event of [...SIGN_INS, { type: 'sign-out', code: 'ok', durationMs: 20_000 } as const])
		await log(payload, event)
	// A row of 2020 and a sign-in with no duration: the first is out of the period, the second counts without a duration.
	await payload.create({
		collection: 'auth-events',
		data: { type: 'sign-in', code: 'ok', durationMs: 60_000, date: '2020-01-02T10:00:00.000Z' },
		overrideAccess: true,
	})
	await log(payload, { type: 'sign-in', code: 'service-indisponible' })
}, 120_000)

afterAll(async () => {
	if (before === undefined) delete process.env.STATS_TOKEN
	else process.env.STATS_TOKEN = before
	await Promise.all([emptyBase(), emptyStorage()])
}, 60_000)

describe('Les statistiques hebdomadaires : messages de contact, connexions, comptes hérités', () => {
	test('un message par état : les nombres exacts, et zéro hors de la période', async () => {
		const stats = await read(...around())
		expect(stats.contact).toEqual({
			total: 4,
			byStatus: { new: 1, forwarded: 1, answered: 1, spam: 1 },
			byMailState: { pending: 1, sent: 2, failed: 1 },
		})
		const old = await read(new Date('2020-02-01T00:00:00Z'), new Date('2020-02-08T00:00:00Z'))
		expect(old.contact?.total).toBe(0)
		expect(Object.values(old.contact?.byStatus ?? {}).every(n => n === 0)).toBe(true)
	}, 60_000)

	test('les connexions par code et leur 95e centile ; les autres événements à part', async () => {
		const { auth } = await read(...around())
		const signIns = auth?.signIns
		expect(signIns?.total).toBe(SIGN_INS.length + 1)
		expect(signIns?.byCode).toMatchObject({
			ok: 6,
			heritee: 1,
			'identifiants-invalides': 2,
			'trop-de-tentatives': 1,
			'service-indisponible': 1,
			'compte-bloque': 0,
		})
		// Ten durations, 100 to 1 000: the nearest rank of the 95th percentile is the tenth. The row of 2020, the
		// sign-out and the sign-in with no duration do not move it.
		expect(signIns?.durationP95Ms).toBe(1000)
		expect(auth?.byType['sign-in']).toBe(SIGN_INS.length + 1)
		expect(auth?.byType['sign-out']).toBe(1)
		expect(auth?.byType['sign-up']).toBe(0)
	}, 60_000)

	test('une période sans connexion : zéro, et pas de centile', async () => {
		const { auth } = await read(new Date('2020-02-01T00:00:00Z'), new Date('2020-02-08T00:00:00Z'))
		expect(auth?.signIns.total).toBe(0)
		expect(auth?.signIns.durationP95Ms).toBeNull()
		const fromJanuary2 = await read(new Date('2020-01-02T00:00:00Z'), new Date('2020-01-03T00:00:00Z'))
		expect(fromJanuary2.auth?.signIns).toMatchObject({ total: 1, durationP95Ms: 60_000 })
	}, 60_000)

	test('ni IP, ni email, ni 9 chiffres dans les nouvelles clés', async () => {
		const { contact, auth, inherited } = await read(...around())
		const text = JSON.stringify({ contact, auth, inherited })
		expect(text).not.toContain('@')
		expect(text).not.toMatch(/\d{9}/)
		expect(text).not.toMatch(/\d+\.\d+\.\d+\.\d+/)
		for (const word of ['visiteuse', 'Léa', 'Témoin', 'Bonjour', 'example.test']) expect(text).not.toContain(word)
	}, 60_000)

	test('les hash hérités restants et les comptes sans mot de passe, par fournisseur d’origine', async () => {
		const promised = Object.values(ACCOUNT_TYPES).flatMap(type =>
			'reprise' in type && type.reprise ? [type.reprise] : []
		)
		const expectedWithoutHash = (fournisseur: 'google' | 'facebook') =>
			promised.filter(reprise => reprise.fournisseur === fournisseur && !reprise.hashHerite).length

		const { inherited } = await read(...around())
		expect(inherited?.remainingHashes).toBe(promised.filter(reprise => reprise.hashHerite).length)
		expect(inherited?.withoutPasswordByProvider).toEqual({
			google: expectedWithoutHash('google'),
			facebook: expectedWithoutHash('facebook'),
			other: 0,
		})
		// The fixed set holds every type of account once.
		expect(DATASET_TYPES.length).toBe(Object.keys(ACCOUNT_TYPES).length)
	}, 60_000)

	test('la première connexion avec l’ancien mot de passe fait baisser le nombre de hash restants, et rien d’autre', async () => {
		const payload = await testPayload()
		const beforeSignIn = (await read(...around())).inherited
		const accepted = await replaceLegacyHash(payload, {
			email: datasetUrl('reprise-avec-hash'),
			password: FIXTURE_LEGACY_PASSWORD,
		})
		expect(accepted).toBe(true)
		const after = (await read(...around())).inherited
		expect(after?.remainingHashes).toBe((beforeSignIn?.remainingHashes ?? 0) - 1)
		expect(after?.withoutPasswordByProvider).toEqual(beforeSignIn?.withoutPasswordByProvider)
	}, 60_000)
})
