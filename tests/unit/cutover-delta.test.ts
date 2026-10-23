import { describe, expect, test } from 'bun:test'
import { cutoverStart, exportPlace, methodNotAllowed, readInstant, respondToDelta } from '@/lib/cutover/delta-response'
import { DELTA_FORMAT, type DeltaExport, deltaAsText, deltaLog, removeSecrets } from '@/lib/cutover/export-delta'

/** Ticket 234: the answer of the export of the delta, with what it reads given by the test. */

const DELTA: DeltaExport = {
	format: DELTA_FORMAT,
	since: '2026-11-02T00:00:00.000Z',
	counts: { accounts: 2, profiles: 1, photos: 0, messages: 1, deletedAccounts: 1 },
	accounts: [
		{ id: 7, sinceCutover: 'created', email: 'a@example.test' },
		{ id: 9, sinceCutover: 'updated', email: 'b@example.test' },
	],
	profiles: [{ id: 3, sinceCutover: 'created', slug: 'fictive' }],
	photos: [],
	messages: [{ id: 5, sinceCutover: 'created', message: 'Un texte qui ne doit jamais aller au journal.' }],
	deletedAccounts: [{ strapiId: 41, date: '2026-11-03T10:00:00.000Z' }],
}

function reading(surcharge: Partial<Parameters<typeof respondToDelta>[1]> = {}) {
	const read: Date[] = []
	const log: string[] = []
	return {
		lus: read,
		log: log,
		options: {
			place: 'site' as const,
			cutoverDate: '2026-11-02',
			isAdmin: async () => true as boolean | 'anonyme',
			read: async (depuis: Date) => {
				read.push(depuis)
				return DELTA
			},
			log: (ligne: string) => {
				log.push(ligne)
			},
			...surcharge,
		},
	}
}

const makeRequest = (adresse = 'https://my-makeup.fr/api/cutover/delta') => new Request(adresse)

describe('où tourne l’export', () => {
	test('le site seulement', () => {
		const site = { NODE_ENV: 'production', APP_ENV: 'prod', NEXT_PUBLIC_SITE_URL: 'https://my-makeup.fr' }
		expect(exportPlace(site)).toBe('site')
		expect(exportPlace({ ...site, NODE_ENV: 'development' })).toBe('autre')
		expect(exportPlace({ ...site, APP_ENV: 'test' })).toBe('autre')
		expect(exportPlace({ ...site, APP_ENV: undefined })).toBe('autre')
		expect(exportPlace({ ...site, NEXT_PUBLIC_SITE_URL: 'http://localhost:3100' })).toBe('autre')
		expect(exportPlace({})).toBe('autre')
	})
})

describe('le début de la fenêtre', () => {
	test('le jour de la bascule à 00:00 UTC, ou rien', () => {
		expect(cutoverStart('2026-11-02')?.toISOString()).toBe('2026-11-02T00:00:00.000Z')
		for (const bad of [undefined, '', '2026-02-30', '02/11/2026', '2026-11-02T08:00:00Z'])
			expect(cutoverStart(bad)).toBeUndefined()
	})
	test('un instant ISO avec son fuseau', () => {
		expect(readInstant('2026-11-02T08:30:00Z')?.toISOString()).toBe('2026-11-02T08:30:00.000Z')
		expect(readInstant('2026-11-02T10:30:00+02:00')?.toISOString()).toBe('2026-11-02T08:30:00.000Z')
		for (const bad of ['2026-11-02', '2026-11-02T08:30:00', 'hier', '2026-13-40T00:00:00Z', ''])
			expect(readInstant(bad)).toBeUndefined()
	})
})

describe('la réponse', () => {
	test('hors du site : 403, rien n’est demandé ni lu', async () => {
		let request = false
		const { options, lus: read } = reading({
			place: 'autre',
			isAdmin: async () => {
				request = true
				return true
			},
		})
		const response = await respondToDelta(makeRequest(), options)
		expect(response.status).toBe(403)
		expect(request).toBe(false)
		expect(read).toEqual([])
	})

	test('sans session : 401 ; une maquilleuse : 403 ; rien n’est lu', async () => {
		const anonymous = reading({ isAdmin: async () => 'anonyme' })
		expect((await respondToDelta(makeRequest(), anonymous.options)).status).toBe(401)
		const artist = reading({ isAdmin: async () => false })
		expect((await respondToDelta(makeRequest(), artist.options)).status).toBe(403)
		expect([...anonymous.lus, ...artist.lus]).toEqual([])
	})

	test('un admin reçoit le fichier, depuis le jour de CUTOVER_DATE par défaut', async () => {
		const { options, lus: read, log } = reading()
		const response = await respondToDelta(makeRequest(), options)
		expect(response.status).toBe(200)
		expect(read.map(date => date.toISOString())).toEqual(['2026-11-02T00:00:00.000Z'])
		expect(response.headers.get('cache-control')).toBe('no-store')
		expect(response.headers.get('x-robots-tag')).toBe('noindex')
		expect(response.headers.get('content-disposition')).toBe('attachment; filename="delta-since-2026-11-02.json"')
		expect(JSON.parse(await response.text())).toEqual(DELTA)
		// The log: counts and numeric identifiers, no address and no text.
		const text = log.join('\n')
		expect(text).toContain('comptes : 2 (identifiants 7, 9)')
		expect(text).toContain('messages : 1 (identifiants 5)')
		expect(text).toContain('(identifiants 41)')
		expect(text).not.toMatch(/@|ne doit jamais|fictive/)
	})

	test('?since prime sur CUTOVER_DATE, et deux appels donnent le même texte', async () => {
		const one = reading()
		const two = reading({ cutoverDate: undefined })
		const url = 'https://my-makeup.fr/api/cutover/delta?since=2026-11-02T08:30:00Z'
		const first = await (await respondToDelta(makeRequest(url), one.options)).text()
		const second = await (await respondToDelta(makeRequest(url), two.options)).text()
		expect(one.lus.map(date => date.toISOString())).toEqual(['2026-11-02T08:30:00.000Z'])
		expect(first).toBe(second)
		expect(first).toBe(deltaAsText(DELTA))
	})

	test('sans CUTOVER_DATE ni depuis, ou avec un depuis illisible : 400', async () => {
		const without = reading({ cutoverDate: undefined })
		expect((await respondToDelta(makeRequest(), without.options)).status).toBe(400)
		const bad = reading()
		expect(
			(await respondToDelta(makeRequest('https://my-makeup.fr/api/cutover/delta?since=hier'), bad.options)).status
		).toBe(400)
		expect([...without.lus, ...bad.lus]).toEqual([])
	})

	test('un autre verbe : 405', () => {
		expect(methodNotAllowed().status).toBe(405)
	})
})

describe('les secrets', () => {
	test('removeSecrets enlève toute clé de mot de passe, hash, sel, jeton ou session, à toute profondeur', () => {
		const own = removeSecrets({
			email: 'a@example.test',
			hash: 'x',
			salt: 'x',
			legacyBcrypt: 'x',
			resetPasswordToken: 'x',
			_verificationToken: 'x',
			password: 'x',
			sessions: [{ id: 'x' }],
			loginAttempts: 1,
			lockUntil: 'x',
			imbrique: [{ nom: 'garde', apiKey: 'x', secretCache: 'x' }],
		})
		expect(own).toEqual({ email: 'a@example.test', imbrique: [{ nom: 'garde' }] })
	})

	test('le journal ne porte que des nombres', () => {
		for (const line of deltaLog(DELTA)) expect(line).not.toMatch(/@|\$2[aby]\$/)
	})
})
