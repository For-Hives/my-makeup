import { describe, expect, test } from 'bun:test'
import { profileCards } from '@/lib/dashboard/cards'
import {
	CITY_TO_CHOOSE_MESSAGE,
	cityLabel,
	enteredRadiusSchema,
	errorsByField,
	strictLocationSchema,
	textRadius,
} from '@/lib/dashboard/location'
import { payloadFailure } from '@/lib/dashboard/result'
import { ABROAD_MESSAGES, ZONE_MESSAGES } from '@/lib/profile/zone'

/**
 * The rules of the location form (ticket 123; plan 02 U14, U15, U16): the label of a commune, the
 * radius, the strict schema of the server, and the card that shows what is stored.
 */

const VALID = { codeInsee: '74010', rayonKm: 30, aDomicile: true }

describe('U16 : une commune INSEE a son libellé « Annecy (74) »', () => {
	test('le nom et le département', () => {
		expect(cityLabel({ nom: 'Annecy', departement: '74' })).toBe('Annecy (74)')
		expect(cityLabel({ nom: 'Ajaccio', departement: '2A' })).toBe('Ajaccio (2A)')
		expect(cityLabel({ nom: 'Papeete', departement: '987' })).toBe('Papeete (987)')
	})

	test('sans département le nom seul, sans nom rien : jamais « () », « null » ni « undefined »', () => {
		expect(cityLabel({ nom: 'Annecy' })).toBe('Annecy')
		expect(cityLabel({ nom: ' Annecy ', departement: null })).toBe('Annecy')
		expect(cityLabel({ departement: '74' })).toBe('')
		expect(cityLabel({})).toBe('')
		expect(cityLabel({ nom: null, departement: undefined })).toBe('')
	})
})

describe('U14, U15 : la carte de la localisation ne dit jamais « & km »', () => {
	const card = (profil: Parameters<typeof profileCards>[0]) => {
		const found = profileCards(profil).find(c => c.section === 'localisation')
		if (!found) throw new Error('pas de carte')
		return found.lignes.map(l => l.valeur)
	}

	test('une commune, un rayon et « à domicile » enregistrés', () => {
		expect(card({ id: 1, city: { name: 'Annecy', department: '74' }, radiusKm: 30, homeService: true })).toEqual([
			'Annecy (74)',
			'30 km',
			'Oui',
		])
	})

	test('un rayon de 0 ou absent n’écrit pas de kilomètres', () => {
		for (const radiusKm of [0, null, undefined]) {
			const values = card({
				id: 1,
				city: { name: 'Annecy', department: '74' },
				radiusKm: radiusKm,
				homeService: false,
			})
			expect(values).toEqual(['Annecy (74)', null, 'Non'])
			expect(values.join(' ')).not.toMatch(/&|null km|undefined|NaN/)
		}
	})

	test('un rayon seul, sans commune, ne dit rien', () => {
		expect(card({ id: 1, radiusKm: 40, homeService: true })).toEqual([null, '40 km', null])
	})
})

describe('le rayon saisi : des kilomètres entiers, de 0 à 200', () => {
	test.each(['', '   ', '0', '1', '30', '200', ' 45 ', '007'])('« %s » passe', texte => {
		expect(enteredRadiusSchema.safeParse(texte).success).toBe(true)
	})

	test.each([
		'201',
		'250',
		'1000',
		'-1',
		'12,5',
		'12.5',
		'abc',
		'1e2',
		'&',
		'30 km',
		'0x10',
	])('« %s » est refusé', texte => {
		const wasRead = enteredRadiusSchema.safeParse(texte)
		expect(wasRead.success).toBe(false)
		expect(wasRead.error?.issues[0]?.message).toBe(ZONE_MESSAGES.rayon)
	})

	test('le rayon saisi devient des kilomètres, ou rien quand le champ est vide', () => {
		expect(textRadius(' 30 ')).toBe(30)
		expect(textRadius('0')).toBe(0)
		expect(textRadius('')).toBeNull()
		expect(textRadius('  ')).toBeNull()
	})
})

