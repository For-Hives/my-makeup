import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { normalize } from '../../scripts/migration/import/engine'
import { REFERENCES } from '../../scripts/migration/import/gaps'
import {
	computedStatus,
	contactDetailsToReview,
	emptyToSource,
	expectedProfiles,
	legacySpecialty,
	lostPricedOffer,
	PROFILES_ADAPTER,
	type ReadProfile,
	radiusToReview,
	SPAM_PROFILES,
	shownToSource,
	skippedProfiles,
	sourceContactDetails,
	sourceRadius,
} from '../../scripts/migration/import/profiles'
import { EMPTY_SECTIONS } from '../../scripts/migration/import/sections'
import { displayName, fullName, NEUTRAL_NAME, text } from '../../src/lib/profile/display-name'
import { PUBLIC_PROFILE_FIELDS } from '../../src/services/public/profiles'

/**
 * Tickets 026 and 059: what the import makes of a profile of the old site, the name of its page,
 * and the fields the public reading chooses. No database: the runs are in
 * tests/integration/import-profiles.test.ts. Every value here is fictional.
 */

const profile = (id: number, modif: Partial<ReadProfile> = {}): ReadProfile => ({
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
	sections: EMPTY_SECTIONS,
	...modif,
})

describe('la source dit si un profil est entièrement vide, comme l’ancien site le lit', () => {
	test('un nom seul laisse le profil entièrement vide', () => {
		expect(emptyToSource(profile(1, { first_name: 'Manon', last_name: 'Petit' }))).toBe(true)
		expect(emptyToSource(profile(1, { reseaux: { instagram: '   ' } }))).toBe(true)
	})

	test('une seule des six conditions suffit à ne plus l’être', () => {
		const condition: Partial<ReadProfile>[] = [
			{ aPhotoPrincipale: true },
			{ city: 'Annecy' },
			{ speciality: 'Mariage' },
			{ prix: ['Sur devis', 'à partir de 80 €'] },
			{ description: 'x'.repeat(200) },
			{ reseaux: { phone: '06 39 98 00 00' } },
		]
		for (const edit of condition) expect(emptyToSource(profile(1, edit)), JSON.stringify(edit)).toBe(false)
		// What is not a condition: a short description, a country, a price without a number.
		for (const edit of [{ description: 'Courte.' }, { city: 'France' }, { prix: ['Sur devis'] }])
			expect(emptyToSource(profile(1, edit)), JSON.stringify(edit)).toBe(true)
	})
})

describe('le statut est celui que le serveur calcule de ce que l’import écrit (ticket 044)', () => {
	test('entièrement vide : brouillon ; une condition remplie : publié', () => {
		expect(computedStatus({ firstName: 'Manon', lastName: 'Petit' })).toBe('draft')
		expect(computedStatus({ specialty: 'Mariage' })).toBe('published')
		expect(computedStatus({ description: 'x'.repeat(200) })).toBe('published')
		expect(computedStatus({ description: 'Courte.' })).toBe('draft')
	})

	test('le statut est comparé mais jamais écrit ; le choix du statut est rendu à la règle', () => {
		expect(PROFILES_ADAPTER.computed).toEqual(['status'])
		expect(PROFILES_ADAPTER.fields).toMatchObject({ status: 'texte', chosenStatus: 'texte' })
		const [expected] = expectedProfiles([profile(21, { speciality: 'Mariage' })], new Map([[121, 501]])).expected
		expect(expected?.values).toMatchObject({ status: 'published', chosenStatus: 'automatic' })
	})
})

