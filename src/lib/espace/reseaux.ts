/**
 * The networks and the website of a makeup artist, as she edits them in her space (ticket 125;
 * plan 02 U28, E30, E31): Instagram, Facebook, YouTube, LinkedIn and a website. One module, read by
 * the form in the browser and by the server action, so the two never disagree.
 *
 * - What she types is « @pseudo », a bare pseudo or an address. `normaliserReseau` turns it into
 *   the one address that is stored, so « @studio.fictif » and « https://www.instagram.com/studio.fictif »
 *   give the same value (U28). Normalising a normalised value changes nothing.
 * - An address that belongs to another site is refused under its field (E30): the field of
 *   Instagram holds an Instagram address. The website field holds any web address.
 * - An empty field removes the network (the value stored is nothing).
 * - The server reads the strict schema: a key that is not one of the five fields refuses the whole request.
 * - A link to a network is a channel of contact (src/lib/profil/completude.ts): the card says so.
 * - Every message is in French, under the field it is about.
 */

import { z } from 'zod'
import { LONGUEUR_MAX_LIEN } from '../profil/coordonnees'
import { texte } from '../profil/nom-affiche'
import { urlReseau } from '../profil/vue-publique'

/** The five fields, in display order. `siteWeb` is the key of the collection. */
export const CHAMPS_DES_RESEAUX = ['instagram', 'facebook', 'youtube', 'linkedin', 'siteWeb'] as const
export type ChampDeReseau = (typeof CHAMPS_DES_RESEAUX)[number]

export type ValeursDesReseaux = Record<ChampDeReseau, string>

interface Reseau {
	readonly libelle: string
	/** The name of the network in a sentence, with its article. */
	readonly nom: string
	/** The hosts of its addresses; `www.` is added by the normalisation. `null`: any website. */
	readonly hotes: readonly string[] | null
	/** The host written in a stored address. */
	readonly hotePrincipal: string | null
	readonly exemple: string
}

export const RESEAUX: Readonly<Record<ChampDeReseau, Reseau>> = {
	instagram: {
		libelle: 'Instagram',
		nom: 'd’Instagram',
		hotes: ['instagram.com'],
		hotePrincipal: 'www.instagram.com',
		exemple: '@ton.pseudo',
	},
	facebook: {
		libelle: 'Facebook',
		nom: 'de Facebook',
		hotes: ['facebook.com', 'fb.com', 'fb.me'],
		hotePrincipal: 'www.facebook.com',
		exemple: 'https://www.facebook.com/ta.page',
	},
	youtube: {
		libelle: 'YouTube',
		nom: 'de YouTube',
		hotes: ['youtube.com', 'youtu.be'],
		hotePrincipal: 'www.youtube.com',
		exemple: '@ta.chaine',
	},
	linkedin: {
		libelle: 'LinkedIn',
		nom: 'de LinkedIn',
		hotes: ['linkedin.com'],
		hotePrincipal: 'www.linkedin.com',
		exemple: 'https://www.linkedin.com/in/ton-profil',
	},
	siteWeb: {
		libelle: 'Site web',
		nom: 'd’un site web',
		hotes: null,
		hotePrincipal: null,
		exemple: 'https://www.ton-site.fr',
	},
}

export const MESSAGES_DES_RESEAUX = {
	pasUnTexte: 'Ce champ doit être un texte.',
	tropLong: `Ce lien ne doit pas dépasser ${LONGUEUR_MAX_LIEN} caractères.`,
	illisible: (canal: ChampDeReseau) =>
		canal === 'siteWeb'
			? `Cette adresse n’est pas lisible : colle l’adresse de ton site, par exemple ${RESEAUX.siteWeb.exemple}.`
			: `Ce lien n’est pas lisible : écris ton @pseudo ou colle l’adresse de ta page ${RESEAUX[canal].libelle}.`,
	autreSite: (canal: ChampDeReseau) =>
		`Cette adresse n’est pas celle ${RESEAUX[canal].nom} : colle l’adresse de ta page ${RESEAUX[canal].libelle} ou écris ton @pseudo.`,
	adresseDeSite: 'Ce n’est pas une adresse de site : colle l’adresse de ton site, par exemple https://www.ton-site.fr.',
} as const

/** The host without a leading `www.`, in lower case. */
const sansWww = (hote: string): string => hote.replace(/^www\./, '')

