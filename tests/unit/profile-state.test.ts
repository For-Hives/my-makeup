import { describe, expect, test } from 'bun:test'
import type { Field } from 'payload'
import { Profiles } from '@/collections/Profiles'
import { STATE_FIELDS } from '@/collections/profiles/state'
import { completeness, publishableConditions } from '@/lib/profile/completeness'
import {
	type ProfileDocument,
	profileFields,
	profileState,
	stateAfterSave,
	statusAfter,
	TRANSITION_DATES,
} from '@/lib/profile/state'
import {
	ANNECY,
	caseDocument,
	completenessInV3,
	excludedCity,
	OLD_SITE_RESPONSES,
	SHARED_CASE,
} from '../support/completeness-cases'

/**
 * The state of a profile as the server stores it (ticket 044): a document of `profils` read by the
 * single rule of the old site (src/lib/profile/completeness.ts), the dates of its flags, and the
 * status that follows. The same cases on the bench, through the real saves:
 * tests/integration/profils-completude.test.ts. Made-up values only.
 */

const DESCRIPTION = 'Maquilleuse fictive. '.repeat(10)

/** A profile that meets the six conditions, as the collection holds it. */
const PUBLISHABLE: ProfileDocument = {
	firstName: 'Prénom',
	lastName: 'Fictif',
	specialty: 'Mariage',
	city: ANNECY,
	description: DESCRIPTION,
	mainPicture: 12,
	serviceOffers: [{ priceFrom: 80 }],
	networks: { instagram: '@compte.fictif' },
}

const NOW = new Date('2026-10-14T10:00:00.000Z')
const YESTERDAY = '2026-10-13T10:00:00.000Z'

describe('un document de profils lu par la règle unique', () => {
	test('un profil vide : 0 sur 13, ni actif ni publiable, entièrement vide', () => {
		for (const empty of [{}, null, undefined])
			expect(profileState(empty)).toEqual({ completeness: 0, active: false, publishable: false, fullyEmpty: true })
	})

	test('un profil qui n’a qu’un nom reste entièrement vide', () => {
		expect(profileState({ firstName: 'Prénom', lastName: 'Fictif', artistName: 'Studio Fictif' })).toEqual({
			completeness: 2,
			active: false,
			publishable: false,
			fullyEmpty: true,
		})
	})

	test('les six conditions remplies : actif et publiable', () => {
		expect(profileState(PUBLISHABLE)).toMatchObject({ active: true, publishable: true, fullyEmpty: false })
	})

	test('une photo passée par son seul identifiant compte comme une photo, la galerie comme sa liste', () => {
		expect(publishableConditions(profileFields({ mainPicture: 12 })).photoPrincipale).toBe(true)
		expect(publishableConditions(profileFields({ mainPicture: { id: 12 } })).photoPrincipale).toBe(true)
		expect(publishableConditions(profileFields({ mainPicture: null })).photoPrincipale).toBe(false)
		expect(completeness(profileFields({ gallery: [3] })).manquants).not.toContain('galerie')
		expect(completeness(profileFields({ gallery: [] })).manquants).toContain('galerie')
	})

	test('la ville est le nom de la commune, seulement avec son code INSEE', () => {
		expect(profileFields({ city: ANNECY }).city).toBe('Annecy')
		expect(publishableConditions(profileFields({ city: ANNECY })).villeExploitable).toBe(true)
		for (const city of [{ name: 'Annecy', inseeCode: null }, { name: null, inseeCode: null }, null])
			expect(profileFields({ city: city }).city).toBeNull()
	})

	test('une commune de plus de six mots est une ville exploitable : son trait d’union espacé est lu comme les autres', () => {
		// The only name of the official list (14/10/2026) the rule refused as it is.
		const montvertBridge = { name: 'Pont de Montvert - Sud Mont Lozère', inseeCode: '48116' }
		expect(publishableConditions(profileFields({ city: montvertBridge })).villeExploitable).toBe(true)
		expect(profileFields({ city: montvertBridge }).city).toBe('Pont de Montvert-Sud Mont Lozère')
		expect(profileState({ city: montvertBridge, mainPicture: 3, specialty: 'Mariage' })).toMatchObject({
			active: true,
		})
		expect(profileState({ city: montvertBridge })).toMatchObject({ completeness: 1, fullyEmpty: false })
		// A name the rule reads as a city is passed as it is.
		expect(
			profileFields({ city: { name: 'Saint-Remy-en-Bouzemont-Saint-Genest-et-Isson', inseeCode: '51513' } }).city
		).toBe('Saint-Remy-en-Bouzemont-Saint-Genest-et-Isson')
		// A text that is no city stays none, even next to a code: the rule still refuses it.
		for (const nameValue of ['France', 'Partout', 'Toute la France', '-'])
			expect([
				nameValue,
				publishableConditions(profileFields({ city: { name: nameValue, inseeCode: '74010' } })).villeExploitable,
			]).toEqual([nameValue, false])
	})

	test('le prix chiffré d’une offre est son montant : un texte sans montant n’en est pas un', () => {
		const offer = (serviceOffers: ProfileDocument['serviceOffers']) =>
			publishableConditions(profileFields({ serviceOffers })).offreChiffree
		expect(offer([{ priceFrom: 80 }])).toBe(true)
		expect(offer([{ priceFrom: 5 }, { priceFrom: null }])).toBe(true)
		expect(offer([{ priceFrom: 10_000 }])).toBe(true)
		expect(offer([{ priceFrom: 49.5 }])).toBe(true)
		expect(offer([{ priceFrom: null }])).toBe(false)
		expect(offer([{ priceFrom: 4 }, { priceFrom: 10_001 }])).toBe(false)
		expect(offer([null])).toBe(false)
		expect(offer([])).toBe(false)
	})

	test('le téléphone et l’email ne comptent comme canal de contact que montrés au public', () => {
		const channel = (document: ProfileDocument) => publishableConditions(profileFields(document)).canalDeContact
		const contactDetails = { phone: '06 39 98 00 00', email: 'contact-fictif@example.test' }
		expect(channel({ contactDetails, publicContact: false })).toBe(false)
		expect(channel({ contactDetails })).toBe(false)
		expect(channel({ contactDetails, publicContact: true })).toBe(true)
		expect(channel({ contactDetails: { phone: '06 39 98 00 00' }, publicContact: true })).toBe(true)
		expect(channel({ publicContact: true })).toBe(false)
		for (const network of ['youtube', 'facebook', 'instagram', 'website', 'linkedin'] as const)
			expect(channel({ networks: { [network]: 'https://example.test/fictif' } }), network).toBe(true)
	})
})

