import { describe, expect, test } from 'bun:test'
import {
	dateDuJour,
	dernierJourDObtention,
	identitesDesLignes,
	jourCalendaire,
	LONGUEUR_DESCRIPTION,
	LONGUEUR_NOM,
	MESSAGES,
	messageDeDate,
	messageDeFin,
	messageDePrix,
	messageDeTexte,
	messageDObtention,
} from '@/lib/profile/lists'

/**
 * The rules of the list sections of a profile (ticket 040): the identity of each row (rule L1 of
 * docs/qualite.md §3) and the bounds the server checks (plans/02 U29, U30). The collection plays
 * them in tests/integration/profils-listes.test.ts.
 */

// Identifiers as Payload gives them: 24 hexadecimal characters.
const A = '6710a0000000000000000001'
const B = '6710a0000000000000000002'
const C = '6710a0000000000000000003'
const O1 = '6710b0000000000000000001'
const O2 = '6710b0000000000000000002'

const stocke = {
	serviceOffers: [
		{ id: A, name: 'Mariée', options: [{ id: O1, name: 'Essai' }] },
		{ id: B, name: 'Soirée', options: [{ id: O2, name: 'Faux cils' }] },
	],
	languages: [{ id: C, name: 'Anglais' }],
}

describe('L1. Un identifiant par ligne : le serveur le donne et le garde', () => {
	test('une ligne renvoyée avec son identifiant le garde, dans l’ordre envoyé', () => {
		const recu = {
			serviceOffers: [
				{ id: B, name: 'Soirée' },
				{ id: A, name: 'Mariée' },
			],
		}

		expect(identitesDesLignes(recu, stocke).serviceOffers).toEqual([
			{ id: B, name: 'Soirée' },
			{ id: A, name: 'Mariée' },
		])
	})

	test('une ligne nouvelle, ou venue avec un identifiant tiré de son contenu, n’en a plus : Payload lui en donnera un', () => {
		const recu = { languages: [{ name: 'Italien' }, { id: 'italien', name: 'Italien' }, { id: C, name: 'Anglais' }] }

		expect(identitesDesLignes(recu, stocke).languages).toEqual([
			{ name: 'Italien' },
			{ name: 'Italien' },
			{ id: C, name: 'Anglais' },
		])
	})

	test('deux lignes de même contenu et de même identifiant : la seconde est une ligne nouvelle', () => {
		const recu = {
			languages: [
				{ id: C, name: 'Anglais' },
				{ id: C, name: 'Anglais' },
			],
		}

		expect(identitesDesLignes(recu, stocke).languages).toEqual([{ id: C, name: 'Anglais' }, { name: 'Anglais' }])
	})

	test('un identifiant d’une autre liste, ou d’un autre profil, n’est pas repris', () => {
		const recu = { languages: [{ id: A, name: 'Anglais' }], skills: [{ id: C, name: 'Mariage' }] }

		expect(identitesDesLignes(recu, stocke)).toEqual({
			languages: [{ name: 'Anglais' }],
			skills: [{ name: 'Mariage' }],
		})
	})

	test('à la création, aucun profil n’est stocké : toutes les lignes sont nouvelles', () => {
		expect(identitesDesLignes({ languages: [{ id: C, name: 'Anglais' }] }, undefined).languages).toEqual([
			{ name: 'Anglais' },
		])
	})

	test('les options gardent leur identifiant une fois dans tout le profil, même déplacées vers une autre prestation', () => {
		const recu = {
			serviceOffers: [
				{ id: A, options: [{ id: O2, name: 'Faux cils' }, { id: O1 }] },
				{ id: B, options: [{ id: O1 }, { id: 'essai' }] },
				{ name: 'Nouvelle', options: [{ id: O1 }] },
			],
		}

		expect(identitesDesLignes(recu, stocke).serviceOffers).toEqual([
			{ id: A, options: [{ id: O2, name: 'Faux cils' }, { id: O1 }] },
			{ id: B, options: [{}, {}] },
			{ name: 'Nouvelle', options: [{}] },
		])
	})

	test('une liste qui n’est pas envoyée, les autres champs et ce qui n’est pas une ligne restent tels quels', () => {
		const recu = { prenom: 'Zoé', languages: null, skills: [null, 'texte'] }

		expect(identitesDesLignes(recu, stocke)).toEqual({ prenom: 'Zoé', languages: null, skills: [null, 'texte'] })
	})

	test('les données reçues ne sont pas modifiées en place', () => {
		const recu = { languages: [{ id: 'italien', name: 'Italien' }] }

		identitesDesLignes(recu, stocke)

		expect(recu).toEqual({ languages: [{ id: 'italien', name: 'Italien' }] })
	})
})

