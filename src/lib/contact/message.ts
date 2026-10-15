/**
 * The rules of the contact form (ticket 158, plan 02 U76), pure: the form, the Server Action and the
 * tests share them. No `next` import, no Payload.
 *
 * - The five fields of the live site, all required, with its limits (100, 100, 254, 30 and 5000
 *   characters). The phone number is required, as it is today.
 * - The server checks everything before it writes anything: a message that fails a rule creates no
 *   row and sends no mail, whoever called the action.
 * - The sentences are the ones of the live site, word for word, so that the form says the same thing
 *   with or without scripts. The public pages say « vous ».
 */

export const CHAMPS_DU_CONTACT = ['prenom', 'nom', 'email', 'telephone', 'message'] as const
export type ChampDuContact = (typeof CHAMPS_DU_CONTACT)[number]

/** The longest text of each field: the limits of the live site. */
export const LIMITES_DU_CONTACT: Record<ChampDuContact, number> = {
	prenom: 100,
	nom: 100,
	email: 254,
	telephone: 30,
	message: 5000,
}

/** What the visitor typed, trimmed and checked. */
export type MessageDeContact = Record<ChampDuContact, string>

/** One sentence for each field in error. */
export type ErreursDeContact = Partial<Record<ChampDuContact, string>>

const REQUIS: Record<ChampDuContact, string> = {
	prenom: 'Le prénom est requis',
	nom: 'Le nom est requis',
	email: 'L’e-mail est invalide',
	telephone: 'Le numéro de téléphone est requis',
	message: 'Le message est requis',
}

const GROUPE_NOMINAL: Record<ChampDuContact, string> = {
	prenom: 'Le prénom',
	nom: 'Le nom',
	email: 'L’e-mail',
	telephone: 'Le numéro de téléphone',
	message: 'Le message',
}

export const MESSAGE_ENVOYE = 'Le message a bien été envoyé !'
export const MESSAGE_NON_ENREGISTRE =
	'Une erreur s’est produite ! Votre message n’a pas été envoyé. Ce que vous avez écrit est conservé : réessayez dans un instant.'
export const RESUME_DES_ERREURS = 'Le message n’a pas été envoyé : corrigez les champs signalés.'

/**
 * One bare address: no space, no second @, none of the characters that make a header value a name, a
 * list or a group (the address is the Reply-To of the mail to the team).
 */
const ADRESSE_NUE = /^[^@\s<>()[\]\\,;:"]+@[^@\s<>()[\]\\,;:"]+$/
const ADRESSE_DOMAINE = /^[^@\s]+@[^@\s]+\.[^@\s.]{2,}$/

function adresseValide(valeur: string): boolean {
	return ADRESSE_NUE.test(valeur) && ADRESSE_DOMAINE.test(valeur)
}

/** A value of the form as text: anything else (a file, a missing field) is an empty text. A NUL is dropped: the database refuses it. */
function texte(valeur: unknown): string {
	return typeof valeur === 'string' ? valeur.replaceAll('\u0000', '').trim() : ''
}

/** What the form hands over: a `FormData`, or anything that can give a field by its name. */
export type SaisieDuContact = { get: (nom: string) => unknown }

/** Reads the five fields as typed, without checking them: what the form puts back in its fields. */
export function saisieDuContact(saisie: SaisieDuContact): MessageDeContact {
	return {
		prenom: texte(saisie.get('prenom')),
		nom: texte(saisie.get('nom')),
		email: texte(saisie.get('email')),
		telephone: texte(saisie.get('telephone')),
		message: texte(saisie.get('message')),
	}
}

/** Checks a message. Gives it cleaned, or one sentence per field in error. */
export function validerLeMessage(
	saisie: SaisieDuContact
): { ok: true; message: MessageDeContact } | { ok: false; erreurs: ErreursDeContact } {
	const message = saisieDuContact(saisie)
	const erreurs: ErreursDeContact = {}
	for (const champ of CHAMPS_DU_CONTACT) {
		const valeur = message[champ]
		const limite = LIMITES_DU_CONTACT[champ]
		if (valeur === '') erreurs[champ] = REQUIS[champ]
		else if (valeur.length > limite)
			erreurs[champ] = `${GROUPE_NOMINAL[champ]} ne doit pas dépasser ${limite} caractères`
		else if (champ === 'email' && !adresseValide(valeur)) erreurs[champ] = REQUIS.email
	}
	return Object.keys(erreurs).length === 0 ? { ok: true, message } : { ok: false, erreurs }
}

/** What the Server Action answers, and the form keeps between two sends. */
export type EtatDuContact =
	| { envoye: true }
	| { erreurs: ErreursDeContact; valeurs: MessageDeContact }
	/** The message was not stored (`reseau`: the request itself failed). The typing comes back. */
	| { echec: true; reseau?: true; valeurs: MessageDeContact }
	| null
