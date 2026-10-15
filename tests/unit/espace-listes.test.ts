import { describe, expect, test } from 'bun:test'
import { EXPERIENCES } from '@/lib/espace/experiences'
import { FORMATIONS } from '@/lib/espace/formations'
import {
	erreursDeLaLigne,
	LIGNES_MAX,
	lignesDuProfil,
	memeLigne,
	nettoyerLaLigne,
	rangApresRetrait,
	schemaDeLaListe,
} from '@/lib/espace/liste'
import { PRESTATIONS, prixDeLaSaisie } from '@/lib/espace/prestations'

/**
 * The rules of the lists of her space (tickets 129 to 131; plan 02 U29, U30): what the form and the
 * server both read. The panels play them in tests/unit/espace-listes-panneaux.test.tsx, the server in
 * tests/integration/espace-listes.test.ts.
 */

const MAINTENANT = new Date('2026-10-15T10:00:00Z')

describe('129, U30 : une expérience', () => {
	const ligne = {
		poste: 'Maquilleuse',
		entreprise: 'Studio Fictif',
		ville: '',
		debut: '2020-03-01',
		fin: '',
		description: '',
	}

	test('elle exige l’entreprise, le poste et le début, pas la ville ni la fin ni la description', () => {
		expect(erreursDeLaLigne(EXPERIENCES, ligne, { avecRequis: true, maintenant: MAINTENANT })).toEqual({})
		expect(
			Object.keys(
				erreursDeLaLigne(
					EXPERIENCES,
					{ ...ligne, poste: '', entreprise: '', debut: '' },
					{ avecRequis: true, maintenant: MAINTENANT }
				)
			).sort()
		).toEqual(['debut', 'entreprise', 'poste'])
		// A row that is not added or edited requires nothing: an imported row may have empty fields.
		expect(
			erreursDeLaLigne(
				EXPERIENCES,
				{ ...ligne, poste: '', entreprise: '', debut: '' },
				{ avecRequis: false, maintenant: MAINTENANT }
			)
		).toEqual({})
	})

	test('U30 : la fin avant le début est refusée, le même jour est accepté', () => {
		const refus = erreursDeLaLigne(
			EXPERIENCES,
			{ ...ligne, fin: '2020-02-28' },
			{ avecRequis: true, maintenant: MAINTENANT }
		)
		expect(refus.fin).toBe('La fin d’une expérience ne peut pas précéder son début.')
		expect(
			erreursDeLaLigne(EXPERIENCES, { ...ligne, fin: '2020-03-01' }, { avecRequis: true, maintenant: MAINTENANT })
		).toEqual({})
	})

	test('une date qui n’existe pas est refusée, un texte trop long aussi', () => {
		expect(
			erreursDeLaLigne(EXPERIENCES, { ...ligne, debut: '2020-02-30' }, { avecRequis: true, maintenant: MAINTENANT })
				.debut
		).toBe('Cette date n’est pas valide.')
		expect(
			erreursDeLaLigne(EXPERIENCES, { ...ligne, poste: 'a'.repeat(71) }, { avecRequis: true, maintenant: MAINTENANT })
				.poste
		).toBe('Ce texte ne doit pas dépasser 70 caractères.')
	})

	test('une ligne stockée est lue avec des jours « AAAA-MM-JJ » et rendue avec des jours à midi', () => {
		const lue = EXPERIENCES.depuisLeStockage({
			...ligne,
			id: 'x',
			debut: '2020-03-01T12:00:00.000Z',
			fin: null,
			ville: null,
		})
		expect(lue).toEqual(ligne)
		expect(EXPERIENCES.versLeStockage(ligne)).toEqual({
			poste: 'Maquilleuse',
			entreprise: 'Studio Fictif',
			ville: null,
			debut: '2020-03-01',
			fin: null,
			description: null,
		})
	})

	test('son résumé dit le poste, l’entreprise et la période', () => {
		expect(EXPERIENCES.resume({ ...ligne, ville: 'Lyon', fin: '2022-03-01' })).toBe(
			'Maquilleuse - Studio Fictif - Lyon - mars 2020 - mars 2022'
		)
	})
})