describe('les profils que l’import ne prend pas (SCHEMA.md §4.1 et §11)', () => {
	const profiles = [
		profile(21, { compte: 1 }),
		profile(29, { compte: 11 }),
		profile(31, { compte: 12 }),
		// The spam: no account at all.
		profile(67, { compte: null }),
		profile(74, { compte: null }),
		// No account, out of the list of the spam: a link to an account the source no longer holds.
		profile(40, { compte: 99 }),
		profile(41, { compte: null }),
	]
	const sourceAccounts = new Set([1, 11, 12])

	test('la liste du spam est celle de SCHEMA.md §4.1', () => {
		const schema = readFileSync(path.resolve(import.meta.dir, '../../docs/migration/SCHEMA.md'), 'utf8')
		const section = schema.slice(schema.indexOf('### 4.1'), schema.indexOf('### 4.2'))
		expect(section).toContain(`Identifiants (\`makeup_artistes.id\`) : ${SPAM_PROFILES.join(', ')}.`)
		expect(SPAM_PROFILES).toHaveLength(13)
	})

	test('sans décision : les profils du spam sont écartés, tout autre profil sans compte arrête l’import', () => {
		expect(
			skippedProfiles(profiles, { sourceAccounts: sourceAccounts, excludedAccounts: [11, 12], excludedProfiles: [] })
		).toEqual({
			excluded: [],
			spam: [67, 74],
			ofExcludedAccounts: [29, 31],
			withoutAccount: [40, 41],
			pointless: 0,
		})
	})

	test('une décision par profil le laisse de côté ; une décision qui ne nomme aucun de ces cas est sans objet', () => {
		expect(
			skippedProfiles(profiles, {
				sourceAccounts: sourceAccounts,
				excludedAccounts: [11, 12],
				// 21 has its account, 67 is the spam already, 500 is not in the source.
				excludedProfiles: [29, 41, 21, 67, 500],
			})
		).toEqual({ excluded: [29, 41], spam: [67, 74], ofExcludedAccounts: [31], withoutAccount: [40], pointless: 3 })
	})

	test('un profil de la liste du spam qui a un compte est un profil comme un autre', () => {
		expect(
			skippedProfiles([profile(67, { compte: 1 })], {
				sourceAccounts: sourceAccounts,
				excludedAccounts: [],
				excludedProfiles: [],
			})
		).toEqual({ excluded: [], spam: [], ofExcludedAccounts: [], withoutAccount: [], pointless: 0 })
	})
})

