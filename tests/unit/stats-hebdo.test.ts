import { describe, expect, test } from 'bun:test'
import {
	agregerStats,
	jetonDeLEntete,
	jetonValide,
	lirePeriode,
	PERIODE_MAX_JOURS,
	type ProfilPourStats,
	StatsHebdo,
} from '@/lib/stats-hebdo'
import { methodeNonPermise, repondreAuxStats } from '@/services/mesure/reponse-stats'
import exemple from '../../docs/mesure/stats-hebdo.exemple.json'

const periode = { debut: new Date('2026-10-05T00:00:00+02:00'), fin: new Date('2026-10-12T00:00:00+02:00') }
const maintenant = new Date('2026-10-14T10:00:00Z')

const profil = (surcharge: Partial<ProfilPourStats> & { slug: string }): ProfilPourStats => ({
	createdAt: '2026-01-10T10:00:00.000Z',
	updatedAt: '2026-01-10T10:00:00.000Z',
	statut: 'publie',
	completude: 0,
	actif: false,
	publiable: false,
	entierementVide: true,
	...surcharge,
})

describe('lirePeriode', () => {
	const lire = (requete: string) => lirePeriode(new URLSearchParams(requete))

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
		expect(PERIODE_MAX_JOURS).toBe(92)
		expect(lire('from=2026-01-01T00:00:00Z&to=2026-04-03T00:00:00Z')).toBeDefined()
		expect(lire('from=2026-01-01T00:00:00Z&to=2026-04-04T00:00:01Z')).toBeUndefined()
	})
})

describe('the token', () => {
	const jeton = 'a'.repeat(40)

	test('Bearer only', () => {
		expect(jetonDeLEntete(`Bearer ${jeton}`)).toBe(jeton)
		for (const entete of [null, '', 'Basic abc', `Bearer`, `Bearer ${jeton} extra`, jeton]) {
			expect(jetonDeLEntete(entete)).toBeUndefined()
		}
	})

	test('exact match; no configured token means nobody gets in', () => {
		expect(jetonValide(`Bearer ${jeton}`, jeton)).toBe(true)
		expect(jetonValide(`Bearer ${jeton}x`, jeton)).toBe(false)
		expect(jetonValide(`Bearer ${jeton}`, undefined)).toBe(false)
		expect(jetonValide('Bearer ', '')).toBe(false)
		expect(jetonValide(null, jeton)).toBe(false)
	})
})

describe('the answers of the route', () => {
	const jeton = 'b'.repeat(40)
	const lire = async () => agregerStats({ profils: [], datesDesComptes: [], periode, maintenant })
	const demande = (requete: string, entete?: string) =>
		new Request(`http://localhost/api/stats/weekly?${requete}`, entete ? { headers: { authorization: entete } } : {})
	const bonne = 'from=2026-10-05T00:00:00Z&to=2026-10-12T00:00:00Z'

	test('401 without a token, or with a wrong one, or when none is configured; never cached', async () => {
		for (const [entete, attendu] of [
			[undefined, jeton],
			['Bearer faux', jeton],
			[`Bearer ${jeton}`, undefined],
		] as const) {
			const reponse = await repondreAuxStats(demande(bonne, entete), { jeton: attendu, lire })
			expect(reponse.status).toBe(401)
			expect(reponse.headers.get('Cache-Control')).toBe('no-store')
			expect(reponse.headers.get('X-Robots-Tag')).toBe('noindex')
		}
	})

	test('400 for a period that cannot be read, after the token', async () => {
		const reponse = await repondreAuxStats(demande('from=x', `Bearer ${jeton}`), { jeton, lire })
		expect(reponse.status).toBe(400)
		expect(reponse.headers.get('Cache-Control')).toBe('no-store')
		const sansJeton = await repondreAuxStats(demande('from=x'), { jeton, lire })
		expect(sansJeton.status).toBe(401)
	})

	test('200 with the token, never cached', async () => {
		const reponse = await repondreAuxStats(demande(bonne, `Bearer ${jeton}`), { jeton, lire })
		expect(reponse.status).toBe(200)
		expect(reponse.headers.get('Cache-Control')).toBe('no-store')
		expect(StatsHebdo.safeParse(await reponse.json()).success).toBe(true)
	})

	test('any other verb is 405, with Allow', () => {
		const reponse = methodeNonPermise()
		expect(reponse.status).toBe(405)
		expect(reponse.headers.get('Allow')).toBe('GET')
		expect(reponse.headers.get('Cache-Control')).toBe('no-store')
	})
})

