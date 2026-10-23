import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { NO_PROFILE_CONTEXT } from '@/collections/Profiles'
import { readSearch } from '@/lib/search/input'
import { PER_PAGE, paginate, sectionsOfPage } from '@/lib/search/pagination'
import { find } from '@/lib/search/results'
import { type DirectoryProfile, readDirectory } from '@/services/public/profiles'
import { emptyBase, testPayload } from '../support/payload-test'
import { buildProfiles } from '../support/profile-factory'

/**
 * The search over the real directory (tickets 099 and 100; plan 02 I28 to I31). The search is made on
 * the page, in memory, on the directory the server reads (`lireLAnnuaire`) and the cache of Next
 * keeps: there is no search API to call. So the tests play what the page plays: the read, the
 * ranking, the cut in pages. The page itself, its status codes and the brake of the proxy are played
 * by tests/e2e/keyword-search.spec.ts.
 *
 * The bench holds 500 generated profiles (tests/support/profile-factory.ts) and five profiles the
 * search must treat in their own way.
 */

const COUNT = 500
const PHONE = '06 39 98 00 77'
const EMAIL = 'contact-recherche@example.test'

let payload: Payload

const account = (cle: string) => ({
	email: `recherche-${cle}@example.test`,
	password: `Banc-${cle}-${crypto.randomUUID()}`,
	name: `Recherche ${cle}`,
	_verified: true,
})

/** One profile of its own kind, by hand. */
async function set(cle: string, profil: Record<string, unknown>): Promise<void> {
	const pro = await payload.create({
		collection: 'pros',
		data: account(cle),
		context: NO_PROFILE_CONTEXT,
		disableVerificationEmail: true,
	})
	await payload.create({
		collection: 'profiles',
		data: { pro: pro.id, slug: `recherche-${cle}`, firstName: 'Essai', lastName: cle, ...profil } as never,
	})
}

const ANNECY = { name: 'Annecy', inseeCode: '74010', latitude: 45.9, longitude: 6.13 }

beforeAll(async () => {
	payload = await testPayload()
	await buildProfiles(payload, COUNT)
	await set('visible', {
		specialty: 'Maquillage zyglo',
		city: ANNECY,
		description: 'Maquilleuse qui publie ses coordonnées.',
		contactDetails: { phone: PHONE, email: EMAIL },
		publicContact: true,
		consentedAt: '2026-09-01T08:00:00.000Z',
		consentSource: 'artist',
	})
	await set('masque', { specialty: 'Maquillage zyglo', city: ANNECY, chosenStatus: 'hidden' })
	await set('indisponible', { specialty: 'Maquillage zyglo', city: ANNECY, available: false })
	await set('vide', {})
}, 240_000)

afterAll(async () => {
	await emptyBase()
})

const slugs = (profils: readonly DirectoryProfile[]) => profils.map(({ carte }) => carte.slug)

describe('I28 : la recherche ne liste que les profils listés, par pages de 20', () => {
	test('l’annuaire compte les profils listés et ni le masqué, ni l’indisponible, ni le vide', async () => {
		const directory = await readDirectory(payload, { avecLesTextes: true })
		expect(directory).toHaveLength(COUNT + 1)
		const names = slugs(directory)
		expect(names).toContain('recherche-visible')
		for (const absent of ['masque', 'indisponible', 'vide']) expect(names, absent).not.toContain(`recherche-${absent}`)
	})

	test('une ville : celles de la ville d’abord, 20 par page, chacune une seule fois d’une page à l’autre', async () => {
		const directory = await readDirectory(payload, { avecLesTextes: true })
		const search = readSearch({ city: 'Annecy' })
		const { locaux: local, sections } = find(directory, search)
		// 50 of the generated profiles are in Annecy (one commune in ten), and the visible one.
		expect(local).toHaveLength(COUNT / 10 + 1)
		for (const profile of local) expect(profile.ville).toBe('Annecy')
		const all = [...local, ...sections.flatMap(section => section.profils)]
		expect(all).toHaveLength(COUNT + 1)

		const seen: string[] = []
		const pages = paginate(all, 1).pages
		expect(pages).toBe(Math.ceil((COUNT + 1) / PER_PAGE))
		for (let page = 1; page <= pages; page += 1) {
			const current = paginate(all, page)
			expect(current.elements.length).toBeLessThanOrEqual(PER_PAGE)
			if (page < pages) expect(current.elements).toHaveLength(PER_PAGE)
			const parts = sectionsOfPage(current, [local.length, ...sections.map(section => section.profils.length)])
			expect(parts.flat()).toEqual(current.elements)
			seen.push(...slugs(current.elements))
		}
		expect(new Set(seen).size).toBe(seen.length)
		expect(seen).toHaveLength(COUNT + 1)
	})

	test('un mot et une ville : le mot filtre, la ville place', async () => {
		const directory = await readDirectory(payload, { avecLesTextes: true })
		const { locaux: local, sections } = find(directory, { search: 'zyglo', city: 'Annecy' })
		// The marker word is in one generated profile in fifty, and in the speciality of the visible one.
		const carry = COUNT / 50 + 1
		const all = [...local, ...sections.flatMap(section => section.profils)]
		expect(all).toHaveLength(carry)
		for (const profile of all) expect(profile.textes).toBeDefined()
		// Rank 0, 50, 100… are in Annecy only when rank % 10 === 0: all of them are (50 is a multiple of 10).
		expect(local.every(profil => profil.ville === 'Annecy')).toBe(true)
		expect(local.length).toBeGreaterThan(0)
		expect(slugs(local)).toContain('recherche-visible')
		// The ones of the city are first, and the profile whose speciality holds the word leads.
		expect(slugs(local)[0]).toBe('recherche-visible')
	})

	test('un mot qui n’est nulle part ne trouve personne', async () => {
		const directory = await readDirectory(payload, { avecLesTextes: true })
		const { locaux: local, sections } = find(directory, { search: 'zzqqxxyy', city: '' })
		expect(local).toEqual([])
		expect(sections).toEqual([])
	})
})

