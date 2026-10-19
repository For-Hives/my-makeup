import { describe, expect, test } from 'bun:test'
import { EXPERIENCES } from '@/lib/espace/experiences'
import { FORMATIONS } from '@/lib/espace/formations'
import {
	erreursDeLaLigne,
	LIGNES_MAX,
	lignesDuProfil,
	memeLigne,
	nettoyerLaLigne,
	OPTIONS_MAX,
	rangApresRetrait,
	schemaDeLaListe,
} from '@/lib/espace/liste'
import { OPTIONS_DE_PRESTATION, PRESTATIONS, prixDeLaSaisie } from '@/lib/espace/prestations'

/**
 * The rules of the lists of her space (tickets 129 to 131; plan 02 U29, U30): what the form and the
 * server both read. The panels play them in tests/unit/espace-listes-panneaux.test.tsx, the server in
 * tests/integration/espace-listes.test.ts.
 */

const MAINTENANT = new Date('2026-10-15T10:00:00Z')

describe('129, U30 : une expérience', () => {
	const ligne = {
		jobTitle: 'Maquilleuse',
		company: 'Studio Fictif',
		city: '',
		startDate: '2020-03-01',
		endDate: '',
		description: '',
	}

	test('elle exige l’entreprise, le poste et le début, pas la ville ni la fin ni la description', () => {
		expect(erreursDeLaLigne(EXPERIENCES, ligne, { avecRequis: true, maintenant: MAINTENANT })).toEqual({})
		expect(
			Object.keys(
				erreursDeLaLigne(
					EXPERIENCES,
					{ ...ligne, jobTitle: '', company: '', startDate: '' },
					{ avecRequis: true, maintenant: MAINTENANT }
				)
			).sort()
		).toEqual(['company', 'jobTitle', 'startDate'])
		// A row that is not added or edited requires nothing: an imported row may have empty fields.
		expect(
			erreursDeLaLigne(
				EXPERIENCES,
				{ ...ligne, jobTitle: '', company: '', startDate: '' },
				{ avecRequis: false, maintenant: MAINTENANT }
			)
		).toEqual({})
	})

	test('U30 : la fin avant le début est refusée, le même jour est accepté', () => {
		const refus = erreursDeLaLigne(
			EXPERIENCES,
			{ ...ligne, endDate: '2020-02-28' },
			{ avecRequis: true, maintenant: MAINTENANT }
		)
		expect(refus.endDate).toBe('La fin d’une expérience ne peut pas précéder son début.')
		expect(
			erreursDeLaLigne(EXPERIENCES, { ...ligne, endDate: '2020-03-01' }, { avecRequis: true, maintenant: MAINTENANT })
		).toEqual({})
	})

	test('une date qui n’existe pas est refusée, un texte trop long aussi', () => {
		expect(
			erreursDeLaLigne(EXPERIENCES, { ...ligne, startDate: '2020-02-30' }, { avecRequis: true, maintenant: MAINTENANT })
				.startDate
		).toBe('Cette date n’est pas valide.')
		expect(
			erreursDeLaLigne(
				EXPERIENCES,
				{ ...ligne, jobTitle: 'a'.repeat(71) },
				{ avecRequis: true, maintenant: MAINTENANT }
			).jobTitle
		).toBe('Ce texte ne doit pas dépasser 70 caractères.')
	})

	test('une ligne stockée est lue avec des jours « AAAA-MM-JJ » et rendue avec des jours à midi', () => {
		const lue = EXPERIENCES.depuisLeStockage({
			...ligne,
			id: 'x',
			startDate: '2020-03-01T12:00:00.000Z',
			endDate: null,
			city: null,
		})
		expect(lue).toEqual(ligne)
		expect(EXPERIENCES.versLeStockage(ligne)).toEqual({
			jobTitle: 'Maquilleuse',
			company: 'Studio Fictif',
			city: null,
			startDate: '2020-03-01',
			endDate: null,
			description: null,
		})
	})

	test('son résumé dit le poste, l’entreprise et la période', () => {
		expect(EXPERIENCES.resume({ ...ligne, city: 'Lyon', endDate: '2022-03-01' })).toBe(
			'Maquilleuse - Studio Fictif - Lyon - mars 2020 - mars 2022'
		)
	})
})

