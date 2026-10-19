import { describe, expect, test } from 'bun:test'
import type { Field } from 'payload'
import { Profiles } from '@/collections/Profiles'
import { CHAMPS_DE_L_ETAT } from '@/collections/profiles/etat'
import { completude, conditionsPubliable } from '@/lib/profil/completude'
import {
	champsDuProfil,
	DATES_DE_PASSAGE,
	type DocumentDuProfil,
	etatApresSauvegarde,
	etatDuProfil,
	statutApres,
} from '@/lib/profil/etat'
import {
	ANNECY,
	CAS_PARTAGES,
	completudeEnV3,
	documentDuCas,
	REPONSES_DE_L_ANCIEN_SITE,
	villeEcartee,
} from '../outils/cas-completude'

/**
 * The state of a profile as the server stores it (ticket 044): a document of `profils` read by the
 * single rule of the old site (src/lib/profil/completude.ts), the dates of its flags, and the
 * status that follows. The same cases on the bench, through the real saves:
 * tests/integration/profils-completude.test.ts. Made-up values only.
 */

const DESCRIPTION = 'Maquilleuse fictive. '.repeat(10)

/** A profile that meets the six conditions, as the collection holds it. */
const PUBLIABLE: DocumentDuProfil = {
	firstName: 'Prénom',
	lastName: 'Fictif',
	specialty: 'Mariage',
	city: ANNECY,
	description: DESCRIPTION,
	mainPicture: 12,
	serviceOffers: [{ priceFrom: 80 }],
	networks: { instagram: '@compte.fictif' },
}

const MAINTENANT = new Date('2026-10-14T10:00:00.000Z')
const HIER = '2026-10-13T10:00:00.000Z'

describe('un document de profils lu par la règle unique', () => {
	test('un profil vide : 0 sur 13, ni actif ni publiable, entièrement vide', () => {
		for (const vide of [{}, null, undefined])
			expect(etatDuProfil(vide)).toEqual({ completeness: 0, active: false, publishable: false, fullyEmpty: true })
	})

	test('un profil qui n’a qu’un nom reste entièrement vide', () => {
		expect(etatDuProfil({ firstName: 'Prénom', lastName: 'Fictif', artistName: 'Studio Fictif' })).toEqual({
			completeness: 2,
			active: false,
			publishable: false,
			fullyEmpty: true,
		})
	})

	test('les six conditions remplies : actif et publiable', () => {
		expect(etatDuProfil(PUBLIABLE)).toMatchObject({ active: true, publishable: true, fullyEmpty: false })
	})

	test('une photo passée par son seul identifiant compte comme une photo, la galerie comme sa liste', () => {
		expect(conditionsPubliable(champsDuProfil({ mainPicture: 12 })).photoPrincipale).toBe(true)
		expect(conditionsPubliable(champsDuProfil({ mainPicture: { id: 12 } })).photoPrincipale).toBe(true)
		expect(conditionsPubliable(champsDuProfil({ mainPicture: null })).photoPrincipale).toBe(false)
		expect(completude(champsDuProfil({ gallery: [3] })).manquants).not.toContain('galerie')
		expect(completude(champsDuProfil({ gallery: [] })).manquants).toContain('galerie')
	})

	test('la ville est le nom de la commune, seulement avec son code INSEE', () => {
		expect(champsDuProfil({ city: ANNECY }).city).toBe('Annecy')
		expect(conditionsPubliable(champsDuProfil({ city: ANNECY })).villeExploitable).toBe(true)
		for (const commune of [{ name: 'Annecy', inseeCode: null }, { name: null, inseeCode: null }, null])
			expect(champsDuProfil({ city: commune }).city).toBeNull()
	})

	test('une commune de plus de six mots est une ville exploitable : son trait d’union espacé est lu comme les autres', () => {
		// The only name of the official list (14/10/2026) the rule refused as it is.
		const pontDeMontvert = { name: 'Pont de Montvert - Sud Mont Lozère', inseeCode: '48116' }
		expect(conditionsPubliable(champsDuProfil({ city: pontDeMontvert })).villeExploitable).toBe(true)
		expect(champsDuProfil({ city: pontDeMontvert }).city).toBe('Pont de Montvert-Sud Mont Lozère')
		expect(etatDuProfil({ city: pontDeMontvert, mainPicture: 3, specialty: 'Mariage' })).toMatchObject({
			active: true,
		})
		expect(etatDuProfil({ city: pontDeMontvert })).toMatchObject({ completeness: 1, fullyEmpty: false })
		// A name the rule reads as a city is passed as it is.
		expect(
			champsDuProfil({ city: { name: 'Saint-Remy-en-Bouzemont-Saint-Genest-et-Isson', inseeCode: '51513' } }).city
		).toBe('Saint-Remy-en-Bouzemont-Saint-Genest-et-Isson')
		// A text that is no city stays none, even next to a code: the rule still refuses it.
		for (const nom of ['France', 'Partout', 'Toute la France', '-'])
			expect([
				nom,
				conditionsPubliable(champsDuProfil({ city: { name: nom, inseeCode: '74010' } })).villeExploitable,
			]).toEqual([nom, false])
	})

	test('le prix chiffré d’une offre est son montant : un texte sans montant n’en est pas un', () => {
		const offre = (serviceOffers: DocumentDuProfil['serviceOffers']) =>
			conditionsPubliable(champsDuProfil({ serviceOffers })).offreChiffree
		expect(offre([{ priceFrom: 80 }])).toBe(true)
		expect(offre([{ priceFrom: 5 }, { priceFrom: null }])).toBe(true)
		expect(offre([{ priceFrom: 10_000 }])).toBe(true)
		expect(offre([{ priceFrom: 49.5 }])).toBe(true)
		expect(offre([{ priceFrom: null }])).toBe(false)
		expect(offre([{ priceFrom: 4 }, { priceFrom: 10_001 }])).toBe(false)
		expect(offre([null])).toBe(false)
		expect(offre([])).toBe(false)
	})

	test('le téléphone et l’email ne comptent comme canal de contact que montrés au public', () => {
		const canal = (document: DocumentDuProfil) => conditionsPubliable(champsDuProfil(document)).canalDeContact
		const contactDetails = { phone: '06 39 98 00 00', email: 'contact-fictif@example.test' }
		expect(canal({ contactDetails, publicContact: false })).toBe(false)
		expect(canal({ contactDetails })).toBe(false)
		expect(canal({ contactDetails, publicContact: true })).toBe(true)
		expect(canal({ contactDetails: { phone: '06 39 98 00 00' }, publicContact: true })).toBe(true)
		expect(canal({ publicContact: true })).toBe(false)
		for (const reseau of ['youtube', 'facebook', 'instagram', 'website', 'linkedin'] as const)
			expect(canal({ networks: { [reseau]: 'https://example.test/fictif' } }), reseau).toBe(true)
	})
})