describe('les cas partagés, écrits comme la v3 les tient (U01-U08)', () => {
	test('l’état calculé est celui de la règle unique sur le même profil', async () => {
		for (const testCase of SHARED_CASE) {
			const expected = completenessInV3(testCase.profil)
			const state = profileState(await caseDocument(testCase.profil, () => 1))
			expect([testCase.nom, state]).toEqual([
				testCase.nom,
				{
					completeness: expected.score,
					active: expected.actif,
					publishable: expected.publiable,
					fullyEmpty: expected.entierementVide,
				},
			])
		}
	})

	test('et celui de l’ancien site : seul le critère « ville » d’un texte qui n’est pas une commune manque au score', async () => {
		expect(SHARED_CASE.map(({ nom: nameValue }) => nameValue)).toEqual(
			OLD_SITE_RESPONSES.map(({ nom: nameValue }) => nameValue)
		)
		for (const [i, testCase] of SHARED_CASE.entries()) {
			const old = OLD_SITE_RESPONSES[i]
			if (!old) throw new Error(`Pas de réponse de l’ancien site pour « ${testCase.nom} ».`)
			const state = profileState(await caseDocument(testCase.profil, () => 1))
			expect([testCase.nom, state.active, state.fullyEmpty]).toEqual([
				testCase.nom,
				old.front.actif,
				old.api.entirelyEmpty,
			])
			expect([testCase.nom, state.completeness]).toEqual([
				testCase.nom,
				old.front.score - (excludedCity(testCase.profil) ? 1 : 0),
			])
			// The quote form counts on the old site only when it is online; nothing turns it on.
			if (testCase.options?.formulaireDevis) expect([testCase.nom, state.publishable]).toEqual([testCase.nom, false])
			else expect([testCase.nom, state.publishable]).toEqual([testCase.nom, old.front.publiable])
		}
	})
})

