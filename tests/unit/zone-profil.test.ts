import { describe, expect, test } from 'bun:test'
import type { Field } from 'payload'
import { Profiles } from '@/collections/Profiles'
import { DEPARTMENTS } from '@/lib/departments'
import {
	CITY_FIELDS,
	type CityInput,
	COORDINATE_DECIMALS,
	cityErrors,
	cityToFields,
	cityVerdict,
	departmentOfInseeCode,
	looksLikeAnAddress,
	normalizedInseeCode,
	normalizedName,
	OVERSEAS_COLLECTIVITIES,
	RADIUS_BOUNDS_KM,
	radiusVerdict,
	roundedCoordinate,
	ZONE_MESSAGES,
} from '@/lib/profile/zone'

/**
 * The zone of a profile as the server stores it (ticket 041): the INSEE code of a commune and the
 * département it names, the bounds of the radius, and what is wrong with a commune, in French.
 * Fictitious places are not needed: communes are public reference data, not personal data.
 */

/** A commune of the official list, as the space (ticket 123) and the import (ticket 063) will give it. */
const ANNECY = { name: 'Annecy', inseeCode: '74010', latitude: 45.8992, longitude: 6.1294 } as const

describe('le département d’un code INSEE', () => {
	test('les deux premiers caractères en métropole et en Corse, les trois premiers outre-mer', () => {
		expect(departmentOfInseeCode('74010')).toBe('74')
		expect(departmentOfInseeCode('01004')).toBe('01')
		expect(departmentOfInseeCode('75056')).toBe('75')
		expect(departmentOfInseeCode('2A004')).toBe('2A')
		expect(departmentOfInseeCode('2B033')).toBe('2B')
		expect(departmentOfInseeCode('97411')).toBe('974')
		expect(departmentOfInseeCode('97105')).toBe('971')
		expect(departmentOfInseeCode('97611')).toBe('976')
	})

	test('toute la France : les collectivités d’outre-mer de la liste officielle aussi, sur leurs trois premiers caractères', () => {
		// One commune of each, as geo.api.gouv.fr lists them (public reference data, 14/10/2026).
		expect(departmentOfInseeCode('97501')).toBe('975') // Miquelon-Langlade
		expect(departmentOfInseeCode('97502')).toBe('975') // Saint-Pierre
		expect(departmentOfInseeCode('97701')).toBe('977') // Saint-Barthélemy
		expect(departmentOfInseeCode('97801')).toBe('978') // Saint-Martin
		expect(departmentOfInseeCode('98411')).toBe('984') // Îles Saint-Paul et Nouvelle-Amsterdam
		expect(departmentOfInseeCode('98611')).toBe('986') // Alo
		expect(departmentOfInseeCode('98735')).toBe('987') // Papeete
		expect(departmentOfInseeCode('98801')).toBe('988') // Belep
		expect(departmentOfInseeCode('98901')).toBe('989') // Île de Clipperton
		expect(Object.keys(OVERSEAS_COLLECTIVITIES)).toEqual(['975', '977', '978', '984', '986', '987', '988', '989'])
	})

	test('chacun des 101 départements et des 8 collectivités d’outre-mer a des codes de communes bien formés', () => {
		for (const departement of [...Object.keys(DEPARTMENTS), ...Object.keys(OVERSEAS_COLLECTIVITIES)]) {
			const code = departement.length === 3 ? `${departement}01` : `${departement}001`
			expect(departmentOfInseeCode(code), code).toBe(departement)
		}
	})

	test('un code mal formé ne nomme aucun département', () => {
		const malFormes = [
			'7401', // 4 caractères
			'740100', // 6 caractères
			'74 010',
			' 74010', // lu tel quel : la collection retire les espaces avant
			'2a004', // lu tel quel : la collection écrit A et B en capitales avant
			'20004', // la Corse est 2A et 2B depuis 1976
			'2C004',
			'00001', // aucun département 00
			'96001', // ni 96
			'74000', // aucune commune numérotée 0
			'97400',
			'97500',
			'97001', // ni 970
			'97901', // ni 979
			'98001', // ni 980
			'98501', // ni 985
			'99001', // ni 99, ni 990 : l’étranger n’a pas de commune
			'ABCDE',
			'',
		]
		for (const code of malFormes) expect(departmentOfInseeCode(code), code).toBeNull()
		for (const valeur of [74010, null, undefined, {}, ['74010']]) expect(departmentOfInseeCode(valeur)).toBeNull()
	})

	test('la collection range le code sans espaces autour, A et B en capitales, vide en null ; une commune nulle est vide, un texte seul n’a pas de code', () => {
		expect(normalizedInseeCode(' 2a004 ')).toBe('2A004')
		expect(normalizedInseeCode('74010')).toBe('74010')
		expect(normalizedInseeCode('   ')).toBeNull()
		expect(normalizedInseeCode('')).toBeNull()
		// What is not a text is left as sent: the check refuses it.
		expect(normalizedInseeCode(74010)).toBe(74010)
		expect(normalizedInseeCode(null)).toBeNull()
		expect(normalizedInseeCode(undefined)).toBeUndefined()
		expect(cityToFields(null)).toEqual({ name: null, inseeCode: null, latitude: null, longitude: null })
		expect(cityToFields('Annecy')).toEqual({ name: 'Annecy', inseeCode: null, latitude: null, longitude: null })
		expect(cityErrors(cityToFields('Annecy') as CityInput)).toEqual({
			inseeCode: ZONE_MESSAGES.communeSansCodeInsee,
		})
		expect(cityToFields(ANNECY)).toEqual(ANNECY)
		expect(cityToFields(undefined)).toBeUndefined()
		expect(normalizedName('  Annecy ')).toBe('Annecy')
		expect(normalizedName(' ')).toBeNull()
		expect(normalizedName(undefined)).toBeUndefined()
	})
})

