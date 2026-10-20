import { z } from 'zod'

/**
 * The networks and the contact details of a profile (ticket 042; docs/migration/SCHEMA.md, §6.5
 * and §9): what the server accepts, and how the consent to show the contact details is traced.
 *
 * The limits are those of the old API (Strapi): 200 characters for a link or an email, 20 for a
 * phone number. The messages are those of the profile form of the old site, word for word
 * (`ModalUpdateSocialMediaProfil.js`, branch main). One check is new: a link that names a
 * protocol names `http` or `https` (registry, `liens-reseaux-web`). Nothing else is checked: a
 * value the old site accepted stays valid, and the import never truncates nor corrects one in silence.
 */

export const LINK_MAX_LENGTH = 200
export const EMAIL_MAX_LENGTH = 200
export const PHONE_MAX_LENGTH = 20

export const CONTACT_DETAILS_MESSAGES = {
	lienTropLong: "L'URL ne doit pas dépasser 200 caractères.",
	/** New in the v3, not a text of the old site. */
	lienSansProtocoleWeb: 'Ce lien doit commencer par http:// ou https://.',
	emailInvalide: 'Veuillez entrer un email valide.',
	emailTropLong: "L'email ne doit pas dépasser 200 caractères.",
	telephoneTropLong: 'Le numéro de téléphone ne doit pas dépasser 20 caractères.',
} as const

type Value = string | null | undefined

const empty = (valeur: Value): valeur is null | undefined | '' =>
	valeur === null || valeur === undefined || valeur === ''

/** The only protocols a link of a public profile may name: a page of the web. */
const WEB_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * True when the link names a protocol other than `http` or `https` (`javascript:`, `data:`…).
 *
 * The link is read by the URL parser of the platform, the one browsers follow: what it reads as an
 * absolute address is what a browser opens from an `href`, spaces, tabs and capitals included. A
 * link without a protocol (`@pseudo`, `www.example.test`) is not an absolute address: it passes.
 */
function namesAnotherProtocol(lien: string): boolean {
	if (!URL.canParse(lien)) return false
	return !WEB_PROTOCOLS.has(new URL(lien).protocol)
}

/**
 * A link to a network or a website: 200 characters at most, and no protocol but `http` or `https`,
 * since the public profile makes it a link. The signature of a Payload `validate`.
 */
export function validateNetworkLink(valeur: Value): true | string {
	if (empty(valeur)) return true
	if (valeur.length > LINK_MAX_LENGTH) return CONTACT_DETAILS_MESSAGES.lienTropLong
	return namesAnotherProtocol(valeur) ? CONTACT_DETAILS_MESSAGES.lienSansProtocoleWeb : true
}

/** The phone number of contact: 20 characters at most, as on the old site. */
export function validatePhone(valeur: Value): true | string {
	if (empty(valeur)) return true
	return valeur.length <= PHONE_MAX_LENGTH ? true : CONTACT_DETAILS_MESSAGES.telephoneTropLong
}

const EMAIL = z.email()

/** The email of contact, not the one of the account: a well-formed address of 200 characters at most. */
export function validateContactEmail(valeur: Value): true | string {
	if (empty(valeur)) return true
	if (!EMAIL.safeParse(valeur).success) return CONTACT_DETAILS_MESSAGES.emailInvalide
	return valeur.length <= EMAIL_MAX_LENGTH ? true : CONTACT_DETAILS_MESSAGES.emailTropLong
}

/**
 * Who switched `publicContact` on, as the server records it: the makeup artist herself, an admin
 * on her behalf, or the import, for a profile that showed its contact details on the old site
 * (plan 01 §6.2, « Coordonnées »).
 */
export const CONSENT_SOURCES = ['artist', 'admin', 'import'] as const
export type ConsentSource = (typeof CONSENT_SOURCES)[number]

export const SOURCE_LABELS: Record<ConsentSource, string> = {
	artist: 'La maquilleuse',
	admin: 'Un admin, à sa demande',
	import: 'L’import : coordonnées affichées sur l’ancien site',
}

/** The trace of the consent: when, and who gave it. Both empty while the contact details are closed. */
export interface Consent {
	consentedAt: string | null
	consentSource: ConsentSource | null
}

/**
 * The trace of the consent after a save, from `publicContact` before and after it.
 *
 * - Closed: no consent, no date, no source.
 * - Open, and already open before: the trace stays as it was.
 * - Opened by this save: the date of the server, and the source of the account behind the
 *   request (`artist` or `admin`). A write of the server without an account (the import)
 *   may give its own date and source, for a consent given on the old site; without them, the
 *   date of the server and `import`.
 *
 * `donnees` is what the save would store: an account never writes the trace itself (its fields
 * are closed to every API), so its values there are the stored ones.
 */
export function consentAfter({
	avant,
	donnees,
	compte,
	maintenant,
}: {
	/** `publicContact` as stored before the save; `undefined` for a creation. */
	avant: boolean | null | undefined
	donnees: { publicContact?: boolean | null } & Partial<Consent>
	/** The collection of the account behind the request, if any. */
	compte: 'admins' | 'pros' | undefined
	maintenant: Date
}): Consent {
	if (donnees.publicContact !== true) return { consentedAt: null, consentSource: null }
	if (avant === true) return { consentedAt: donnees.consentedAt ?? null, consentSource: donnees.consentSource ?? null }
	if (compte !== undefined)
		return {
			consentedAt: maintenant.toISOString(),
			consentSource: compte === 'pros' ? 'artist' : 'admin',
		}
	return {
		consentedAt: donnees.consentedAt ?? maintenant.toISOString(),
		consentSource: donnees.consentSource ?? 'import',
	}
}

/**
 * A group of the profile sent as `null` (a request that empties it): the group with every field
 * empty. Payload stops with a 500 on a group that is `null` when it reads the fields inside, so
 * the group hook turns it into this before. Anything else is returned as it came, for the checks
 * of the fields to read. The signature of the body of a Payload `beforeValidate` of a group.
 */
export function emptyGroupIfNull(valeur: unknown, champs: readonly string[]): unknown {
	return valeur === null ? Object.fromEntries(champs.map(champ => [champ, null])) : valeur
}
