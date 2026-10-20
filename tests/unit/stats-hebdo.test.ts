import { describe, expect, test } from 'bun:test'
import {
	aggregateAuth,
	aggregateContact,
	aggregateStats,
	headerToken,
	PERIOD_MAX_DAYS,
	type ProfileForStats,
	percentile,
	readPeriod,
	tokenValid,
	WeeklyStats,
} from '@/lib/weekly-stats'
import { methodNotAllowed, respondToStats } from '@/services/analytics/stats-response'
import exemple from '../../docs/mesure/stats-hebdo.exemple.json'

const periode = { debut: new Date('2026-10-05T00:00:00+02:00'), fin: new Date('2026-10-12T00:00:00+02:00') }
const maintenant = new Date('2026-10-14T10:00:00Z')

const profil = (surcharge: Partial<ProfileForStats> & { slug: string }): ProfileForStats => ({
	createdAt: '2026-01-10T10:00:00.000Z',
	updatedAt: '2026-01-10T10:00:00.000Z',
	status: 'published',
	completeness: 0,
	active: false,
	publishable: false,
	fullyEmpty: true,
	...surcharge,
})

describe('lirePeriode', () => {
	const lire = (requete: string) => readPeriod(new URLSearchParams(requete))

	test('two instants, from before to', () => {
		const lue = lire('from=2026-10-05T00:00:00%2B02:00&to=2026-10-12T00:00:00Z')
		expect(lue?.debut.toISOString()).toBe('2026-10-04T22:00:00.000Z')
		expect(lue?.fin.toISOString()).toBe('2026-10-12T00:00:00.000Z')
	})

	test.each([
		'',
		'from=2026-10-05T00:00:00Z',
		'to=2026-10-12T00:00:00Z',
		'from=2026-10-12T00:00:00Z&to=2026-10-05T00:00:00Z',
		'from=2026-10-05T00:00:00Z&to=2026-10-05T00:00:00Z',
		'from=hier&to=aujourdhui',
		'from=2026-10-05&to=2026-10-12',
		'from=2026-13-45T00:00:00Z&to=2026-14-45T00:00:00Z',
		'from=2026-10-05T00:00:00Z&from=2026-10-06T00:00:00Z&to=2026-10-12T00:00:00Z',
		'from=1760000000000&to=1760600000000',
	])('refused: %p', requete => {
		expect(lire(requete)).toBeUndefined()
	})

	test('at most 92 days', () => {
		expect(PERIOD_MAX_DAYS).toBe(92)
		expect(lire('from=2026-01-01T00:00:00Z&to=2026-04-03T00:00:00Z')).toBeDefined()
		expect(lire('from=2026-01-01T00:00:00Z&to=2026-04-04T00:00:01Z')).toBeUndefined()
	})
})

describe('the token', () => {
	const jeton = 'a'.repeat(40)

	test('Bearer only', () => {
		expect(headerToken(`Bearer ${jeton}`)).toBe(jeton)
		for (const entete of [null, '', 'Basic abc', `Bearer`, `Bearer ${jeton} extra`, jeton]) {
			expect(headerToken(entete)).toBeUndefined()
		}
	})

	test('exact match; no configured token means nobody gets in', () => {
		expect(tokenValid(`Bearer ${jeton}`, jeton)).toBe(true)
		expect(tokenValid(`Bearer ${jeton}x`, jeton)).toBe(false)
		expect(tokenValid(`Bearer ${jeton}`, undefined)).toBe(false)
		expect(tokenValid('Bearer ', '')).toBe(false)
		expect(tokenValid(null, jeton)).toBe(false)
	})
})