describe('une commune s’envoie entière, et seulement comme un objet', () => {
	test('ce qu’une commune envoyée ne donne pas est vide, jamais repris de la commune déjà enregistrée', () => {
		const vide = { name: null, inseeCode: null, latitude: null, longitude: null }
		expect(cityToFields({ name: 'Lyon' })).toEqual({ ...vide, name: 'Lyon' })
		expect(cityToFields({ inseeCode: '69123' })).toEqual({ ...vide, inseeCode: '69123' })
		expect(cityToFields({ name: 'Lyon', inseeCode: '69123' })).toEqual({ ...vide, name: 'Lyon', inseeCode: '69123' })
		expect(cityToFields({})).toEqual(vide)
		// The département is the server's: what a request sends for it is not kept.
		expect(cityToFields({ ...ANNECY, department: '13' })).toEqual(ANNECY)
		expect(cityErrors(cityToFields({ name: 'Lyon' }) as CityInput)).toEqual({
			inseeCode: ZONE_MESSAGES.communeSansCodeInsee,
		})
		expect(cityErrors(cityToFields({ inseeCode: '69123' }) as CityInput)).toEqual({
			name: ZONE_MESSAGES.codeInseeSansNom,
		})
	})

	test('une liste, ou un objet qui n’est pas un simple objet, n’est pas une commune : refusée en français', () => {
		for (const commune of [[], ['Annecy'], [ANNECY], new Date(0), new Map([['nom', 'Annecy']])]) {
			expect(cityToFields(commune), String(commune)).toBe(commune)
			expect(cityVerdict(commune), String(commune)).toBe(ZONE_MESSAGES.communeSansCodeInsee)
		}
		for (const commune of [undefined, null, {}, ANNECY, cityToFields(null), Object.create(null)])
			expect(cityVerdict(commune)).toBe(true)
	})
})

