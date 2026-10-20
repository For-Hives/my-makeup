/**
 * What a public profile page shows, computed from the profile as the public reading gives it
 * (plan 01 §3.2 UI-06): ported from src/lib/profil/vue-publique.js of the old site (branch main),
 * under the field names of the v3. Pure functions, no server code: the page and the tests call them.
 *
 * - No « undefined », « null » nor « Invalid Date » whatever was saved: a text goes through `texte`
 *   (src/lib/profile/display-name.ts), which empties the words « null » and « undefined ».
 * - A section with nothing to show is not shown.
 */

import { priceRows } from '../price'
import { fullName, type ProfileNames, text } from './display-name'

/**
 * The line under the name, when the profile has an artist name of its own: shown only if it differs
 * from the name of the h1 and the profile has a full name (else the artist name is the h1 already).
 * `null` otherwise.
 */
export function displayedArtistName(profil: ProfileNames, nomDuTitre: string): string | null {
	const artistName = text(profil.artistName)
	return artistName !== '' && artistName !== nomDuTitre && fullName(profil) !== '' ? artistName : null
}

/**
 * The non-empty lines of a text typed with line breaks, each one trimmed: a line « null » or
 * « undefined » is empty too. A description is shown one paragraph per line typed.
 */
export function rows(valeur: unknown): string[] {
	return typeof valeur === 'string' ? valeur.split('\n').flatMap(ligne => text(ligne) || []) : []
}

/* ------------------------------------------------------------------------------------------
 * Dates
 * ---------------------------------------------------------------------------------------- */

/**
 * « janvier 2020 », read in UTC so the server and the browser agree; '' when the date is empty or
 * invalid. A day of these lists is stored at noon UTC (src/lib/profile/lists.ts), so it stays in its
 * month in every time zone of France.
 */