describe('le statut après une sauvegarde', () => {
	test('un profil créé vide est un brouillon ; créé avec une condition, il est publié', () => {
		const auto = { chosenStatus: 'automatic' } as const
		expect(statusAfter({ apres: {}, fullyEmpty: true })).toEqual({ status: 'draft', ...auto })
		expect(statusAfter({ apres: { status: 'draft', ...auto }, fullyEmpty: true })).toEqual({
			status: 'draft',
			...auto,
		})
		expect(statusAfter({ apres: { status: 'draft', ...auto }, fullyEmpty: false })).toEqual({
			status: 'published',
			...auto,
		})
	})

	test('en automatique, il suit le profil dans les deux sens', () => {
		const draft = { status: 'draft', chosenStatus: 'automatic' } as const
		const published = { status: 'published', chosenStatus: 'automatic' } as const
		expect(statusAfter({ avant: draft, apres: draft, fullyEmpty: false })).toEqual(published)
		expect(statusAfter({ avant: published, apres: published, fullyEmpty: true })).toEqual(draft)
		expect(statusAfter({ avant: published, apres: published, fullyEmpty: false })).toEqual(published)
	})

	test('un profil masqué reste masqué, quoi qu’on enregistre', () => {
		const hidden = { status: 'hidden', chosenStatus: 'hidden' } as const
		for (const fullyEmpty of [true, false])
			expect(statusAfter({ avant: hidden, apres: hidden, fullyEmpty })).toEqual(hidden)
		// Hidden in this very save, by an admin.
		expect(
			statusAfter({
				avant: { status: 'published', chosenStatus: 'automatic' },
				apres: { status: 'published', chosenStatus: 'hidden' },
				fullyEmpty: false,
			})
		).toEqual(hidden)
		// Stored hidden with no choice (before the field existed): still hidden, and the choice says so.
		for (const chosenStatus of [undefined, null, 'automatic'])
			expect(
				statusAfter({ avant: { status: 'hidden', chosenStatus }, apres: { chosenStatus }, fullyEmpty: false })
			).toEqual(hidden)
	})

	test('un statut choisi par l’admin est gardé : le serveur ne l’écrase plus', () => {
		// An admin puts a filled profile back to draft: the rule would publish it.
		const draft = statusAfter({
			avant: { status: 'published', chosenStatus: 'automatic' },
			apres: { status: 'published', chosenStatus: 'draft' },
			fullyEmpty: false,
		})
		expect(draft).toEqual({ status: 'draft', chosenStatus: 'draft' })
		expect(statusAfter({ avant: draft, apres: draft, fullyEmpty: false })).toEqual(draft)
		// An admin publishes an empty profile: it stays published.
		const published = { status: 'published', chosenStatus: 'published' } as const
		expect(statusAfter({ avant: published, apres: published, fullyEmpty: true })).toEqual(published)
		// Created with a choice.
		expect(statusAfter({ apres: { chosenStatus: 'published' }, fullyEmpty: true })).toEqual(published)
	})

	test('un formulaire qui renvoie le choix stocké ne choisit rien : la règle décide', () => {
		// The status the form sends never reaches the rule: no API writes it, so the save holds the
		// stored one (tests/integration/profils-completude.test.ts sends a stale one through REST).
		const published = { status: 'published', chosenStatus: 'automatic' } as const
		const draft = { status: 'draft', chosenStatus: 'automatic' } as const
		expect(statusAfter({ avant: published, apres: published, fullyEmpty: true })).toEqual(draft)
		expect(statusAfter({ avant: draft, apres: draft, fullyEmpty: false })).toEqual(published)
	})

	test('l’admin rend le statut à la règle en choisissant « automatique » : la règle s’applique dès cet enregistrement', () => {
		expect(
			statusAfter({
				avant: { status: 'draft', chosenStatus: 'draft' },
				apres: { status: 'draft', chosenStatus: 'automatic' },
				fullyEmpty: false,
			})
		).toEqual({ status: 'published', chosenStatus: 'automatic' })
		expect(
			statusAfter({
				avant: { status: 'hidden', chosenStatus: 'hidden' },
				apres: { status: 'hidden', chosenStatus: 'automatic' },
				fullyEmpty: true,
			})
		).toEqual({ status: 'draft', chosenStatus: 'automatic' })
	})

	test('le code serveur qui écrit le statut lui-même en fait le choix ; un choix écrit en même temps l’emporte', () => {
		const auto = { status: 'draft', chosenStatus: 'automatic' } as const
		expect(
			statusAfter({ avant: auto, apres: { status: 'published', chosenStatus: 'automatic' }, fullyEmpty: true })
		).toEqual({
			status: 'published',
			chosenStatus: 'published',
		})
		expect(statusAfter({ apres: { status: 'hidden' }, fullyEmpty: false })).toEqual({
			status: 'hidden',
			chosenStatus: 'hidden',
		})
		// The same status as the stored one is no decision.
		expect(statusAfter({ avant: auto, apres: { status: 'draft' }, fullyEmpty: false })).toEqual({
			status: 'published',
			chosenStatus: 'automatic',
		})
		expect(
			statusAfter({ avant: auto, apres: { status: 'hidden', chosenStatus: 'published' }, fullyEmpty: true })
		).toEqual({ status: 'published', chosenStatus: 'published' })
	})

	test('un statut ou un choix inconnu compte comme celui de départ', () => {
		expect(
			statusAfter({
				avant: { status: null, chosenStatus: 'autre' },
				apres: { status: 'autre', chosenStatus: 'autre' },
				fullyEmpty: false,
			})
		).toEqual({ status: 'published', chosenStatus: 'automatic' })
	})
})

