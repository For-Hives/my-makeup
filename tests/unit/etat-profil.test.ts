import { describe, expect, test } from 'bun:test'
import type { Field } from 'payload'
import { Profils } from '@/collections/Profils'
import { CHAMPS_DE_L_ETAT } from '@/collections/profils/etat'
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
	prenom: 'Prénom',
	nom: 'Fictif',
	specialite: 'Mariage',
	commune: ANNECY,
	description: DESCRIPTION,
	photoPrincipale: 12,
	prestations: [{ prixAPartirDe: 80 }],
	reseaux: { instagram: '@compte.fictif' },
}

const MAINTENANT = new Date('2026-10-14T10:00:00.000Z')
const HIER = '2026-10-13T10:00:00.000Z'

describe('un document de profils lu par la règle unique', () => {
	test('un profil vide : 0 sur 13, ni actif ni publiable, entièrement vide', () => {
		for (const vide of [{}, null, undefined])
			expect(etatDuProfil(vide)).toEqual({ completude: 0, actif: false, publiable: false, entierementVide: true })
	})

	test('un profil qui n’a qu’un nom reste entièrement vide', () => {
		expect(etatDuProfil({ prenom: 'Prénom', nom: 'Fictif', nomArtiste: 'Studio Fictif' })).toEqual({
			completude: 2,
			actif: false,
			publiable: false,
			entierementVide: true,
		})
	})

	test('les six conditions remplies : actif et publiable', () => {
		expect(etatDuProfil(PUBLIABLE)).toMatchObject({ actif: true, publiable: true, entierementVide: false })
	})

	test('une photo passée par son seul identifiant compte comme une photo, la galerie comme sa liste', () => {
		expect(conditionsPubliable(champsDuProfil({ photoPrincipale: 12 })).photoPrincipale).toBe(true)
		expect(conditionsPubliable(champsDuProfil({ photoPrincipale: { id: 12 } })).photoPrincipale).toBe(true)
		expect(conditionsPubliable(champsDuProfil({ photoPrincipale: null })).photoPrincipale).toBe(false)
		expect(completude(champsDuProfil({ galerie: [3] })).manquants).not.toContain('galerie')
		expect(completude(champsDuProfil({ galerie: [] })).manquants).toContain('galerie')
	})

	test('la ville est le nom de la commune, seulement avec son code INSEE', () => {
		expect(champsDuProfil({ commune: ANNECY }).city).toBe('Annecy')
		expect(conditionsPubliable(champsDuProfil({ commune: ANNECY })).villeExploitable).toBe(true)
		for (const commune of [{ nom: 'Annecy', codeInsee: null }, { nom: null, codeInsee: null }, null])
			expect(champsDuProfil({ commune }).city).toBeNull()
	})

	test('une commune de plus de six mots est une ville exploitable : son trait d’union espacé est lu comme les autres', () => {
		// The only name of the official list (14/10/2026) the rule refused as it is.
		const pontDeMontvert = { nom: 'Pont de Montvert - Sud Mont Lozère', codeInsee: '48116' }
		expect(conditionsPubliable(champsDuProfil({ commune: pontDeMontvert })).villeExploitable).toBe(true)
		expect(champsDuProfil({ commune: pontDeMontvert }).city).toBe('Pont de Montvert-Sud Mont Lozère')
		expect(etatDuProfil({ commune: pontDeMontvert, photoPrincipale: 3, specialite: 'Mariage' })).toMatchObject({
			actif: true,
		})
		expect(etatDuProfil({ commune: pontDeMontvert })).toMatchObject({ completude: 1, entierementVide: false })
		// A name the rule reads as a city is passed as it is.
		expect(
			champsDuProfil({ commune: { nom: 'Saint-Remy-en-Bouzemont-Saint-Genest-et-Isson', codeInsee: '51513' } }).city
		).toBe('Saint-Remy-en-Bouzemont-Saint-Genest-et-Isson')
		// A text that is no city stays none, even next to a code: the rule still refuses it.
		for (const nom of ['France', 'Partout', 'Toute la France', '-'])
			expect([
				nom,
				conditionsPubliable(champsDuProfil({ commune: { nom, codeInsee: '74010' } })).villeExploitable,
			]).toEqual([nom, false])
	})

	test('le prix chiffré d’une offre est son montant : un texte sans montant n’en est pas un', () => {
		const offre = (prestations: DocumentDuProfil['prestations']) =>
			conditionsPubliable(champsDuProfil({ prestations })).offreChiffree
		expect(offre([{ prixAPartirDe: 80 }])).toBe(true)
		expect(offre([{ prixAPartirDe: 5 }, { prixAPartirDe: null }])).toBe(true)
		expect(offre([{ prixAPartirDe: 10_000 }])).toBe(true)
		expect(offre([{ prixAPartirDe: 49.5 }])).toBe(true)
		expect(offre([{ prixAPartirDe: null }])).toBe(false)
		expect(offre([{ prixAPartirDe: 4 }, { prixAPartirDe: 10_001 }])).toBe(false)
		expect(offre([null])).toBe(false)
		expect(offre([])).toBe(false)
	})

	test('le téléphone et l’email ne comptent comme canal de contact que montrés au public', () => {
		const canal = (document: DocumentDuProfil) => conditionsPubliable(champsDuProfil(document)).canalDeContact
		const coordonnees = { telephone: '06 39 98 00 00', email: 'contact-fictif@example.test' }
		expect(canal({ coordonnees, contactPublic: false })).toBe(false)
		expect(canal({ coordonnees })).toBe(false)
		expect(canal({ coordonnees, contactPublic: true })).toBe(true)
		expect(canal({ coordonnees: { telephone: '06 39 98 00 00' }, contactPublic: true })).toBe(true)
		expect(canal({ contactPublic: true })).toBe(false)
		for (const reseau of ['youtube', 'facebook', 'instagram', 'siteWeb', 'linkedin'] as const)
			expect(canal({ reseaux: { [reseau]: 'https://example.test/fictif' } }), reseau).toBe(true)
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
					completude: attendu.score,
					actif: attendu.actif,
					publiable: attendu.publiable,
					entierementVide: attendu.entierementVide,
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
			expect([cas.nom, etat.actif, etat.entierementVide]).toEqual([
				cas.nom,
				ancien.front.actif,
				ancien.api.entirelyEmpty,
			])
			expect([cas.nom, etat.completude]).toEqual([cas.nom, ancien.front.score - (villeEcartee(cas.profil) ? 1 : 0)])
			// The quote form counts on the old site only when it is online; nothing turns it on.
			if (cas.options?.formulaireDevis) expect([cas.nom, etat.publiable]).toEqual([cas.nom, false])
			else expect([cas.nom, etat.publiable]).toEqual([cas.nom, ancien.front.publiable])
		}
	})
})

