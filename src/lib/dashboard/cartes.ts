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

import type { Profile } from '@/payload-types'
import { rayonKm } from '../format-zone'
import { formatPrix } from '../prix'
import { texte } from '../profil/nom-affiche'
import { moisAnnee, periode } from '../profil/vue-publique'
import { dateLongue } from './coordonnees'
import { estDisponible, TEXTE_DISPONIBLE, TEXTE_HORS_RECHERCHE, TEXTE_INDISPONIBLE } from './disponibilite'
import { libelleDeLaCommune } from './localisation'

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
	Profile,
	| 'id'
	| 'firstName'
	| 'lastName'
	| 'artistName'
	| 'specialty'
	| 'description'
	| 'city'
	| 'radiusKm'
	| 'homeService'
	| 'available'
	| 'mainPicture'
	| 'gallery'
	| 'skills'
	| 'courses'
	| 'experiences'
	| 'languages'
	| 'serviceOffers'
	| 'networks'
	| 'contactDetails'
	| 'publicContact'
	| 'consentedAt'
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
	const commune = texte(profil.city?.name)
	const km = rayonKm(profil.radiusKm)
	const domicile = profil.homeService === true ? 'Oui' : profil.homeService === false ? 'Non' : null
	return {
		section: 'localisation',
		titre: 'Localisation',
		lignes: [
			{
				libelle: 'Commune',
				valeur: ou(libelleDeLaCommune({ nom: profil.city?.name, departement: profil.city?.department })),
			},
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
	['website', 'Site web'],
] as const

/** « Oui, depuis le 15 octobre 2026 » when the server dated her choice, « Oui » without a date, else « Non ». */
function affichage(profil: ProfilDeLEspace): string {
	if (profil.publicContact !== true) return 'Non'
	const depuis = dateLongue(profil.consentedAt)
	return depuis === null ? 'Oui' : `Oui, depuis le ${depuis}`
}

/** The cards of a profile, one per section, in the order of the page. */
export function cartesDuProfil(profil: ProfilDeLEspace): Carte[] {
	const reseaux = RESEAUX.flatMap(([cle, libelle]) => {
		const valeur = ou(profil.networks?.[cle])
		return valeur === null ? [] : [{ libelle, valeur }]
	})
	const photos = profil.gallery?.length ?? 0
	return [
		{
			section: 'identite',
			titre: 'Identité',
			lignes: [
				ligne('Prénom', profil.firstName),
				ligne('Nom', profil.lastName),
				ligne('Nom d’artiste', profil.artistName),
				ligne('Spécialité', profil.specialty),
			],
		},
		{ section: 'description', titre: 'Description', lignes: [ligne(undefined, profil.description)] },
		carteLocalisation(profil),
		{
			section: 'disponibilite',
			titre: 'Disponibilité',
			// No value stored (an imported profile) reads « Disponible », as the public list does.
			lignes: estDisponible(profil.available)
				? [{ valeur: TEXTE_DISPONIBLE }]
				: [{ valeur: TEXTE_INDISPONIBLE }, { valeur: TEXTE_HORS_RECHERCHE }],
		},
		{
			section: 'photo',
			titre: 'Photo principale',
			lignes: [{ valeur: profil.mainPicture ? 'Photo ajoutée' : null }],
		},
		{
			section: 'portfolio',
			titre: 'Portfolio',
			lignes: [{ valeur: photos === 0 ? null : photos === 1 ? '1 photo' : `${photos} photos` }],
		},
		{
			section: 'competences',
			titre: 'Compétences',
			lignes: lignesDeListe((profil.skills ?? []).map(({ name }) => ou(name))),
		},
		{
			section: 'formations',
			titre: 'Formations',
			lignes: lignesDeListe(
				(profil.courses ?? []).map(({ diploma, school, graduatedAt }) =>
					rassembler([diploma, school, moisAnnee(graduatedAt)], ' - ')
				)
			),
		},
		{
			section: 'experiences',
			titre: 'Expériences',
			lignes: lignesDeListe(
				(profil.experiences ?? []).map(({ jobTitle, company, city, startDate, endDate }) =>
					rassembler([jobTitle, company, city, periode({ startDate, endDate })], ' - ')
				)
			),
		},
		{
			section: 'langues',
			titre: 'Langues',
			lignes: lignesDeListe((profil.languages ?? []).map(({ name }) => ou(name))),
		},
		{
			section: 'prestations',
			titre: 'Prestations',
			lignes: lignesDeListe(
				(profil.serviceOffers ?? []).map(({ name, priceText, priceFrom }) =>
					rassembler([name, formatPrix({ priceText, priceFrom }).replace(/\n/g, ', ')], ' - ')
				)
			),
		},
		{ section: 'reseaux', titre: 'Réseaux', lignes: reseaux.length > 0 ? reseaux : [{ valeur: null }] },
		{
			section: 'coordonnees',
			titre: 'Coordonnées',
			lignes: [
				ligne('Téléphone', profil.contactDetails?.phone),
				ligne('Email de contact', profil.contactDetails?.email),
				{ libelle: 'Affichées sur ton profil', valeur: affichage(profil) },
			],
		},
	]
}