describe('les cas partagés, écrits comme la v3 les tient (U01-U08)', () => {
	test('l’état calculé est celui de la règle unique sur le même profil', async () => {
		for (const cas of CAS_PARTAGES) {
			const attendu = completudeEnV3(cas.profil)
			const etat = etatDuProfil(await documentDuCas(cas.profil, () => 1))
			expect([cas.nom, etat]).toEqual([
				cas.nom,
				{
					completeness: attendu.score,
					active: attendu.actif,
					publishable: attendu.publiable,
					fullyEmpty: attendu.entierementVide,
				},
			])
		}
	})

	test('et celui de l’ancien site : seul le critère « ville » d’un texte qui n’est pas une commune manque au score', async () => {
		expect(CAS_PARTAGES.map(({ nom }) => nom)).toEqual(REPONSES_DE_L_ANCIEN_SITE.map(({ nom }) => nom))
		for (const [i, cas] of CAS_PARTAGES.entries()) {
			const ancien = REPONSES_DE_L_ANCIEN_SITE[i]
			if (!ancien) throw new Error(`Pas de réponse de l’ancien site pour « ${cas.nom} ».`)
			const etat = etatDuProfil(await documentDuCas(cas.profil, () => 1))
			expect([cas.nom, etat.active, etat.fullyEmpty]).toEqual([cas.nom, ancien.front.actif, ancien.api.entirelyEmpty])
			expect([cas.nom, etat.completeness]).toEqual([cas.nom, ancien.front.score - (villeEcartee(cas.profil) ? 1 : 0)])
			// The quote form counts on the old site only when it is online; nothing turns it on.
			if (cas.options?.formulaireDevis) expect([cas.nom, etat.publishable]).toEqual([cas.nom, false])
			else expect([cas.nom, etat.publishable]).toEqual([cas.nom, ancien.front.publiable])
		}
	})
})