describe('le statut après une sauvegarde', () => {
	test('un profil créé vide est un brouillon ; créé avec une condition, il est publié', () => {
		const auto = { statutChoisi: 'automatique' } as const
		expect(statutApres({ apres: {}, entierementVide: true })).toEqual({ statut: 'brouillon', ...auto })
		expect(statutApres({ apres: { statut: 'brouillon', ...auto }, entierementVide: true })).toEqual({
			statut: 'brouillon',
			...auto,
		})
		expect(statutApres({ apres: { statut: 'brouillon', ...auto }, entierementVide: false })).toEqual({
			statut: 'publie',
			...auto,
		})
	})

	test('en automatique, il suit le profil dans les deux sens', () => {
		const brouillon = { statut: 'brouillon', statutChoisi: 'automatique' } as const
		const publie = { statut: 'publie', statutChoisi: 'automatique' } as const
		expect(statutApres({ avant: brouillon, apres: brouillon, entierementVide: false })).toEqual(publie)
		expect(statutApres({ avant: publie, apres: publie, entierementVide: true })).toEqual(brouillon)
		expect(statutApres({ avant: publie, apres: publie, entierementVide: false })).toEqual(publie)
	})

	test('un profil masqué reste masqué, quoi qu’on enregistre', () => {
		const masque = { statut: 'masque', statutChoisi: 'masque' } as const
		for (const entierementVide of [true, false])
			expect(statutApres({ avant: masque, apres: masque, entierementVide })).toEqual(masque)
		// Hidden in this very save, by an admin.
		expect(
			statutApres({
				avant: { statut: 'publie', statutChoisi: 'automatique' },
				apres: { statut: 'publie', statutChoisi: 'masque' },
				entierementVide: false,
			})
		).toEqual(masque)
		// Stored hidden with no choice (before the field existed): still hidden, and the choice says so.
		for (const statutChoisi of [undefined, null, 'automatique'])
			expect(
				statutApres({ avant: { statut: 'masque', statutChoisi }, apres: { statutChoisi }, entierementVide: false })
			).toEqual(masque)
	})

	test('un statut choisi par l’admin est gardé : le serveur ne l’écrase plus', () => {
		// An admin puts a filled profile back to draft: the rule would publish it.
		const brouillon = statutApres({
			avant: { statut: 'publie', statutChoisi: 'automatique' },
			apres: { statut: 'publie', statutChoisi: 'brouillon' },
			entierementVide: false,
		})
		expect(brouillon).toEqual({ statut: 'brouillon', statutChoisi: 'brouillon' })
		expect(statutApres({ avant: brouillon, apres: brouillon, entierementVide: false })).toEqual(brouillon)
		// An admin publishes an empty profile: it stays published.
		const publie = { statut: 'publie', statutChoisi: 'publie' } as const
		expect(statutApres({ avant: publie, apres: publie, entierementVide: true })).toEqual(publie)
		// Created with a choice.
		expect(statutApres({ apres: { statutChoisi: 'publie' }, entierementVide: true })).toEqual(publie)
	})

	test('un formulaire qui renvoie le choix stocké ne choisit rien : la règle décide', () => {
		// The status the form sends never reaches the rule: no API writes it, so the save holds the
		// stored one (tests/integration/profils-completude.test.ts sends a stale one through REST).
		const publie = { statut: 'publie', statutChoisi: 'automatique' } as const
		const brouillon = { statut: 'brouillon', statutChoisi: 'automatique' } as const
		expect(statutApres({ avant: publie, apres: publie, entierementVide: true })).toEqual(brouillon)
		expect(statutApres({ avant: brouillon, apres: brouillon, entierementVide: false })).toEqual(publie)
	})

	test('l’admin rend le statut à la règle en choisissant « automatique » : la règle s’applique dès cet enregistrement', () => {
		expect(
			statutApres({
				avant: { statut: 'brouillon', statutChoisi: 'brouillon' },
				apres: { statut: 'brouillon', statutChoisi: 'automatique' },
				entierementVide: false,
			})
		).toEqual({ statut: 'publie', statutChoisi: 'automatique' })
		expect(
			statutApres({
				avant: { statut: 'masque', statutChoisi: 'masque' },
				apres: { statut: 'masque', statutChoisi: 'automatique' },
				entierementVide: true,
			})
		).toEqual({ statut: 'brouillon', statutChoisi: 'automatique' })
	})

	test('le code serveur qui écrit le statut lui-même en fait le choix ; un choix écrit en même temps l’emporte', () => {
		const auto = { statut: 'brouillon', statutChoisi: 'automatique' } as const
		expect(
			statutApres({ avant: auto, apres: { statut: 'publie', statutChoisi: 'automatique' }, entierementVide: true })
		).toEqual({
			statut: 'publie',
			statutChoisi: 'publie',
		})
		expect(statutApres({ apres: { statut: 'masque' }, entierementVide: false })).toEqual({
			statut: 'masque',
			statutChoisi: 'masque',
		})
		// The same status as the stored one is no decision.
		expect(statutApres({ avant: auto, apres: { statut: 'brouillon' }, entierementVide: false })).toEqual({
			statut: 'publie',
			statutChoisi: 'automatique',
		})
		expect(
			statutApres({ avant: auto, apres: { statut: 'masque', statutChoisi: 'publie' }, entierementVide: true })
		).toEqual({ statut: 'publie', statutChoisi: 'publie' })
	})

	test('un statut ou un choix inconnu compte comme celui de départ', () => {
		expect(
			statutApres({
				avant: { statut: null, statutChoisi: 'autre' },
				apres: { statut: 'autre', statutChoisi: 'autre' },
				entierementVide: false,
			})
		).toEqual({ statut: 'publie', statutChoisi: 'automatique' })
	})
})