describe('the answers of the route', () => {
	const jeton = 'b'.repeat(40)
	const lire = async () => aggregateStats({ profils: [], datesDesComptes: [], periode, maintenant })
	const demande = (requete: string, entete?: string) =>
		new Request(`http://localhost/api/stats/weekly?${requete}`, entete ? { headers: { authorization: entete } } : {})
	const bonne = 'from=2026-10-05T00:00:00Z&to=2026-10-12T00:00:00Z'

	test('401 without a token, or with a wrong one, or when none is configured; never cached', async () => {
		for (const [entete, attendu] of [
			[undefined, jeton],
			['Bearer faux', jeton],
			[`Bearer ${jeton}`, undefined],
		] as const) {
			const reponse = await respondToStats(demande(bonne, entete), { jeton: attendu, lire })
			expect(reponse.status).toBe(401)
			expect(reponse.headers.get('Cache-Control')).toBe('no-store')
			expect(reponse.headers.get('X-Robots-Tag')).toBe('noindex')
		}
	})

	test('400 for a period that cannot be read, after the token', async () => {
		const reponse = await respondToStats(demande('from=x', `Bearer ${jeton}`), { jeton, lire })
		expect(reponse.status).toBe(400)
		expect(reponse.headers.get('Cache-Control')).toBe('no-store')
		const sansJeton = await respondToStats(demande('from=x'), { jeton, lire })
		expect(sansJeton.status).toBe(401)
	})

	test('200 with the token, never cached', async () => {
		const reponse = await respondToStats(demande(bonne, `Bearer ${jeton}`), { jeton, lire })
		expect(reponse.status).toBe(200)
		expect(reponse.headers.get('Cache-Control')).toBe('no-store')
		expect(WeeklyStats.safeParse(await reponse.json()).success).toBe(true)
	})

	test('any other verb is 405, with Allow', () => {
		const reponse = methodNotAllowed()
		expect(reponse.status).toBe(405)
		expect(reponse.headers.get('Allow')).toBe('GET')
		expect(reponse.headers.get('Cache-Control')).toBe('no-store')
	})
})

describe('agregerStats', () => {
	const profils: ProfileForStats[] = [
		profil({
			slug: 'ada-fictive',
			firstName: 'Ada',
			lastName: 'Fictive',
			createdAt: '2026-10-06T08:00:00.000Z',
			updatedAt: '2026-10-07T08:00:00.000Z',
			completeness: 13,
			active: true,
			publishable: true,
			fullyEmpty: false,
			city: { name: 'Annecy', inseeCode: '74010', department: '74' },
			contactDetails: { phone: '0639980001', email: 'ada@example.test' },
			publicContact: true,
		}),
		profil({
			slug: 'brouillon-fictif',
			createdAt: '2026-09-20T08:00:00.000Z',
			completeness: 3,
			active: true,
			fullyEmpty: false,
			status: 'draft',
		}),
		profil({
			slug: 'masquee-fictive',
			completeness: 12,
			active: true,
			publishable: true,
			fullyEmpty: false,
			status: 'hidden',
			city: { department: '44' },
		}),
		profil({ slug: 'vide-fictive', createdAt: '2026-10-08T08:00:00.000Z', completeness: 1 }),
	]
	const stats = aggregateStats({
		profils,
		datesDesComptes: ['2026-01-01T00:00:00.000Z', '2026-10-06T08:00:00.000Z', '2026-10-08T08:00:00.000Z'],
		periode,
		maintenant,
	})

	test('exact counts', () => {
		expect(stats.profiles).toEqual({
			total: 4,
			fullyEmpty: 1,
			active: 3,
			publishable: 1,
			hidden: 1,
			complete11: 2,
			nearlyEmpty: 1,
			noChannel: 3,
			modified90d: 1,
			created: 2,
		})
		expect(stats.cohort).toEqual({ profiles: 1, active: 1 })
		expect(stats.accounts).toEqual({ total: 3, new: 2 })
		expect(stats.signUps).toEqual([
			{ createdOn: '2026-10-06', completeness: 13, active: true, publishable: true },
			{ createdOn: '2026-10-08', completeness: 1, active: false, publishable: false },
		])
		expect(stats.publishable).toEqual({ byDepartment: { '74': 1 }, slugs: ['ada-fictive'] })
	})

	test('a hidden publishable profile has no slug in the answer', () => {
		expect(JSON.stringify(stats)).not.toContain('masquee-fictive')
		expect(JSON.stringify(stats)).not.toContain('brouillon-fictif')
	})

	test('no personal data outside the slugs: no @, no run of 9 digits, no name', () => {
		const sansSlugs = JSON.stringify({ ...stats, publishable: { ...stats.publishable, slugs: [] } })
		expect(sansSlugs).not.toContain('@')
		expect(sansSlugs).not.toMatch(/\d{9}/)
		for (const nom of ['Ada', 'Fictive', 'Annecy', 'example.test']) expect(sansSlugs).not.toContain(nom)
	})

	test('the answer fits the schema, and the schema refuses an extra key', () => {
		expect(WeeklyStats.safeParse(stats).success).toBe(true)
		expect(WeeklyStats.safeParse({ ...stats, email: 'x' }).success).toBe(false)
		expect(WeeklyStats.safeParse({ ...stats, accounts: { ...stats.accounts, nom: 'x' } }).success).toBe(false)
	})

	test('the answer is version 2, with English keys only: a version 1 answer is refused', () => {
		expect(stats.version).toBe(2)
		expect(WeeklyStats.safeParse({ ...stats, version: 1 }).success).toBe(false)
		const cles = (valeur: unknown): string[] =>
			valeur !== null && typeof valeur === 'object'
				? Object.entries(valeur).flatMap(([cle, v]) => [cle, ...cles(v)])
				: []
		for (const ancienne of ['periode', 'genereLe', 'comptes', 'profils', 'entierementVides', 'inscriptions', 'parCode'])
			expect(cles(stats)).not.toContain(ancienne)
	})
})