describe('le schéma du serveur est strict', () => {
	test('un code, un rayon et « à domicile » passent ; le code est mis en forme', () => {
		expect(strictLocationSchema.parse(VALID)).toEqual(VALID)
		expect(strictLocationSchema.parse({ ...VALID, codeInsee: ' 2a004 ', rayonKm: null })).toMatchObject({
			codeInsee: '2A004',
		})
		expect(strictLocationSchema.parse({ ...VALID, rayonKm: 0 }).rayonKm).toBe(0)
		expect(strictLocationSchema.parse({ ...VALID, codeInsee: '97411' })).toMatchObject({ codeInsee: '97411' })
	})

	test.each([
		-1,
		201,
		12.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		'30',
		undefined,
		{},
	])('le rayon %p est refusé avec le message de la zone', rayonKm => {
		const wasRead = strictLocationSchema.safeParse({ ...VALID, rayonKm })
		if (wasRead.success) throw new Error('doit être refusé')
		expect(errorsByField(wasRead.error)).toEqual({ rayonKm: ZONE_MESSAGES.rayon })
	})

	test.each([
		'Annecy',
		'rue des Lilas',
		'12 rue des Lilas, 74000 Annecy',
		'7401',
		'20004',
		'',
		'74010; DROP',
		42,
		null,
		undefined,
		{ code: '74010' },
	])('le texte %p n’est pas une commune : refusé, côté serveur aussi', codeInsee => {
		const wasRead = strictLocationSchema.safeParse({ ...VALID, codeInsee })
		if (wasRead.success) throw new Error('doit être refusé')
		expect(errorsByField(wasRead.error)).toEqual({ codeInsee: CITY_TO_CHOOSE_MESSAGE })
	})

	test.each([
		'nom',
		'commune',
		'latitude',
		'longitude',
		'departement',
		'adresse',
		'statut',
		'verifie',
		'pro',
		'slug',
		'id',
		// Ticket 265: the postal codes are the list's, never a request's; the review is the import's.
		'postalCodes',
		'codesPostaux',
		'codePostal',
		'zoneReview',
		'zoneKind',
		'candidates',
	])('la clé %s refuse la requête entière', cle => {
		expect(strictLocationSchema.safeParse({ ...VALID, [cle]: 'x' }).success).toBe(false)
	})

	test('« à domicile » est un oui ou un non', () => {
		for (const toHome of ['oui', 1, null, undefined]) {
			expect(strictLocationSchema.safeParse({ ...VALID, aDomicile: toHome }).success).toBe(false)
		}
	})
})

