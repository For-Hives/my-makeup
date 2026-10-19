import { describe, expect, test } from 'bun:test'
import {
	deltaEnTexte,
	type ExportDuDelta,
	FORMAT_DU_DELTA,
	journalDuDelta,
	retirerLesSecrets,
} from '@/lib/bascule/export-delta'
import {
	debutDeLaBascule,
	lieuDeLExport,
	lireLInstant,
	methodeNonPermise,
	repondreAuDelta,
} from '@/lib/bascule/reponse-delta'

/** Ticket 234: the answer of the export of the delta, with what it reads given by the test. */

const DELTA: ExportDuDelta = {
	format: FORMAT_DU_DELTA,
	depuis: '2026-11-02T00:00:00.000Z',
	nombres: { comptes: 2, profils: 1, photos: 0, messages: 1, comptesSupprimes: 1 },
	comptes: [
		{ id: 7, depuisLaBascule: 'cree', email: 'a@example.test' },
		{ id: 9, depuisLaBascule: 'modifie', email: 'b@example.test' },
	],
	profils: [{ id: 3, depuisLaBascule: 'cree', slug: 'fictive' }],
	photos: [],
	messages: [{ id: 5, depuisLaBascule: 'cree', message: 'Un texte qui ne doit jamais aller au journal.' }],
	comptesSupprimes: [{ strapiId: 41, date: '2026-11-03T10:00:00.000Z' }],
}

function lecture(surcharge: Partial<Parameters<typeof repondreAuDelta>[1]> = {}) {
	const lus: Date[] = []
	const journal: string[] = []
	return {
		lus,
		journal,
		options: {
			lieu: 'site' as const,
			basculeLe: '2026-11-02',
			estAdmin: async () => true as boolean | 'anonyme',
			lire: async (depuis: Date) => {
				lus.push(depuis)
				return DELTA
			},
			journal: (ligne: string) => {
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
		expect(lieuDeLExport(site)).toBe('site')
		expect(lieuDeLExport({ ...site, NODE_ENV: 'development' })).toBe('autre')
		expect(lieuDeLExport({ ...site, APP_ENV: 'test' })).toBe('autre')
		expect(lieuDeLExport({ ...site, APP_ENV: undefined })).toBe('autre')
		expect(lieuDeLExport({ ...site, NEXT_PUBLIC_SITE_URL: 'http://localhost:3100' })).toBe('autre')
		expect(lieuDeLExport({})).toBe('autre')
	})
})

describe('le début de la fenêtre', () => {
	test('le jour de la bascule à 00:00 UTC, ou rien', () => {
		expect(debutDeLaBascule('2026-11-02')?.toISOString()).toBe('2026-11-02T00:00:00.000Z')
		for (const mauvais of [undefined, '', '2026-02-30', '02/11/2026', '2026-11-02T08:00:00Z'])
			expect(debutDeLaBascule(mauvais)).toBeUndefined()
	})
	test('un instant ISO avec son fuseau', () => {
		expect(lireLInstant('2026-11-02T08:30:00Z')?.toISOString()).toBe('2026-11-02T08:30:00.000Z')
		expect(lireLInstant('2026-11-02T10:30:00+02:00')?.toISOString()).toBe('2026-11-02T08:30:00.000Z')
		for (const mauvais of ['2026-11-02', '2026-11-02T08:30:00', 'hier', '2026-13-40T00:00:00Z', ''])
			expect(lireLInstant(mauvais)).toBeUndefined()
	})
})

describe('la réponse', () => {
	test('hors du site : 403, rien n’est demandé ni lu', async () => {
		let demande = false
		const { options, lus } = lecture({
			lieu: 'autre',
			estAdmin: async () => {
				demande = true
				return true
			},
		})
		const reponse = await repondreAuDelta(demander(), options)
		expect(reponse.status).toBe(403)
		expect(demande).toBe(false)
		expect(lus).toEqual([])
	})

	test('sans session : 401 ; une maquilleuse : 403 ; rien n’est lu', async () => {
		const anonyme = lecture({ estAdmin: async () => 'anonyme' })
		expect((await repondreAuDelta(demander(), anonyme.options)).status).toBe(401)
		const maquilleuse = lecture({ estAdmin: async () => false })
		expect((await repondreAuDelta(demander(), maquilleuse.options)).status).toBe(403)
		expect([...anonyme.lus, ...maquilleuse.lus]).toEqual([])
	})

	test('un admin reçoit le fichier, depuis le jour de BASCULE_LE par défaut', async () => {
		const { options, lus, journal } = lecture()
		const reponse = await repondreAuDelta(demander(), options)
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

	test('?since prime sur BASCULE_LE, et deux appels donnent le même texte', async () => {
		const un = lecture()
		const deux = lecture({ basculeLe: undefined })
		const adresse = 'https://my-makeup.fr/api/cutover/delta?since=2026-11-02T08:30:00Z'
		const premier = await (await repondreAuDelta(demander(adresse), un.options)).text()
		const second = await (await repondreAuDelta(demander(adresse), deux.options)).text()
		expect(un.lus.map(date => date.toISOString())).toEqual(['2026-11-02T08:30:00.000Z'])
		expect(premier).toBe(second)
		expect(premier).toBe(deltaEnTexte(DELTA))
	})

	test('sans BASCULE_LE ni depuis, ou avec un depuis illisible : 400', async () => {
		const sans = lecture({ basculeLe: undefined })
		expect((await repondreAuDelta(demander(), sans.options)).status).toBe(400)
		const mauvais = lecture()
		expect(
			(await repondreAuDelta(demander('https://my-makeup.fr/api/cutover/delta?since=hier'), mauvais.options)).status
		).toBe(400)
		expect([...sans.lus, ...mauvais.lus]).toEqual([])
	})

	test('un autre verbe : 405', () => {
		expect(methodeNonPermise().status).toBe(405)
	})
})

describe('les secrets', () => {
	test('retirerLesSecrets enlève toute clé de mot de passe, hash, sel, jeton ou session, à toute profondeur', () => {
		const propre = retirerLesSecrets({
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
		for (const ligne of journalDuDelta(DELTA)) expect(ligne).not.toMatch(/@|\$2[aby]\$/)
	})
})
