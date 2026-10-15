/**
 * The search by city (ticket 098; plan 02 U17 and U19): what the visitor types, where the profiles of a
 * search are, and the sections of the page. Unit tests: no database, no server (the page itself is
 * tests/e2e/recherche-ville.spec.ts).
 */

import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { correspondanceLieu, lieuDuProfil, lireLieu, type PlaceDuProfil, sectionsParLieu } from '@/lib/recherche/lieu'
import {
	champ,
	LONGUEUR_MAX_DE_LA_SAISIE,
	lireLaPage,
	lireLaRecherche,
	PAGE_MAX,
	rechercheParMot,
	rechercheParVille,
	rechercheValide,
	titreDesResultats,
	urlPageRecherche,
} from '@/lib/recherche/saisie'
import { lireLAnnuaire } from '@/services/public/profils'

/** A profile for the sections: its commune, its département, and whether she travels. */
const profil = (nom: string, ville: string | null, departement: string | null, seDeplace = false) => ({
	nom,
	ville,
	departement,
	seDeplace,
})

const COMMUNES = [
	profil('annecy', 'Annecy', '74', true),
	profil('annecy-le-vieux', 'Annecy-le-Vieux', '74'),
	profil('annemasse', 'Annemasse', '74', true),
	profil('thonon', 'Thonon-les-Bains', '74'),
	profil('chambery', 'Chambéry', '73', true),
	profil('nantes', 'Nantes', '44'),
	profil('sans-ville', null, null),
]

const noms = (profils: readonly { nom: string }[]): string[] => profils.map(p => p.nom)

describe('U17 : la saisie, normalisée', () => {
	test('un champ est rogné, ses espaces fusionnés, coupé à 100 caractères', () => {
		expect(champ('  Annecy   le  Vieux ')).toBe('Annecy le Vieux')
		expect(champ('x'.repeat(250))).toHaveLength(LONGUEUR_MAX_DE_LA_SAISIE)
		expect(champ(['Lyon', 'Paris'])).toBe('Lyon')
	})

	test('ce qui n’est pas un texte est un champ vide, jamais une erreur', () => {
		for (const valeur of [undefined, null, 42, {}, true, [], [undefined]]) expect(champ(valeur)).toBe('')
	})

	test('l’adresse donne la recherche, un paramètre inconnu est ignoré', () => {
		expect(lireLaRecherche({ search: ' mariage ', city: ['Annecy', 'Lyon'], page: '3', x: 'y' })).toEqual({
			search: 'mariage',
			city: 'Annecy',
			page: 3,
		})
	})

	test('la casse, les accents et les traits d’union ne changent pas la ville trouvée', () => {
		const annecyLeVieux = lieuDuProfil({ ville: 'Annecy-le-Vieux', departement: '74' })
		for (const saisie of ['annecy', 'ANNECY', 'Annecy', '  annecy  ', 'Annecy le Vieux', 'annecy-le-vieux'])
			expect(correspondanceLieu(annecyLeVieux, lireLieu(saisie)), saisie).toBe('ville')
		const evian = lieuDuProfil({ ville: 'Évian-les-Bains', departement: '74' })
		for (const saisie of ['evian', 'Évian', 'EVIAN LES BAINS'])
			expect(correspondanceLieu(evian, lireLieu(saisie))).toBe('ville')
		const saintJulien = lieuDuProfil({ ville: 'Saint-Julien-en-Genevois', departement: '74' })
		for (const saisie of ['St Julien', 'saint julien', 'st-julien-en-genevois'])
			expect(correspondanceLieu(saintJulien, lireLieu(saisie)), saisie).toBe('ville')
	})

	test('« Annecy » n’est pas « Annemasse », et un mot entier n’est pas un bout de mot', () => {
		expect(correspondanceLieu(lieuDuProfil({ ville: 'Annemasse', departement: '74' }), lireLieu('annecy'))).toBeNull()
		expect(correspondanceLieu(lieuDuProfil({ ville: 'Lyon', departement: '69' }), lireLieu('on'))).toBeNull()
		expect(correspondanceLieu(lieuDuProfil({ ville: 'Paris', departement: '75' }), lireLieu('par'))).toBeNull()
	})

	test('un code postal, un code ou un nom de département disent le département', () => {
		expect(lireLieu('74000 Annecy').departements).toEqual(['74'])
		expect(lireLieu('Annecy (74)').departements).toEqual(['74'])
		expect(lireLieu('2A').departements).toEqual(['2A'])
		expect(lireLieu('974').departements).toEqual(['974'])
		expect(lireLieu('Haute-Savoie').departements).toEqual(['74'])
		expect(lireLieu('Corse').departements).toEqual(['2A', '2B'])
		const annecy = lieuDuProfil({ ville: 'Annecy', departement: '74' })
		expect(correspondanceLieu(annecy, lireLieu('Haute-Savoie'))).toBe('departement')
		expect(correspondanceLieu(annecy, lireLieu('74'))).toBe('departement')
		expect(correspondanceLieu(annecy, lireLieu('73'))).toBeNull()
	})

	test('« Savoie » n’est pas « Haute-Savoie », ni « Loire » « Loire-Atlantique »', () => {
		const hauteSavoie = lieuDuProfil({ ville: 'Haute-Savoie', departement: '74' })
		expect(correspondanceLieu(hauteSavoie, lireLieu('Savoie'))).toBeNull()
		const loireAtlantique = lieuDuProfil({ ville: 'Loire-Atlantique', departement: '44' })
		expect(correspondanceLieu(loireAtlantique, lireLieu('Loire'))).toBeNull()
	})

	test('un pays ou une région ne compte que si rien de plus précis n’est écrit', () => {
		const annecy = lieuDuProfil({ ville: 'Annecy', departement: '74' })
		expect(correspondanceLieu(annecy, lireLieu('Annecy, Suisse'))).toBe('ville')
		expect(correspondanceLieu(lieuDuProfil({ ville: 'Occitanie', departement: null }), lireLieu('Occitanie'))).toBe(
			'ville'
		)
	})
})

