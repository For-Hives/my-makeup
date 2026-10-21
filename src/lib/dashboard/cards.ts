/**
 * The cards of the page of her space (ticket 118): one per section of her profile, each with the
 * value stored or nothing, which the page shows as « à compléter ». Pure functions, no server code:
 * the page and the tests call them.
 *
 * - Only what was stored is shown: a text goes through `texte` (src/lib/profile/display-name.ts), so
 *   « null » and « undefined » are empty, never printed.
 * - The cards hold plain text: they are what the page hands to the browser, never the document of
 *   Payload (no account, no internal field, no token).
 */

import type { Profile } from '@/payload-types'
import { formatZone, radiusKm, zoneCountries } from '../format-zone'
import { formatPrice } from '../price'
import { text } from '../profile/display-name'
import { monthYear, period } from '../profile/public-view'
import { AVAILABLE_TEXT, isAvailable, OUT_OF_SEARCH_TEXT, UNAVAILABLE_TEXT } from './availability'
import { longDate } from './contact-details'
import { cityLabel } from './location'

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
export interface CardRow {
	readonly libelle?: string
	readonly valeur: string | null
}

export interface Card {
	readonly section: Section
	readonly titre: string
	readonly lignes: readonly CardRow[]
}

/** What the cards read of a profile: the fields of the owner, as `payload.find` gives them. */
export type DashboardProfile = Pick<
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
	| 'zoneKind'
	| 'countries'
	| 'town'
	| 'zoneReview'
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

const or = (valeur: unknown): string | null => text(valeur) || null

const row = (libelle: string | undefined, valeur: unknown): CardRow => ({
	...(libelle === undefined ? {} : { libelle }),
	valeur: or(valeur),
})

/** The lines of a list: one per row that says something; a single empty line when none does. */
function listRows(textes: readonly (string | null)[]): CardRow[] {
	const present = textes.flatMap(valeur => (valeur === null ? [] : [{ valeur }]))
	return present.length > 0 ? present : [{ valeur: null }]
}

const gather = (parties: readonly unknown[], separateur: string): string | null =>
	or(parties.map(text).filter(Boolean).join(separateur))

function locationCard(profil: DashboardProfile): Card {
	const cityName = text(profil.city?.name)
	const km = radiusKm(profil.radiusKm)
	const home = profil.homeService === true ? 'Oui' : profil.homeService === false ? 'Non' : null
	// A zone of countries says what the public page says (ticket 266), without the flag: that is for the eye only.
	if (zoneCountries({ zoneKind: profil.zoneKind, countries: profil.countries, city: profil.city?.name }).length > 0) {
		const zone = formatZone({
			city: profil.city?.name,
			radius: profil.radiusKm,
			zoneKind: profil.zoneKind,
			countries: profil.countries,
			town: profil.town,
		})
		return {
			section: 'localisation',
			titre: 'Localisation',
			lignes: [
				{ libelle: 'Zone', valeur: or(zone) },
				{ libelle: 'Se déplace à domicile', valeur: home },
			],
		}
	}
	return {
		section: 'localisation',
		titre: 'Localisation',
		lignes: [
			{
				libelle: 'Commune',
				valeur: or(cityLabel({ nom: profil.city?.name, departement: profil.city?.department })),
			},
			{ libelle: 'Rayon', valeur: km === null ? null : `${km} km` },
			{ libelle: 'Se déplace à domicile', valeur: cityName === '' ? null : home },
		],
	}
}

const NETWORKS = [
	['instagram', 'Instagram'],
	['facebook', 'Facebook'],
	['linkedin', 'LinkedIn'],
	['youtube', 'YouTube'],
	['website', 'Site web'],
] as const

/** « Oui, depuis le 15 octobre 2026 » when the server dated her choice, « Oui » without a date, else « Non ». */
function display(profil: DashboardProfile): string {
	if (profil.publicContact !== true) return 'Non'
	const from = longDate(profil.consentedAt)
	return from === null ? 'Oui' : `Oui, depuis le ${from}`
}

/** The cards of a profile, one per section, in the order of the page. */
export function profileCards(
	profil: DashboardProfile,
	shown?: { photo: unknown; galerie: readonly unknown[] }
): Card[] {
	const networks = NETWORKS.flatMap(([cle, libelle]) => {
		const value = or(profil.networks?.[cle])
		return value === null ? [] : [{ libelle, valeur: value }]
	})
	// Given what her space really shows, a photo marked missing by the import (ticket 275) is not counted.
	const photos = shown === undefined ? (profil.gallery?.length ?? 0) : shown.galerie.length
	const hasMain = shown === undefined ? Boolean(profil.mainPicture) : shown.photo !== null
	return [
		{
			section: 'identite',
			titre: 'Identité',
			lignes: [
				row('Prénom', profil.firstName),
				row('Nom', profil.lastName),
				row('Nom d’artiste', profil.artistName),
				row('Spécialité', profil.specialty),
			],
		},
		{ section: 'description', titre: 'Description', lignes: [row(undefined, profil.description)] },
		locationCard(profil),
		{
			section: 'disponibilite',
			titre: 'Disponibilité',
			// No value stored (an imported profile) reads « Disponible », as the public list does.
			lignes: isAvailable(profil.available)
				? [{ valeur: AVAILABLE_TEXT }]
				: [{ valeur: UNAVAILABLE_TEXT }, { valeur: OUT_OF_SEARCH_TEXT }],
		},
		{
			section: 'photo',
			titre: 'Photo principale',
			lignes: [{ valeur: hasMain ? 'Photo ajoutée' : null }],
		},
		{
			section: 'portfolio',
			titre: 'Portfolio',
			lignes: [{ valeur: photos === 0 ? null : photos === 1 ? '1 photo' : `${photos} photos` }],
		},
		{
			section: 'competences',
			titre: 'Compétences',
			lignes: listRows((profil.skills ?? []).map(({ name }) => or(name))),
		},
		{
			section: 'formations',
			titre: 'Formations',
			lignes: listRows(
				(profil.courses ?? []).map(({ diploma, school, graduatedAt }) =>
					gather([diploma, school, monthYear(graduatedAt)], ' - ')
				)
			),
		},
		{
			section: 'experiences',
			titre: 'Expériences',
			lignes: listRows(
				(profil.experiences ?? []).map(({ jobTitle, company, city, startDate, endDate }) =>
					gather([jobTitle, company, city, period({ startDate, endDate })], ' - ')
				)
			),
		},
		{
			section: 'langues',
			titre: 'Langues',
			lignes: listRows((profil.languages ?? []).map(({ name }) => or(name))),
		},
		{
			section: 'prestations',
			titre: 'Prestations',
			lignes: listRows(
				(profil.serviceOffers ?? []).map(({ name, priceText, priceFrom }) =>
					gather([name, formatPrice({ priceText, priceFrom }).replace(/\n/g, ', ')], ' - ')
				)
			),
		},
		{ section: 'reseaux', titre: 'Réseaux', lignes: networks.length > 0 ? networks : [{ valeur: null }] },
		{
			section: 'coordonnees',
			titre: 'Coordonnées',
			lignes: [
				row('Téléphone', profil.contactDetails?.phone),
				row('Email de contact', profil.contactDetails?.email),
				{ libelle: 'Affichées sur ton profil', valeur: display(profil) },
			],
		},
	]
}