describe('Les textes sont bornés, et le refus est en français', () => {
	test('70 caractères pour un nom, 2 000 pour une description', () => {
		expect(messageDeTexte('a'.repeat(LONGUEUR_NOM), LONGUEUR_NOM)).toBeNull()
		expect(messageDeTexte('a'.repeat(LONGUEUR_NOM + 1), LONGUEUR_NOM)).toBe(
			'Ce texte ne doit pas dépasser 70 caractères.'
		)
		expect(messageDeTexte('a'.repeat(LONGUEUR_DESCRIPTION), LONGUEUR_DESCRIPTION)).toBeNull()
		expect(messageDeTexte('a'.repeat(LONGUEUR_DESCRIPTION + 1), LONGUEUR_DESCRIPTION)).toBe(
			'Ce texte ne doit pas dépasser 2000 caractères.'
		)
	})

	test('un champ vide passe, ce qui n’est pas un texte est refusé', () => {
		expect(messageDeTexte(null, LONGUEUR_NOM)).toBeNull()
		expect(messageDeTexte(undefined, LONGUEUR_NOM)).toBeNull()
		expect(messageDeTexte('', LONGUEUR_NOM)).toBeNull()
		expect(messageDeTexte(42, LONGUEUR_NOM)).toBe(MESSAGES.pasUnTexte)
		expect(messageDeTexte({ name: 'x' }, LONGUEUR_NOM)).toBe(MESSAGES.pasUnTexte)
	})
})

describe('Le montant d’un prix suit la règle de prix unique (U29)', () => {
	test('un prix négatif est refusé, en français', () => {
		expect(messageDePrix(-50)).toBe('Le prix doit être un montant entre 5 € et 10 000 €.')
	})

	test('les bornes de src/lib/prix.ts : de 5 à 10 000 €', () => {
		for (const refuse of [0, 4.99, 10_000.01, Number.NaN, Number.POSITIVE_INFINITY, '80', true])
			expect(messageDePrix(refuse)).toBe(MESSAGES.prixHorsBornes)
		for (const accepte of [5, 80, 49.5, 10_000]) expect(messageDePrix(accepte)).toBeNull()
	})

	test('sans montant, une prestation sur devis passe', () => {
		expect(messageDePrix(null)).toBeNull()
		expect(messageDePrix(undefined)).toBeNull()
	})
})

