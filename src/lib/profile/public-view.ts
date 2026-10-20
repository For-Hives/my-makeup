/**
 * What a public profile page shows, computed from the profile as the public reading gives it
 * (plan 01 §3.2 UI-06): ported from src/lib/profil/vue-publique.js of the old site (branch main),
 * under the field names of the v3. Pure functions, no server code: the page and the tests call them.
 *
 * - No « undefined », « null » nor « Invalid Date » whatever was saved: a text goes through `texte`
 *   (src/lib/profil/nom-affiche.ts), which empties the words « null » and « undefined ».
 * - A section with nothing to show is not shown.
 */

import { lignesDePrix } from '../prix'
import { type NomsDuProfil, nomComplet, texte } from './display-name'

/**
 * The line under the name, when the profile has an artist name of its own: shown only if it differs
 * from the name of the h1 and the profile has a full name (else the artist name is the h1 already).
 * `null` otherwise.
 */
export function nomDArtisteAffiche(profil: NomsDuProfil, nomDuTitre: string): string | null {
	const nomArtiste = texte(profil.artistName)
	return nomArtiste !== '' && nomArtiste !== nomDuTitre && nomComplet(profil) !== '' ? nomArtiste : null
}

/**
 * The non-empty lines of a text typed with line breaks, each one trimmed: a line « null » or
 * « undefined » is empty too. A description is shown one paragraph per line typed.
 */
export function lignes(valeur: unknown): string[] {
	return typeof valeur === 'string' ? valeur.split('\n').flatMap(ligne => texte(ligne) || []) : []
}

/* ------------------------------------------------------------------------------------------
 * Dates
 * ---------------------------------------------------------------------------------------- */

/**
 * « janvier 2020 », read in UTC so the server and the browser agree; '' when the date is empty or
 * invalid. A day of these lists is stored at noon UTC (src/lib/profil/listes.ts), so it stays in its
 * month in every time zone of France.
 */
export function moisAnnee(date: unknown): string {
	if (typeof date !== 'string' || date.trim() === '') return ''
	const jour = new Date(date)
	if (Number.isNaN(jour.getTime())) return ''
	return jour.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/**
 * « janvier 2020 - aujourd’hui », « janvier 2020 - mars 2022 »; '' when the start is unknown (an end
 * alone says nothing).
 */
export function periode(experience: { startDate?: unknown; endDate?: unknown } | null | undefined): string {
	const debut = moisAnnee(experience?.startDate)
	return debut === '' ? '' : `${debut} - ${moisAnnee(experience?.endDate) || 'aujourd’hui'}`
}

/* ------------------------------------------------------------------------------------------
 * Networks and contact details
 * ---------------------------------------------------------------------------------------- */

const CONTIENT_UN_ESPACE = /\s/
const COMMENCE_PAR_HTTP = /^https?:\/\//i
const PSEUDO = /^@?[\w.]{1,30}$/
const ARROBASE = /^@/
const DOMAINE_AVEC_CHEMIN = /^[\w-]+(\.[\w-]+)+(\/\S*)?$/i
const ADRESSE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const TOUT_SAUF_CHIFFRES_ET_PLUS = /[^\d+]/g

/** Where a bare pseudo leads, by network. A website has none: a bare word there is no address. */
const RESEAUX = {
	instagram: 'https://www.instagram.com/',
	facebook: 'https://www.facebook.com/',
	linkedin: 'https://www.linkedin.com/in/',
	youtube: 'https://www.youtube.com/@',
	website: null,
} as const

// « instagram.com » alone is a domain, not a pseudo.
const DOMAINE_SEUL = /^(www\.)?(instagram|facebook|fb|linkedin|youtube)\.com$|^youtu\.be$/i

/**
 * The link of a network or of a website as the artist typed it: an http(s) address as it is, a bare
 * domain with https://, « @pseudo » on the network itself; `null` for anything else (never a
 * `javascript:` nor a relative link).
 */
export function urlReseau(canal: keyof typeof RESEAUX, valeur: unknown): string | null {
	const v = texte(valeur)
	if (v === '' || CONTIENT_UN_ESPACE.test(v)) return null
	const base = RESEAUX[canal]
	let url: string | null = null
	if (COMMENCE_PAR_HTTP.test(v)) url = v
	// « studio.fictif » is an Instagram account, « instagram.com/x » a link.
	else if (base !== null && PSEUDO.test(v) && !DOMAINE_SEUL.test(v)) url = base + v.replace(ARROBASE, '')
	else if (DOMAINE_AVEC_CHEMIN.test(v)) url = `https://${v}`
	if (url === null) return null
	if (!URL.canParse(url)) return null
	const adresse = new URL(url)
	return adresse.protocol === 'http:' || adresse.protocol === 'https:' ? adresse.toString() : null
}

/** The channels a profile shows, in the order of the page. */
export const CANAUX = ['instagram', 'facebook', 'linkedin', 'youtube', 'email', 'phone', 'website'] as const
export type Canal = (typeof CANAUX)[number]

/** The name of a channel, for the link. */
export const LIBELLES_DES_CANAUX: Readonly<Record<Canal, string>> = {
	instagram: 'Instagram',
	facebook: 'Facebook',
	linkedin: 'LinkedIn',
	youtube: 'YouTube',
	email: 'Email',
	phone: 'Téléphone',
	website: 'Site internet',
}

/** A channel the artist published: what she typed, and where it leads, if it leads anywhere. */
export interface LienDeContact {
	canal: Canal
	/** The text of the link: what she typed. */
	libelle: string
	href: string | null
}

function lienDuCanal(canal: Canal, valeur: string): string | null {
	if (canal === 'email') return ADRESSE_EMAIL.test(valeur) ? `mailto:${valeur}` : null
	if (canal === 'phone') {
		const numero = valeur.replace(TOUT_SAUF_CHIFFRES_ET_PLUS, '')
		return numero.length >= 6 ? `tel:${numero}` : null
	}
	return urlReseau(canal, valeur)
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
}): LienDeContact[] {
	const valeurs: Record<Canal, string> = {
		instagram: texte(publies.reseaux?.instagram),
		facebook: texte(publies.reseaux?.facebook),
		linkedin: texte(publies.reseaux?.linkedin),
		youtube: texte(publies.reseaux?.youtube),
		email: texte(publies.email),
		phone: texte(publies.telephone),
		website: texte(publies.reseaux?.website),
	}
	return CANAUX.flatMap(canal => {
		const libelle = valeurs[canal]
		return libelle === '' ? [] : [{ canal, libelle, href: lienDuCanal(canal, libelle) }]
	})
}