describe('un nom de commune n’est jamais une adresse', () => {
	test('un numéro, un code postal, une virgule ou une rue suivie de son name : refusés en français', () => {
		const adresses = [
			'12 rue des Lilas, 74000 Annecy',
			'12 rue des Lilas',
			'rue des Lilas',
			'Rue des Lilas Annecy',
			'Chemin des Vignes',
			'l’avenue des Lilas',
			'3 place du Marché Thonon-les-Bains',
			'lieu-dit Les Marais',
			'Le Bourg 74300 Cluses',
			'Annecy 74000',
			'74000',
			'Annecy, Haute-Savoie',
			'Annecy; Thonon',
			'Paris 21e Arrondissement 75000',
			'BP 12 Annecy',
		]
		for (const nom of adresses) {
			expect(looksLikeAnAddress(nom), nom).toBe(true)
			expect(cityErrors({ name: nom, inseeCode: '74010' }), nom).toEqual({
				name: ZONE_MESSAGES.nomAdresse,
			})
		}
		expect(ZONE_MESSAGES.nomAdresse).toBe(
			'Ce nom ressemble à une adresse : choisis ta commune dans la liste, jamais ton adresse.'
		)
	})

	test('les noms de la liste officielle passent, même ceux qui portent un mot de rue, un chiffre ou des parenthèses', () => {
		// Real names of geo.api.gouv.fr (public reference data). The rule was also run on the whole
		// list of 14/10/2026, 34 969 communes and 45 arrondissements: none was refused.
		const noms = [
			'Annecy',
			'Rue',
			'Le Chemin',
			'Le Passage',
			'Cours',
			'Le Parc',
			'La Chaussée-Saint-Victor',
			'Les Rues-des-Vignes',
			'Château-Chinon (Ville)',
			'Bors (Canton de Tude-et-Lavalette)',
			'L’Haÿ-les-Roses',
			"L'Haÿ-les-Roses",
			'Îles Saint-Paul et Nouvelle-Amsterdam',
			'Marseille 1er Arrondissement',
			'Paris 20e Arrondissement',
			'Saint-Remy-en-Bouzemont-Saint-Genest-et-Isson',
		]
		for (const nom of noms) {
			expect(looksLikeAnAddress(nom), nom).toBe(false)
			expect(cityErrors({ name: nom, inseeCode: '74010' }), nom).toEqual({})
		}
	})
})

describe('un nom de commune n’a que les caractères d’un nom de commune', () => {
	test('un email, un site, une abréviation ou un symbole : refusés en français', () => {
		const textes = [
			'moi@exemple.fr',
			'www.mon-site-fictif.fr',
			'St. Gervais',
			'Annecy & alentours',
			'Annecy + alentours',
			'Annecy !',
			'Où ça ?',
			'Annecy_Centre',
			'« Annecy »',
			'"Annecy"',
			'#Annecy',
			'Annecy*',
			'[Annecy]',
			'Annecy\u200b',
		]
		for (const nom of textes)
			expect(cityErrors({ name: nom, inseeCode: '74010' }), nom).toEqual({
				name: ZONE_MESSAGES.nomCaracteres,
			})
		expect(ZONE_MESSAGES.nomCaracteres).toBe(
			'Le nom d’une commune n’a que des lettres, des espaces, des traits d’union, des apostrophes et des parenthèses : choisis ta commune dans la liste.'
		)
	})

	test('les lettres de toutes les langues, leurs accents, le trait d’union, l’apostrophe et les parenthèses passent', () => {
		// Made-up names, one per kind of character the official list holds.
		for (const nom of [
			'Œuvre-sur-Mer',
			'Ÿonne',
			'L’Île-Fictive',
			"L'Île-Fictive",
			'Fictive (Ville)',
			'Haÿ ʻO Fictif',
			'Ville - Fictive',
		])
			expect(cityErrors({ name: nom, inseeCode: '74010' }), nom).toEqual({})
	})

	test('le nom n’est pas comparé à celui de son code : c’est le travail de la liste de l’espace et de l’import', () => {
		// A decision of ticket 041, written in the README: the server checks the form of the name only.
		expect(cityErrors({ name: 'Lyon', inseeCode: '74010' })).toEqual({})
	})
})