describe('Une date de ces listes est un jour, sans heure', () => {
	test('un texte donne le jour qu’il écrit, quel que soit le fuseau ; une Date donne son jour en UTC', () => {
		expect(jourCalendaire('2024-03-01')).toBe('2024-03-01')
		expect(jourCalendaire('2024-03-01T23:30:00-05:00')).toBe('2024-03-01')
		expect(jourCalendaire('2024-03-01T00:30:00+02:00')).toBe('2024-03-01')
		expect(jourCalendaire(new Date('2024-03-01T12:00:00.000Z'))).toBe('2024-03-01')
		expect(jourCalendaire('2024-02-29')).toBe('2024-02-29')
	})

	test('un jour qui n’existe pas, une autre forme ou autre chose qu’une date n’est pas une date', () => {
		for (const pasUneDate of [
			'2024-02-30',
			'2023-02-29',
			'2024-13-01',
			'01/03/2024',
			'March 1, 2024',
			'2024-03-01Tmidi',
			'0000-01-01',
			'0000-12-31T00:00:00.000Z',
		])
			expect(jourCalendaire(pasUneDate)).toBeNull()
		for (const pasUneDate of [20240301, null, undefined, new Date('invalide'), {}])
			expect(jourCalendaire(pasUneDate)).toBeNull()
	})

	test('l’an 0 n’existe pas pour PostgreSQL : refusé avec la phrase des dates ; l’an 1 passe', () => {
		expect(jourCalendaire('0001-01-01')).toBe('0001-01-01')
		expect(messageDeDate('0000-01-01')).toBe(MESSAGES.dateInvalide)
		expect(messageDeFin('0000-06-01', '2020-01-01')).toBe(MESSAGES.dateInvalide)
		expect(dateDuJour('0000-01-01')).toBe('0000-01-01')
	})

	test('stockée à midi UTC ; un champ vide devient nul ; le reste est laissé à la validation', () => {
		expect(dateDuJour('2024-03-01')).toBe('2024-03-01T12:00:00.000Z')
		expect(dateDuJour('2024-03-01T23:30:00-05:00')).toBe('2024-03-01T12:00:00.000Z')
		expect(dateDuJour('2024-03-01T12:00:00.000Z')).toBe('2024-03-01T12:00:00.000Z')
		expect(dateDuJour('')).toBeNull()
		expect(dateDuJour(null)).toBeNull()
		expect(dateDuJour(undefined)).toBeUndefined()
		expect(dateDuJour('2024-02-30')).toBe('2024-02-30')
	})

	test('une date qui n’en est pas une est refusée, en français', () => {
		expect(messageDeDate('2024-02-30')).toBe('Cette date n’est pas valide.')
		expect(messageDeDate('2024-02-29')).toBeNull()
		expect(messageDeDate(null)).toBeNull()
	})
})

describe('Expérience : la fin ne précède pas le début (U30)', () => {
	test('une fin avant le début est refusée, en français', () => {
		expect(messageDeFin('2023-05-31', '2023-06-01')).toBe('La fin d’une expérience ne peut pas précéder son début.')
	})

	test('le même jour passe, quelle que soit l’heure ; sans fin ou sans début, rien à comparer', () => {
		expect(messageDeFin('2023-06-01T08:00:00.000Z', '2023-06-01T20:00:00.000Z')).toBeNull()
		expect(messageDeFin('2024-06-01', '2023-06-01')).toBeNull()
		expect(messageDeFin(null, '2023-06-01')).toBeNull()
		expect(messageDeFin('2023-06-01', null)).toBeNull()
	})

	test('une fin qui n’est pas une date est refusée comme telle', () => {
		expect(messageDeFin('2023-02-30', '2023-01-01')).toBe(MESSAGES.dateInvalide)
	})
})

describe('Formation : obtenue au plus un an après la date du jour (U30)', () => {
	const maintenant = new Date('2026-10-14T09:00:00.000Z')

	test('le même jour un an plus tard passe, le lendemain est refusé, en français', () => {
		expect(dernierJourDObtention(maintenant)).toBe('2027-10-14')
		expect(messageDObtention('2027-10-14', maintenant)).toBeNull()
		expect(messageDObtention('2027-10-15', maintenant)).toBe(
			'Une date d’obtention ne peut pas dépasser d’un an la date du jour.'
		)
	})

	test('une date passée ou absente passe ; une date qui n’en est pas une est refusée comme telle', () => {
		expect(messageDObtention('2012-06-30', maintenant)).toBeNull()
		expect(messageDObtention(null, maintenant)).toBeNull()
		expect(messageDObtention('2012-06-31', maintenant)).toBe(MESSAGES.dateInvalide)
	})

	test('un 29 février : la limite est le 1er mars de l’année suivante', () => {
		expect(dernierJourDObtention(new Date('2028-02-29T10:00:00.000Z'))).toBe('2029-03-01')
	})
})