describe('130, U30 : une formation', () => {
	const ligne = { diplome: 'CAP esthétique', ecole: 'École Fictive', obtenuLe: '2018-06-30', description: '' }

	test('elle exige le diplôme et l’école', () => {
		expect(
			Object.keys(
				erreursDeLaLigne(FORMATIONS, { ...ligne, diplome: '', ecole: '' }, { avecRequis: true, maintenant: MAINTENANT })
			).sort()
		).toEqual(['diplome', 'ecole'])
	})

	test('U30 : une date à plus d’un an est refusée, à un an pile elle est acceptée', () => {
		const refus = erreursDeLaLigne(
			FORMATIONS,
			{ ...ligne, obtenuLe: '2027-10-16' },
			{ avecRequis: true, maintenant: MAINTENANT }
		)
		expect(refus.obtenuLe).toBe('Une date d’obtention ne peut pas dépasser d’un an la date du jour.')
		expect(
			erreursDeLaLigne(FORMATIONS, { ...ligne, obtenuLe: '2027-10-15' }, { avecRequis: true, maintenant: MAINTENANT })
		).toEqual({})
	})

	test('une formation à venir et une formation sans date sont acceptées', () => {
		expect(
			erreursDeLaLigne(FORMATIONS, { ...ligne, obtenuLe: '2027-01-01' }, { avecRequis: true, maintenant: MAINTENANT })
		).toEqual({})
		expect(
			erreursDeLaLigne(FORMATIONS, { ...ligne, obtenuLe: '' }, { avecRequis: true, maintenant: MAINTENANT })
		).toEqual({})
	})
})

describe('131, U29 : une prestation', () => {
	const brute = (prix: string) => ({ nom: 'Mariée', description: '', prix })
	const stockee = (prix: string) => PRESTATIONS.versLeStockage(nettoyerLaLigne(PRESTATIONS, brute(prix)))

	test('« 80 », « 80 € » et « à partir de 80 » donnent un prix de 80, le texte est gardé', () => {
		for (const saisie of ['80', '80 €', 'à partir de 80']) {
			expect(stockee(saisie)).toMatchObject({ prixAPartirDe: 80, prixTexte: saisie })
		}
	})

	test('« sur devis » garde son texte sans montant', () => {
		expect(stockee('sur devis')).toMatchObject({ prixAPartirDe: null, prixTexte: 'sur devis' })
	})

	test('un prix vide ne donne ni texte ni montant', () => {
		expect(stockee('')).toMatchObject({ prixAPartirDe: null, prixTexte: null })
	})

	test('plusieurs formules séparées par « ; » sont rangées une par ligne, et retapées avec « ; »', () => {
		expect(prixDeLaSaisie('60 € ; sur devis ;')).toBe('60 €\nsur devis')
		expect(stockee('60 € ; sur devis')).toMatchObject({ prixAPartirDe: 60, prixTexte: '60 €\nsur devis' })
		expect(PRESTATIONS.depuisLeStockage({ nom: 'x', prixTexte: '60 €\nsur devis', prixAPartirDe: 60 }).prix).toBe(
			'60 € ; sur devis'
		)
	})

	test('un montant stocké sans texte (offre importée) se retape en montant', () => {
		expect(PRESTATIONS.depuisLeStockage({ nom: 'x', prixTexte: null, prixAPartirDe: 80 }).prix).toBe('80')
	})

	test('elle exige le nom seulement, et borne le nom, la description et le prix', () => {
		expect(
			erreursDeLaLigne(
				PRESTATIONS,
				{ nom: '', description: '', prix: '' },
				{ avecRequis: true, maintenant: MAINTENANT }
			)
		).toEqual({
			nom: 'Le nom de la prestation est requis.',
		})
		expect(
			Object.keys(
				erreursDeLaLigne(
					PRESTATIONS,
					{ nom: 'a'.repeat(71), description: 'b'.repeat(2001), prix: 'c'.repeat(71) },
					{ avecRequis: true, maintenant: MAINTENANT }
				)
			).sort()
		).toEqual(['description', 'nom', 'prix'])
	})

	test('les options de la ligne stockée sont gardées, ce que le formulaire ne dit pas', () => {
		const options = [{ id: 'o1', nom: 'Essai', prixTexte: '30', prixAPartirDe: 30 }]
		expect(PRESTATIONS.garder?.({ nom: 'x', options })).toEqual({ options })
		expect(PRESTATIONS.garder?.({ nom: 'x' })).toEqual({ options: [] })
	})
})