describe('les profils attendus', () => {
	const profiles = [
		profile(21, { username: 'Zoé Lefèvre', compte: 1, speciality: 'Mariage', created_at: '2023-05-12T09:20:00.000Z' }),
		profile(22, { username: 'lea-martin', compte: 2, first_name: 'Léa', available: null }),
		// Same slug as 21, created later: it takes the suffix, as on the old site.
		profile(23, { username: 'zoe lefevre', compte: 3, created_at: '2024-01-01T00:00:00.000Z', available: false }),
		profile(24, { username: 'Sans compte', compte: null }),
		profile(25, { username: 'Compte écarté', compte: 11 }),
		// Older than 21 and without an account: its slug still counts in the table of the old site.
		profile(26, { username: 'ZOE-LEFEVRE', compte: null, created_at: '2022-01-01T00:00:00.000Z' }),
	]
	const accounts = new Map<number, number | null>([
		[1, 501],
		[2, 502],
		[3, null],
	])
	const left = { excluded: [25], spam: [24, 26] }

	test('reliés à leur compte dans Payload, avec le slug de l’ancien site, calculé sur toute la source', () => {
		const { expected: expectedList } = expectedProfiles(profiles, accounts, left)

		expect(expectedList.map(({ strapiId, values: valeurs }) => [strapiId, valeurs.pro, valeurs.slug])).toEqual([
			[21, 501, 'zoe-lefevre-2'],
			[22, 502, 'lea-martin'],
			[23, null, 'zoe-lefevre-3'],
		])
	})

	test('un profil ni pris ni laissé de côté est une erreur : l’import devait s’arrêter avant', () => {
		expect(() => expectedProfiles(profiles, accounts, { excluded: [25], spam: [26] })).toThrow(
			'Le profil 24 n’a pas de compte repris'
		)
	})

	test('chaque transformation porte sa référence : slug stocké, disponibilité par défaut, profil vide en brouillon', () => {
		const { expected: expectedList, statuses } = expectedProfiles(profiles, accounts, left)

		expect(
			expectedList.map(({ strapiId, gaps: ecarts }) => [strapiId, ecarts.map(({ reference }) => reference)])
		).toEqual([
			[21, ['slug-stocke']],
			[22, ['disponibilite-par-defaut', 'profils-vides-brouillon']],
			[23, ['slug-stocke', 'profils-vides-brouillon']],
		])
		expect(statuses).toEqual({ published: 1, draft: 2 })
		for (const reference of ['disponibilite-par-defaut', 'profils-spam-non-repris'])
			expect(Object.values(REFERENCES) as string[]).toContain(reference)
	})

	test('l’identité, l’ancien nom d’utilisateur, le score, le badge et les dates tels quels ; nul reste nul, sauf la disponibilité', () => {
		const [zoe, lea, ines] = expectedProfiles(
			[
				{ ...(profiles[0] as ReadProfile), score: '12.50', pro: true, updated_at: '2026-09-28T10:11:12.131Z' },
				...profiles.slice(1),
			],
			accounts,
			left
		).expected

		expect(zoe?.values).toEqual({
			strapiId: 21,
			pro: 501,
			slug: 'zoe-lefevre-2',
			legacyUsername: 'Zoé Lefèvre',
			firstName: null,
			lastName: null,
			artistName: null,
			specialty: 'Mariage',
			specialtyBullets: ['wedding'],
			specialtyOther: null,
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
		expect([lea?.values.available, lea?.values.score, lea?.values.legacyUsername]).toEqual([true, null, 'lea-martin'])
		expect(ines?.values.available).toBe(false)
	})

	test('un statut que la source ne donne pas est listé : une section pas encore reprise', () => {
		// 22 is empty in the v3 but not at the source: its only condition is its main picture.
		const { statusesDifferingFromSource: sourceStatusesDifferent } = expectedProfiles(
			[profiles[0] as ReadProfile, { ...(profiles[1] as ReadProfile), aPhotoPrincipale: true }],
			accounts
		)

		expect(sourceStatusesDifferent).toEqual([22])
	})

	test('un profil non vide à la source qui devient brouillon porte sa propre référence, pas celle des profils vides', () => {
		const { expected: expectedList } = expectedProfiles(
			[profiles[0] as ReadProfile, { ...(profiles[1] as ReadProfile), aPhotoPrincipale: true }],
			accounts
		)
		const references = (id: number) => expectedList.find(({ strapiId }) => strapiId === id)?.gaps.map(e => e.reference)

		expect(references(22)).toContain('profil-non-vide-en-brouillon')
		expect(references(22)).not.toContain('profils-vides-brouillon')
		expect(Object.values(REFERENCES) as string[]).toContain('profil-non-vide-en-brouillon')
	})
})

describe('le moteur compare un groupe de champs comme un tout', () => {
	test('un groupe vide vaut nul ; deux groupes égaux champ par champ sont égaux, dans n’importe quel ordre', () => {
		expect(normalize('objet', { nom: null, inseeCode: undefined })).toBeNull()
		expect(normalize('objet', { nom: 'Annecy', inseeCode: '74010' })).toBe(
			normalize('objet', { inseeCode: '74010', nom: 'Annecy', latitude: undefined })
		)
		expect(normalize('objet', { nom: 'Annecy', inseeCode: '74010' })).not.toBe(
			normalize('objet', { nom: 'Annecy', inseeCode: '74011' })
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
	const networks = (phone: string | null, email: string | null) =>
		profile(1, { reseaux: { phone, email } as ReadProfile['reseaux'] })

	test('rognées, et sans valeur quand elles sont vides ou les mots null et undefined', () => {
		expect(sourceContactDetails(networks(' 06 12 ', '  a@example.test '))).toEqual({
			telephone: '06 12',
			email: 'a@example.test',
		})
		for (const empty of ['', '   ', 'null', 'undefined', ' Undefined ', 'NULL']) {
			expect(sourceContactDetails(networks(empty, empty)), empty).toEqual({ telephone: null, email: null })
			expect(shownToSource(networks(empty, empty)), empty).toBe(false)
		}
	})

	test('une valeur que le serveur refuserait est laissée de côté et listée, sans sa valeur', () => {
		const wasRead = networks('0'.repeat(21), 'Insta: @hugo')

		expect(sourceContactDetails(wasRead)).toEqual({ telephone: null, email: null })
		expect(contactDetailsToReview(wasRead)).toEqual([
			{ profile: 1, field: 'telephone' },
			{ profile: 1, field: 'email' },
		])
		expect(shownToSource(wasRead)).toBe(false)
		// The other channel still opens the contact details.
		expect(shownToSource(networks('0'.repeat(21), 'a@example.test'))).toBe(true)
		expect(contactDetailsToReview(networks('06', 'a@example.test'))).toEqual([])
	})
})

describe('le rayon d’action est repris de 0 à 200 km, jamais ramené à 200 en silence (ticket 226)', () => {
	test('de 0 à 200 : repris tel quel ; sans rayon : vide', () => {
		for (const radius of [0, 1, 30, 200]) expect(sourceRadius({ action_radius: radius }), String(radius)).toBe(radius)
		expect(sourceRadius({ action_radius: null })).toBeNull()
		expect(sourceRadius({})).toBeNull()
		expect(radiusToReview({ id: 1, action_radius: 200 })).toBeNull()
		expect(radiusToReview({ id: 1, action_radius: null })).toBeNull()
	})

	test('au-dessus de 200 : le champ reste vide, le profil est repris et listé avec la valeur', () => {
		expect(sourceRadius({ action_radius: 201 })).toBeNull()
		expect(sourceRadius({ action_radius: 400 })).toBeNull()
		expect(radiusToReview({ id: 26, action_radius: 400 })).toEqual({ profile: 26, radiusKm: 400 })

		const { expected: expectedList, radiiToReview } = expectedProfiles(
			[profile(1, { action_radius: 30 }), profile(2, { action_radius: 400 }), profile(3)],
			new Map([
				[101, 1],
				[102, 2],
				[103, 3],
			])
		)

		expect(expectedList.map(({ values: valeurs }) => valeurs.radiusKm)).toEqual([30, null, null])
		expect(radiiToReview).toEqual([{ profile: 2, radiusKm: 400 }])
		// The difference is explained by the register, once, for the profile above the bound only.
		expect(
			expectedList.map(({ gaps: ecarts }) => ecarts.some(({ reference }) => reference === REFERENCES.rayon200Km))
		).toEqual([false, true, false])
	})

	test('le rayon est un champ comparé : la parité le voit', () => {
		expect(PROFILES_ADAPTER.fields.radiusKm).toBe('nombre')
		expect(normalize('nombre', null)).toBeNull()
		expect(normalize('nombre', 30)).toBe(30)
	})
})

describe('le contrôle des offres chiffrées perdues ne lit que les prestations (ticket 226)', () => {
	test('une option chiffrée ne cache pas une offre qui a perdu son montant', () => {
		const written = [{ priceText: '80 €', priceFrom: null, options: [{ priceText: '15 €', priceFrom: 15 }] }]

		expect(lostPricedOffer(['80 €'], written)).toBe(true)
	})

	test('seule une option chiffrée : aucune offre chiffrée à la source, rien n’est perdu', () => {
		const written = [{ priceText: 'Sur devis', priceFrom: null, options: [{ priceText: '15 €', priceFrom: 15 }] }]

		expect(lostPricedOffer(['Sur devis'], written)).toBe(false)
	})

	test('une offre qui garde son montant n’est pas perdue', () => {
		expect(lostPricedOffer(['80 €', null], [{ priceFrom: 80 }, { priceFrom: null }])).toBe(false)
	})
})

describe('ticket 261 : la zone que l’import écrit, commune, pays ou revue', () => {
	const accounts = new Map([[148, 548]])
	const only = (edit: Partial<ReadProfile>) => profile(48, { city: 'Bruxelles-Belgique', ...edit })

	test('une zone de pays écrit le type, les pays et la ville ; le profil dont c’est la seule condition est publié', () => {
		const countries = new Map([[48, { countries: ['BE'], town: 'Bruxelles' }]])

		const [withZone] = expectedProfiles([only({})], accounts, undefined, undefined, undefined, null, undefined, {
			countries,
		}).expected
		const [withoutZone] = expectedProfiles([only({})], accounts).expected

		expect(withZone?.values).toMatchObject({
			city: null,
			zoneKind: 'countries',
			countries: ['BE'],
			town: 'Bruxelles',
			status: 'published',
		})
		expect(withoutZone?.values.status).toBe('draft')
		expect(withZone?.gaps.map(({ reference }) => reference)).toContain(REFERENCES.zoneHorsDeFrance)
		expect(withZone?.gaps.map(({ reference }) => reference)).toContain(REFERENCES.villeEnCommune)
	})

	test('une revue écrit la raison, le code postal et les communes possibles, jamais le texte', () => {
		const reviews = new Map([
			[
				36,
				{
					reason: 'sharedPostalCode' as const,
					postalCode: '62900',
					candidates: [{ inseeCode: '62901', name: 'Hameau-Un', department: '62' }],
				},
			],
		])

		const [expected] = expectedProfiles(
			[profile(36, { city: '62900' })],
			new Map([[136, 536]]),
			undefined,
			undefined,
			undefined,
			null,
			undefined,
			{ reviews }
		).expected

		expect(expected?.values.zoneReview).toEqual({
			reason: 'sharedPostalCode',
			postalCode: '62900',
			candidates: [{ inseeCode: '62901', name: 'Hameau-Un', department: '62' }],
		})
		expect(expected?.values.city).toBeNull()
		expect(JSON.stringify(expected?.values)).not.toContain('62900"}')
	})

	test('un profil de commune garde exactement les valeurs d’avant : aucune clé de zone', () => {
		const [expected] = expectedProfiles([profile(21, { city: 'Annecy' })], new Map([[121, 501]])).expected

		for (const key of ['zoneKind', 'countries', 'town', 'zoneReview'])
			expect(Object.hasOwn(expected?.values ?? {}, key), key).toBe(false)
	})

	test('les champs de zone sont comparés : le type par défaut est « city », une revue d’avant est un écart', () => {
		expect(PROFILES_ADAPTER.fields).toMatchObject({
			zoneKind: 'texte',
			countries: 'liste',
			town: 'texte',
			zoneReview: 'objet',
		})
		expect(PROFILES_ADAPTER.defaults).toEqual({
			zoneKind: 'city',
			countries: [],
			town: null,
			zoneReview: { reason: null, postalCode: null, candidates: null },
		})
	})
})

describe('1010 : la spécialité de l’ancien site est rangée sans perte', () => {
	test('une puce exacte devient une puce, tout autre texte reste entier dans « Autre »', () => {
		expect(legacySpecialty('Mariage')).toEqual({ specialtyBullets: ['wedding'], specialtyOther: null })
		expect(legacySpecialty('Maquilleuse mariée')).toEqual({
			specialtyBullets: [],
			specialtyOther: 'Maquilleuse mariée',
		})
		expect(legacySpecialty(null)).toEqual({ specialtyBullets: [], specialtyOther: null })
	})

	test('les valeurs attendues portent le texte d’origine et les champs rangés, et la comparaison les voit égaux au second passage', () => {
		for (const field of ['specialty', 'specialtyBullets', 'specialtyOther'])
			expect(Object.keys(PROFILES_ADAPTER.fields)).toContain(field)
		const stored = legacySpecialty('Mariage, Effets spéciaux')
		expect(normalize('liste', stored.specialtyBullets)).toBe(normalize('liste', ['wedding', 'specialEffects']))
		expect(normalize('texte', stored.specialtyOther)).toBe(normalize('texte', undefined))
	})
})