describe('ce qu’une sauvegarde écrit : l’état, ses dates de passage, le statut', () => {
	test('à la création : l’état, les trois dates à l’instant de la création, le brouillon', () => {
		expect(etatApresSauvegarde({ apres: {}, maintenant: MAINTENANT })).toEqual({
			completude: 0,
			actif: false,
			publiable: false,
			entierementVide: true,
			actifDepuis: MAINTENANT.toISOString(),
			publiableDepuis: MAINTENANT.toISOString(),
			entierementVideDepuis: MAINTENANT.toISOString(),
			statut: 'brouillon',
			statutChoisi: 'automatique',
		})
	})

	test('une date ne change que quand sa case change de valeur', () => {
		const avant = {
			...etatDuProfil({ specialite: 'Mariage' }),
			actifDepuis: HIER,
			publiableDepuis: HIER,
			entierementVideDepuis: HIER,
			statut: 'publie',
			statutChoisi: 'automatique',
		}
		// The same profile, saved again: nothing moves.
		expect(etatApresSauvegarde({ avant, apres: { specialite: 'Mariage' }, maintenant: MAINTENANT })).toMatchObject({
			actifDepuis: HIER,
			publiableDepuis: HIER,
			entierementVideDepuis: HIER,
			statut: 'publie',
		})
		// Active now: only the date of `actif` moves.
		const actif = { specialite: 'Mariage', commune: ANNECY, photoPrincipale: 3 }
		expect(etatApresSauvegarde({ avant, apres: actif, maintenant: MAINTENANT })).toMatchObject({
			actif: true,
			actifDepuis: MAINTENANT.toISOString(),
			publiableDepuis: HIER,
			entierementVideDepuis: HIER,
		})
		// Emptied: back to a draft, and the date of `entierementVide` moves.
		expect(etatApresSauvegarde({ avant, apres: {}, maintenant: MAINTENANT })).toMatchObject({
			entierementVide: true,
			entierementVideDepuis: MAINTENANT.toISOString(),
			actifDepuis: HIER,
			statut: 'brouillon',
		})
	})

	test('un document sans date stockée reçoit l’instant de la sauvegarde ; une date en objet est gardée', () => {
		const avant = { ...etatDuProfil({}), statut: 'brouillon', actifDepuis: new Date(HIER) }
		expect(etatApresSauvegarde({ avant, apres: {}, maintenant: MAINTENANT })).toMatchObject({
			actifDepuis: HIER,
			publiableDepuis: MAINTENANT.toISOString(),
			entierementVideDepuis: MAINTENANT.toISOString(),
		})
	})

	test('ce que la requête envoie sur l’état est ignoré : il est recalculé', () => {
		const envoye = {
			completude: 13,
			actif: true,
			publiable: true,
			entierementVide: false,
			actifDepuis: '2020-01-01T00:00:00.000Z',
			statut: 'brouillon',
		}
		expect(etatApresSauvegarde({ apres: envoye, maintenant: MAINTENANT })).toMatchObject({
			completude: 0,
			actif: false,
			publiable: false,
			entierementVide: true,
			actifDepuis: MAINTENANT.toISOString(),
		})
	})
})

describe('les champs de l’état dans la collection des profils', () => {
	const champs = Profils.fields.filter((champ): champ is Field & { name: string } => 'name' in champ)
	const noms = champs.map(({ name }) => name)

	test('la complétude, les trois cases, leurs dates, et le statut choisi par l’admin à côté du statut', () => {
		for (const nom of ['completude', 'actif', 'publiable', 'entierementVide', ...Object.values(DATES_DE_PASSAGE)])
			expect(noms).toContain(nom)
		expect(noms[noms.indexOf('statut') + 1]).toBe('statutChoisi')
	})

	test('aucune API n’écrit l’état ni le statut : création et modification fermées à tous', () => {
		const statut = champs.find(({ name }) => name === 'statut')
		if (!statut) throw new Error('Le champ « statut » manque à la collection des profils.')
		for (const champ of [...CHAMPS_DE_L_ETAT, statut]) {
			const acces = 'access' in champ ? champ.access : undefined
			const nom = 'name' in champ ? champ.name : ''
			for (const operation of ['create', 'update'] as const)
				expect([nom, operation, acces?.[operation]?.({} as never)]).toEqual([nom, operation, false])
		}
	})
})
