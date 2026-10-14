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
		expect(statutApres({ apres: {}, entierementVide: true })).toEqual({ statut: 'brouillon', statutFixe: false })
		expect(statutApres({ apres: { statut: 'brouillon' }, entierementVide: true })).toEqual({
			statut: 'brouillon',
			statutFixe: false,
		})
		expect(statutApres({ apres: { statut: 'brouillon' }, entierementVide: false })).toEqual({
			statut: 'publie',
			statutFixe: false,
		})
	})

	test('sans statut fixé, il suit le profil dans les deux sens', () => {
		const brouillon = { statut: 'brouillon', statutFixe: false } as const
		const publie = { statut: 'publie', statutFixe: false } as const
		expect(statutApres({ avant: brouillon, apres: brouillon, entierementVide: false })).toEqual(publie)
		expect(statutApres({ avant: publie, apres: publie, entierementVide: true })).toEqual(brouillon)
		expect(statutApres({ avant: publie, apres: publie, entierementVide: false })).toEqual(publie)
	})

	test('un profil masqué reste masqué, quoi qu’on enregistre', () => {
		for (const statutFixe of [true, false])
			for (const entierementVide of [true, false]) {
				const masque = { statut: 'masque', statutFixe }
				expect(statutApres({ avant: masque, apres: masque, entierementVide }).statut).toBe('masque')
			}
		// Hidden in this very save, by an admin: fixed as well.
		expect(
			statutApres({
				avant: { statut: 'publie' },
				apres: { statut: 'masque', statutFixe: false },
				entierementVide: false,
			})
		).toEqual({ statut: 'masque', statutFixe: true })
	})

	test('un statut changé par un admin est fixé, et le serveur ne l’écrase plus', () => {
		// An admin puts a filled profile back to draft: the rule would publish it.
		const fixe = statutApres({
			avant: { statut: 'publie', statutFixe: false },
			apres: { statut: 'brouillon', statutFixe: false },
			entierementVide: false,
		})
		expect(fixe).toEqual({ statut: 'brouillon', statutFixe: true })
		expect(statutApres({ avant: fixe, apres: fixe, entierementVide: false })).toEqual(fixe)
		// An admin publishes an empty profile: it stays published.
		const publie = { statut: 'publie', statutFixe: true } as const
		expect(statutApres({ avant: publie, apres: publie, entierementVide: true })).toEqual(publie)
		// Created with another status than the draft: fixed too.
		expect(statutApres({ apres: { statut: 'publie' }, entierementVide: true })).toEqual(publie)
	})

	test('l’admin rend le statut à la règle en décochant « statut fixé », sans changer le statut', () => {
		expect(
			statutApres({
				avant: { statut: 'brouillon', statutFixe: true },
				apres: { statut: 'brouillon', statutFixe: false },
				entierementVide: false,
			})
		).toEqual({ statut: 'publie', statutFixe: false })
		// Changing the status in the same save fixes it again.
		expect(
			statutApres({
				avant: { statut: 'brouillon', statutFixe: true },
				apres: { statut: 'publie', statutFixe: false },
				entierementVide: true,
			})
		).toEqual({ statut: 'publie', statutFixe: true })
	})

	test('un statut inconnu compte comme le brouillon de départ', () => {
		expect(statutApres({ avant: { statut: null }, apres: { statut: 'autre' }, entierementVide: false })).toEqual({
			statut: 'publie',
			statutFixe: false,
		})
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
			statutFixe: false,
		})
	})

	test('une date ne change que quand sa case change de valeur', () => {
		const avant = {
			...etatDuProfil({ specialite: 'Mariage' }),
			actifDepuis: HIER,
			publiableDepuis: HIER,
			entierementVideDepuis: HIER,
			statut: 'publie',
			statutFixe: false,
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

	test('la complétude, les trois cases, leurs dates, et « statut fixé » à côté du statut', () => {
		for (const nom of ['completude', 'actif', 'publiable', 'entierementVide', ...Object.values(DATES_DE_PASSAGE)])
			expect(noms).toContain(nom)
		expect(noms[noms.indexOf('statut') + 1]).toBe('statutFixe')
	})

	test('aucune API n’écrit l’état : création et modification fermées à tous', () => {
		for (const champ of CHAMPS_DE_L_ETAT) {
			const acces = 'access' in champ ? champ.access : undefined
			const nom = 'name' in champ ? champ.name : ''
			for (const operation of ['create', 'update'] as const)
				expect([nom, operation, acces?.[operation]?.({} as never)]).toEqual([nom, operation, false])
		}
	})
})
