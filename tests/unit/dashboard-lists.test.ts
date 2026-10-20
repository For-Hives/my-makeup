import { describe, expect, test } from 'bun:test'
import { COURSES } from '@/lib/dashboard/courses'
import { EXPERIENCES } from '@/lib/dashboard/experiences'
import {
	cleanRow,
	listSchema,
	OPTIONS_MAX,
	profileRows,
	ROWS_MAX,
	rankAfterRemoval,
	rowErrors,
	sameRow,
} from '@/lib/dashboard/list'
import { inputPrice, SERVICE_OFFER_OPTIONS, SERVICE_OFFERS } from '@/lib/dashboard/service-offers'

/**
 * The rules of the lists of her space (tickets 129 to 131; plan 02 U29, U30): what the form and the
 * server both read. The panels play them in tests/unit/dashboard-lists-panels.test.tsx, the server in
 * tests/integration/espace-listes.test.ts.
 */

const NOW = new Date('2026-10-15T10:00:00Z')

describe('129, U30 : une expérience', () => {
	const line = {
		jobTitle: 'Maquilleuse',
		company: 'Studio Fictif',
		city: '',
		startDate: '2020-03-01',
		endDate: '',
		description: '',
	}

	test('elle exige l’entreprise, le poste et le début, pas la ville ni la fin ni la description', () => {
		expect(rowErrors(EXPERIENCES, line, { avecRequis: true, maintenant: NOW })).toEqual({})
		expect(
			Object.keys(
				rowErrors(
					EXPERIENCES,
					{ ...line, jobTitle: '', company: '', startDate: '' },
					{ avecRequis: true, maintenant: NOW }
				)
			).sort()
		).toEqual(['company', 'jobTitle', 'startDate'])
		// A row that is not added or edited requires nothing: an imported row may have empty fields.
		expect(
			rowErrors(
				EXPERIENCES,
				{ ...line, jobTitle: '', company: '', startDate: '' },
				{ avecRequis: false, maintenant: NOW }
			)
		).toEqual({})
	})

	test('U30 : la fin avant le début est refusée, le même jour est accepté', () => {
		const refusal = rowErrors(EXPERIENCES, { ...line, endDate: '2020-02-28' }, { avecRequis: true, maintenant: NOW })
		expect(refusal.endDate).toBe('La fin d’une expérience ne peut pas précéder son début.')
		expect(rowErrors(EXPERIENCES, { ...line, endDate: '2020-03-01' }, { avecRequis: true, maintenant: NOW })).toEqual(
			{}
		)
	})

	test('une date qui n’existe pas est refusée, un texte trop long aussi', () => {
		expect(
			rowErrors(EXPERIENCES, { ...line, startDate: '2020-02-30' }, { avecRequis: true, maintenant: NOW }).startDate
		).toBe('Cette date n’est pas valide.')
		expect(
			rowErrors(EXPERIENCES, { ...line, jobTitle: 'a'.repeat(71) }, { avecRequis: true, maintenant: NOW }).jobTitle
		).toBe('Ce texte ne doit pas dépasser 70 caractères.')
	})

	test('une ligne stockée est lue avec des jours « AAAA-MM-JJ » et rendue avec des jours à midi', () => {
		const read = EXPERIENCES.depuisLeStockage({
			...line,
			id: 'x',
			startDate: '2020-03-01T12:00:00.000Z',
			endDate: null,
			city: null,
		})
		expect(read).toEqual(line)
		expect(EXPERIENCES.versLeStockage(line)).toEqual({
			jobTitle: 'Maquilleuse',
			company: 'Studio Fictif',
			city: null,
			startDate: '2020-03-01',
			endDate: null,
			description: null,
		})
	})

	test('son résumé dit le poste, l’entreprise et la période', () => {
		expect(EXPERIENCES.resume({ ...line, city: 'Lyon', endDate: '2022-03-01' })).toBe(
			'Maquilleuse - Studio Fictif - Lyon - mars 2020 - mars 2022'
		)
	})
})