describe('130, U30 : une formation', () => {
	const ligne = { diploma: 'CAP esthétique', school: 'École Fictive', graduatedAt: '2018-06-30', description: '' }

	test('elle exige le diplôme et l’école', () => {
		expect(
			Object.keys(
				erreursDeLaLigne(
					FORMATIONS,
					{ ...ligne, diploma: '', school: '' },
					{ avecRequis: true, maintenant: MAINTENANT }
				)
			).sort()
		).toEqual(['diploma', 'school'])
	})

	test('U30 : une date à plus d’un an est refusée, à un an pile elle est acceptée', () => {
		const refus = erreursDeLaLigne(
			FORMATIONS,
			{ ...ligne, graduatedAt: '2027-10-16' },
			{ avecRequis: true, maintenant: MAINTENANT }
		)
		expect(refus.graduatedAt).toBe('Une date d’obtention ne peut pas dépasser d’un an la date du jour.')
		expect(
			erreursDeLaLigne(
				FORMATIONS,
				{ ...ligne, graduatedAt: '2027-10-15' },
				{ avecRequis: true, maintenant: MAINTENANT }
			)
		).toEqual({})
	})

	test('une formation à venir et une formation sans date sont acceptées', () => {
		expect(
			erreursDeLaLigne(
				FORMATIONS,
				{ ...ligne, graduatedAt: '2027-01-01' },
				{ avecRequis: true, maintenant: MAINTENANT }
			)
		).toEqual({})
		expect(
			erreursDeLaLigne(FORMATIONS, { ...ligne, graduatedAt: '' }, { avecRequis: true, maintenant: MAINTENANT })
		).toEqual({})
	})
})

describe('131, U29 : une prestation', () => {
	const brute = (price: string) => ({ name: 'Mariée', description: '', price })
	const stockee = (price: string) => PRESTATIONS.versLeStockage(nettoyerLaLigne(PRESTATIONS, brute(price)))

	test('« 80 », « 80 € » et « à partir de 80 » donnent un prix de 80, le texte est gardé', () => {
		for (const saisie of ['80', '80 €', 'à partir de 80']) {
			expect(stockee(saisie)).toMatchObject({ priceFrom: 80, priceText: saisie })
		}
	})

	test('« sur devis » garde son texte sans montant', () => {
		expect(stockee('sur devis')).toMatchObject({ priceFrom: null, priceText: 'sur devis' })
	})

	test('un prix vide ne donne ni texte ni montant', () => {
		expect(stockee('')).toMatchObject({ priceFrom: null, priceText: null })
	})

	test('plusieurs formules séparées par « ; » sont rangées une par ligne, et retapées avec « ; »', () => {
		expect(prixDeLaSaisie('60 € ; sur devis ;')).toBe('60 €\nsur devis')
		expect(stockee('60 € ; sur devis')).toMatchObject({ priceFrom: 60, priceText: '60 €\nsur devis' })
		expect(PRESTATIONS.depuisLeStockage({ name: 'x', priceText: '60 €\nsur devis', priceFrom: 60 }).price).toBe(
			'60 € ; sur devis'
		)
	})

	test('un montant stocké sans texte (offre importée) se retape en montant', () => {
		expect(PRESTATIONS.depuisLeStockage({ name: 'x', priceText: null, priceFrom: 80 }).price).toBe('80')
	})

	test('elle exige le nom seulement, et borne le nom, la description et le prix', () => {
		expect(
			erreursDeLaLigne(
				PRESTATIONS,
				{ name: '', description: '', price: '' },
				{ avecRequis: true, maintenant: MAINTENANT }
			)
		).toEqual({
			name: 'Le nom de la prestation est requis.',
		})
		expect(
			Object.keys(
				erreursDeLaLigne(
					PRESTATIONS,
					{ name: 'a'.repeat(71), description: 'b'.repeat(2001), price: 'c'.repeat(71) },
					{ avecRequis: true, maintenant: MAINTENANT }
				)
			).sort()
		).toEqual(['description', 'name', 'price'])
	})

	test('les options de la ligne stockée sont gardées, ce que le formulaire ne dit pas', () => {
		const options = [{ id: 'o1', name: 'Essai', priceText: '30', priceFrom: 30 }]
		expect(PRESTATIONS.garder?.({ name: 'x', options })).toEqual({ options })
		expect(PRESTATIONS.garder?.({ name: 'x' })).toEqual({ options: [] })
	})
})

