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

function lecture(surcharge: Partial<Parameters<typeof respondToDelta>[1]> = {}) {
	const lus: Date[] = []
	const journal: string[] = []
	return {
		lus,
		log: journal,
		options: {
			place: 'site' as const,
			cutoverDate: '2026-11-02',
			isAdmin: async () => true as boolean | 'anonyme',
			read: async (depuis: Date) => {
				lus.push(depuis)
				return DELTA
			},
			log: (ligne: string) => {
				journal.push(ligne)
			},
			...surcharge,
		},
	}
}

const demander = (adresse = 'https://my-makeup.fr/api/cutover/delta') => new Request(adresse)

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
		for (const mauvais of [undefined, '', '2026-02-30', '02/11/2026', '2026-11-02T08:00:00Z'])
			expect(cutoverStart(mauvais)).toBeUndefined()
	})
	test('un instant ISO avec son fuseau', () => {
		expect(readInstant('2026-11-02T08:30:00Z')?.toISOString()).toBe('2026-11-02T08:30:00.000Z')
		expect(readInstant('2026-11-02T10:30:00+02:00')?.toISOString()).toBe('2026-11-02T08:30:00.000Z')
		for (const mauvais of ['2026-11-02', '2026-11-02T08:30:00', 'hier', '2026-13-40T00:00:00Z', ''])
			expect(readInstant(mauvais)).toBeUndefined()
	})
})

describe('la réponse', () => {
	test('hors du site : 403, rien n’est demandé ni lu', async () => {
		let demande = false
		const { options, lus } = lecture({
			place: 'autre',
			isAdmin: async () => {
				demande = true
				return true
			},
		})
		const reponse = await respondToDelta(demander(), options)
		expect(reponse.status).toBe(403)
		expect(demande).toBe(false)
		expect(lus).toEqual([])
	})

	test('sans session : 401 ; une maquilleuse : 403 ; rien n’est lu', async () => {
		const anonyme = lecture({ isAdmin: async () => 'anonyme' })
		expect((await respondToDelta(demander(), anonyme.options)).status).toBe(401)
		const maquilleuse = lecture({ isAdmin: async () => false })
		expect((await respondToDelta(demander(), maquilleuse.options)).status).toBe(403)
		expect([...anonyme.lus, ...maquilleuse.lus]).toEqual([])
	})

	test('un admin reçoit le fichier, depuis le jour de CUTOVER_DATE par défaut', async () => {
		const { options, lus, log: journal } = lecture()
		const reponse = await respondToDelta(demander(), options)
		expect(reponse.status).toBe(200)
		expect(lus.map(date => date.toISOString())).toEqual(['2026-11-02T00:00:00.000Z'])
		expect(reponse.headers.get('cache-control')).toBe('no-store')
		expect(reponse.headers.get('x-robots-tag')).toBe('noindex')
		expect(reponse.headers.get('content-disposition')).toBe('attachment; filename="delta-since-2026-11-02.json"')
		expect(JSON.parse(await reponse.text())).toEqual(DELTA)
		// The log: counts and numeric identifiers, no address and no text.
		const texte = journal.join('\n')
		expect(texte).toContain('comptes : 2 (identifiants 7, 9)')
		expect(texte).toContain('messages : 1 (identifiants 5)')
		expect(texte).toContain('(identifiants 41)')
		expect(texte).not.toMatch(/@|ne doit jamais|fictive/)
	})

	test('?since prime sur CUTOVER_DATE, et deux appels donnent le même texte', async () => {
		const un = lecture()
		const deux = lecture({ cutoverDate: undefined })
		const adresse = 'https://my-makeup.fr/api/cutover/delta?since=2026-11-02T08:30:00Z'
		const premier = await (await respondToDelta(demander(adresse), un.options)).text()
		const second = await (await respondToDelta(demander(adresse), deux.options)).text()
		expect(un.lus.map(date => date.toISOString())).toEqual(['2026-11-02T08:30:00.000Z'])
		expect(premier).toBe(second)
		expect(premier).toBe(deltaAsText(DELTA))
	})

	test('sans CUTOVER_DATE ni depuis, ou avec un depuis illisible : 400', async () => {
		const sans = lecture({ cutoverDate: undefined })
		expect((await respondToDelta(demander(), sans.options)).status).toBe(400)
		const mauvais = lecture()
		expect(
			(await respondToDelta(demander('https://my-makeup.fr/api/cutover/delta?since=hier'), mauvais.options)).status
		).toBe(400)
		expect([...sans.lus, ...mauvais.lus]).toEqual([])
	})

	test('un autre verbe : 405', () => {
		expect(methodNotAllowed().status).toBe(405)
	})
})

describe('les secrets', () => {
	test('removeSecrets enlève toute clé de mot de passe, hash, sel, jeton ou session, à toute profondeur', () => {
		const propre = removeSecrets({
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
		expect(propre).toEqual({ email: 'a@example.test', imbrique: [{ nom: 'garde' }] })
	})

	test('le journal ne porte que des nombres', () => {
		for (const ligne of deltaLog(DELTA)) expect(ligne).not.toMatch(/@|\$2[aby]\$/)
	})
})