describe('le statut après une sauvegarde', () => {
	test('un profil créé vide est un brouillon ; créé avec une condition, il est publié', () => {
		const auto = { chosenStatus: 'automatic' } as const
		expect(statutApres({ apres: {}, fullyEmpty: true })).toEqual({ status: 'draft', ...auto })
		expect(statutApres({ apres: { status: 'draft', ...auto }, fullyEmpty: true })).toEqual({
			status: 'draft',
			...auto,
		})
		expect(statutApres({ apres: { status: 'draft', ...auto }, fullyEmpty: false })).toEqual({
			status: 'published',
			...auto,
		})
	})

	test('en automatique, il suit le profil dans les deux sens', () => {
		const brouillon = { status: 'draft', chosenStatus: 'automatic' } as const
		const publie = { status: 'published', chosenStatus: 'automatic' } as const
		expect(statutApres({ avant: brouillon, apres: brouillon, fullyEmpty: false })).toEqual(publie)
		expect(statutApres({ avant: publie, apres: publie, fullyEmpty: true })).toEqual(brouillon)
		expect(statutApres({ avant: publie, apres: publie, fullyEmpty: false })).toEqual(publie)
	})

	test('un profil masqué reste masqué, quoi qu’on enregistre', () => {
		const masque = { status: 'hidden', chosenStatus: 'hidden' } as const
		for (const fullyEmpty of [true, false])
			expect(statutApres({ avant: masque, apres: masque, fullyEmpty })).toEqual(masque)
		// Hidden in this very save, by an admin.
		expect(
			statutApres({
				avant: { status: 'published', chosenStatus: 'automatic' },
				apres: { status: 'published', chosenStatus: 'hidden' },
				fullyEmpty: false,
			})
		).toEqual(masque)
		// Stored hidden with no choice (before the field existed): still hidden, and the choice says so.
		for (const chosenStatus of [undefined, null, 'automatic'])
			expect(
				statutApres({ avant: { status: 'hidden', chosenStatus }, apres: { chosenStatus }, fullyEmpty: false })
			).toEqual(masque)
	})

	test('un statut choisi par l’admin est gardé : le serveur ne l’écrase plus', () => {
		// An admin puts a filled profile back to draft: the rule would publish it.
		const brouillon = statutApres({
			avant: { status: 'published', chosenStatus: 'automatic' },
			apres: { status: 'published', chosenStatus: 'draft' },
			fullyEmpty: false,
		})
		expect(brouillon).toEqual({ status: 'draft', chosenStatus: 'draft' })
		expect(statutApres({ avant: brouillon, apres: brouillon, fullyEmpty: false })).toEqual(brouillon)
		// An admin publishes an empty profile: it stays published.
		const publie = { status: 'published', chosenStatus: 'published' } as const
		expect(statutApres({ avant: publie, apres: publie, fullyEmpty: true })).toEqual(publie)
		// Created with a choice.
		expect(statutApres({ apres: { chosenStatus: 'published' }, fullyEmpty: true })).toEqual(publie)
	})

	test('un formulaire qui renvoie le choix stocké ne choisit rien : la règle décide', () => {
		// The status the form sends never reaches the rule: no API writes it, so the save holds the
		// stored one (tests/integration/profils-completude.test.ts sends a stale one through REST).
		const publie = { status: 'published', chosenStatus: 'automatic' } as const
		const brouillon = { status: 'draft', chosenStatus: 'automatic' } as const
		expect(statutApres({ avant: publie, apres: publie, fullyEmpty: true })).toEqual(brouillon)
		expect(statutApres({ avant: brouillon, apres: brouillon, fullyEmpty: false })).toEqual(publie)
	})

	test('l’admin rend le statut à la règle en choisissant « automatique » : la règle s’applique dès cet enregistrement', () => {
		expect(
			statutApres({
				avant: { status: 'draft', chosenStatus: 'draft' },
				apres: { status: 'draft', chosenStatus: 'automatic' },
				fullyEmpty: false,
			})
		).toEqual({ status: 'published', chosenStatus: 'automatic' })
		expect(
			statutApres({
				avant: { status: 'hidden', chosenStatus: 'hidden' },
				apres: { status: 'hidden', chosenStatus: 'automatic' },
				fullyEmpty: true,
			})
		).toEqual({ status: 'draft', chosenStatus: 'automatic' })
	})

	test('le code serveur qui écrit le statut lui-même en fait le choix ; un choix écrit en même temps l’emporte', () => {
		const auto = { status: 'draft', chosenStatus: 'automatic' } as const
		expect(
			statutApres({ avant: auto, apres: { status: 'published', chosenStatus: 'automatic' }, fullyEmpty: true })
		).toEqual({
			status: 'published',
			chosenStatus: 'published',
		})
		expect(statutApres({ apres: { status: 'hidden' }, fullyEmpty: false })).toEqual({
			status: 'hidden',
			chosenStatus: 'hidden',
		})
		// The same status as the stored one is no decision.
		expect(statutApres({ avant: auto, apres: { status: 'draft' }, fullyEmpty: false })).toEqual({
			status: 'published',
			chosenStatus: 'automatic',
		})
		expect(
			statutApres({ avant: auto, apres: { status: 'hidden', chosenStatus: 'published' }, fullyEmpty: true })
		).toEqual({ status: 'published', chosenStatus: 'published' })
	})

	test('un statut ou un choix inconnu compte comme celui de départ', () => {
		expect(
			statutApres({
				avant: { status: null, chosenStatus: 'autre' },
				apres: { status: 'autre', chosenStatus: 'autre' },
				fullyEmpty: false,
			})
		).toEqual({ status: 'published', chosenStatus: 'automatic' })
	})
})