describe('le schéma de la requête est strict', () => {
	const schema = schemaDeLaListe(PRESTATIONS)
	const valeurs = { name: 'Mariée', description: '', price: '80' }

	test('des lignes avec leurs textes passent, avec ou sans identifiant', () => {
		expect(schema.safeParse({ lignes: [{ valeurs }, { id: 'abc', valeurs }] }).success).toBe(true)
	})

	test('un montant envoyé par la requête refuse la requête entière', () => {
		expect(schema.safeParse({ lignes: [{ valeurs: { ...valeurs, priceFrom: '80' } }] }).success).toBe(false)
		expect(schema.safeParse({ lignes: [{ valeurs: { ...valeurs, priceFrom: 80 } }] }).success).toBe(false)
	})

	test('une clé en trop, une valeur qui n’est pas un texte, trop de lignes : refusés', () => {
		expect(schema.safeParse({ lignes: [], profil: 3 }).success).toBe(false)
		expect(schema.safeParse({ lignes: [{ valeurs: { ...valeurs, name: 3 } }] }).success).toBe(false)
		// Only an offer holds options: another section refuses the key.
		expect(schemaDeLaListe(EXPERIENCES).safeParse({ lignes: [{ valeurs: {}, options: [] }] }).success).toBe(false)
		expect(schema.safeParse({ lignes: Array.from({ length: LIGNES_MAX + 1 }, () => ({ valeurs })) }).success).toBe(
			false
		)
		expect(schema.safeParse({ lignes: [{ valeurs: { name: 'x' } }] }).success).toBe(false)
	})
})

describe('les aides de la liste', () => {
	test('deux lignes sont les mêmes quand leurs textes le sont, un jour écrit autrement est le même jour', () => {
		const a = { jobTitle: 'Maquilleuse', company: 'S', city: '', startDate: '2020-03-01', endDate: '', description: '' }
		expect(memeLigne(EXPERIENCES, a, { ...a, jobTitle: ' Maquilleuse ', startDate: '2020-03-01T12:00:00.000Z' })).toBe(
			true
		)
		expect(memeLigne(EXPERIENCES, a, { ...a, jobTitle: 'maquilleuse' })).toBe(false)
	})

	test('après un retrait, le focus va à la ligne qui prend la place, sinon à celle du dessus, sinon nulle part', () => {
		expect(rangApresRetrait(2, 0)).toBe(0)
		expect(rangApresRetrait(2, 2)).toBe(1)
		expect(rangApresRetrait(0, 0)).toBeNull()
	})

	test('la page lit les lignes d’un profil avec leur identifiant, et ignore celles qui n’en ont pas', () => {
		const profil = {
			serviceOffers: [{ id: 'a', name: 'Mariée', priceText: '80', priceFrom: 80 }, { name: 'sans id' }, null],
		}
		expect(lignesDuProfil(PRESTATIONS, profil)).toEqual([
			{ id: 'a', valeurs: { name: 'Mariée', description: '', price: '80' }, options: [] },
		])
		expect(lignesDuProfil(PRESTATIONS, null)).toEqual([])
	})
})

describe('132 : les options d’une prestation', () => {
	const schema = schemaDeLaListe(PRESTATIONS)
	const valeurs = { name: 'Mariée', description: '', price: '80' }
	const option = { name: 'Essai', description: '', price: '30' }

	test('la page lit les options d’une prestation avec leur identifiant, dans l’ordre', () => {
		const profil = {
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
		expect(lignesDuProfil(PRESTATIONS, profil)[0]?.options).toEqual([
			{ id: 'o2', valeurs: { name: 'Cils', description: '', price: 'sur devis' } },
			{ id: 'o1', valeurs: { name: 'Essai', description: '', price: '30' } },
		])
	})

	test('la requête peut porter les options, avec ou sans identifiant, et pas de montant', () => {
		expect(
			schema.safeParse({ lignes: [{ valeurs, options: [{ valeurs: option }, { id: 'o1', valeurs: option }] }] }).success
		).toBe(true)
		expect(
			schema.safeParse({ lignes: [{ valeurs, options: [{ valeurs: { ...option, priceFrom: 30 } }] }] }).success
		).toBe(false)
		expect(schema.safeParse({ lignes: [{ valeurs, options: [{ valeurs: option, profil: 1 }] }] }).success).toBe(false)
		expect(
			schema.safeParse({
				lignes: [{ valeurs, options: Array.from({ length: OPTIONS_MAX + 1 }, () => ({ valeurs: option })) }],
			}).success
		).toBe(false)
	})

	test('une option se lit comme une prestation : « 30 » est un montant, « sur devis » est gardé', () => {
		expect(OPTIONS_DE_PRESTATION.versLeStockage(option)).toEqual({
			name: 'Essai',
			description: null,
			priceText: '30',
			priceFrom: 30,
		})
		expect(OPTIONS_DE_PRESTATION.versLeStockage({ ...option, price: 'sur devis' })).toMatchObject({
			priceText: 'sur devis',
			priceFrom: null,
		})
		expect(OPTIONS_DE_PRESTATION.requis.name).toBe('Le nom de l’option est requis.')
		expect(OPTIONS_DE_PRESTATION.retrait('Essai')).toBe('Option Essai retirée')
	})
})