describe('130, U30 : une formation', () => {
	const line = { diploma: 'CAP esthétique', school: 'École Fictive', graduatedAt: '2018-06-30', description: '' }

	test('elle exige le diplôme et l’école', () => {
		expect(
			Object.keys(
				rowErrors(COURSES, { ...line, diploma: '', school: '' }, { avecRequis: true, maintenant: NOW })
			).sort()
		).toEqual(['diploma', 'school'])
	})

	test('U30 : une date à plus d’un an est refusée, à un an pile elle est acceptée', () => {
		const refusal = rowErrors(COURSES, { ...line, graduatedAt: '2027-10-16' }, { avecRequis: true, maintenant: NOW })
		expect(refusal.graduatedAt).toBe('Une date d’obtention ne peut pas dépasser d’un an la date du jour.')
		expect(rowErrors(COURSES, { ...line, graduatedAt: '2027-10-15' }, { avecRequis: true, maintenant: NOW })).toEqual(
			{}
		)
	})

	test('une formation à venir et une formation sans date sont acceptées', () => {
		expect(rowErrors(COURSES, { ...line, graduatedAt: '2027-01-01' }, { avecRequis: true, maintenant: NOW })).toEqual(
			{}
		)
		expect(rowErrors(COURSES, { ...line, graduatedAt: '' }, { avecRequis: true, maintenant: NOW })).toEqual({})
	})
})

describe('131, U29 : une prestation', () => {
	const brute = (price: string) => ({ name: 'Mariée', description: '', price })
	const stored = (price: string) => SERVICE_OFFERS.versLeStockage(cleanRow(SERVICE_OFFERS, brute(price)))

	test('« 80 », « 80 € » et « à partir de 80 » donnent un prix de 80, le texte est gardé', () => {
		for (const input of ['80', '80 €', 'à partir de 80']) {
			expect(stored(input)).toMatchObject({ priceFrom: 80, priceText: input })
		}
	})

	test('« sur devis » garde son texte sans montant', () => {
		expect(stored('sur devis')).toMatchObject({ priceFrom: null, priceText: 'sur devis' })
	})

	test('un prix vide ne donne ni texte ni montant', () => {
		expect(stored('')).toMatchObject({ priceFrom: null, priceText: null })
	})

	test('plusieurs formules séparées par « ; » sont rangées une par ligne, et retapées avec « ; »', () => {
		expect(inputPrice('60 € ; sur devis ;')).toBe('60 €\nsur devis')
		expect(stored('60 € ; sur devis')).toMatchObject({ priceFrom: 60, priceText: '60 €\nsur devis' })
		expect(SERVICE_OFFERS.depuisLeStockage({ name: 'x', priceText: '60 €\nsur devis', priceFrom: 60 }).price).toBe(
			'60 € ; sur devis'
		)
	})

	test('un montant stocké sans texte (offre importée) se retape en montant', () => {
		expect(SERVICE_OFFERS.depuisLeStockage({ name: 'x', priceText: null, priceFrom: 80 }).price).toBe('80')
	})

	test('elle exige le nom seulement, et borne le nom, la description et le prix', () => {
		expect(
			rowErrors(SERVICE_OFFERS, { name: '', description: '', price: '' }, { avecRequis: true, maintenant: NOW })
		).toEqual({
			name: 'Le nom de la prestation est requis.',
		})
		expect(
			Object.keys(
				rowErrors(
					SERVICE_OFFERS,
					{ name: 'a'.repeat(71), description: 'b'.repeat(2001), price: 'c'.repeat(71) },
					{ avecRequis: true, maintenant: NOW }
				)
			).sort()
		).toEqual(['description', 'name', 'price'])
	})

	test('les options de la ligne stockée sont gardées, ce que le formulaire ne dit pas', () => {
		const options = [{ id: 'o1', name: 'Essai', priceText: '30', priceFrom: 30 }]
		expect(SERVICE_OFFERS.garder?.({ name: 'x', options })).toEqual({ options })
		expect(SERVICE_OFFERS.garder?.({ name: 'x' })).toEqual({ options: [] })
	})
})

describe('le schéma de la requête est strict', () => {
	const schema = listSchema(SERVICE_OFFERS)
	const values = { name: 'Mariée', description: '', price: '80' }

	test('des lignes avec leurs textes passent, avec ou sans identifiant', () => {
		expect(schema.safeParse({ lignes: [{ valeurs: values }, { id: 'abc', valeurs: values }] }).success).toBe(true)
	})

	test('un montant envoyé par la requête refuse la requête entière', () => {
		expect(schema.safeParse({ lignes: [{ valeurs: { ...values, priceFrom: '80' } }] }).success).toBe(false)
		expect(schema.safeParse({ lignes: [{ valeurs: { ...values, priceFrom: 80 } }] }).success).toBe(false)
	})

	test('une clé en trop, une valeur qui n’est pas un texte, trop de lignes : refusés', () => {
		expect(schema.safeParse({ lignes: [], profil: 3 }).success).toBe(false)
		expect(schema.safeParse({ lignes: [{ valeurs: { ...values, name: 3 } }] }).success).toBe(false)
		// Only an offer holds options: another section refuses the key.
		expect(listSchema(EXPERIENCES).safeParse({ lignes: [{ valeurs: {}, options: [] }] }).success).toBe(false)
		expect(
			schema.safeParse({ lignes: Array.from({ length: ROWS_MAX + 1 }, () => ({ valeurs: values })) }).success
		).toBe(false)
		expect(schema.safeParse({ lignes: [{ valeurs: { name: 'x' } }] }).success).toBe(false)
	})
})

