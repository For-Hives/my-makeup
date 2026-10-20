import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { REFERENCES } from '../../scripts/migration/import/gaps'
import { normaliser } from '../../scripts/migration/import/engine'
import {
	ADAPTATEUR_PROFILS,
	affichesALaSource,
	coordonneesARevoir,
	coordonneesDeLaSource,
	offreChiffreePerdue,
	PROFILS_DU_SPAM,
	type ProfilLu,
	profilsAttendus,
	profilsLaisses,
	rayonARevoir,
	rayonDeLaSource,
	statutCalcule,
	videALaSource,
} from '../../scripts/migration/import/profiles'
import { SECTIONS_VIDES } from '../../scripts/migration/import/sections'
import { displayName, fullName, NEUTRAL_NAME, text } from '../../src/lib/profile/display-name'
import { PUBLIC_PROFILE_FIELDS } from '../../src/services/public/profiles'

/**
 * Tickets 026 and 059: what the import makes of a profile of the old site, the name of its page,
 * and the fields the public reading chooses. No database: the runs are in
 * tests/integration/import-profils.test.ts. Every value here is fictional.
 */

const profil = (id: number, modif: Partial<ProfilLu> = {}): ProfilLu => ({
	id,
	first_name: null,
	last_name: null,
	company_artist_name: null,
	speciality: null,
	description: null,
	city: null,
	username: `Profil ${id}`,
	score: null,
	available: true,
	pro: false,
	created_at: '2024-01-01T10:00:00.000Z',
	updated_at: '2024-02-01T10:00:00.000Z',
	compte: id + 100,
	aPhotoPrincipale: false,
	prix: [],
	reseaux: null,
	sections: SECTIONS_VIDES,
	...modif,
})

describe('la source dit si un profil est entièrement vide, comme l’ancien site le lit', () => {
	test('un nom seul laisse le profil entièrement vide', () => {
		expect(videALaSource(profil(1, { first_name: 'Manon', last_name: 'Petit' }))).toBe(true)
		expect(videALaSource(profil(1, { reseaux: { instagram: '   ' } }))).toBe(true)
	})

	test('une seule des six conditions suffit à ne plus l’être', () => {
		const uneCondition: Partial<ProfilLu>[] = [
			{ aPhotoPrincipale: true },
			{ city: 'Annecy' },
			{ speciality: 'Mariage' },
			{ prix: ['Sur devis', 'à partir de 80 €'] },
			{ description: 'x'.repeat(200) },
			{ reseaux: { phone: '06 39 98 00 00' } },
		]
		for (const modif of uneCondition) expect(videALaSource(profil(1, modif)), JSON.stringify(modif)).toBe(false)
		// What is not a condition: a short description, a country, a price without a number.
		for (const modif of [{ description: 'Courte.' }, { city: 'France' }, { prix: ['Sur devis'] }])
			expect(videALaSource(profil(1, modif)), JSON.stringify(modif)).toBe(true)
	})
})

describe('le statut est celui que le serveur calcule de ce que l’import écrit (ticket 044)', () => {
	test('entièrement vide : brouillon ; une condition remplie : publié', () => {
		expect(statutCalcule({ firstName: 'Manon', lastName: 'Petit' })).toBe('draft')
		expect(statutCalcule({ specialty: 'Mariage' })).toBe('published')
		expect(statutCalcule({ description: 'x'.repeat(200) })).toBe('published')
		expect(statutCalcule({ description: 'Courte.' })).toBe('draft')
	})

	test('le statut est comparé mais jamais écrit ; le choix du statut est rendu à la règle', () => {
		expect(ADAPTATEUR_PROFILS.calcules).toEqual(['status'])
		expect(ADAPTATEUR_PROFILS.champs).toMatchObject({ status: 'texte', chosenStatus: 'texte' })
		const [attendu] = profilsAttendus([profil(21, { speciality: 'Mariage' })], new Map([[121, 501]])).attendus
		expect(attendu?.valeurs).toMatchObject({ status: 'published', chosenStatus: 'automatic' })
	})
})