export function monthYear(date: unknown): string {
	if (typeof date !== 'string' || date.trim() === '') return ''
	const day = new Date(date)
	if (Number.isNaN(day.getTime())) return ''
	return day.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/**
 * « janvier 2020 - aujourd’hui », « janvier 2020 - mars 2022 »; '' when the start is unknown (an end
 * alone says nothing).
 */
export function period(experience: { startDate?: unknown; endDate?: unknown } | null | undefined): string {
	const start = monthYear(experience?.startDate)
	return start === '' ? '' : `${start} - ${monthYear(experience?.endDate) || 'aujourd’hui'}`
}

/* ------------------------------------------------------------------------------------------
 * Networks and contact details
 * ---------------------------------------------------------------------------------------- */

const CONTAINS_SPACE = /\s/
const STARTS_WITH_HTTP = /^https?:\/\//i
const PSEUDO = /^@?[\w.]{1,30}$/
const AT_SIGN = /^@/
const DOMAIN_WITH_PATH = /^[\w-]+(\.[\w-]+)+(\/\S*)?$/i
const EMAIL_ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const NON_PHONE_CHARACTERS = /[^\d+]/g

/** Where a bare pseudo leads, by network. A website has none: a bare word there is no address. */
const NETWORKS = {
	instagram: 'https://www.instagram.com/',
	facebook: 'https://www.facebook.com/',
	linkedin: 'https://www.linkedin.com/in/',
	youtube: 'https://www.youtube.com/@',
	website: null,
} as const

// « instagram.com » alone is a domain, not a pseudo.
const BARE_DOMAIN = /^(www\.)?(instagram|facebook|fb|linkedin|youtube)\.com$|^youtu\.be$/i

/**
 * The link of a network or of a website as the artist typed it: an http(s) address as it is, a bare
 * domain with https://, « @pseudo » on the network itself; `null` for anything else (never a
 * `javascript:` nor a relative link).
 */
export function networkUrl(canal: keyof typeof NETWORKS, valeur: unknown): string | null {
	const v = text(valeur)
	if (v === '' || CONTAINS_SPACE.test(v)) return null
	const base = NETWORKS[canal]
	let url: string | null = null
	if (STARTS_WITH_HTTP.test(v)) url = v
	// « studio.fictif » is an Instagram account, « instagram.com/x » a link.
	else if (base !== null && PSEUDO.test(v) && !BARE_DOMAIN.test(v)) url = base + v.replace(AT_SIGN, '')
	else if (DOMAIN_WITH_PATH.test(v)) url = `https://${v}`
	if (url === null) return null
	if (!URL.canParse(url)) return null
	const parsedUrl = new URL(url)
	return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:' ? parsedUrl.toString() : null
}

/** The channels a profile shows, in the order of the page. */
export const CHANNELS = ['instagram', 'facebook', 'linkedin', 'youtube', 'email', 'phone', 'website'] as const
export type Channel = (typeof CHANNELS)[number]

/** The name of a channel, for the link. */
export const CHANNEL_LABELS: Readonly<Record<Channel, string>> = {
	instagram: 'Instagram',
	facebook: 'Facebook',
	linkedin: 'LinkedIn',
	youtube: 'YouTube',
	email: 'Email',
	phone: 'Téléphone',
	website: 'Site internet',
}

/** A channel the artist published: what she typed, and where it leads, if it leads anywhere. */
export interface ContactLink {
	canal: Channel
	/** The text of the link: what she typed. */
	libelle: string
	href: string | null
}

function channelLink(canal: Channel, valeur: string): string | null {
	if (canal === 'email') return EMAIL_ADDRESS.test(valeur) ? `mailto:${valeur}` : null
	if (canal === 'phone') {
		const number = valeur.replace(NON_PHONE_CHARACTERS, '')
		return number.length >= 6 ? `tel:${number}` : null
	}
	return networkUrl(canal, valeur)
}

/**
 * The channels she published, in the order of the page. The networks are public; the telephone and the
 * email arrive here only when the public reading gave them (she chose to publish them), so this
 * function never decides that.
 */
export function contacts(publies: {
	reseaux?: { instagram?: unknown; facebook?: unknown; linkedin?: unknown; youtube?: unknown; website?: unknown } | null
	telephone?: unknown
	email?: unknown
}): ContactLink[] {
	const values: Record<Channel, string> = {
		instagram: text(publies.reseaux?.instagram),
		facebook: text(publies.reseaux?.facebook),
		linkedin: text(publies.reseaux?.linkedin),
		youtube: text(publies.reseaux?.youtube),
		email: text(publies.email),
		phone: text(publies.telephone),
		website: text(publies.reseaux?.website),
	}
	return CHANNELS.flatMap(canal => {
		const label = values[canal]
		return label === '' ? [] : [{ canal, libelle: label, href: channelLink(canal, label) }]
	})
}

/* ------------------------------------------------------------------------------------------
 * The lists
 * ---------------------------------------------------------------------------------------- */

/** An option of an offer, as the page shows it. */
export interface PublicOption {
	nom: string
	/** One paragraph per line typed. */
	description: string[]
	/** The price, one entry per line (src/lib/price.ts, `priceRows`). */
	prix: string[]
}

/** An offer of services, as the page shows it. */
export interface PublicServiceOffer extends PublicOption {
	options: PublicOption[]
}

/** A course, as the page shows it. */
export interface PublicCourse {
	diploma: string
	school: string
	/** « juin 2016 », or '' without a date. */
	obtenu: string
	description: string[]
}

/** A professional experience, as the page shows it. */
export interface PublicExperience {
	company: string
	jobTitle: string
	city: string
	/** « janvier 2020 - aujourd’hui », or '' without a start. */
	periode: string
	description: string[]
}

type Row = Record<string, unknown> | null | undefined

const rowsOf = (valeur: unknown): Row[] => (Array.isArray(valeur) ? valeur : [])

function publicOption(ligne: Row): PublicOption | null {
	const name = text(ligne?.name)
	if (name === '') return null
	return {
		nom: name,
		description: rows(ligne?.description),
		prix: priceRows({
			priceFrom: typeof ligne?.priceFrom === 'number' ? ligne.priceFrom : null,
			priceText: typeof ligne?.priceText === 'string' ? ligne.priceText : null,
		}),
	}
}

/** The offers with a name, in the order she gave, each with its options that have a name. */
export function serviceOffers(stockees: unknown): PublicServiceOffer[] {
	return rowsOf(stockees).flatMap(ligne => {
		const offer = publicOption(ligne)
		if (offer === null) return []
		return [{ ...offer, options: rowsOf(ligne?.options).flatMap(option => publicOption(option) ?? []) }]
	})
}

/** The names of a list that has a name per row (skills, languages), blank rows left out. */
export function names(stockees: unknown): string[] {
	return rowsOf(stockees).flatMap(ligne => text(ligne?.name) || [])
}

/** The courses with a diploma or a school. */
export function courses(stockees: unknown): PublicCourse[] {
	return rowsOf(stockees).flatMap(ligne => {
		const diploma = text(ligne?.diploma)
		const school = text(ligne?.school)
		if (diploma === '' && school === '') return []
		return [{ diploma, school, obtenu: monthYear(ligne?.graduatedAt), description: rows(ligne?.description) }]
	})
}

/** The experiences with a company or a job. */
export function experiences(stockees: unknown): PublicExperience[] {
	return rowsOf(stockees).flatMap(ligne => {
		const company = text(ligne?.company)
		const jobTitle = text(ligne?.jobTitle)
		if (company === '' && jobTitle === '') return []
		return [
			{
				company,
				jobTitle,
				city: text(ligne?.city),
				periode: period(ligne),
				description: rows(ligne?.description),
			},
		]
	})
}

/** The names a photo of the portfolio is described with: « Réalisation de <nom> (n/N) », n from 1. */
export const altWork = (nom: string, rang: number, total: number): string => `Réalisation de ${nom} (${rang}/${total})`