describe('le schéma de la requête est strict', () => {
	const schema = schemaDeLaListe(PRESTATIONS)
	const valeurs = { nom: 'Mariée', description: '', prix: '80' }

	test('des lignes avec leurs textes passent, avec ou sans identifiant', () => {
		expect(schema.safeParse({ lignes: [{ valeurs }, { id: 'abc', valeurs }] }).success).toBe(true)
	})

	test('un montant envoyé par la requête refuse la requête entière', () => {
		expect(schema.safeParse({ lignes: [{ valeurs: { ...valeurs, prixAPartirDe: '80' } }] }).success).toBe(false)
		expect(schema.safeParse({ lignes: [{ valeurs: { ...valeurs, prixAPartirDe: 80 } }] }).success).toBe(false)
	})

	test('une clé en trop, une valeur qui n’est pas un texte, trop de lignes : refusés', () => {
		expect(schema.safeParse({ lignes: [], profil: 3 }).success).toBe(false)
		expect(schema.safeParse({ lignes: [{ valeurs: { ...valeurs, nom: 3 } }] }).success).toBe(false)
		expect(schema.safeParse({ lignes: [{ valeurs, options: [] }] }).success).toBe(false)
		expect(schema.safeParse({ lignes: Array.from({ length: LIGNES_MAX + 1 }, () => ({ valeurs })) }).success).toBe(
			false
		)
		expect(schema.safeParse({ lignes: [{ valeurs: { nom: 'x' } }] }).success).toBe(false)
	})
})

describe('les aides de la liste', () => {
	test('deux lignes sont les mêmes quand leurs textes le sont, un jour écrit autrement est le même jour', () => {
		const a = { poste: 'Maquilleuse', entreprise: 'S', ville: '', debut: '2020-03-01', fin: '', description: '' }
		expect(memeLigne(EXPERIENCES, a, { ...a, poste: ' Maquilleuse ', debut: '2020-03-01T12:00:00.000Z' })).toBe(true)
		expect(memeLigne(EXPERIENCES, a, { ...a, poste: 'maquilleuse' })).toBe(false)
	})

	test('après un retrait, le focus va à la ligne qui prend la place, sinon à celle du dessus, sinon nulle part', () => {
		expect(rangApresRetrait(2, 0)).toBe(0)
		expect(rangApresRetrait(2, 2)).toBe(1)
		expect(rangApresRetrait(0, 0)).toBeNull()
	})

	test('la page lit les lignes d’un profil avec leur identifiant, et ignore celles qui n’en ont pas', () => {
		const profil = {
			prestations: [{ id: 'a', nom: 'Mariée', prixTexte: '80', prixAPartirDe: 80 }, { nom: 'sans id' }, null],
		}
		expect(lignesDuProfil(PRESTATIONS, profil)).toEqual([
			{ id: 'a', valeurs: { nom: 'Mariée', description: '', prix: '80' } },
		])
		expect(lignesDuProfil(PRESTATIONS, null)).toEqual([])
	})
})