describe('les profils que l’import ne prend pas (SCHEMA.md §4.1 et §11)', () => {
	const profils = [
		profil(21, { compte: 1 }),
		profil(29, { compte: 11 }),
		profil(31, { compte: 12 }),
		// The spam: no account at all.
		profil(67, { compte: null }),
		profil(74, { compte: null }),
		// No account, out of the list of the spam: a link to an account the source no longer holds.
		profil(40, { compte: 99 }),
		profil(41, { compte: null }),
	]
	const comptesDeLaSource = new Set([1, 11, 12])

	test('la liste du spam est celle de SCHEMA.md §4.1', () => {
		const schema = readFileSync(path.resolve(import.meta.dir, '../../docs/migration/SCHEMA.md'), 'utf8')
		const section = schema.slice(schema.indexOf('### 4.1'), schema.indexOf('### 4.2'))
		expect(section).toContain(`Identifiants (\`makeup_artistes.id\`) : ${PROFILS_DU_SPAM.join(', ')}.`)
		expect(PROFILS_DU_SPAM).toHaveLength(13)
	})

	test('sans décision : les profils du spam sont écartés, tout autre profil sans compte arrête l’import', () => {
		expect(profilsLaisses(profils, { comptesDeLaSource, comptesEcartes: [11, 12], profilsEcartes: [] })).toEqual({
			ecartes: [],
			spam: [67, 74],
			deComptesEcartes: [29, 31],
			sansCompte: [40, 41],
			sansObjet: 0,
		})
	})

	test('une décision par profil le laisse de côté ; une décision qui ne nomme aucun de ces cas est sans objet', () => {
		expect(
			profilsLaisses(profils, {
				comptesDeLaSource,
				comptesEcartes: [11, 12],
				// 21 has its account, 67 is the spam already, 500 is not in the source.
				profilsEcartes: [29, 41, 21, 67, 500],
			})
		).toEqual({ ecartes: [29, 41], spam: [67, 74], deComptesEcartes: [31], sansCompte: [40], sansObjet: 3 })
	})

	test('un profil de la liste du spam qui a un compte est un profil comme un autre', () => {
		expect(
			profilsLaisses([profil(67, { compte: 1 })], { comptesDeLaSource, comptesEcartes: [], profilsEcartes: [] })
		).toEqual({ ecartes: [], spam: [], deComptesEcartes: [], sansCompte: [], sansObjet: 0 })
	})
})

describe('les profils attendus', () => {
	const profils = [
		profil(21, { username: 'Zoé Lefèvre', compte: 1, speciality: 'Mariage', created_at: '2023-05-12T09:20:00.000Z' }),
		profil(22, { username: 'lea-martin', compte: 2, first_name: 'Léa', available: null }),
		// Same slug as 21, created later: it takes the suffix, as on the old site.
		profil(23, { username: 'zoe lefevre', compte: 3, created_at: '2024-01-01T00:00:00.000Z', available: false }),
		profil(24, { username: 'Sans compte', compte: null }),
		profil(25, { username: 'Compte écarté', compte: 11 }),
		// Older than 21 and without an account: its slug still counts in the table of the old site.
		profil(26, { username: 'ZOE-LEFEVRE', compte: null, created_at: '2022-01-01T00:00:00.000Z' }),
	]
	const comptes = new Map<number, number | null>([
		[1, 501],
		[2, 502],
		[3, null],
	])
	const laisses = { ecartes: [25], spam: [24, 26] }

	test('reliés à leur compte dans Payload, avec le slug de l’ancien site, calculé sur toute la source', () => {
		const { attendus } = profilsAttendus(profils, comptes, laisses)

		expect(attendus.map(({ strapiId, valeurs }) => [strapiId, valeurs.pro, valeurs.slug])).toEqual([
			[21, 501, 'zoe-lefevre-2'],
			[22, 502, 'lea-martin'],
			[23, null, 'zoe-lefevre-3'],
		])
	})

	test('un profil ni pris ni laissé de côté est une erreur : l’import devait s’arrêter avant', () => {
		expect(() => profilsAttendus(profils, comptes, { ecartes: [25], spam: [26] })).toThrow(
			'Le profil 24 n’a pas de compte repris'
		)
	})

	test('chaque transformation porte sa référence : slug stocké, disponibilité par défaut, profil vide en brouillon', () => {
		const { attendus, statuts } = profilsAttendus(profils, comptes, laisses)

		expect(attendus.map(({ strapiId, ecarts }) => [strapiId, ecarts.map(({ reference }) => reference)])).toEqual([
			[21, ['slug-stocke']],
			[22, ['disponibilite-par-defaut', 'profils-vides-brouillon']],
			[23, ['slug-stocke', 'profils-vides-brouillon']],
		])
		expect(statuts).toEqual({ published: 1, draft: 2 })
		for (const reference of ['disponibilite-par-defaut', 'profils-spam-non-repris'])
			expect(Object.values(REFERENCES) as string[]).toContain(reference)
	})

	test('l’identité, l’ancien nom d’utilisateur, le score, le badge et les dates tels quels ; nul reste nul, sauf la disponibilité', () => {
		const [zoe, lea, ines] = profilsAttendus(
			[
				{ ...(profils[0] as ProfilLu), score: '12.50', pro: true, updated_at: '2026-09-28T10:11:12.131Z' },
				...profils.slice(1),
			],
			comptes,
			laisses
		).attendus

		expect(zoe?.valeurs).toEqual({
			strapiId: 21,
			pro: 501,
			slug: 'zoe-lefevre-2',
			legacyUsername: 'Zoé Lefèvre',
			firstName: null,
			lastName: null,
			artistName: null,
			specialty: 'Mariage',
			description: null,
			city: null,
			// Its radius (ticket 226): none at the source, none in the target.
			radiusKm: null,
			available: true,
			score: 12.5,
			superArtist: true,
			// Its sections (ticket 060): none at the source, none in the target.
			mainPicture: null,
			gallery: [],
			skills: [],
			languages: [],
			courses: [],
			experiences: [],
			serviceOffers: [],
			networks: null,
			// Its contact details (ticket 064): none at the source, so closed, without date or source.
			contactDetails: { phone: null, email: null },
			publicContact: false,
			consentedAt: null,
			consentSource: null,
			chosenStatus: 'automatic',
			status: 'published',
			createdAt: '2023-05-12T09:20:00.000Z',
			updatedAt: '2026-09-28T10:11:12.131Z',
		})
		expect([lea?.valeurs.available, lea?.valeurs.score, lea?.valeurs.legacyUsername]).toEqual([
			true,
			null,
			'lea-martin',
		])
		expect(ines?.valeurs.available).toBe(false)
	})

	test('un statut que la source ne donne pas est listé : une section pas encore reprise', () => {
		// 22 is empty in the v3 but not at the source: its only condition is its main picture.
		const { statutsDifferentsDeLaSource } = profilsAttendus(
			[profils[0] as ProfilLu, { ...(profils[1] as ProfilLu), aPhotoPrincipale: true }],
			comptes
		)

		expect(statutsDifferentsDeLaSource).toEqual([22])
	})

	test('un profil non vide à la source qui devient brouillon porte sa propre référence, pas celle des profils vides', () => {
		const { attendus } = profilsAttendus(
			[profils[0] as ProfilLu, { ...(profils[1] as ProfilLu), aPhotoPrincipale: true }],
			comptes
		)
		const references = (id: number) => attendus.find(({ strapiId }) => strapiId === id)?.ecarts.map(e => e.reference)

		expect(references(22)).toContain('profil-non-vide-en-brouillon')
		expect(references(22)).not.toContain('profils-vides-brouillon')
		expect(Object.values(REFERENCES) as string[]).toContain('profil-non-vide-en-brouillon')
	})
})

