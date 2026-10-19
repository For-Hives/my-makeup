import { describe, expect, test } from 'bun:test'
import { type ProfilLu, profilsAttendus } from '../../scripts/migration/import/profils'
import {
	lignesDansLesBornes,
	SECTIONS_VIDES,
	type SectionsLues,
	valeursDesListes,
} from '../../scripts/migration/import/sections'

/**
 * Ticket 060: what the import makes of the sections of a profile of the old site, before and
 * without the database: each list in its order, each value as it is, the photos of the media
 * adopted. The runs on the bench are in tests/integration/import-profils-sections.test.ts. Every
 * value here is fictional.
 */

const sections = (modif: Partial<SectionsLues> = {}): SectionsLues => ({
	...SECTIONS_VIDES,
	photoPrincipale: [],
	galerie: [],
	...modif,
})

const profil = (id: number, modif: Partial<SectionsLues> = {}): ProfilLu => {
	const lues = sections(modif)
	return {
		id,
		first_name: 'Zoé',
		last_name: 'Fictive',
		company_artist_name: null,
		speciality: null,
		description: null,
		city: null,
		username: `profil-${id}`,
		score: null,
		available: true,
		pro: false,
		created_at: '2024-01-01T10:00:00.000Z',
		updated_at: '2024-02-01T10:00:00.000Z',
		compte: id + 100,
		aPhotoPrincipale: lues.photoPrincipale.length > 0,
		prix: lues.prestations.map(({ price }) => price),
		reseaux: lues.reseau,
		sections: lues,
	}
}

describe('les listes d’un profil, sous les noms de Payload', () => {
	test('chaque ligne dans son ordre, chaque valeur telle quelle ; un jour à midi UTC', () => {
		const valeurs = valeursDesListes(
			sections({
				competences: [
					{ name: 'Maquillage mariée', description: null },
					{ name: 'Coiffure', description: 'Chignons.' },
					{ name: 'Maquillage mariée', description: null },
				],
				langues: [{ name: 'Français' }, { name: 'Anglais' }],
				formations: [
					{
						diploma: 'CAP Esthétique',
						school: 'École fictive',
						date_graduation: '2018-06-30',
						course_description: null,
					},
				],
				experiences: [
					{
						company: 'Studio fictif',
						job_name: 'Maquilleuse',
						city: 'Lyon',
						date_start: '2019-09-01',
						date_end: null,
						description: null,
					},
				],
				prestations: [
					{
						id: 4,
						name: 'Mariage',
						description: null,
						price: '  à partir de 120 € ',
						options: [
							{ name: 'Retouche', description: null, price: '' },
							{ name: 'Essai', description: 'Une heure.', price: null },
						],
					},
				],
				reseau: { instagram: 'https://instagram.example.test/fictif', website: '@fictif', phone: '06 39 98 00 00' },
			})
		)

		expect(valeurs).toEqual({
			skills: [
				{ name: 'Maquillage mariée', description: null },
				{ name: 'Coiffure', description: 'Chignons.' },
				{ name: 'Maquillage mariée', description: null },
			],
			languages: [{ name: 'Français' }, { name: 'Anglais' }],
			courses: [
				{
					diploma: 'CAP Esthétique',
					school: 'École fictive',
					graduatedAt: '2018-06-30T12:00:00.000Z',
					description: null,
				},
			],
			experiences: [
				{
					company: 'Studio fictif',
					jobTitle: 'Maquilleuse',
					city: 'Lyon',
					startDate: '2019-09-01T12:00:00.000Z',
					endDate: null,
					description: null,
				},
			],
			// The price typed, byte for byte: spaces, an empty text and nothing at all stay as they are.
			serviceOffers: [
				{
					name: 'Mariage',
					description: null,
					priceText: '  à partir de 120 € ',
					priceFrom: 120,
					options: [
						{ name: 'Retouche', description: null, priceText: '', priceFrom: null },
						{ name: 'Essai', description: 'Une heure.', priceText: null, priceFrom: null },
					],
				},
			],
			// The five links, under their names in Payload; the phone stays out (ticket 064).
			networks: {
				youtube: null,
				facebook: null,
				instagram: 'https://instagram.example.test/fictif',
				website: '@fictif',
				linkedin: null,
			},
		})
		expect(JSON.stringify(valeurs)).not.toContain('06 39 98')
	})

	test('le prix lu par la règle unique : le nombre quand il se lit, le texte toujours tel quel (ticket 062)', () => {
		const saisies = [
			'50',
			'50€',
			' 1 200 € ',
			'à partir de 80',
			'Sur devis',
			'Entre 60 et 90 €',
			'2 h : 150 €',
			'3',
			'',
			null,
		]
		const { serviceOffers: prestations } = valeursDesListes(
			sections({
				prestations: saisies.map((price, i) => ({
					id: i + 1,
					name: `Offre ${i + 1}`,
					description: null,
					price,
					options: [{ name: 'Option', description: null, price }],
				})),
			})
		) as {
			serviceOffers: {
				priceText: string | null
				priceFrom: number | null
				options: { priceFrom: number | null }[]
			}[]
		}

		expect(prestations.map(({ priceText, priceFrom }) => [priceText, priceFrom])).toEqual([
			['50', 50],
			['50€', 50],
			[' 1 200 € ', 1200],
			['à partir de 80', 80],
			['Sur devis', null],
			// The old site reads the first number of the text: ported as it is (src/lib/prix.ts).
			['Entre 60 et 90 €', 60],
			['2 h : 150 €', null],
			// Out of bounds (5 to 10 000 €): no amount, the text stays.
			['3', null],
			['', null],
			[null, null],
		])
		// An option goes through the same rule as its offer.
		const options = prestations.flatMap(({ options }) => options)
		expect(options.map(({ priceFrom }) => priceFrom)).toEqual(prestations.map(({ priceFrom }) => priceFrom))
	})

	test('le bilan des prix compte en nombres et liste les profils, sans jamais citer un texte', () => {
		const offre = (id: number, price: string | null) => ({ id, name: 'Offre', description: null, price, options: [] })
		const { prix, attendus } = profilsAttendus(
			[
				profil(1, { prestations: [offre(1, '80'), offre(2, 'Sur devis')] }),
				profil(2, { prestations: [offre(3, '2 h : 150 €')] }),
				profil(3, { prestations: [offre(4, null), offre(5, '')] }),
				profil(4, {
					prestations: [{ ...offre(6, 'Sur devis'), options: [{ name: 'Option', description: null, price: '15 €' }] }],
				}),
			],
			new Map([
				[101, 1],
				[102, 2],
				[103, 3],
				[104, 4],
			])
		)

		expect(prix).toEqual({
			prix: 7,
			avecMontant: 2,
			textesLibres: 3,
			sansTexte: 2,
			profilsAvecOffreChiffree: 1,
			offresChiffreesPerdues: [],
			chiffresNonLus: [2],
		})
		// The register line is counted once per profile that gains an amount, options included.
		const comptes = attendus.map(
			({ ecarts }) => ecarts.filter(({ reference }) => reference === 'prix-numerique').length
		)
		expect(comptes).toEqual([1, 0, 0, 1])
		expect(JSON.stringify(prix)).not.toContain('Sur devis')
	})

	test('un profil sans section n’a que des listes vides, et pas de réseaux', () => {
		expect(valeursDesListes(sections())).toEqual({
			skills: [],
			languages: [],
			courses: [],
			experiences: [],
			serviceOffers: [],
			networks: null,
		})
	})
})

