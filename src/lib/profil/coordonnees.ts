import { z } from 'zod'

/**
 * The networks and the contact details of a profile (ticket 042; docs/migration/SCHEMA.md, §6.5
 * and §9): what the server accepts, and how the consent to show the contact details is traced.
 *
 * The limits are those of the old API (Strapi): 200 characters for a link or an email, 20 for a
 * phone number. The messages are those of the profile form of the old site, word for word
 * (`ModalUpdateSocialMediaProfil.js`, branch main). Nothing else is checked: a value the old site
 * accepted stays valid, and the import never truncates nor corrects one in silence.
 */

export const LONGUEUR_MAX_LIEN = 200
export const LONGUEUR_MAX_EMAIL = 200
export const LONGUEUR_MAX_TELEPHONE = 20

export const MESSAGES_DES_COORDONNEES = {
	lienTropLong: "L'URL ne doit pas dépasser 200 caractères.",
	emailInvalide: 'Veuillez entrer un email valide.',
	emailTropLong: "L'email ne doit pas dépasser 200 caractères.",
	telephoneTropLong: 'Le numéro de téléphone ne doit pas dépasser 20 caractères.',
} as const

type Valeur = string | null | undefined

const vide = (valeur: Valeur): valeur is null | undefined | '' =>
	valeur === null || valeur === undefined || valeur === ''

/** A link to a network or a website: 200 characters at most. The signature of a Payload `validate`. */
export function validerLienDeReseau(valeur: Valeur): true | string {
	if (vide(valeur)) return true
	return valeur.length <= LONGUEUR_MAX_LIEN ? true : MESSAGES_DES_COORDONNEES.lienTropLong
}

/** The phone number of contact: 20 characters at most, as on the old site. */
export function validerTelephone(valeur: Valeur): true | string {
	if (vide(valeur)) return true
	return valeur.length <= LONGUEUR_MAX_TELEPHONE ? true : MESSAGES_DES_COORDONNEES.telephoneTropLong
}

const EMAIL = z.email()

/** The email of contact, not the one of the account: a well-formed address of 200 characters at most. */
export function validerEmailDeContact(valeur: Valeur): true | string {
	if (vide(valeur)) return true
	if (!EMAIL.safeParse(valeur).success) return MESSAGES_DES_COORDONNEES.emailInvalide
	return valeur.length <= LONGUEUR_MAX_EMAIL ? true : MESSAGES_DES_COORDONNEES.emailTropLong
}

/**
 * Who switched `contactPublic` on, as the server records it: the makeup artist herself, an admin
 * on her behalf, or the import, for a profile that showed its contact details on the old site
 * (plan 01 §6.2, « Coordonnées »).
 */
export const SOURCES_DU_CONSENTEMENT = ['maquilleuse', 'admin', 'import'] as const
export type SourceDuConsentement = (typeof SOURCES_DU_CONSENTEMENT)[number]

export const LIBELLES_DES_SOURCES: Record<SourceDuConsentement, string> = {
	maquilleuse: 'La maquilleuse',
	admin: 'Un admin, à sa demande',
	import: 'L’import : coordonnées affichées sur l’ancien site',
}

/** The trace of the consent: when, and who gave it. Both empty while the contact details are closed. */
export interface Consentement {
	consentiLe: string | null
	sourceConsentement: SourceDuConsentement | null
}

/**
 * The trace of the consent after a save, from `contactPublic` before and after it.
 *
 * - Closed: no consent, no date, no source.
 * - Open, and already open before: the trace stays as it was.
 * - Opened by this save: the date of the server, and the source of the account behind the
 *   request (`maquilleuse` or `admin`). A write of the server without an account (the import)
 *   may give its own date and source, for a consent given on the old site; without them, the
 *   date of the server and `import`.
 *
 * `donnees` is what the save would store: an account never writes the trace itself (its fields
 * are closed to every API), so its values there are the stored ones.
 */
export function consentementApres({
	avant,
	donnees,
	compte,
	maintenant,
}: {
	/** `contactPublic` as stored before the save; `undefined` for a creation. */
	avant: boolean | null | undefined
	donnees: { contactPublic?: boolean | null } & Partial<Consentement>
	/** The collection of the account behind the request, if any. */
	compte: 'admins' | 'pros' | undefined
	maintenant: Date
}): Consentement {
	if (donnees.contactPublic !== true) return { consentiLe: null, sourceConsentement: null }
	if (avant === true)
		return { consentiLe: donnees.consentiLe ?? null, sourceConsentement: donnees.sourceConsentement ?? null }
	if (compte !== undefined)
		return {
			consentiLe: maintenant.toISOString(),
			sourceConsentement: compte === 'pros' ? 'maquilleuse' : 'admin',
		}
	return {
		consentiLe: donnees.consentiLe ?? maintenant.toISOString(),
		sourceConsentement: donnees.sourceConsentement ?? 'import',
	}
}
