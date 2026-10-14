import { describe, expect, test } from 'bun:test'
import { type ProfilLu, profilsAttendus } from '../../scripts/migration/import/profils'
import { SECTIONS_VIDES, type SectionsLues, valeursDesListes } from '../../scripts/migration/import/sections'

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
			competences: [
				{ nom: 'Maquillage mariée', description: null },
				{ nom: 'Coiffure', description: 'Chignons.' },
				{ nom: 'Maquillage mariée', description: null },
			],
			langues: [{ nom: 'Français' }, { nom: 'Anglais' }],
			formations: [
				{ diplome: 'CAP Esthétique', ecole: 'École fictive', obtenuLe: '2018-06-30T12:00:00.000Z', description: null },
			],
			experiences: [
				{
					entreprise: 'Studio fictif',
					poste: 'Maquilleuse',
					ville: 'Lyon',
					debut: '2019-09-01T12:00:00.000Z',
					fin: null,
					description: null,
				},
			],
			// The price typed, byte for byte: spaces, an empty text and nothing at all stay as they are.
			prestations: [
				{
					nom: 'Mariage',
					description: null,
					prixTexte: '  à partir de 120 € ',
					prixAPartirDe: 120,
					options: [
						{ nom: 'Retouche', description: null, prixTexte: '', prixAPartirDe: null },
						{ nom: 'Essai', description: 'Une heure.', prixTexte: null, prixAPartirDe: null },
					],
				},
			],
			// The five links, under their names in Payload; the phone stays out (ticket 064).
			reseaux: {
				youtube: null,
				facebook: null,
				instagram: 'https://instagram.example.test/fictif',
				siteWeb: '@fictif',
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
		const { prestations } = valeursDesListes(
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
			prestations: {
				prixTexte: string | null
				prixAPartirDe: number | null
				options: { prixAPartirDe: number | null }[]
			}[]
		}

		expect(prestations.map(({ prixTexte, prixAPartirDe }) => [prixTexte, prixAPartirDe])).toEqual([
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
		expect(options.map(({ prixAPartirDe }) => prixAPartirDe)).toEqual(
			prestations.map(({ prixAPartirDe }) => prixAPartirDe)
		)
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
			competences: [],
			langues: [],
			formations: [],
			experiences: [],
			prestations: [],
			reseaux: null,
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

		expect(attendus.map(({ valeurs }) => [valeurs.photoPrincipale, valeurs.galerie])).toEqual([
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

		expect(attendus.map(({ valeurs }) => [valeurs.photoPrincipale, valeurs.statut])).toEqual([
			[null, 'publie'],
			[null, 'brouillon'],
			[null, 'brouillon'],
		])
		expect(statuts).toEqual({ publie: 1, brouillon: 2 })
		// 22 has a main picture at the source, whose file is not adopted: its status says so.
		expect(statutsDifferentsDeLaSource).toEqual([22])
	})

	test('un lien de liste sans ligne est signalé par son profil', () => {
		const { liensSansLigne } = profilsAttendus([profil(21, { liensSansLigne: 2 }), profil(22)], comptes)

		expect(liensSansLigne).toEqual([21])
	})
})