describe('ce qu’une sauvegarde écrit : l’état, ses dates de passage, le statut', () => {
	test('à la création : l’état, les trois dates à l’instant de la création, le brouillon', () => {
		expect(etatApresSauvegarde({ apres: {}, maintenant: MAINTENANT })).toEqual({
			completeness: 0,
			active: false,
			publishable: false,
			fullyEmpty: true,
			activeSince: MAINTENANT.toISOString(),
			publishableSince: MAINTENANT.toISOString(),
			fullyEmptySince: MAINTENANT.toISOString(),
			status: 'draft',
			chosenStatus: 'automatic',
		})
	})

	test('une date ne change que quand sa case change de valeur', () => {
		const avant = {
			...etatDuProfil({ specialty: 'Mariage' }),
			activeSince: HIER,
			publishableSince: HIER,
			fullyEmptySince: HIER,
			status: 'published',
			chosenStatus: 'automatic',
		}
		// The same profile, saved again: nothing moves.
		expect(etatApresSauvegarde({ avant, apres: { specialty: 'Mariage' }, maintenant: MAINTENANT })).toMatchObject({
			activeSince: HIER,
			publishableSince: HIER,
			fullyEmptySince: HIER,
			status: 'published',
		})
		// Active now: only the date of `actif` moves.
		const actif = { specialty: 'Mariage', city: ANNECY, mainPicture: 3 }
		expect(etatApresSauvegarde({ avant, apres: actif, maintenant: MAINTENANT })).toMatchObject({
			active: true,
			activeSince: MAINTENANT.toISOString(),
			publishableSince: HIER,
			fullyEmptySince: HIER,
		})
		// Emptied: back to a draft, and the date of `fullyEmpty` moves.
		expect(etatApresSauvegarde({ avant, apres: {}, maintenant: MAINTENANT })).toMatchObject({
			fullyEmpty: true,
			fullyEmptySince: MAINTENANT.toISOString(),
			activeSince: HIER,
			status: 'draft',
		})
	})

	test('un document sans date stockée reçoit l’instant de la sauvegarde ; une date en objet est gardée', () => {
		const avant = { ...etatDuProfil({}), status: 'draft', activeSince: new Date(HIER) }
		expect(etatApresSauvegarde({ avant, apres: {}, maintenant: MAINTENANT })).toMatchObject({
			activeSince: HIER,
			publishableSince: MAINTENANT.toISOString(),
			fullyEmptySince: MAINTENANT.toISOString(),
		})
	})

	test('ce que la requête envoie sur l’état est ignoré : il est recalculé', () => {
		const envoye = {
			completeness: 13,
			active: true,
			publishable: true,
			fullyEmpty: false,
			activeSince: '2020-01-01T00:00:00.000Z',
			status: 'draft',
		}
		expect(etatApresSauvegarde({ apres: envoye, maintenant: MAINTENANT })).toMatchObject({
			completeness: 0,
			active: false,
			publishable: false,
			fullyEmpty: true,
			activeSince: MAINTENANT.toISOString(),
		})
	})
})

describe('les champs de l’état dans la collection des profils', () => {
	const champs = Profiles.fields.filter((champ): champ is Field & { name: string } => 'name' in champ)
	const noms = champs.map(({ name }) => name)

	test('la complétude, les trois cases, leurs dates, et le statut choisi par l’admin à côté du statut', () => {
		for (const nom of ['completeness', 'active', 'publishable', 'fullyEmpty', ...Object.values(DATES_DE_PASSAGE)])
			expect(noms).toContain(nom)
		expect(noms[noms.indexOf('status') + 1]).toBe('chosenStatus')
	})

	test('aucune API n’écrit l’état ni le statut : création et modification fermées à tous', () => {
		const statut = champs.find(({ name }) => name === 'status')
		if (!statut) throw new Error('Le champ « status » manque à la collection des profils.')
		for (const champ of [...CHAMPS_DE_L_ETAT, statut]) {
			const acces = 'access' in champ ? champ.access : undefined
			const nom = 'name' in champ ? champ.name : ''
			for (const operation of ['create', 'update'] as const)
				expect([nom, operation, acces?.[operation]?.({} as never)]).toEqual([nom, operation, false])
		}
	})
})
