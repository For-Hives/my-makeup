/**
 * The rules of the contact form (ticket 158, plan 02 U76), pure: the form, the Server Action and the
 * tests share them. No `next` import, no Payload.
 *
 * - The five fields of the live site, all required, with its limits (100, 100, 254, 30 and 5000
 *   characters). The phone number is optional (ticket 305): left empty, the message goes without it;
 *   typed, it keeps its limit.
 * - The server checks everything before it writes anything: a message that fails a rule creates no
 *   row and sends no mail, whoever called the action.
 * - The sentences are the ones of the live site, word for word, so that the form says the same thing
 *   with or without scripts. The public pages say « vous ».
 */

export const CONTACT_FIELDS = ['prenom', 'nom', 'email', 'telephone', 'message'] as const
export type ContactField = (typeof CONTACT_FIELDS)[number]

/** The longest text of each field: the limits of the live site. */
export const CONTACT_LIMITS: Record<ContactField, number> = {
	prenom: 100,
	nom: 100,
	email: 254,
	telephone: 30,
	message: 5000,
}

/** What the visitor typed, trimmed and checked. */
export type ContactMessage = Record<ContactField, string>

/** One sentence for each field in error. */
export type ContactErrors = Partial<Record<ContactField, string>>

/** The sentence of a field left empty. The phone number has none: it may stay empty (ticket 305). */
const REQUIRED: Record<Exclude<ContactField, 'telephone'>, string> = {
	prenom: 'Le prénom est requis',
	nom: 'Le nom est requis',
	email: 'L’e-mail est invalide',
	message: 'Le message est requis',
}

const NAME_GROUP: Record<ContactField, string> = {
	prenom: 'Le prénom',
	nom: 'Le nom',
	email: 'L’e-mail',
	telephone: 'Le numéro de téléphone',
	message: 'Le message',
}

export const MESSAGE_SENT = 'Le message a bien été envoyé !'
export const MESSAGE_NOT_SAVED =
	'Une erreur s’est produite ! Votre message n’a pas été envoyé. Ce que vous avez écrit est conservé : réessayez dans un instant.'
/** Said when a brake refuses the send (ticket 161): the proxy's 429 and the action's own refusal use the same sentence. */
export const MESSAGE_TOO_MANY_MESSAGES =
	'Vous avez envoyé beaucoup de messages en peu de temps. Ce que vous avez écrit est conservé : patientez un peu, puis réessayez.'
/** Said when the Turnstile check fails (ticket 1000): nothing is stored and what she typed is kept. */
export const MESSAGE_VERIFICATION_FAILED =
	'La vérification anti-robot n’a pas abouti. Ce que vous avez écrit est conservé : réessayez dans un instant.'
/** The trap field of the form (ticket 161): out of sight, never filled by a person. */
export const CONTACT_TRAP_FIELD = 'commentaire'
export const ERRORS_SUMMARY = 'Le message n’a pas été envoyé : corrigez les champs signalés.'

/**
 * One bare address: no space, no second @, none of the characters that make a header value a name, a
 * list or a group (the address is the Reply-To of the mail to the team).
 */
const BARE_ADDRESS = /^[^@\s<>()[\]\\,;:"]+@[^@\s<>()[\]\\,;:"]+$/
const ADDRESS_DOMAIN = /^[^@\s]+@[^@\s]+\.[^@\s.]{2,}$/

export function validAddress(valeur: string): boolean {
	return BARE_ADDRESS.test(valeur) && ADDRESS_DOMAIN.test(valeur)
}

/** A value of the form as text: anything else (a file, a missing field) is an empty text. A NUL is dropped: the database refuses it. */
function text(valeur: unknown): string {
	return typeof valeur === 'string' ? valeur.replaceAll('\u0000', '').trim() : ''
}

/** What the form hands over: a `FormData`, or anything that can give a field by its name. */
export type ContactFormInput = { get: (nom: string) => unknown }

/** Reads the five fields as typed, without checking them: what the form puts back in its fields. */
export function contactFormInput(saisie: ContactFormInput): ContactMessage {
	return {
		prenom: text(saisie.get('prenom')),
		nom: text(saisie.get('nom')),
		email: text(saisie.get('email')),
		telephone: text(saisie.get('telephone')),
		message: text(saisie.get('message')),
	}
}

/** Checks a message. Gives it cleaned, or one sentence per field in error. */
export function validateMessage(
	saisie: ContactFormInput
): { ok: true; message: ContactMessage } | { ok: false; erreurs: ContactErrors } {
	const message = contactFormInput(saisie)
	const errors: ContactErrors = {}
	for (const field of CONTACT_FIELDS) {
		const value = message[field]
		const limit = CONTACT_LIMITS[field]
		if (value === '') {
			if (field !== 'telephone') errors[field] = REQUIRED[field]
		} else if (value.length > limit) errors[field] = `${NAME_GROUP[field]} ne doit pas dépasser ${limit} caractères`
		else if (field === 'email' && !validAddress(value)) errors[field] = REQUIRED.email
	}
	return Object.keys(errors).length === 0 ? { ok: true, message } : { ok: false, erreurs: errors }
}

/** What the Server Action answers, and the form keeps between two sends. */
export type ContactState =
	| { envoye: true }
	| { erreurs: ContactErrors; valeurs: ContactMessage }
	/** The message was not stored (`reseau`: the request itself failed). The typing comes back. */
	| { echec: true; reseau?: true; valeurs: ContactMessage }
	/** A brake refused the send (ticket 161). The typing comes back. */
	| { limite: true; valeurs: ContactMessage }
	/** The anti-robot check (Turnstile) did not pass (ticket 1000). The typing comes back. */
	| { verification: true; valeurs: ContactMessage }
	| null
