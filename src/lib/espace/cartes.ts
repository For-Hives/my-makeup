/**
 * The cards of the page of her space (ticket 118): one per section of her profile, each with the
 * value stored or nothing, which the page shows as « à compléter ». Pure functions, no server code:
 * the page and the tests call them.
 *
 * - Only what was stored is shown: a text goes through `texte` (src/lib/profil/nom-affiche.ts), so
 *   « null » and « undefined » are empty, never printed.
 * - The cards hold plain text: they are what the page hands to the browser, never the document of
 *   Payload (no account, no internal field, no token).
 */

import type { Profil } from '@/payload-types'
import { rayonKm } from '../format-zone'
import { formatPrix } from '../prix'
import { texte } from '../profil/nom-affiche'
import { moisAnnee, periode } from '../profil/vue-publique'
import { estDisponible, TEXTE_DISPONIBLE, TEXTE_HORS_RECHERCHE, TEXTE_INDISPONIBLE } from './disponibilite'

/** The sections, in the order of the page. Each one will have its « Modifier » button. */
export const SECTIONS = [
	'identite',
	'description',
	'localisation',
	'disponibilite',
	'photo',
	'portfolio',
	'competences',
	'formations',
	'experiences',
	'langues',
	'prestations',
	'reseaux',
	'coordonnees',
] as const
export type Section = (typeof SECTIONS)[number]

/** One line of a card: its label, if it has one, and its value, or `null` when nothing is stored. */
export interface LigneDeCarte {
	readonly libelle?: string
	readonly valeur: string | null
}

export interface Carte {
	readonly section: Section
	readonly titre: string
	readonly lignes: readonly LigneDeCarte[]
}

/** What the cards read of a profile: the fields of the owner, as `payload.find` gives them. */
export type ProfilDeLEspace = Pick<
	Profil,
	| 'id'
	| 'prenom'
	| 'nom'
	| 'nomArtiste'
	| 'specialite'
	| 'description'
	| 'commune'
	| 'rayonKm'
	| 'aDomicile'
	| 'disponible'
	| 'photoPrincipale'
	| 'galerie'
	| 'competences'
	| 'formations'
	| 'experiences'
	| 'langues'
	| 'prestations'
	| 'reseaux'
	| 'coordonnees'
	| 'contactPublic'
>

const ou = (valeur: unknown): string | null => texte(valeur) || null

const ligne = (libelle: string | undefined, valeur: unknown): LigneDeCarte => ({
	...(libelle === undefined ? {} : { libelle }),
	valeur: ou(valeur),
})

/** The lines of a list: one per row that says something; a single empty line when none does. */
function lignesDeListe(textes: readonly (string | null)[]): LigneDeCarte[] {
	const dits = textes.flatMap(valeur => (valeur === null ? [] : [{ valeur }]))
	return dits.length > 0 ? dits : [{ valeur: null }]
}

const rassembler = (parties: readonly unknown[], separateur: string): string | null =>
	ou(parties.map(texte).filter(Boolean).join(separateur))

function carteLocalisation(profil: ProfilDeLEspace): Carte {
	const commune = texte(profil.commune?.nom)
	const departement = texte(profil.commune?.departement)
	const km = rayonKm(profil.rayonKm)
	const domicile = profil.aDomicile === true ? 'Oui' : profil.aDomicile === false ? 'Non' : null
	return {
		section: 'localisation',
		titre: 'Localisation',
		lignes: [
			{ libelle: 'Commune', valeur: commune === '' ? null : departement ? `${commune} (${departement})` : commune },
			{ libelle: 'Rayon', valeur: km === null ? null : `${km} km` },
			{ libelle: 'Se déplace à domicile', valeur: commune === '' ? null : domicile },
		],
	}
}

const RESEAUX = [
	['instagram', 'Instagram'],
	['facebook', 'Facebook'],
	['linkedin', 'LinkedIn'],
	['youtube', 'YouTube'],
	['siteWeb', 'Site web'],
] as const

/** The cards of a profile, one per section, in the order of the page. */
export function cartesDuProfil(profil: ProfilDeLEspace): Carte[] {
	const reseaux = RESEAUX.flatMap(([cle, libelle]) => {
		const valeur = ou(profil.reseaux?.[cle])
		return valeur === null ? [] : [{ libelle, valeur }]
	})
	const photos = profil.galerie?.length ?? 0
	return [
		{
			section: 'identite',
			titre: 'Identité',
			lignes: [
				ligne('Prénom', profil.prenom),
				ligne('Nom', profil.nom),
				ligne('Nom d’artiste', profil.nomArtiste),
				ligne('Spécialité', profil.specialite),
			],
		},
		{ section: 'description', titre: 'Description', lignes: [ligne(undefined, profil.description)] },
		carteLocalisation(profil),
		{
			section: 'disponibilite',
			titre: 'Disponibilité',
			// No value stored (an imported profile) reads « Disponible », as the public list does.
			lignes: estDisponible(profil.disponible)
				? [{ valeur: TEXTE_DISPONIBLE }]
				: [{ valeur: TEXTE_INDISPONIBLE }, { valeur: TEXTE_HORS_RECHERCHE }],
		},
		{
			section: 'photo',
			titre: 'Photo principale',
			lignes: [{ valeur: profil.photoPrincipale ? 'Photo ajoutée' : null }],
		},
		{
			section: 'portfolio',
			titre: 'Portfolio',
			lignes: [{ valeur: photos === 0 ? null : photos === 1 ? '1 photo' : `${photos} photos` }],
		},
		{
			section: 'competences',
			titre: 'Compétences',
			lignes: lignesDeListe((profil.competences ?? []).map(({ nom }) => ou(nom))),
		},
		{
			section: 'formations',
			titre: 'Formations',
			lignes: lignesDeListe(
				(profil.formations ?? []).map(({ diplome, ecole, obtenuLe }) =>
					rassembler([diplome, ecole, moisAnnee(obtenuLe)], ' - ')
				)
			),
		},
		{
			section: 'experiences',
			titre: 'Expériences',
			lignes: lignesDeListe(
				(profil.experiences ?? []).map(({ poste, entreprise, ville, debut, fin }) =>
					rassembler([poste, entreprise, ville, periode({ debut, fin })], ' - ')
				)
			),
		},
		{
			section: 'langues',
			titre: 'Langues',
			lignes: lignesDeListe((profil.langues ?? []).map(({ nom }) => ou(nom))),
		},
		{
			section: 'prestations',
			titre: 'Prestations',
			lignes: lignesDeListe(
				(profil.prestations ?? []).map(({ nom, prixTexte, prixAPartirDe }) =>
					rassembler([nom, formatPrix({ prixTexte, prixAPartirDe }).replace(/\n/g, ', ')], ' - ')
				)
			),
		},
		{ section: 'reseaux', titre: 'Réseaux', lignes: reseaux.length > 0 ? reseaux : [{ valeur: null }] },
		{
			section: 'coordonnees',
			titre: 'Coordonnées',
			lignes: [
				ligne('Téléphone', profil.coordonnees?.telephone),
				ligne('Email de contact', profil.coordonnees?.email),
				{ libelle: 'Affichées sur ton profil', valeur: profil.contactPublic === true ? 'Oui' : 'Non' },
			],
		},
	]
}