describe('les aides de la liste', () => {
	test('deux lignes sont les mêmes quand leurs textes le sont, un jour écrit autrement est le même jour', () => {
		const a = { jobTitle: 'Maquilleuse', company: 'S', city: '', startDate: '2020-03-01', endDate: '', description: '' }
		expect(sameRow(EXPERIENCES, a, { ...a, jobTitle: ' Maquilleuse ', startDate: '2020-03-01T12:00:00.000Z' })).toBe(
			true
		)
		expect(sameRow(EXPERIENCES, a, { ...a, jobTitle: 'maquilleuse' })).toBe(false)
	})

	test('après un retrait, le focus va à la ligne qui prend la place, sinon à celle du dessus, sinon nulle part', () => {
		expect(rankAfterRemoval(2, 0)).toBe(0)
		expect(rankAfterRemoval(2, 2)).toBe(1)
		expect(rankAfterRemoval(0, 0)).toBeNull()
	})

	test('la page lit les lignes d’un profil avec leur identifiant, et ignore celles qui n’en ont pas', () => {
		const profile = {
			serviceOffers: [{ id: 'a', name: 'Mariée', priceText: '80', priceFrom: 80 }, { name: 'sans id' }, null],
		}
		expect(profileRows(SERVICE_OFFERS, profile)).toEqual([
			{ id: 'a', valeurs: { name: 'Mariée', description: '', price: '80' }, options: [] },
		])
		expect(profileRows(SERVICE_OFFERS, null)).toEqual([])
	})
})

describe('132 : les options d’une prestation', () => {
	const schema = listSchema(SERVICE_OFFERS)
	const values = { name: 'Mariée', description: '', price: '80' }
	const option = { name: 'Essai', description: '', price: '30' }

	test('la page lit les options d’une prestation avec leur identifiant, dans l’ordre', () => {
		const profile = {
			serviceOffers: [
				{
					id: 'a',
					name: 'Mariée',
					options: [
						{ id: 'o2', name: 'Cils', priceText: 'sur devis' },
						{ id: 'o1', name: 'Essai', priceText: '30', priceFrom: 30 },
						{ name: 'sans id' },
					],
				},
			],
		}
		expect(profileRows(SERVICE_OFFERS, profile)[0]?.options).toEqual([
			{ id: 'o2', valeurs: { name: 'Cils', description: '', price: 'sur devis' } },
			{ id: 'o1', valeurs: { name: 'Essai', description: '', price: '30' } },
		])
	})

	test('la requête peut porter les options, avec ou sans identifiant, et pas de montant', () => {
		expect(
			schema.safeParse({ lignes: [{ valeurs: values, options: [{ valeurs: option }, { id: 'o1', valeurs: option }] }] })
				.success
		).toBe(true)
		expect(
			schema.safeParse({ lignes: [{ valeurs: values, options: [{ valeurs: { ...option, priceFrom: 30 } }] }] }).success
		).toBe(false)
		expect(schema.safeParse({ lignes: [{ valeurs: values, options: [{ valeurs: option, profil: 1 }] }] }).success).toBe(
			false
		)
		expect(
			schema.safeParse({
				lignes: [{ valeurs: values, options: Array.from({ length: OPTIONS_MAX + 1 }, () => ({ valeurs: option })) }],
			}).success
		).toBe(false)
	})

	test('une option se lit comme une prestation : « 30 » est un montant, « sur devis » est gardé', () => {
		expect(SERVICE_OFFER_OPTIONS.versLeStockage(option)).toEqual({
			name: 'Essai',
			description: null,
			priceText: '30',
			priceFrom: 30,
		})
		expect(SERVICE_OFFER_OPTIONS.versLeStockage({ ...option, price: 'sur devis' })).toMatchObject({
			priceText: 'sur devis',
			priceFrom: null,
		})
		expect(SERVICE_OFFER_OPTIONS.requis.name).toBe('Le nom de l’option est requis.')
		expect(SERVICE_OFFER_OPTIONS.retrait('Essai')).toBe('Option Essai retirée')
	})
})