describe('266 : la zone est une commune ou des pays, jamais un mélange', () => {
	const COUNTRIES = { kind: 'countries' as const, countries: ['BE'], town: 'Bruxelles', rayonKm: 30, aDomicile: true }
	const refused = (saisie: unknown) => {
		const wasRead = strictLocationSchema.safeParse(saisie)
		if (wasRead.success) throw new Error('doit être refusé')
		return errorsByField(wasRead.error)
	}

	test('sans « kind », c’est une commune ; « city » aussi', () => {
		expect(strictLocationSchema.parse(VALID)).toEqual(VALID)
		expect(strictLocationSchema.parse({ ...VALID, kind: 'city' })).toEqual({ ...VALID, kind: 'city' })
	})

	test('des pays, une ville, un rayon et « à domicile » passent ; les codes sont mis en capitales, dans l’ordre', () => {
		expect(strictLocationSchema.parse(COUNTRIES)).toEqual(COUNTRIES)
		expect(
			strictLocationSchema.parse({ ...COUNTRIES, countries: [' it', 'fr'], town: null, rayonKm: null })
		).toMatchObject({ countries: ['IT', 'FR'], town: null })
		expect(strictLocationSchema.parse({ ...COUNTRIES, town: '  ' })).toMatchObject({ town: null })
	})

	test('[FR] seul : « Choisis au moins un pays étranger… »', () => {
		expect(refused({ ...COUNTRIES, countries: ['FR'], town: null })).toEqual({
			countries: 'Choisis au moins un pays étranger : pour la France, écris ta commune.',
		})
	})

	test('aucun pays : le même message', () => {
		expect(refused({ ...COUNTRIES, countries: [], town: null })).toEqual({
			countries: ABROAD_MESSAGES.countriesFranceOnly,
		})
	})

	test('six pays : « 5 pays au plus. »', () => {
		expect(refused({ ...COUNTRIES, countries: ['BE', 'IT', 'ES', 'DE', 'CH', 'LU'], town: null })).toEqual({
			countries: '5 pays au plus.',
		})
	})

	test('un code inconnu, un pays deux fois, une liste qui n’en est pas une', () => {
		expect(refused({ ...COUNTRIES, countries: ['ZZ'], town: null })).toEqual({
			countries: ABROAD_MESSAGES.countriesUnknown,
		})
		expect(refused({ ...COUNTRIES, countries: ['BE', 'be'], town: null })).toEqual({
			countries: ABROAD_MESSAGES.countriesDuplicate,
		})
		expect(refused({ ...COUNTRIES, countries: 'BE' })).toMatchObject({ countries: ABROAD_MESSAGES.countriesNotAList })
	})

	test('une ville qui est une adresse : le message d’adresse', () => {
		expect(refused({ ...COUNTRIES, town: '12 rue des Lilas' })).toEqual({
			town: 'Écris le nom de ta ville, pas ton adresse : elle ne s’enregistre jamais.',
		})
		expect(refused({ ...COUNTRIES, town: 'Rue des Lilas' })).toEqual({ town: ABROAD_MESSAGES.townAddress })
	})

	test('une ville avec plusieurs pays : refusée', () => {
		expect(refused({ ...COUNTRIES, countries: ['BE', 'IT'] })).toEqual({ town: ABROAD_MESSAGES.townSeveralCountries })
	})

	test('le rayon et « à domicile » se lisent comme pour une commune', () => {
		expect(refused({ ...COUNTRIES, rayonKm: 201 })).toEqual({ rayonKm: ZONE_MESSAGES.rayon })
		expect(refused({ ...COUNTRIES, aDomicile: 'oui' })).toHaveProperty('aDomicile')
	})

	test('une requête qui mêle un code INSEE et des pays est refusée entière, dans les deux sens', () => {
		expect(strictLocationSchema.safeParse({ ...COUNTRIES, codeInsee: '74010' }).success).toBe(false)
		expect(strictLocationSchema.safeParse({ ...VALID, countries: ['BE'] }).success).toBe(false)
		expect(strictLocationSchema.safeParse({ ...VALID, kind: 'city', town: 'Bruxelles' }).success).toBe(false)
	})

	test.each([
		'postalCodes',
		'zoneKind',
		'zoneReview',
		'city',
		'slug',
		'pro',
		'id',
		'nom',
	])('la clé réservée %s refuse la requête de pays entière', cle => {
		expect(strictLocationSchema.safeParse({ ...COUNTRIES, [cle]: 'x' }).success).toBe(false)
	})

	test.each(['pays', 'Countries', '', null, 42])('un « kind » %p n’est ni une commune ni des pays : refusé', kind => {
		expect(strictLocationSchema.safeParse({ ...VALID, kind }).success).toBe(false)
	})

	test('une requête qui n’est pas un objet est refusée', () => {
		for (const input of [null, 'BE', 42, ['BE']]) expect(strictLocationSchema.safeParse(input).success).toBe(false)
	})
})

describe('l’échec de Payload sur la commune se dit sous le champ de la commune', () => {
	test('un chemin commune.* devient le champ codeInsee', () => {
		const error = {
			data: { errors: [{ path: 'commune.nom', message: ZONE_MESSAGES.nomAdresse }] },
		}
		const failure = payloadFailure(error, ['codeInsee', 'rayonKm', 'aDomicile'], chemin =>
			chemin.startsWith('commune') ? 'codeInsee' : chemin
		)
		expect(failure.champs).toEqual({ codeInsee: ZONE_MESSAGES.nomAdresse })
	})
})