describe('the published example', () => {
	test('fits the schema', () => {
		expect(WeeklyStats.parse(exemple)).toEqual(exemple as unknown as WeeklyStats)
	})

	test('carries no personal data', () => {
		const sansSlugs = JSON.stringify({ ...exemple, publishable: { ...exemple.publishable, slugs: [] } })
		expect(sansSlugs).not.toContain('@')
		expect(sansSlugs).not.toMatch(/\d{9}/)
	})
})

describe('ticket 169: contact messages, sign-ins and inherited hashes', () => {
	test('agregerContact: one message per state, every state of the closed lists present', () => {
		const contact = aggregateContact([
			{ status: 'new', mailStatus: 'pending' },
			{ status: 'forwarded', mailStatus: 'sent' },
			{ status: 'answered', mailStatus: 'sent' },
			{ status: 'spam', mailStatus: 'failed' },
			{ status: 'inconnu', mailStatus: null },
		])
		expect(contact.total).toBe(5)
		expect(contact.byStatus).toEqual({ new: 1, forwarded: 1, answered: 1, spam: 1 })
		expect(contact.byMailState).toEqual({ pending: 1, sent: 2, failed: 1 })
		expect(aggregateContact([]).byStatus).toEqual({ new: 0, forwarded: 0, answered: 0, spam: 0 })
	})

	test('centile: nearest rank, null when empty', () => {
		expect(percentile([], 0.95)).toBeNull()
		expect(percentile([7], 0.95)).toBe(7)
		expect(
			percentile(
				Array.from({ length: 100 }, (_, i) => 100 - i),
				0.95
			)
		).toBe(95)
		expect(percentile([10, 20, 30, 40], 0.95)).toBe(40)
		expect(percentile([10, 20, 30, 40], 0.5)).toBe(20)
	})

	test('agregerAuth: by kind, the sign-ins by code, the 95th percentile of their durations only', () => {
		const auth = aggregateAuth([
			{ type: 'sign-in', code: 'ok', durationMs: 100 },
			{ type: 'sign-in', code: 'ok', durationMs: 300 },
			{ type: 'sign-in', code: 'heritee', durationMs: 900 },
			{ type: 'sign-in', code: 'identifiants-invalides' },
			{ type: 'sign-out', code: 'ok', durationMs: 5000 },
			{ type: 'sign-up', code: 'champ-piege' },
			{ type: 'pirate', code: 'ok' },
		])
		expect(auth.byType['sign-in']).toBe(4)
		expect(auth.byType['sign-out']).toBe(1)
		expect(auth.byType['sign-up']).toBe(1)
		expect(Object.values(auth.byType).reduce((a, b) => a + b, 0)).toBe(6)
		expect(auth.signIns.total).toBe(4)
		expect(auth.signIns.byCode.ok).toBe(2)
		expect(auth.signIns.byCode.heritee).toBe(1)
		expect(auth.signIns.byCode['champ-piege']).toBe(0)
		expect(auth.signIns.durationP95Ms).toBe(900)
		expect(aggregateAuth([]).signIns.durationP95Ms).toBeNull()
	})

	test('the new keys are optional: an answer without them, the old example, still fits; a stray key does not', () => {
		const { contact: _c, auth: _a, inherited: _h, ...ancien } = exemple as unknown as WeeklyStats
		expect(WeeklyStats.safeParse(ancien).success).toBe(true)
		const avec = WeeklyStats.parse(exemple)
		expect(avec.contact?.total).toBe(3)
		expect(WeeklyStats.safeParse({ ...avec, contact: { ...avec.contact, email: 'x' } }).success).toBe(false)
		expect(WeeklyStats.safeParse({ ...avec, inherited: { remainingHashes: 1 } }).success).toBe(false)
	})
})