describe('agregerStats', () => {
	const profils: ProfilPourStats[] = [
		profil({
			slug: 'ada-fictive',
			prenom: 'Ada',
			nom: 'Fictive',
			createdAt: '2026-10-06T08:00:00.000Z',
			updatedAt: '2026-10-07T08:00:00.000Z',
			completude: 13,
			actif: true,
			publiable: true,
			entierementVide: false,
			commune: { nom: 'Annecy', codeInsee: '74010', departement: '74' },
			coordonnees: { telephone: '0639980001', email: 'ada@example.test' },
			contactPublic: true,
		}),
		profil({
			slug: 'brouillon-fictif',
			createdAt: '2026-09-20T08:00:00.000Z',
			completude: 3,
			actif: true,
			entierementVide: false,
			statut: 'brouillon',
		}),
		profil({
			slug: 'masquee-fictive',
			completude: 12,
			actif: true,
			publiable: true,
			entierementVide: false,
			statut: 'masque',
			commune: { departement: '44' },
		}),
		profil({ slug: 'vide-fictive', createdAt: '2026-10-08T08:00:00.000Z', completude: 1 }),
	]
	const stats = agregerStats({
		profils,
		datesDesComptes: ['2026-01-01T00:00:00.000Z', '2026-10-06T08:00:00.000Z', '2026-10-08T08:00:00.000Z'],
		periode,
		maintenant,
	})

	test('exact counts', () => {
		expect(stats.profils).toEqual({
			total: 4,
			entierementVides: 1,
			actifs: 3,
			publiables: 1,
			masques: 1,
			complets11: 2,
			quasiVides: 1,
			sansCanal: 3,
			modifies90j: 1,
			crees: 2,
		})
		expect(stats.cohorte).toEqual({ profils: 1, actifs: 1 })
		expect(stats.comptes).toEqual({ total: 3, nouveaux: 2 })
		expect(stats.inscriptions).toEqual([
			{ creeLe: '2026-10-06', completude: 13, actif: true, publiable: true },
			{ creeLe: '2026-10-08', completude: 1, actif: false, publiable: false },
		])
		expect(stats.publiables).toEqual({ parDepartement: { '74': 1 }, slugs: ['ada-fictive'] })
	})

	test('a hidden publishable profile has no slug in the answer', () => {
		expect(JSON.stringify(stats)).not.toContain('masquee-fictive')
		expect(JSON.stringify(stats)).not.toContain('brouillon-fictif')
	})

	test('no personal data outside the slugs: no @, no run of 9 digits, no name', () => {
		const sansSlugs = JSON.stringify({ ...stats, publiables: { ...stats.publiables, slugs: [] } })
		expect(sansSlugs).not.toContain('@')
		expect(sansSlugs).not.toMatch(/\d{9}/)
		for (const nom of ['Ada', 'Fictive', 'Annecy', 'example.test']) expect(sansSlugs).not.toContain(nom)
	})

	test('the answer fits the schema, and the schema refuses an extra key', () => {
		expect(StatsHebdo.safeParse(stats).success).toBe(true)
		expect(StatsHebdo.safeParse({ ...stats, email: 'x' }).success).toBe(false)
		expect(StatsHebdo.safeParse({ ...stats, comptes: { ...stats.comptes, nom: 'x' } }).success).toBe(false)
	})
})

describe('the published example', () => {
	test('fits the schema', () => {
		expect(StatsHebdo.parse(exemple)).toEqual(exemple as unknown as StatsHebdo)
	})

	test('carries no personal data', () => {
		const sansSlugs = JSON.stringify({ ...exemple, publiables: { ...exemple.publiables, slugs: [] } })
		expect(sansSlugs).not.toContain('@')
		expect(sansSlugs).not.toMatch(/\d{9}/)
	})
})