/** True when the host is the network's own, or one of its subdomains (`fr.linkedin.com`, `m.youtube.com`). */
function estDuReseau(hote: string, hotes: readonly string[]): boolean {
	return hotes.some(propre => hote === propre || hote.endsWith(`.${propre}`))
}

export type ResultatDeNormalisation = { ok: true; valeur: string } | { ok: false; message: string }

/**
 * The one address stored for what she typed in the field of a network, or the message to show
 * under the field. Empty gives an empty value: it removes the network.
 *
 * A network is stored as `https://`, on its main host (`www.instagram.com`) when she gave the bare
 * or the `www.` one, without a final slash. Its path, query and anchor stay as she pasted them. A
 * website is stored as she typed it, completed with `https://` when it has no protocol.
 */
export function normaliserReseau(canal: ChampDeReseau, saisie: unknown): ResultatDeNormalisation {
	if (typeof saisie !== 'string') return { ok: false, message: MESSAGES_DES_RESEAUX.pasUnTexte }
	const v = texte(saisie)
	if (v === '') return { ok: true, valeur: '' }
	const reseau = RESEAUX[canal]
	if (canal === 'siteWeb' && v.startsWith('@')) return { ok: false, message: MESSAGES_DES_RESEAUX.adresseDeSite }
	const lien = urlReseau(canal === 'siteWeb' ? 'website' : canal, v)
	if (lien === null) return { ok: false, message: MESSAGES_DES_RESEAUX.illisible(canal) }
	const adresse = new URL(lien)
	if (adresse.username !== '' || adresse.password !== '')
		return { ok: false, message: MESSAGES_DES_RESEAUX.illisible(canal) }
	let valeur = lien
	if (reseau.hotes === null) {
		// A website: any web address with a real name (« localhost », « 12 » are no site of hers).
		if (!adresse.hostname.includes('.')) return { ok: false, message: MESSAGES_DES_RESEAUX.adresseDeSite }
		// Written with its protocol, it stays exactly as she wrote it.
		if (/^https?:\/\//i.test(v)) valeur = v
	} else {
		if (!estDuReseau(adresse.hostname, reseau.hotes) && !estDuReseau(sansWww(adresse.hostname), reseau.hotes))
			return { ok: false, message: MESSAGES_DES_RESEAUX.autreSite(canal) }
		adresse.protocol = 'https:'
		// Only the bare and the `www.` hosts of the network are written one way; a short link
		// (`youtu.be`, `fb.me`) or a subdomain (`fr.linkedin.com`) stays as it is.
		if (sansWww(adresse.hostname) === reseau.hotes[0] && reseau.hotePrincipal !== null)
			adresse.hostname = reseau.hotePrincipal
		if (adresse.pathname.length > 1) adresse.pathname = adresse.pathname.replace(/\/+$/, '')
		valeur = adresse.toString()
		// A bare host has a path of « / » and no more to say: that is no page of the network.
		if (adresse.pathname === '/' && adresse.search === '' && adresse.hash === '')
			return { ok: false, message: MESSAGES_DES_RESEAUX.illisible(canal) }
	}
	if (valeur.length > LONGUEUR_MAX_LIEN) return { ok: false, message: MESSAGES_DES_RESEAUX.tropLong }
	return { ok: true, valeur }
}

const TEXTE = z.string({ error: MESSAGES_DES_RESEAUX.pasUnTexte })
const FORME = Object.fromEntries(CHAMPS_DES_RESEAUX.map(champ => [champ, TEXTE])) as Record<ChampDeReseau, typeof TEXTE>

/** What the server accepts: the five fields and no other key. */
export const schemaDesReseauxStrict = z.strictObject(FORME)

export type LectureDesReseaux =
	| { ok: true; valeurs: ValeursDesReseaux }
	| { ok: false; champs: Partial<Record<ChampDeReseau, string>> }

/**
 * Reads the five fields as typed: the normalised values, or the message of each field that does
 * not pass. A missing field is read as empty (the form always sends the five).
 */
export function lireLesReseaux(saisie: Partial<Record<ChampDeReseau, unknown>>): LectureDesReseaux {
	const valeurs = {} as ValeursDesReseaux
	const champs: Partial<Record<ChampDeReseau, string>> = {}
	for (const champ of CHAMPS_DES_RESEAUX) {
		const lue = normaliserReseau(champ, saisie[champ] ?? '')
		if (lue.ok) valeurs[champ] = lue.valeur
		else champs[champ] = lue.message
	}
	return Object.keys(champs).length > 0 ? { ok: false, champs } : { ok: true, valeurs }
}
