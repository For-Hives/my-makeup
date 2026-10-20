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
export const NETWORKS_FIELDS = ['instagram', 'facebook', 'youtube', 'linkedin', 'siteWeb'] as const
export type NetworkField = (typeof NETWORKS_FIELDS)[number]

export type NetworksValues = Record<NetworkField, string>

interface Network {
	readonly libelle: string
	/** The name of the network in a sentence, with its article. */
	readonly nom: string
	/** The hosts of its addresses; `www.` is added by the normalisation. `null`: any website. */
	readonly hotes: readonly string[] | null
	/** The host written in a stored address. */
	readonly hotePrincipal: string | null
	readonly exemple: string
}

export const NETWORKS: Readonly<Record<NetworkField, Network>> = {
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

export const NETWORKS_MESSAGES = {
	pasUnTexte: 'Ce champ doit être un texte.',
	tropLong: `Ce lien ne doit pas dépasser ${LONGUEUR_MAX_LIEN} caractères.`,
	illisible: (canal: NetworkField) =>
		canal === 'siteWeb'
			? `Cette adresse n’est pas lisible : colle l’adresse de ton site, par exemple ${NETWORKS.siteWeb.exemple}.`
			: `Ce lien n’est pas lisible : écris ton @pseudo ou colle l’adresse de ta page ${NETWORKS[canal].libelle}.`,
	autreSite: (canal: NetworkField) =>
		`Cette adresse n’est pas celle ${NETWORKS[canal].nom} : colle l’adresse de ta page ${NETWORKS[canal].libelle} ou écris ton @pseudo.`,
	adresseDeSite: 'Ce n’est pas une adresse de site : colle l’adresse de ton site, par exemple https://www.ton-site.fr.',
} as const

/** The host without a leading `www.`, in lower case. */
const withoutWww = (hote: string): string => hote.replace(/^www\./, '')

/** True when the host is the network's own, or one of its subdomains (`fr.linkedin.com`, `m.youtube.com`). */
function isNetwork(hote: string, hotes: readonly string[]): boolean {
	return hotes.some(propre => hote === propre || hote.endsWith(`.${propre}`))
}

export type NormalizationResult = { ok: true; valeur: string } | { ok: false; message: string }

/**
 * The one address stored for what she typed in the field of a network, or the message to show
 * under the field. Empty gives an empty value: it removes the network.
 *
 * A network is stored as `https://`, on its main host (`www.instagram.com`) when she gave the bare
 * or the `www.` one, without a final slash. Its path, query and anchor stay as she pasted them. A
 * website is stored as she typed it, completed with `https://` when it has no protocol.
 */
export function normalizeNetwork(canal: NetworkField, saisie: unknown): NormalizationResult {
	if (typeof saisie !== 'string') return { ok: false, message: NETWORKS_MESSAGES.pasUnTexte }
	const v = texte(saisie)
	if (v === '') return { ok: true, valeur: '' }
	const network = NETWORKS[canal]
	if (canal === 'siteWeb' && v.startsWith('@')) return { ok: false, message: NETWORKS_MESSAGES.adresseDeSite }
	const link = urlReseau(canal === 'siteWeb' ? 'website' : canal, v)
	if (link === null) return { ok: false, message: NETWORKS_MESSAGES.illisible(canal) }
	const address = new URL(link)
	if (address.username !== '' || address.password !== '')
		return { ok: false, message: NETWORKS_MESSAGES.illisible(canal) }
	let value = link
	if (network.hotes === null) {
		// A website: any web address with a real name (« localhost », « 12 » are no site of hers).
		if (!address.hostname.includes('.')) return { ok: false, message: NETWORKS_MESSAGES.adresseDeSite }
		// Written with its protocol, it stays exactly as she wrote it.
		if (/^https?:\/\//i.test(v)) value = v
	} else {
		if (!isNetwork(address.hostname, network.hotes) && !isNetwork(withoutWww(address.hostname), network.hotes))
			return { ok: false, message: NETWORKS_MESSAGES.autreSite(canal) }
		address.protocol = 'https:'
		// Only the bare and the `www.` hosts of the network are written one way; a short link
		// (`youtu.be`, `fb.me`) or a subdomain (`fr.linkedin.com`) stays as it is.
		if (withoutWww(address.hostname) === network.hotes[0] && network.hotePrincipal !== null)
			address.hostname = network.hotePrincipal
		if (address.pathname.length > 1) address.pathname = address.pathname.replace(/\/+$/, '')
		value = address.toString()
		// A bare host has a path of « / » and no more to say: that is no page of the network.
		if (address.pathname === '/' && address.search === '' && address.hash === '')
			return { ok: false, message: NETWORKS_MESSAGES.illisible(canal) }
	}
	if (value.length > LONGUEUR_MAX_LIEN) return { ok: false, message: NETWORKS_MESSAGES.tropLong }
	return { ok: true, valeur: value }
}

const TEXT = z.string({ error: NETWORKS_MESSAGES.pasUnTexte })
const SHAPE = Object.fromEntries(NETWORKS_FIELDS.map(champ => [champ, TEXT])) as Record<NetworkField, typeof TEXT>

/** What the server accepts: the five fields and no other key. */
export const strictNetworksSchema = z.strictObject(SHAPE)

export type NetworksReading =
	| { ok: true; valeurs: NetworksValues }
	| { ok: false; champs: Partial<Record<NetworkField, string>> }

/**
 * Reads the five fields as typed: the normalised values, or the message of each field that does
 * not pass. A missing field is read as empty (the form always sends the five).
 */
export function readNetworks(saisie: Partial<Record<NetworkField, unknown>>): NetworksReading {
	const values = {} as NetworksValues
	const fields: Partial<Record<NetworkField, string>> = {}
	for (const field of NETWORKS_FIELDS) {
		const parsed = normalizeNetwork(field, saisie[field] ?? '')
		if (parsed.ok) values[field] = parsed.valeur
		else fields[field] = parsed.message
	}
	return Object.keys(fields).length > 0 ? { ok: false, champs: fields } : { ok: true, valeurs: values }
}