describe('U18 : les paramètres de l’adresse, leurs défauts et leurs bornes', () => {
	test('sans paramètre : ni mot, ni ville, première page', () => {
		expect(lireLaRecherche({})).toEqual({ search: '', city: '', page: 1 })
	})

	test('la page est un entier de 1 à 1 000, sinon la première', () => {
		for (const [valeur, attendu] of [
			['1', 1],
			['2', 2],
			['1000', 1000],
			['1001', 1],
			['0', 1],
			['-3', 1],
			['2.5', 1],
			['1e2', 1],
			['abc', 1],
			['', 1],
			[['4', '5'], 4],
			[undefined, 1],
			[7, 1],
			['99999', 1],
		] as const)
			expect(lireLaPage(valeur), String(valeur)).toBe(attendu)
		expect(PAGE_MAX).toBe(1000)
	})

	test('« specialite » dit ce que dit « search » quand « search » est vide, jamais l’inverse', () => {
		expect(lireLaRecherche({ specialite: 'mariage', city: 'Annecy' })).toMatchObject({ search: 'mariage' })
		expect(lireLaRecherche({ search: 'soirée', specialite: 'mariage' })).toMatchObject({ search: 'soirée' })
		expect(lireLaRecherche({ specialite: ['a', 'b'] })).toMatchObject({ search: 'a' })
	})

	test('un paramètre inconnu est ignoré', () => {
		expect(lireLaRecherche({ x: 'y', rayon: '30', limit: '500' })).toEqual({ search: '', city: '', page: 1 })
	})

	test('l’adresse de la page garde le mot et la ville, et laisse la première page sans paramètre', () => {
		expect(urlPageRecherche({ search: 'mariage', city: 'Annecy', page: 1 })).toBe('/search?search=mariage&city=Annecy')
		expect(urlPageRecherche({ search: 'mariage', city: 'Annecy', page: 3 })).toBe(
			'/search?search=mariage&city=Annecy&page=3'
		)
		expect(urlPageRecherche({ search: 'été & soirée', page: 2 })).toBe(
			'/search?search=%C3%A9t%C3%A9+%26+soir%C3%A9e&page=2'
		)
		expect(urlPageRecherche({ page: 2 })).toBe('/search?page=2')
		expect(urlPageRecherche({ page: 99999 })).toBe(`/search?page=${PAGE_MAX}`)
	})
})