/* ------------------------------------------------------------------------------------------
 * The lists
 * ---------------------------------------------------------------------------------------- */

/** An option of an offer, as the page shows it. */
export interface OptionPublique {
	nom: string
	/** One paragraph per line typed. */
	description: string[]
	/** The price, one entry per line (src/lib/prix.ts, `lignesDePrix`). */
	prix: string[]
}

/** An offer of services, as the page shows it. */
export interface PrestationPublique extends OptionPublique {
	options: OptionPublique[]
}

/** A course, as the page shows it. */
export interface FormationPublique {
	diploma: string
	school: string
	/** « juin 2016 », or '' without a date. */
	obtenu: string
	description: string[]
}

/** A professional experience, as the page shows it. */
export interface ExperiencePublique {
	company: string
	jobTitle: string
	city: string
	/** « janvier 2020 - aujourd’hui », or '' without a start. */
	periode: string
	description: string[]
}

type Ligne = Record<string, unknown> | null | undefined

const lignesDe = (valeur: unknown): Ligne[] => (Array.isArray(valeur) ? valeur : [])

function optionPublique(ligne: Ligne): OptionPublique | null {
	const nom = texte(ligne?.name)
	if (nom === '') return null
	return {
		nom,
		description: lignes(ligne?.description),
		prix: lignesDePrix({
			priceFrom: typeof ligne?.priceFrom === 'number' ? ligne.priceFrom : null,
			priceText: typeof ligne?.priceText === 'string' ? ligne.priceText : null,
		}),
	}
}

/** The offers with a name, in the order she gave, each with its options that have a name. */
export function prestations(stockees: unknown): PrestationPublique[] {
	return lignesDe(stockees).flatMap(ligne => {
		const offre = optionPublique(ligne)
		if (offre === null) return []
		return [{ ...offre, options: lignesDe(ligne?.options).flatMap(option => optionPublique(option) ?? []) }]
	})
}

/** The names of a list that has a name per row (skills, languages), blank rows left out. */
export function noms(stockees: unknown): string[] {
	return lignesDe(stockees).flatMap(ligne => texte(ligne?.name) || [])
}

/** The courses with a diploma or a school. */
export function formations(stockees: unknown): FormationPublique[] {
	return lignesDe(stockees).flatMap(ligne => {
		const diploma = texte(ligne?.diploma)
		const school = texte(ligne?.school)
		if (diploma === '' && school === '') return []
		return [{ diploma, school, obtenu: moisAnnee(ligne?.graduatedAt), description: lignes(ligne?.description) }]
	})
}

/** The experiences with a company or a job. */
export function experiences(stockees: unknown): ExperiencePublique[] {
	return lignesDe(stockees).flatMap(ligne => {
		const company = texte(ligne?.company)
		const jobTitle = texte(ligne?.jobTitle)
		if (company === '' && jobTitle === '') return []
		return [
			{
				company,
				jobTitle,
				city: texte(ligne?.city),
				periode: periode(ligne),
				description: lignes(ligne?.description),
			},
		]
	})
}

/** The names a photo of the portfolio is described with: « Réalisation de <nom> (n/N) », n from 1. */
export const altRealisation = (nom: string, rang: number, total: number): string =>
	`Réalisation de ${nom} (${rang}/${total})`