describe('les photos d’un profil sont les médias adoptés de ses fichiers', () => {
	const comptes = new Map([
		[121, 501],
		[122, 502],
		[123, 503],
	])

	test('la photo principale et la galerie, dans l’ordre ; un fichier non adopté est signalé, pas inventé', () => {
		const medias = new Map<number, number | null>([
			[1, 11],
			[2, 12],
			[3, 13],
		])

		const { attendus, photosNonReprises } = profilsAttendus(
			[profil(21, { photoPrincipale: [1], galerie: [3, 9, 2] }), profil(22, { photoPrincipale: [8] })],
			comptes,
			undefined,
			undefined,
			medias
		)

		expect(attendus.map(({ valeurs }) => [valeurs.mainPicture, valeurs.gallery])).toEqual([
			[11, [13, 12]],
			[null, []],
		])
		expect(photosNonReprises).toEqual([
			{ entree: 21, fichier: 9 },
			{ entree: 22, fichier: 8 },
		])
	})

	test('le statut lit si la photo principale est adoptée, même avant que son média existe (à blanc)', () => {
		const { attendus, statuts, statutsDifferentsDeLaSource } = profilsAttendus(
			[profil(21, { photoPrincipale: [1] }), profil(22, { photoPrincipale: [2] }), profil(23)],
			comptes,
			undefined,
			undefined,
			new Map([[1, null]])
		)

		expect(attendus.map(({ valeurs }) => [valeurs.mainPicture, valeurs.status])).toEqual([
			[null, 'published'],
			[null, 'draft'],
			[null, 'draft'],
		])
		expect(statuts).toEqual({ published: 1, draft: 2 })
		// 22 has a main picture at the source, whose file is not adopted: its status says so.
		expect(statutsDifferentsDeLaSource).toEqual([22])
	})

	test('un lien de liste sans ligne est signalé par son profil', () => {
		const { liensSansLigne } = profilsAttendus([profil(21, { liensSansLigne: 2 }), profil(22)], comptes)

		expect(liensSansLigne).toEqual([21])
	})
})