describe('le moteur compare un groupe de champs comme un tout', () => {
	test('un groupe vide vaut nul ; deux groupes égaux champ par champ sont égaux, dans n’importe quel ordre', () => {
		expect(normaliser('objet', { nom: null, codeInsee: undefined })).toBeNull()
		expect(normaliser('objet', { nom: 'Annecy', codeInsee: '74010' })).toBe(
			normaliser('objet', { codeInsee: '74010', nom: 'Annecy', latitude: undefined })
		)
		expect(normaliser('objet', { nom: 'Annecy', codeInsee: '74010' })).not.toBe(
			normaliser('objet', { nom: 'Annecy', codeInsee: '74011' })
		)
	})
})

describe('le nom de la page : prénom et nom, sinon le nom d’artiste, sinon un libellé neutre', () => {
	test('comme sur l’ancien site', () => {
		expect(displayName({ firstName: 'Zoé', lastName: 'Lefèvre', artistName: 'Zoé Make-up' })).toBe('Zoé Lefèvre')
		expect(displayName({ firstName: ' Zoé ', lastName: null })).toBe('Zoé')
		expect(displayName({ lastName: 'Lefèvre' })).toBe('Lefèvre')
		expect(displayName({ firstName: '  ', lastName: 'null', artistName: 'Studio Lumière' })).toBe('Studio Lumière')
		expect(displayName({ artistName: 'undefined' })).toBe(NEUTRAL_NAME)
		expect(displayName({})).toBe('Maquilleuse professionnelle')
	})

	test('jamais « undefined » ni « null »', () => {
		expect(text('NULL')).toBe('')
		expect(text(42)).toBe('')
		expect(fullName({ firstName: 'Undefined', lastName: 'Petit' })).toBe('Petit')
	})
})

describe('la lecture publique choisit ses champs un par un', () => {
	test('l’identité seulement : ni coordonnées, ni compte, ni ce qu’ont écrit l’import ou un admin', () => {
		expect(Object.keys(PUBLIC_PROFILE_FIELDS).sort()).toEqual([
			'artistName',
			'description',
			'firstName',
			'lastName',
			'slug',
			'specialty',
		])
	})
})