describe('les coordonnées de la commune sont celles de son centre, à environ 1 km près', () => {
	test('arrondies à deux décimales : aucune ne situe une adresse', () => {
		expect(COORDINATE_DECIMALS).toBe(2)
		expect(roundedCoordinate(48.85341234)).toBe(48.85)
		expect(roundedCoordinate(2.34881234)).toBe(2.35)
		expect(roundedCoordinate(45.8992)).toBe(45.9)
		expect(roundedCoordinate(-21.11551)).toBe(-21.12)
		expect(roundedCoordinate(-0.001)).toBe(0)
		expect(Object.is(roundedCoordinate(-0.001), -0)).toBe(false)
		expect(roundedCoordinate(6)).toBe(6)
	})

	test('ce qui n’est pas un nombre fini est laissé tel quel, pour que la vérification le refuse', () => {
		for (const valeur of [null, undefined, '45.8992', Number.NaN, Number.POSITIVE_INFINITY, true])
			expect(Object.is(roundedCoordinate(valeur), valeur), String(valeur)).toBe(true)
	})
})

describe('le rayon d’action', () => {
	test('de 0 à 200 km, en kilomètres entiers, ou vide', () => {
		expect(RADIUS_BOUNDS_KM).toEqual({ min: 0, max: 200 })
		for (const rayon of [0, 1, 30, 199, 200, null, undefined]) expect(radiusVerdict(rayon), String(rayon)).toBe(true)
	})

	test('hors bornes, décimal ou qui n’est pas un nombre : refusé en français', () => {
		expect(ZONE_MESSAGES.rayon).toBe('Le rayon d’action se donne en kilomètres entiers, de 0 à 200 km.')
		for (const rayon of [-1, 201, 400, 1000, 12.5, Number.NaN, Number.POSITIVE_INFINITY, '30', true])
			expect(radiusVerdict(rayon), String(rayon)).toBe(ZONE_MESSAGES.rayon)
	})
})

describe('la commune', () => {
	test('vide, ou avec son nom et son code INSEE : acceptée ; ses coordonnées sont facultatives', () => {
		expect(cityErrors(undefined)).toEqual({})
		expect(cityErrors(null)).toEqual({})
		expect(cityErrors({})).toEqual({})
		expect(cityErrors({ name: null, inseeCode: null, department: null, latitude: null, longitude: null })).toEqual({})
		expect(cityErrors(ANNECY)).toEqual({})
		expect(cityErrors({ name: 'Annecy', inseeCode: '74010' })).toEqual({})
		expect(cityErrors({ name: 'Saint-Remy-en-Bouzemont-Saint-Genest-et-Isson', inseeCode: '51513' })).toEqual({})
		expect(cityErrors({ name: 'Ajaccio', inseeCode: '2A004', latitude: 0, longitude: 0 })).toEqual({})
	})

	test('sans code INSEE : refusée en français, sur le code', () => {
		expect(cityErrors({ name: 'Annecy' })).toEqual({ inseeCode: ZONE_MESSAGES.communeSansCodeInsee })
		expect(cityErrors({ ...ANNECY, inseeCode: null })).toEqual({
			inseeCode: ZONE_MESSAGES.communeSansCodeInsee,
		})
		expect(cityErrors({ name: 'Annecy', inseeCode: '  ' })).toEqual({
			inseeCode: ZONE_MESSAGES.communeSansCodeInsee,
		})
		expect(ZONE_MESSAGES.communeSansCodeInsee).toBe(
			'Choisis ta commune dans la liste : sans son code INSEE, elle ne peut pas être enregistrée.'
		)
	})

	test('code INSEE mal formé : refusé en français', () => {
		for (const codeInsee of ['7401', '20004', 'ABCDE', '97001', 74010])
			expect(cityErrors({ name: 'Annecy', inseeCode: codeInsee }), String(codeInsee)).toEqual({
				inseeCode: ZONE_MESSAGES.codeInseeMalForme,
			})
		expect(ZONE_MESSAGES.codeInseeMalForme).toBe(
			'Le code INSEE de la commune est mal formé : 5 caractères, comme 74010 ou 2A004.'
		)
	})

	test('un code sans nom, un nom trop long ou qui n’est pas un texte : refusés sur le nom', () => {
		expect(cityErrors({ inseeCode: '74010' })).toEqual({ name: ZONE_MESSAGES.codeInseeSansNom })
		expect(cityErrors({ name: 'A'.repeat(71), inseeCode: '74010' })).toEqual({
			name: ZONE_MESSAGES.nomInvalide,
		})
		expect(cityErrors({ name: 'A'.repeat(70), inseeCode: '74010' })).toEqual({})
		expect(cityErrors({ name: 42, inseeCode: '74010' })).toEqual({ name: ZONE_MESSAGES.nomInvalide })
	})

	test('des coordonnées hors bornes, seules ou sans commune : refusées en français', () => {
		expect(cityErrors({ ...ANNECY, latitude: 91 })).toEqual({ latitude: ZONE_MESSAGES.latitude })
		expect(cityErrors({ ...ANNECY, longitude: -180.5 })).toEqual({ longitude: ZONE_MESSAGES.longitude })
		expect(cityErrors({ ...ANNECY, latitude: Number.NaN })).toEqual({ latitude: ZONE_MESSAGES.latitude })
		expect(cityErrors({ ...ANNECY, longitude: null })).toEqual({
			longitude: ZONE_MESSAGES.coordonneesIncompletes,
		})
		expect(cityErrors({ ...ANNECY, latitude: undefined })).toEqual({
			latitude: ZONE_MESSAGES.coordonneesIncompletes,
		})
		expect(cityErrors({ latitude: 45.9, longitude: 6.13 })).toEqual({
			latitude: ZONE_MESSAGES.coordonneesSansCommune,
		})
	})

	test('chaque message est en français, avec ses accents', () => {
		for (const message of Object.values(ZONE_MESSAGES)) {
			expect(message).toMatch(/^[A-ZÀ-Ý]/)
			expect(message).toEndWith('.')
			expect(message).not.toMatch(/\b(?:the|field|invalid|must|is)\b/i)
		}
	})
})

