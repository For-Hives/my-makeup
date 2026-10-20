import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { CONTEXTE_SANS_PROFIL } from '@/collections/Profiles'
import { PAR_PAGE, paginer, sectionsDeLaPage } from '@/lib/search/pagination'
import { chercher } from '@/lib/search/results'
import { lireLaRecherche } from '@/lib/search/input'
import { lireLAnnuaire, type ProfilDeLAnnuaire } from '@/services/public/profiles'
import { fabriquerDesProfils } from '../outils/fabrique-profils'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'

/**
 * The search over the real directory (tickets 099 and 100; plan 02 I28 to I31). The search is made on
 * the page, in memory, on the directory the server reads (`lireLAnnuaire`) and the cache of Next
 * keeps: there is no search API to call. So the tests play what the page plays: the read, the
 * ranking, the cut in pages. The page itself, its status codes and the brake of the proxy are played
 * by tests/e2e/recherche-mot-cle.spec.ts.
 *
 * The bench holds 500 generated profiles (tests/outils/fabrique-profils.ts) and five profiles the
 * search must treat in their own way.
 */

const NOMBRE = 500
const TELEPHONE = '06 39 98 00 77'
const EMAIL = 'contact-recherche@example.test'

let payload: Payload

const compte = (cle: string) => ({
	email: `recherche-${cle}@example.test`,
	password: `Banc-${cle}-${crypto.randomUUID()}`,
	name: `Recherche ${cle}`,
	_verified: true,
})

/** One profile of its own kind, by hand. */
async function poser(cle: string, profil: Record<string, unknown>): Promise<void> {
	const pro = await payload.create({
		collection: 'pros',
		data: compte(cle),
		context: CONTEXTE_SANS_PROFIL,
		disableVerificationEmail: true,
	})
	await payload.create({
		collection: 'profiles',
		data: { pro: pro.id, slug: `recherche-${cle}`, firstName: 'Essai', lastName: cle, ...profil } as never,
	})
}

const ANNECY = { name: 'Annecy', inseeCode: '74010', latitude: 45.9, longitude: 6.13 }

beforeAll(async () => {
	payload = await payloadDeTest()
	await fabriquerDesProfils(payload, NOMBRE)
	await poser('visible', {
		specialty: 'Maquillage zyglo',
		city: ANNECY,
		description: 'Maquilleuse qui publie ses coordonnées.',
		contactDetails: { phone: TELEPHONE, email: EMAIL },
		publicContact: true,
		consentedAt: '2026-09-01T08:00:00.000Z',
		consentSource: 'artist',
	})
	await poser('masque', { specialty: 'Maquillage zyglo', city: ANNECY, chosenStatus: 'hidden' })
	await poser('indisponible', { specialty: 'Maquillage zyglo', city: ANNECY, available: false })
	await poser('vide', {})
}, 240_000)

afterAll(async () => {
	await viderLaBase()
})

const slugs = (profils: readonly ProfilDeLAnnuaire[]) => profils.map(({ carte }) => carte.slug)

describe('I28 : la recherche ne liste que les profils listés, par pages de 20', () => {
	test('l’annuaire compte les profils listés et ni le masqué, ni l’indisponible, ni le vide', async () => {
		const annuaire = await lireLAnnuaire(payload, { avecLesTextes: true })
		expect(annuaire).toHaveLength(NOMBRE + 1)
		const noms = slugs(annuaire)
		expect(noms).toContain('recherche-visible')
		for (const absent of ['masque', 'indisponible', 'vide']) expect(noms, absent).not.toContain(`recherche-${absent}`)
	})

	test('une ville : celles de la ville d’abord, 20 par page, chacune une seule fois d’une page à l’autre', async () => {
		const annuaire = await lireLAnnuaire(payload, { avecLesTextes: true })
		const recherche = lireLaRecherche({ city: 'Annecy' })
		const { locaux, sections } = chercher(annuaire, recherche)
		// 50 of the generated profiles are in Annecy (one commune in ten), and the visible one.
		expect(locaux).toHaveLength(NOMBRE / 10 + 1)
		for (const profil of locaux) expect(profil.ville).toBe('Annecy')
		const tous = [...locaux, ...sections.flatMap(section => section.profils)]
		expect(tous).toHaveLength(NOMBRE + 1)

		const vus: string[] = []
		const pages = paginer(tous, 1).pages
		expect(pages).toBe(Math.ceil((NOMBRE + 1) / PAR_PAGE))
		for (let page = 1; page <= pages; page += 1) {
			const courante = paginer(tous, page)
			expect(courante.elements.length).toBeLessThanOrEqual(PAR_PAGE)
			if (page < pages) expect(courante.elements).toHaveLength(PAR_PAGE)
			const parts = sectionsDeLaPage(courante, [locaux.length, ...sections.map(section => section.profils.length)])
			expect(parts.flat()).toEqual(courante.elements)
			vus.push(...slugs(courante.elements))
		}
		expect(new Set(vus).size).toBe(vus.length)
		expect(vus).toHaveLength(NOMBRE + 1)
	})

	test('un mot et une ville : le mot filtre, la ville place', async () => {
		const annuaire = await lireLAnnuaire(payload, { avecLesTextes: true })
		const { locaux, sections } = chercher(annuaire, { search: 'zyglo', city: 'Annecy' })
		// The marker word is in one generated profile in fifty, and in the speciality of the visible one.
		const portent = NOMBRE / 50 + 1
		const tous = [...locaux, ...sections.flatMap(section => section.profils)]
		expect(tous).toHaveLength(portent)
		for (const profil of tous) expect(profil.textes).toBeDefined()
		// Rank 0, 50, 100… are in Annecy only when rank % 10 === 0: all of them are (50 is a multiple of 10).
		expect(locaux.every(profil => profil.ville === 'Annecy')).toBe(true)
		expect(locaux.length).toBeGreaterThan(0)
		expect(slugs(locaux)).toContain('recherche-visible')
		// The ones of the city are first, and the profile whose speciality holds the word leads.
		expect(slugs(locaux)[0]).toBe('recherche-visible')
	})

	test('un mot qui n’est nulle part ne trouve personne', async () => {
		const annuaire = await lireLAnnuaire(payload, { avecLesTextes: true })
		const { locaux, sections } = chercher(annuaire, { search: 'zzqqxxyy', city: '' })
		expect(locaux).toEqual([])
		expect(sections).toEqual([])
	})
})