describe('U19 : sans critère, sans erreur', () => {
	test('une adresse sans paramètre n’est pas une recherche, et ne lève rien', () => {
		for (const parametres of [{}, { search: '', city: '' }, { search: '   ' }, { city: [] }, undefined]) {
			const recherche = lireLaRecherche(parametres)
			expect(rechercheValide(recherche)).toBe(false)
			expect(rechercheParVille(recherche)).toBe(false)
		}
	})

	test('la ville seule est une recherche par ville ; « France » n’est pas un lieu', () => {
		expect(rechercheParVille(lireLaRecherche({ city: 'Annecy' }))).toBe(true)
		expect(rechercheParVille(lireLaRecherche({ search: 'annecy', city: 'Annecy' }))).toBe(true)
		expect(rechercheParVille(lireLaRecherche({ city: 'France' }))).toBe(false)
		expect(rechercheParVille(lireLaRecherche({ city: 'Toute la France' }))).toBe(false)
	})

	test('un mot, seul ou avec une ville, est une recherche par mot et non par ville', () => {
		expect(rechercheValide(lireLaRecherche({ search: 'mariage' }))).toBe(true)
		expect(rechercheParVille(lireLaRecherche({ search: 'mariage' }))).toBe(false)
		expect(rechercheParVille(lireLaRecherche({ search: 'mariage', city: 'Annecy' }))).toBe(false)
		expect(rechercheParMot(lireLaRecherche({ search: 'mariage' }))).toBe(true)
		expect(rechercheParMot(lireLaRecherche({ search: 'mariage', city: 'Annecy' }))).toBe(true)
		// A mot with a place the page cannot rank by is still a word.
		expect(rechercheParMot(lireLaRecherche({ search: 'mariage', city: 'France' }))).toBe(true)
		// The city typed twice, or alone, is a search by city.
		expect(rechercheParMot(lireLaRecherche({ search: 'Annecy', city: 'annecy' }))).toBe(false)
		expect(rechercheParMot(lireLaRecherche({ city: 'Annecy' }))).toBe(false)
		expect(rechercheParMot(lireLaRecherche({}))).toBe(false)
	})

	test('sans lieu utilisable, une seule liste : tout le monde est « local »', () => {
		const resultat = sectionsParLieu(COMMUNES, 'France')
		expect(resultat.parLieu).toBe(false)
		expect(resultat.locaux).toHaveLength(COMMUNES.length)
		expect(resultat.sections).toEqual([])
		expect(sectionsParLieu([], 'Annecy').locaux).toEqual([])
	})
})

