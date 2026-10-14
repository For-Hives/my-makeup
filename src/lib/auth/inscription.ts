import { z } from 'zod'

/**
 * The rules of the sign-up form (ticket 082; plan 02 U24 and U25), one place for the form's hints
 * and for the server, which checks again.
 *
 * - The email is a valid address, 255 characters at most; the server lower-cases it.
 * - The password has 8 characters at least and no rule of composition (AUTH-11: the old rule asked
 *   for a capital, a small letter and a digit). It is never trimmed, and 255 characters at most.
 * - The name is free and need not be unique (AUTH-04: « Marie » can sign up when another « Marie »
 *   exists, and three letters are not required). It is trimmed; it must not be empty.
 * - The terms must be accepted.
 *
 * Each field has one message in French, the first rule it breaks. Every message names the field's
 * problem and what to do, in the tone of the space (« tu »). No `next` import.
 */

export const CHAMPS_INSCRIPTION = ['nom', 'email', 'password', 'cgu'] as const
export type ChampInscription = (typeof CHAMPS_INSCRIPTION)[number]
export type ErreursInscription = Partial<Record<ChampInscription, string>>

export const MOT_DE_PASSE_MIN = 8
export const MOT_DE_PASSE_MAX = 255
export const NOM_MAX = 100
export const EMAIL_MAX = 255

export const MESSAGES_INSCRIPTION = {
	nom: { vide: 'Indique ton nom.', long: `Ton nom est trop long (${NOM_MAX} caractères au plus).` },
	email: {
		vide: 'Indique ton adresse email.',
		invalide: 'Cette adresse email n’est pas valide.',
		long: `Ton adresse email est trop longue (${EMAIL_MAX} caractères au plus).`,
	},
	password: {
		vide: 'Choisis un mot de passe.',
		court: `Ton mot de passe doit faire au moins ${MOT_DE_PASSE_MIN} caractères.`,
		long: `Ton mot de passe est trop long (${MOT_DE_PASSE_MAX} caractères au plus).`,
	},
	cgu: { refusees: 'Pour t’inscrire, accepte les conditions générales.' },
} as const

const texte = (valeur: unknown): string => (typeof valeur === 'string' ? valeur : '')

const schema = z.object({
	nom: z.string().trim().min(1, MESSAGES_INSCRIPTION.nom.vide).max(NOM_MAX, MESSAGES_INSCRIPTION.nom.long),
	email: z
		.string()
		.trim()
		.min(1, MESSAGES_INSCRIPTION.email.vide)
		.max(EMAIL_MAX, MESSAGES_INSCRIPTION.email.long)
		.pipe(z.email(MESSAGES_INSCRIPTION.email.invalide)),
	password: z
		.string()
		.min(1, MESSAGES_INSCRIPTION.password.vide)
		.min(MOT_DE_PASSE_MIN, MESSAGES_INSCRIPTION.password.court)
		.max(MOT_DE_PASSE_MAX, MESSAGES_INSCRIPTION.password.long),
	cgu: z.literal(true, MESSAGES_INSCRIPTION.cgu.refusees),
})

export interface DonneesInscription {
	nom: string
	email: string
	password: string
}

export type ValidationInscription =
	| { ok: true; donnees: DonneesInscription }
	| { ok: false; erreurs: ErreursInscription }

/** A checkbox sent by a form is « on » (or its value) when checked, and absent otherwise. */
const coche = (valeur: unknown): boolean => valeur === 'on' || valeur === 'true' || valeur === true

/** Checks what the form sent (a `FormData` read field by field, or any record). */
export function validerInscription(entree: {
	nom?: unknown
	email?: unknown
	password?: unknown
	cgu?: unknown
}): ValidationInscription {
	const resultat = schema.safeParse({
		nom: texte(entree.nom),
		email: texte(entree.email),
		password: texte(entree.password),
		cgu: coche(entree.cgu),
	})
	if (resultat.success) {
		const { nom, email, password } = resultat.data
		return { ok: true, donnees: { nom, email, password } }
	}
	const erreurs: ErreursInscription = {}
	for (const probleme of resultat.error.issues) {
		const champ = probleme.path[0]
		if (typeof champ === 'string' && (CHAMPS_INSCRIPTION as readonly string[]).includes(champ)) {
			const connu = champ as ChampInscription
			erreurs[connu] ??= probleme.message
		}
	}
	return { ok: false, erreurs }
}

/** The codes of a sign-up that failed for a reason that is not one field, and what each says. */
export const CODES_ECHEC_INSCRIPTION = ['email-deja-pris', 'email-non-envoye', 'service-indisponible'] as const
export type CodeEchecInscription = (typeof CODES_ECHEC_INSCRIPTION)[number]

export const MESSAGES_ECHEC_INSCRIPTION: Record<CodeEchecInscription, string> = {
	'email-deja-pris': 'Cette adresse email est déjà utilisée.',
	'email-non-envoye':
		'L’email de confirmation n’a pas pu partir. Ton compte n’est pas créé : réessaie dans un instant.',
	'service-indisponible': 'Le service est momentanément indisponible, réessaie dans quelques minutes.',
}