describe('les coordonnées de contact sont lues comme l’ancien site les lit (ticket 064)', () => {
	const reseaux = (phone: string | null, email: string | null) =>
		profil(1, { reseaux: { phone, email } as ProfilLu['reseaux'] })

	test('rognées, et sans valeur quand elles sont vides ou les mots null et undefined', () => {
		expect(coordonneesDeLaSource(reseaux(' 06 12 ', '  a@example.test '))).toEqual({
			telephone: '06 12',
			email: 'a@example.test',
		})
		for (const vide of ['', '   ', 'null', 'undefined', ' Undefined ', 'NULL']) {
			expect(coordonneesDeLaSource(reseaux(vide, vide)), vide).toEqual({ telephone: null, email: null })
			expect(affichesALaSource(reseaux(vide, vide)), vide).toBe(false)
		}
	})

	test('une valeur que le serveur refuserait est laissée de côté et listée, sans sa valeur', () => {
		const lu = reseaux('0'.repeat(21), 'Insta: @hugo')

		expect(coordonneesDeLaSource(lu)).toEqual({ telephone: null, email: null })
		expect(coordonneesARevoir(lu)).toEqual([
			{ profil: 1, champ: 'telephone' },
			{ profil: 1, champ: 'email' },
		])
		expect(affichesALaSource(lu)).toBe(false)
		// The other channel still opens the contact details.
		expect(affichesALaSource(reseaux('0'.repeat(21), 'a@example.test'))).toBe(true)
		expect(coordonneesARevoir(reseaux('06', 'a@example.test'))).toEqual([])
	})
})

describe('le rayon d’action est repris de 0 à 200 km, jamais ramené à 200 en silence (ticket 226)', () => {
	test('de 0 à 200 : repris tel quel ; sans rayon : vide', () => {
		for (const rayon of [0, 1, 30, 200]) expect(rayonDeLaSource({ action_radius: rayon }), String(rayon)).toBe(rayon)
		expect(rayonDeLaSource({ action_radius: null })).toBeNull()
		expect(rayonDeLaSource({})).toBeNull()
		expect(rayonARevoir({ id: 1, action_radius: 200 })).toBeNull()
		expect(rayonARevoir({ id: 1, action_radius: null })).toBeNull()
	})

	test('au-dessus de 200 : le champ reste vide, le profil est repris et listé avec la valeur', () => {
		expect(rayonDeLaSource({ action_radius: 201 })).toBeNull()
		expect(rayonDeLaSource({ action_radius: 400 })).toBeNull()
		expect(rayonARevoir({ id: 26, action_radius: 400 })).toEqual({ profil: 26, rayonKm: 400 })

		const { attendus, rayonsARevoir } = profilsAttendus(
			[profil(1, { action_radius: 30 }), profil(2, { action_radius: 400 }), profil(3)],
			new Map([
				[101, 1],
				[102, 2],
				[103, 3],
			])
		)

		expect(attendus.map(({ valeurs }) => valeurs.radiusKm)).toEqual([30, null, null])
		expect(rayonsARevoir).toEqual([{ profil: 2, rayonKm: 400 }])
		// The difference is explained by the register, once, for the profile above the bound only.
		expect(attendus.map(({ ecarts }) => ecarts.some(({ reference }) => reference === REFERENCES.rayon200Km))).toEqual([
			false,
			true,
			false,
		])
	})

	test('le rayon est un champ comparé : la parité le voit', () => {
		expect(ADAPTATEUR_PROFILS.champs.radiusKm).toBe('nombre')
		expect(normaliser('nombre', null)).toBeNull()
		expect(normaliser('nombre', 30)).toBe(30)
	})
})

describe('le contrôle des offres chiffrées perdues ne lit que les prestations (ticket 226)', () => {
	test('une option chiffrée ne cache pas une offre qui a perdu son montant', () => {
		const ecrites = [{ priceText: '80 €', priceFrom: null, options: [{ priceText: '15 €', priceFrom: 15 }] }]

		expect(offreChiffreePerdue(['80 €'], ecrites)).toBe(true)
	})

	test('seule une option chiffrée : aucune offre chiffrée à la source, rien n’est perdu', () => {
		const ecrites = [{ priceText: 'Sur devis', priceFrom: null, options: [{ priceText: '15 €', priceFrom: 15 }] }]

		expect(offreChiffreePerdue(['Sur devis'], ecrites)).toBe(false)
	})

	test('une offre qui garde son montant n’est pas perdue', () => {
		expect(offreChiffreePerdue(['80 €', null], [{ priceFrom: 80 }, { priceFrom: null }])).toBe(false)
	})
})