describe('les sections d’une recherche par ville', () => {
	test('d’abord la ville, puis le département tapé ; le titre ne compte qu’eux', () => {
		const resultat = sectionsParLieu(COMMUNES, 'Annecy')
		expect(noms(resultat.locaux)).toEqual(['annecy', 'annecy-le-vieux'])
		expect(resultat.parLieu).toBe(true)
	})

	test('puis le même département, ceux qui se déplacent, le reste : chacun une fois', () => {
		const resultat = sectionsParLieu(COMMUNES, 'Annecy')
		expect(resultat.departements).toEqual(['74'])
		expect(resultat.sections.map(({ cle }) => cle)).toEqual(['departement', 'deplacent', 'autres'])
		expect(resultat.sections.map(({ titre }) => titre)).toEqual([
			'Autres maquilleuses du 74 (Haute-Savoie)',
			'Autres maquilleuses qui se déplacent',
			'Autres maquilleuses',
		])
		expect(noms(resultat.sections[0]?.profils ?? [])).toEqual(['annemasse', 'thonon'])
		expect(noms(resultat.sections[1]?.profils ?? [])).toEqual(['chambery'])
		expect(noms(resultat.sections[2]?.profils ?? [])).toEqual(['nantes', 'sans-ville'])
		const tous = [...resultat.locaux, ...resultat.sections.flatMap(section => section.profils)]
		expect(noms(tous).sort()).toEqual(noms(COMMUNES).sort())
	})

	test('un département tapé donne ses profils d’abord, sans section du même département', () => {
		const resultat = sectionsParLieu(COMMUNES, 'Haute-Savoie')
		expect(noms(resultat.locaux)).toEqual(['annecy', 'annecy-le-vieux', 'annemasse', 'thonon'])
		expect(resultat.sections.map(({ cle }) => cle)).toEqual(['deplacent', 'autres'])
	})

	test('sans profil de la ville, la page le dit : aucun local, et le département reste inconnu', () => {
		const resultat = sectionsParLieu(COMMUNES, 'Grenoble')
		expect(resultat.locaux).toEqual([])
		expect(resultat.departements).toEqual([])
		expect(resultat.sections.map(({ cle }) => cle)).toEqual(['deplacent', 'autres'])
	})

	test('le département d’une ville est celui de ses profils, le plus fréquent', () => {
		const profils: PlaceDuProfil[] = [
			{ ville: 'Annecy', departement: '74', seDeplace: false },
			{ ville: 'Annecy', departement: '74', seDeplace: false },
			{ ville: 'Annecy-le-Vieux', departement: '74', seDeplace: false },
		]
		expect(sectionsParLieu(profils, 'annecy').departements).toEqual(['74'])
	})
})

describe('le titre et l’adresse', () => {
	test('le titre dit ce qui a été tapé, jamais où sont les maquilleuses', () => {
		expect(titreDesResultats({ search: '', city: 'Annecy' }, 3)).toBe('3 résultats pour « Annecy »')
		expect(titreDesResultats({ search: 'annecy', city: 'Annecy' }, 1)).toBe('1 résultat pour « Annecy »')
		expect(titreDesResultats({ search: 'mariage', city: 'Annecy' }, 2)).toBe(
			'2 résultats pour « mariage » à « Annecy »'
		)
		expect(titreDesResultats({ search: 'zzqq', city: '' }, 0)).toBe('Aucun résultat pour « zzqq »')
	})

	test('l’adresse de la recherche laisse de côté les champs vides', () => {
		expect(urlPageRecherche()).toBe('/search')
		expect(urlPageRecherche({ city: ' Annecy  ' })).toBe('/search?city=Annecy')
		expect(urlPageRecherche({ search: 'mariée', city: 'Paris' })).toBe('/search?search=mari%C3%A9e&city=Paris')
	})
})