describe('une ligne hors d’une borne de la v3 est laissée de côté et listée, le profil est repris (ticket 226)', () => {
	const AUJOURD_HUI = new Date('2026-10-16T09:00:00.000Z')
	const experience = (debut: string | null, fin: string | null) => ({
		company: 'Studio',
		job_name: 'Maquilleuse',
		city: null,
		date_start: debut,
		date_end: fin,
		description: null,
	})
	const formation = (jour: string | null) => ({
		diploma: 'CAP',
		school: null,
		date_graduation: jour,
		course_description: null,
	})
	const offre = (id: number, modif: Partial<SectionsLues['prestations'][number]> = {}) => ({
		id,
		name: `Offre ${id}`,
		description: null,
		price: null,
		options: [],
		...modif,
	})

	test('une fin d’expérience avant son début : la ligne part, les autres restent à leur rang', () => {
		const { sections: gardees, laissees } = lignesDansLesBornes(
			sections({
				experiences: [
					experience('2020-01-01', '2021-01-01'),
					experience('2022-05-01', '2021-01-01'),
					experience('2023-01-01', null),
					experience(null, '2019-01-01'),
				],
			}),
			AUJOURD_HUI
		)

		expect(laissees).toEqual([{ liste: 'experiences', rang: 2 }])
		expect(gardees.experiences.map(({ date_start }) => date_start)).toEqual(['2020-01-01', '2023-01-01', null])
	})

	test('une formation datée de plus d’un an après le jour part ; un an exactement reste', () => {
		const { sections: gardees, laissees } = lignesDansLesBornes(
			sections({
				formations: [formation('2027-10-16'), formation('2027-10-17'), formation('2018-06-30'), formation(null)],
			}),
			AUJOURD_HUI
		)

		expect(laissees).toEqual([{ liste: 'formations', rang: 2 }])
		expect(gardees.formations).toHaveLength(3)
	})

	test('un nom de plus de 70 caractères et une description de plus de 2 000 : à 70 et 2 000 ils restent', () => {
		const { sections: gardees, laissees } = lignesDansLesBornes(
			sections({
				prestations: [
					offre(1, { name: 'x'.repeat(70), description: 'y'.repeat(2000) }),
					offre(2, { description: 'y'.repeat(2001) }),
					offre(3, {
						options: [
							{ name: 'x'.repeat(70), description: null, price: null },
							{ name: 'x'.repeat(71), description: null, price: null },
							{ name: 'ok', description: 'y'.repeat(2001), price: null },
						],
					}),
				],
				competences: [{ name: 'x'.repeat(71), description: null }],
			}),
			AUJOURD_HUI
		)

		expect(laissees).toEqual([
			{ liste: 'competences', rang: 1 },
			{ liste: 'prestations', rang: 2 },
			{ liste: 'options', rang: 2, prestation: 3 },
			{ liste: 'options', rang: 3, prestation: 3 },
		])
		expect(gardees.prestations.map(({ id, options }) => [id, options.length])).toEqual([
			[1, 0],
			[3, 1],
		])
		expect(gardees.competences).toEqual([])
	})

	test('une offre laissée de côté emporte ses options, chacune listée', () => {
		const { sections: gardees, laissees } = lignesDansLesBornes(
			sections({
				prestations: [
					offre(1, {
						description: 'y'.repeat(2001),
						options: [{ name: 'Option', description: null, price: '15 €' }],
					}),
				],
			}),
			AUJOURD_HUI
		)

		expect(gardees.prestations).toEqual([])
		expect(laissees).toEqual([
			{ liste: 'prestations', rang: 1 },
			{ liste: 'options', rang: 1, prestation: 1 },
		])
	})

	test('rien n’est listé quand tout est dans les bornes, et la liste ne porte jamais un texte', () => {
		const lues = sections({
			experiences: [experience('2020-01-01', '2020-01-01')],
			formations: [formation('2026-10-16')],
			prestations: [offre(1)],
		})

		expect(lignesDansLesBornes(lues, AUJOURD_HUI)).toEqual({ sections: lues, laissees: [] })
		const { laissees } = lignesDansLesBornes(sections({ langues: [{ name: 'Secret'.repeat(20) }] }), AUJOURD_HUI)
		expect(JSON.stringify(laissees)).not.toContain('Secret')
	})

	test('le profil est repris sans la ligne ; le bilan des prix ne compte que ce qui est écrit, et le dit à part', () => {
		const lues = sections({
			experiences: [experience('2022-05-01', '2021-01-01')],
			prestations: [offre(1, { description: 'y'.repeat(2001), price: '80 €' }), offre(2, { price: '60 €' })],
		})
		const { attendus, lignesLaissees, prix } = profilsAttendus(
			[profil(1, lues)],
			new Map([[101, 1]]),
			undefined,
			undefined,
			undefined,
			null,
			AUJOURD_HUI
		)

		expect(lignesLaissees).toEqual([
			{ profil: 1, liste: 'experiences', rang: 1 },
			{ profil: 1, liste: 'prestations', rang: 1 },
		])
		expect(attendus[0]?.valeurs.experiences).toEqual([])
		expect((attendus[0]?.valeurs.serviceOffers as unknown[]).length).toBe(1)
		expect(prix.prix).toBe(1)
		expect(prix.offresChiffreesPerdues).toEqual([])
	})
})