describe('les champs de la zone dans la collection des profils', () => {
	const champs = Profiles.fields.filter((champ): champ is Field & { name: string } => 'name' in champ)
	const champ = (nom: string) => champs.find(({ name }) => name === nom)

	test('commune, rayonKm et aDomicile, aux noms de SCHEMA.md, après la spécialité', () => {
		const noms = champs.map(({ name }) => name)
		expect(noms.slice(noms.indexOf('specialty'), noms.indexOf('specialty') + 4)).toEqual([
			'specialty',
			'city',
			'radiusKm',
			'homeService',
		])
		expect(champ('radiusKm')?.type).toBe('number')
		expect(champ('homeService')?.type).toBe('checkbox')
	})

	test('la commune n’a que ses cinq champs : aucune adresse postale', () => {
		const commune = champ('city')
		expect(commune?.type).toBe('group')
		const sousChamps = commune && 'fields' in commune ? commune.fields : []
		expect(sousChamps.map(sousChamp => ('name' in sousChamp ? sousChamp.name : sousChamp.type))).toEqual([
			...CITY_FIELDS,
		])
	})

	test('aucune règle d’accès propre : qui lit un profil lit toute sa zone, code INSEE et coordonnées compris', () => {
		// A decision of ticket 041: the INSEE code and the coordinates of the centre of a commune are
		// public reference data, not personal data, so the whole zone follows the reading of its
		// profile: an anonymous reader reads it with the published profiles (ticket 021).
		const commune = champ('city')
		const sousChamps = commune && 'fields' in commune ? commune.fields : []
		for (const zone of [commune, champ('radiusKm'), champ('homeService'), ...sousChamps]) {
			// Once the configuration is built (another test file may build it), Payload gives every
			// field an empty `access`: what matters is that no rule is in it.
			const acces = zone && 'access' in zone ? zone.access : undefined
			expect(acces ?? {}, 'name' in (zone ?? {}) ? String((zone as { name: string }).name) : '').toEqual({})
		}
	})
})