describe('la lecture de l’annuaire', () => {
	function payloadEspion(pages: unknown[][]) {
		const lectures: Record<string, unknown>[] = []
		const payload = {
			find: async (options: Record<string, unknown>) => {
				lectures.push(options)
				if (options.collection === 'media')
					return {
						docs: [
							{ id: 4, url: 'https://photos.example.test/media/a.webp', width: 400, height: 400, filename: 'a.webp' },
						],
					}
				const page = Number(options.page)
				return { docs: pages[page - 1] ?? [], page, totalDocs: 0, hasNextPage: page < pages.length }
			},
		}
		return { payload: payload as unknown as Payload, lectures }
	}

	const doc = (slug: string, extra: Record<string, unknown> = {}) => ({
		id: 1,
		slug,
		prenom: 'Zoé',
		nom: 'Fictive',
		specialite: 'Mariage',
		commune: { nom: 'Annecy', codeInsee: '74010', departement: '74', latitude: 45.9, longitude: 6.13 },
		rayonKm: 30,
		superMaquilleuse: false,
		photoPrincipale: {
			id: 4,
			url: 'https://photos.example.test/media/a.webp',
			width: 400,
			height: 400,
			filename: 'a.webp',
		},
		...extra,
	})

	test('il lit page après page, par cent, jusqu’à la dernière, sous les règles d’accès', async () => {
		const { payload, lectures } = payloadEspion([[doc('a')], [doc('b')], [doc('c')]])

		const annuaire = await lireLAnnuaire(payload)

		expect(annuaire.map(({ carte }) => carte.slug)).toEqual(['a', 'b', 'c'])
		const profils = lectures.filter(lecture => lecture.collection === 'profils' && lecture.overrideAccess === false)
		expect(profils.map(({ page }) => page)).toEqual([1, 2, 3])
		for (const lecture of profils)
			expect(lecture).toMatchObject({ collection: 'profils', limit: 100, overrideAccess: false, depth: 0 })
	})

	test('il ne lit jamais plus de dix pages', async () => {
		const { payload, lectures } = payloadEspion(Array.from({ length: 50 }, () => [doc('x')]))
		await lireLAnnuaire(payload)
		expect(
			lectures.filter(lecture => lecture.collection === 'profils' && lecture.overrideAccess === false)
		).toHaveLength(10)
	})

	test('la place d’un profil est sa commune et son département ; le centre de la commune n’en sort pas', async () => {
		const { payload } = payloadEspion([
			[doc('a'), doc('b', { commune: null, rayonKm: 30 }), doc('c', { rayonKm: null })],
		])

		const [a, b, c] = await lireLAnnuaire(payload)

		expect(a).toMatchObject({ ville: 'Annecy', departement: '74', seDeplace: true })
		expect(b).toMatchObject({ ville: null, departement: null, seDeplace: false })
		expect(c).toMatchObject({ ville: 'Annecy', seDeplace: false })
		const texte = JSON.stringify(await lireLAnnuaire(payload))
		for (const interdit of ['latitude', 'longitude', 'codeInsee', 'filename', '45.9'])
			expect(texte, interdit).not.toContain(interdit)
	})

	test('avec les textes, chaque profil porte ce qu’une recherche par mot lit, à côté de sa carte et sans prix', async () => {
		const { payload, lectures } = payloadEspion([
			[
				doc('a', {
					description: '  Je fais le maquillage de mariage.  ',
					competences: [{ nom: 'Teint', description: 'Peau mate' }, { nom: ' ' }, { description: 'Sans nom' }],
					prestations: [
						{
							nom: 'Mariée',
							description: 'Essai inclus',
							prixTexte: '150 €',
							prixAPartirDe: 150,
							options: [{ nom: 'Cils' }],
						},
						{ nom: 'Soirée', description: null },
					],
				}),
			],
		])

		const [a] = await lireLAnnuaire(payload, { avecLesTextes: true })

		// Normalised once, at the read: no accent, lower case.
		expect(a?.textes).toEqual({
			ville: 'annecy',
			specialite: 'mariage',
			description: 'je fais le maquillage de mariage.',
			competences: ['teint'],
			descriptionsDesCompetences: ['peau mate', 'sans nom'],
			descriptionsDesPrestations: ['essai inclus'],
			nom: 'fictive',
			prenom: 'zoe',
		} as never)
		// The card is the same keys as without the texts (U22): the texts stay beside it.
		expect(Object.keys(a?.carte ?? {}).sort()).toEqual(
			Object.keys((await lireLAnnuaire(payload))[0]?.carte ?? {}).sort()
		)
		const select = lectures.find(lecture => lecture.collection === 'profils')?.select as Record<string, unknown>
		expect(Object.keys(select)).toEqual(expect.arrayContaining(['description', 'competences', 'prestations']))
		for (const interdit of ['coordonnees', 'contactPublic', 'reseaux', 'noteInterne', 'pro'])
			expect(select).not.toHaveProperty(interdit)
		// Without the option, the texts are neither read nor carried.
		const sans = (await lireLAnnuaire(payload))[0]
		expect(sans).not.toHaveProperty('textes')
		expect(JSON.stringify(sans)).not.toContain('150')
	})

	test('une photo qui n’est qu’un identifiant, ou sans adresse, donne une carte sans photo', async () => {
		const { payload } = payloadEspion([
			[doc('a', { photoPrincipale: 9 }), doc('b', { photoPrincipale: { id: 9 } }), doc('c', { photoPrincipale: null })],
		])
		const cartes = (await lireLAnnuaire(payload)).map(({ carte }) => carte)
		expect(cartes.map(({ photo }) => photo)).toEqual([null, null, null])
	})
})
