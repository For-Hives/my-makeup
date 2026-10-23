import { z } from 'zod'

/**
 * The rules of the sign-up form (ticket 082; plan 02 U24 and U25), one place for the form's hints
 * and for the server, which checks again.
 *
 * - The email is a valid address, 255 characters at most; the server lower-cases it.
 * - The password has 8 characters at least and no rule of composition (AUTH-11: the old rule asked
 *   for a capital, a small letter and a digit). It is never trimmed, and 255 characters at most.
 * - The first name and the last name are free and need not be unique (AUTH-04: « Marie » can sign up
 *   when another « Marie » exists, and three letters are not required). They are trimmed; neither
 *   may be empty. The account keeps « first last » as its name (`accountName`), and her profile starts
 *   with the two (issue 1009): she types her name once.
 * - The terms must be accepted.
 *
 * Each field has one message in French, the first rule it breaks. Every message names the field's
 * problem and what to do, in the tone of the space (« tu »). No `next` import.
 */

export const SIGN_UP_FIELDS = ['prenom', 'nom', 'email', 'password', 'cgu'] as const
export type SignUpField = (typeof SIGN_UP_FIELDS)[number]
export type SignUpErrors = Partial<Record<SignUpField, string>>

export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 255
export const MAX_NAME_LENGTH = 100
export const EMAIL_MAX = 255

export const SIGN_UP_MESSAGES = {
	prenom: {
		vide: 'Indique ton prénom.',
		long: `Ton prénom est trop long (${MAX_NAME_LENGTH} caractères au plus).`,
	},
	nom: { vide: 'Indique ton nom.', long: `Ton nom est trop long (${MAX_NAME_LENGTH} caractères au plus).` },
	email: {
		vide: 'Indique ton adresse email.',
		invalide: 'Cette adresse email n’est pas valide.',
		long: `Ton adresse email est trop longue (${EMAIL_MAX} caractères au plus).`,
	},
	password: {
		vide: 'Choisis un mot de passe.',
		court: `Ton mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`,
		long: `Ton mot de passe est trop long (${MAX_PASSWORD_LENGTH} caractères au plus).`,
	},
	cgu: { refusees: 'Pour t’inscrire, accepte les conditions générales.' },
} as const

const text = (valeur: unknown): string => (typeof valeur === 'string' ? valeur : '')

const schema = z.object({
	prenom: z.string().trim().min(1, SIGN_UP_MESSAGES.prenom.vide).max(MAX_NAME_LENGTH, SIGN_UP_MESSAGES.prenom.long),
	nom: z.string().trim().min(1, SIGN_UP_MESSAGES.nom.vide).max(MAX_NAME_LENGTH, SIGN_UP_MESSAGES.nom.long),
	email: z
		.string()
		.trim()
		.min(1, SIGN_UP_MESSAGES.email.vide)
		.max(EMAIL_MAX, SIGN_UP_MESSAGES.email.long)
		.pipe(z.email(SIGN_UP_MESSAGES.email.invalide)),
	password: z
		.string()
		.min(1, SIGN_UP_MESSAGES.password.vide)
		.min(MIN_PASSWORD_LENGTH, SIGN_UP_MESSAGES.password.court)
		.max(MAX_PASSWORD_LENGTH, SIGN_UP_MESSAGES.password.long),
	cgu: z.literal(true, SIGN_UP_MESSAGES.cgu.refusees),
})

export interface SignUpData {
	prenom: string
	nom: string
	email: string
	password: string
}

export type SignUpValidation = { ok: true; donnees: SignUpData } | { ok: false; erreurs: SignUpErrors }

/** A checkbox sent by a form is « on » (or its value) when checked, and absent otherwise. */
const checked = (valeur: unknown): boolean => valeur === 'on' || valeur === 'true' || valeur === true

/** Checks what the form sent (a `FormData` read field by field, or any record). */
export function validateSignUp(entree: {
	prenom?: unknown
	nom?: unknown
	email?: unknown
	password?: unknown
	cgu?: unknown
}): SignUpValidation {
	const result = schema.safeParse({
		prenom: text(entree.prenom),
		nom: text(entree.nom),
		email: text(entree.email),
		password: text(entree.password),
		cgu: checked(entree.cgu),
	})
	if (result.success) {
		const { prenom: firstName, nom: lastName, email, password } = result.data
		return { ok: true, donnees: { prenom: firstName, nom: lastName, email, password } }
	}
	const errors: SignUpErrors = {}
	for (const problem of result.error.issues) {
		const field = problem.path[0]
		if (typeof field === 'string' && (SIGN_UP_FIELDS as readonly string[]).includes(field)) {
			const known = field as SignUpField
			errors[known] ??= problem.message
		}
	}
	return { ok: false, erreurs: errors }
}

/** The name of the account: « first last ». The slug of her page is made from it. */
export function accountName(data: Pick<SignUpData, 'prenom' | 'nom'>): string {
	return `${data.prenom} ${data.nom}`
}

/** The codes of a sign-up that failed for a reason that is not one field, and what each says. The code « email-deja-pris » is the answer only when the confirmation is off (ticket 083). */
export const SIGN_UP_FAILURE_CODES = [
	'email-deja-pris',
	'email-non-envoye',
	'service-indisponible',
	'trop-de-tentatives',
] as const
export type SignUpFailureCode = (typeof SIGN_UP_FAILURE_CODES)[number]

export const SIGN_UP_FAILURE_MESSAGES: Record<SignUpFailureCode, string> = {
	'email-deja-pris': 'Cette adresse email est déjà utilisée.',
	'email-non-envoye':
		'L’email de confirmation n’a pas pu partir. Ton compte n’est pas créé : réessaie dans un instant.',
	'service-indisponible': 'Le service est momentanément indisponible, réessaie dans quelques minutes.',
	'trop-de-tentatives': 'Trop d’inscriptions depuis cette adresse. Réessaie un peu plus tard, dans une heure au plus.',
}

/**
 * The name of the trap field (ticket 084): a field a person never sees and never fills, so whoever
 * fills it is a script. Its name is not one a browser fills by itself (no « url », « phone »,
 * « company », « address »).
 */
export const TRAP_FIELD = 'commentaire'
