import { describe, expect, test } from 'bun:test'
import { cartesDuProfil } from '@/lib/dashboard/cartes'
import {
	erreursParChamp,
	libelleDeLaCommune,
	MESSAGE_COMMUNE_A_CHOISIR,
	rayonDuTexte,
	schemaDeLaLocalisationStrict,
	schemaDuRayonSaisi,
} from '@/lib/dashboard/localisation'
import { echecDePayload } from '@/lib/dashboard/resultat'
import { MESSAGES_DE_LA_ZONE } from '@/lib/profil/zone'

/**
 * The rules of the location form (ticket 123; plan 02 U14, U15, U16): the label of a commune, the
 * radius, the strict schema of the server, and the card that shows what is stored.
 */

const VALIDE = { codeInsee: '74010', rayonKm: 30, aDomicile: true }

describe('U16 : une commune INSEE a son libellé « Annecy (74) »', () => {
	test('le nom et le département', () => {
		expect(libelleDeLaCommune({ nom: 'Annecy', departement: '74' })).toBe('Annecy (74)')
		expect(libelleDeLaCommune({ nom: 'Ajaccio', departement: '2A' })).toBe('Ajaccio (2A)')
		expect(libelleDeLaCommune({ nom: 'Papeete', departement: '987' })).toBe('Papeete (987)')
	})

	test('sans département le nom seul, sans nom rien : jamais « () », « null » ni « undefined »', () => {
		expect(libelleDeLaCommune({ nom: 'Annecy' })).toBe('Annecy')
		expect(libelleDeLaCommune({ nom: ' Annecy ', departement: null })).toBe('Annecy')
		expect(libelleDeLaCommune({ departement: '74' })).toBe('')
		expect(libelleDeLaCommune({})).toBe('')
		expect(libelleDeLaCommune({ nom: null, departement: undefined })).toBe('')
	})
})

describe('U14, U15 : la carte de la localisation ne dit jamais « & km »', () => {
	const carte = (profil: Parameters<typeof cartesDuProfil>[0]) => {
		const trouvee = cartesDuProfil(profil).find(c => c.section === 'localisation')
		if (!trouvee) throw new Error('pas de carte')
		return trouvee.lignes.map(l => l.valeur)
	}

	test('une commune, un rayon et « à domicile » enregistrés', () => {
		expect(carte({ id: 1, city: { name: 'Annecy', department: '74' }, radiusKm: 30, homeService: true })).toEqual([
			'Annecy (74)',
			'30 km',
			'Oui',
		])
	})

	test('un rayon de 0 ou absent n’écrit pas de kilomètres', () => {
		for (const rayonKm of [0, null, undefined]) {
			const valeurs = carte({
				id: 1,
				city: { name: 'Annecy', department: '74' },
				radiusKm: rayonKm,
				homeService: false,
			})
			expect(valeurs).toEqual(['Annecy (74)', null, 'Non'])
			expect(valeurs.join(' ')).not.toMatch(/&|null km|undefined|NaN/)
		}
	})

	test('un rayon seul, sans commune, ne dit rien', () => {
		expect(carte({ id: 1, radiusKm: 40, homeService: true })).toEqual([null, '40 km', null])
	})
})

describe('le rayon saisi : des kilomètres entiers, de 0 à 200', () => {
	test.each(['', '   ', '0', '1', '30', '200', ' 45 ', '007'])('« %s » passe', texte => {
		expect(schemaDuRayonSaisi.safeParse(texte).success).toBe(true)
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
		const lu = schemaDuRayonSaisi.safeParse(texte)
		expect(lu.success).toBe(false)
		expect(lu.error?.issues[0]?.message).toBe(MESSAGES_DE_LA_ZONE.rayon)
	})

	test('le rayon saisi devient des kilomètres, ou rien quand le champ est vide', () => {
		expect(rayonDuTexte(' 30 ')).toBe(30)
		expect(rayonDuTexte('0')).toBe(0)
		expect(rayonDuTexte('')).toBeNull()
		expect(rayonDuTexte('  ')).toBeNull()
	})
})

describe('le schéma du serveur est strict', () => {
	test('un code, un rayon et « à domicile » passent ; le code est mis en forme', () => {
		expect(schemaDeLaLocalisationStrict.parse(VALIDE)).toEqual(VALIDE)
		expect(schemaDeLaLocalisationStrict.parse({ ...VALIDE, codeInsee: ' 2a004 ', rayonKm: null }).codeInsee).toBe(
			'2A004'
		)
		expect(schemaDeLaLocalisationStrict.parse({ ...VALIDE, rayonKm: 0 }).rayonKm).toBe(0)
		expect(schemaDeLaLocalisationStrict.parse({ ...VALIDE, codeInsee: '97411' }).codeInsee).toBe('97411')
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
		const lu = schemaDeLaLocalisationStrict.safeParse({ ...VALIDE, rayonKm })
		if (lu.success) throw new Error('doit être refusé')
		expect(erreursParChamp(lu.error)).toEqual({ rayonKm: MESSAGES_DE_LA_ZONE.rayon })
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
		const lu = schemaDeLaLocalisationStrict.safeParse({ ...VALIDE, codeInsee })
		if (lu.success) throw new Error('doit être refusé')
		expect(erreursParChamp(lu.error)).toEqual({ codeInsee: MESSAGE_COMMUNE_A_CHOISIR })
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
	])('la clé %s refuse la requête entière', cle => {
		expect(schemaDeLaLocalisationStrict.safeParse({ ...VALIDE, [cle]: 'x' }).success).toBe(false)
	})

	test('« à domicile » est un oui ou un non', () => {
		for (const aDomicile of ['oui', 1, null, undefined]) {
			expect(schemaDeLaLocalisationStrict.safeParse({ ...VALIDE, aDomicile }).success).toBe(false)
		}
	})
})

describe('l’échec de Payload sur la commune se dit sous le champ de la commune', () => {
	test('un chemin commune.* devient le champ codeInsee', () => {
		const erreur = {
			data: { errors: [{ path: 'commune.nom', message: MESSAGES_DE_LA_ZONE.nomAdresse }] },
		}
		const echec = echecDePayload(erreur, ['codeInsee', 'rayonKm', 'aDomicile'], chemin =>
			chemin.startsWith('commune') ? 'codeInsee' : chemin
		)
		expect(echec.champs).toEqual({ codeInsee: MESSAGES_DE_LA_ZONE.nomAdresse })
	})
})