describe('I29 : ni email ni téléphone, et une réponse légère', () => {
	test('ce que la page reçoit des 500 profils tient en moins de 50 Ko et ne porte aucune coordonnée', async () => {
		const directory = await readDirectory(payload, { avecLesTextes: true })
		const { locaux: local, sections } = find(directory, { search: 'maquillage', city: '' })
		const all = [...local, ...sections.flatMap(section => section.profils)]
		const firstPage = paginate(all, 1).elements
		expect(firstPage).toHaveLength(PER_PAGE)
		// What reaches the browser is the cards of a page, and only them.
		const response = JSON.stringify(firstPage.map(({ carte }) => carte))
		expect(new TextEncoder().encode(response).length).toBeLessThan(50_000)
		for (const forbidden of [PHONE, EMAIL, '@example.test', 'latitude', 'longitude', 'inseeCode', 'contactDetails'])
			expect(response, forbidden).not.toContain(forbidden)
	})

	test('l’annuaire entier ne porte jamais les coordonnées publiées, même dans les textes cherchés', async () => {
		const directory = await readDirectory(payload, { avecLesTextes: true })
		// The commune centre is public referential data read for the ranking by distance (ticket 294): `center` only.
		const text = JSON.stringify(directory, (key, value: unknown) => (key === 'center' ? undefined : value))
		for (const forbidden of [PHONE, EMAIL, 'latitude', 'longitude', 'inseeCode'])
			expect(text, forbidden).not.toContain(forbidden)
		const visible = directory.find(({ carte }) => carte.slug === 'recherche-visible')
		expect(Object.keys(visible?.carte ?? {}).sort()).toEqual(
			['lieu', 'nom', 'photo', 'pid', 'slug', 'specialite', 'superMaquilleuse'].sort()
		)
	})

	test('un téléphone ou un email ne se cherche pas : aucun profil ne le porte comme texte', async () => {
		const directory = await readDirectory(payload, { avecLesTextes: true })
		expect(find(directory, { search: EMAIL, city: '' }).locaux).toEqual([])
		expect(find(directory, { search: '0639980077', city: '' }).locaux).toEqual([])
	})
})

describe('I31 : 500 profils générés, p95 sous 300 ms', () => {
	const TERMS = [
		'mariage',
		'soirée',
		'maquillage mariée',
		'teint',
		'effets spéciaux',
		'Anecy',
		'événement',
		'zyglo',
		'coiffure',
		'peau',
	]

	function p95(durees: number[]): number {
		const sorted = [...durees].sort((a, b) => a - b)
		return sorted[Math.ceil(0.95 * sorted.length) - 1] ?? 0
	}

	test('20 recherches sur l’annuaire en mémoire (celui que le cache de Next garde) : p95 sous 300 ms', async () => {
		const directory = await readDirectory(payload, { avecLesTextes: true })
		expect(directory.length).toBeGreaterThanOrEqual(COUNT)
		const durations: number[] = []
		for (let i = 0; i < 20; i += 1) {
			const term = TERMS[i % TERMS.length] ?? 'mariage'
			const start = performance.now()
			const { locaux: local, sections } = find(directory, { search: term, city: i % 2 === 0 ? 'Annecy' : '' })
			const page = paginate([...local, ...sections.flatMap(section => section.profils)], 1)
			durations.push(performance.now() - start)
			expect(page.elements.length).toBeLessThanOrEqual(PER_PAGE)
		}
		console.info(
			`I31 : p95 = ${p95(durations).toFixed(1)} ms, plus lente = ${Math.max(...durations).toFixed(1)} ms (annuaire en mémoire)`
		)
		expect(p95(durations)).toBeLessThan(300)
	})

	test('la lecture des 500 profils dans la base, qui n’a lieu qu’une fois par heure ou après une modification, est mesurée sans être bornée', async () => {
		const durations: number[] = []
		for (let i = 0; i < 5; i += 1) {
			const start = performance.now()
			const directory = await readDirectory(payload, { avecLesTextes: true })
			find(directory, { search: TERMS[i % TERMS.length] ?? 'mariage', city: 'Annecy' })
			durations.push(performance.now() - start)
		}
		// The page reads the directory through the cache of Next: this is the price of a miss, reported, not a bound of the ticket.
		console.info(`I31 : lecture + classement sans cache, 5 essais : ${durations.map(d => d.toFixed(0)).join(', ')} ms`)
		expect(Math.max(...durations)).toBeLessThan(10_000)
	}, 60_000)
})