describe('I29 : ni email ni téléphone, et une réponse légère', () => {
	test('ce que la page reçoit des 500 profils tient en moins de 50 Ko et ne porte aucune coordonnée', async () => {
		const annuaire = await lireLAnnuaire(payload, { avecLesTextes: true })
		const { locaux, sections } = chercher(annuaire, { search: 'maquillage', city: '' })
		const tous = [...locaux, ...sections.flatMap(section => section.profils)]
		const premierePage = paginer(tous, 1).elements
		expect(premierePage).toHaveLength(PAR_PAGE)
		// What reaches the browser is the cards of a page, and only them.
		const reponse = JSON.stringify(premierePage.map(({ carte }) => carte))
		expect(new TextEncoder().encode(reponse).length).toBeLessThan(50_000)
		for (const interdit of [TELEPHONE, EMAIL, '@example.test', 'latitude', 'longitude', 'inseeCode', 'contactDetails'])
			expect(reponse, interdit).not.toContain(interdit)
	})

	test('l’annuaire entier ne porte jamais les coordonnées publiées, même dans les textes cherchés', async () => {
		const annuaire = await lireLAnnuaire(payload, { avecLesTextes: true })
		const texte = JSON.stringify(annuaire)
		for (const interdit of [TELEPHONE, EMAIL, 'latitude', 'longitude', 'inseeCode'])
			expect(texte, interdit).not.toContain(interdit)
		const visible = annuaire.find(({ carte }) => carte.slug === 'recherche-visible')
		expect(Object.keys(visible?.carte ?? {}).sort()).toEqual(
			['lieu', 'nom', 'photo', 'pid', 'slug', 'specialite', 'superMaquilleuse'].sort()
		)
	})

	test('un téléphone ou un email ne se cherche pas : aucun profil ne le porte comme texte', async () => {
		const annuaire = await lireLAnnuaire(payload, { avecLesTextes: true })
		expect(chercher(annuaire, { search: EMAIL, city: '' }).locaux).toEqual([])
		expect(chercher(annuaire, { search: '0639980077', city: '' }).locaux).toEqual([])
	})
})

describe('I31 : 500 profils générés, p95 sous 300 ms', () => {
	const TERMES = [
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
		const triees = [...durees].sort((a, b) => a - b)
		return triees[Math.ceil(0.95 * triees.length) - 1] ?? 0
	}

	test('20 recherches sur l’annuaire en mémoire (celui que le cache de Next garde) : p95 sous 300 ms', async () => {
		const annuaire = await lireLAnnuaire(payload, { avecLesTextes: true })
		expect(annuaire.length).toBeGreaterThanOrEqual(NOMBRE)
		const durees: number[] = []
		for (let i = 0; i < 20; i += 1) {
			const terme = TERMES[i % TERMES.length] ?? 'mariage'
			const debut = performance.now()
			const { locaux, sections } = chercher(annuaire, { search: terme, city: i % 2 === 0 ? 'Annecy' : '' })
			const page = paginer([...locaux, ...sections.flatMap(section => section.profils)], 1)
			durees.push(performance.now() - debut)
			expect(page.elements.length).toBeLessThanOrEqual(PAR_PAGE)
		}
		console.info(
			`I31 : p95 = ${p95(durees).toFixed(1)} ms, plus lente = ${Math.max(...durees).toFixed(1)} ms (annuaire en mémoire)`
		)
		expect(p95(durees)).toBeLessThan(300)
	})

	test('la lecture des 500 profils dans la base, qui n’a lieu qu’une fois par heure ou après une modification, est mesurée sans être bornée', async () => {
		const durees: number[] = []
		for (let i = 0; i < 5; i += 1) {
			const debut = performance.now()
			const annuaire = await lireLAnnuaire(payload, { avecLesTextes: true })
			chercher(annuaire, { search: TERMES[i % TERMES.length] ?? 'mariage', city: 'Annecy' })
			durees.push(performance.now() - debut)
		}
		// The page reads the directory through the cache of Next: this is the price of a miss, reported, not a bound of the ticket.
		console.info(`I31 : lecture + classement sans cache, 5 essais : ${durees.map(d => d.toFixed(0)).join(', ')} ms`)
		expect(Math.max(...durees)).toBeLessThan(10_000)
	}, 60_000)
})