describe('ce qu’une sauvegarde écrit : l’état, ses dates de passage, le statut', () => {
	test('à la création : l’état, les trois dates à l’instant de la création, le brouillon', () => {
		expect(stateAfterSave({ apres: {}, maintenant: NOW })).toEqual({
			completeness: 0,
			active: false,
			publishable: false,
			fullyEmpty: true,
			activeSince: NOW.toISOString(),
			publishableSince: NOW.toISOString(),
			fullyEmptySince: NOW.toISOString(),
			status: 'draft',
			chosenStatus: 'automatic',
		})
	})

	test('une date ne change que quand sa case change de valeur', () => {
		const before = {
			...profileState({ specialty: 'Mariage' }),
			activeSince: YESTERDAY,
			publishableSince: YESTERDAY,
			fullyEmptySince: YESTERDAY,
			status: 'published',
			chosenStatus: 'automatic',
		}
		// The same profile, saved again: nothing moves.
		expect(stateAfterSave({ avant: before, apres: { specialty: 'Mariage' }, maintenant: NOW })).toMatchObject({
			activeSince: YESTERDAY,
			publishableSince: YESTERDAY,
			fullyEmptySince: YESTERDAY,
			status: 'published',
		})
		// Active now: only the date of `actif` moves.
		const active = { specialty: 'Mariage', city: ANNECY, mainPicture: 3 }
		expect(stateAfterSave({ avant: before, apres: active, maintenant: NOW })).toMatchObject({
			active: true,
			activeSince: NOW.toISOString(),
			publishableSince: YESTERDAY,
			fullyEmptySince: YESTERDAY,
		})
		// Emptied: back to a draft, and the date of `fullyEmpty` moves.
		expect(stateAfterSave({ avant: before, apres: {}, maintenant: NOW })).toMatchObject({
			fullyEmpty: true,
			fullyEmptySince: NOW.toISOString(),
			activeSince: YESTERDAY,
			status: 'draft',
		})
	})

	test('un document sans date stockée reçoit l’instant de la sauvegarde ; une date en objet est gardée', () => {
		const before = { ...profileState({}), status: 'draft', activeSince: new Date(YESTERDAY) }
		expect(stateAfterSave({ avant: before, apres: {}, maintenant: NOW })).toMatchObject({
			activeSince: YESTERDAY,
			publishableSince: NOW.toISOString(),
			fullyEmptySince: NOW.toISOString(),
		})
	})

	test('ce que la requête envoie sur l’état est ignoré : il est recalculé', () => {
		const sent = {
			completeness: 13,
			active: true,
			publishable: true,
			fullyEmpty: false,
			activeSince: '2020-01-01T00:00:00.000Z',
			status: 'draft',
		}
		expect(stateAfterSave({ apres: sent, maintenant: NOW })).toMatchObject({
			completeness: 0,
			active: false,
			publishable: false,
			fullyEmpty: true,
			activeSince: NOW.toISOString(),
		})
	})
})

describe('les champs de l’état dans la collection des profils', () => {
	const fields = Profiles.fields.filter((champ): champ is Field & { name: string } => 'name' in champ)
	const names = fields.map(({ name }) => name)

	test('la complétude, les trois cases, leurs dates, et le statut choisi par l’admin à côté du statut', () => {
		for (const nameValue of ['completeness', 'active', 'publishable', 'fullyEmpty', ...Object.values(TRANSITION_DATES)])
			expect(names).toContain(nameValue)
		expect(names[names.indexOf('status') + 1]).toBe('chosenStatus')
	})

	test('aucune API n’écrit l’état ni le statut : création et modification fermées à tous', () => {
		const status = fields.find(({ name }) => name === 'status')
		if (!status) throw new Error('Le champ « status » manque à la collection des profils.')
		for (const field of [...STATE_FIELDS, status]) {
			const access = 'access' in field ? field.access : undefined
			const nameValue = 'name' in field ? field.name : ''
			for (const operation of ['create', 'update'] as const)
				expect([nameValue, operation, access?.[operation]?.({} as never)]).toEqual([nameValue, operation, false])
		}
	})
})
