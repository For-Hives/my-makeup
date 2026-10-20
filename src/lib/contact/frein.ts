import { mailboxKey } from '../auth/canonical-email'
import { createRateLimit, type RateLimit } from '../auth/rate-limit'
import { estUneAdresseLocale } from '../search/frein'

/**
 * The brakes of the contact form (ticket 161; plan 02 U77), the protection kept for the switch-over,
 * without any third-party service. Two counters, each with its own name (`createRateLimit`):
 * - by client address (`ipClient`): 5 messages an hour;
 * - by mailbox (the hashed canonical form, `mailboxKey`): 20 messages a day, whatever the address
 *   they come from.
 *
 * What is counted is every message that got past the checks of the form, as the sign-up does. A
 * message the checks refuse costs nothing, and neither does the trap field (no row, no mail, no place).
 *
 * Both brakes are also read, without taking a place, by the proxy (`secondesAvantUnMessage`,
 * `secondesAvantUneBoite`), which answers a real 429: a Server Action cannot choose its status. For the
 * mailbox the proxy reads a copy of the body of the request (`emailDuCorps`); the action stays the
 * authoritative check and the only one that takes places.
 *
 * A request that did not come through the proxy of the site (no `X-Forwarded-For`, or a loopback
 * address: development, the bench) is never counted by address, as for the search.
 *
 * No `next` import: read by the proxy, the action and the tests.
 */

export const MESSAGES_PAR_HEURE_ET_ADRESSE = 5
export const MESSAGES_PAR_JOUR_ET_EMAIL = 20

/** The path of the contact page: a Server Action is posted to the page that holds its form. */
export const CHEMIN_DU_CONTACT = '/contact'
/** The path the proxy sends a refused message to. */
export const CHEMIN_DU_REFUS_DE_CONTACT = '/contact/throttled'

export const freinDeContactParAdresse: RateLimit = createRateLimit({
	nom: 'contact-adresse',
	limite: MESSAGES_PAR_HEURE_ET_ADRESSE,
	fenetreMs: 60 * 60 * 1000,
})

export const freinDeContactParEmail: RateLimit = createRateLimit({
	nom: 'contact-email',
	limite: MESSAGES_PAR_JOUR_ET_EMAIL,
	fenetreMs: 24 * 60 * 60 * 1000,
})

export interface FreinsDeContact {
	parAdresse: RateLimit
	parEmail: RateLimit
}

export const FREINS_DE_CONTACT: FreinsDeContact = {
	parAdresse: freinDeContactParAdresse,
	parEmail: freinDeContactParEmail,
}

/** Two brakes with the same numbers and counters of their own (named after `nom`): for a test that must not share the process's. */
export function creerFreinsDeContact(nom: string): FreinsDeContact {
	return {
		parAdresse: createRateLimit({
			nom: `contact-adresse-${nom}`,
			limite: MESSAGES_PAR_HEURE_ET_ADRESSE,
			fenetreMs: 60 * 60 * 1000,
		}),
		parEmail: createRateLimit({
			nom: `contact-email-${nom}`,
			limite: MESSAGES_PAR_JOUR_ET_EMAIL,
			fenetreMs: 24 * 60 * 60 * 1000,
		}),
	}
}

export type DecisionDeContact =
	| { autorise: true }
	| { autorise: false; raison: 'adresse' | 'email'; reessayerDansS: number }

/**
 * Takes a place for this message in both brakes, or says which one refuses. The place taken by address
 * is given back when the mailbox refuses: a refused message is no message.
 */
export function prendreUnePlaceDeContact(
	client: string,
	email: string,
	freins: FreinsDeContact = FREINS_DE_CONTACT,
	maintenant = Date.now()
): DecisionDeContact {
	const compteLAdresse = !estUneAdresseLocale(client)
	if (compteLAdresse) {
		const adresse = freins.parAdresse.prendre(client, maintenant)
		if (!adresse.autorise) return { autorise: false, raison: 'adresse', reessayerDansS: adresse.reessayerDansS }
	}
	const boite = freins.parEmail.prendre(mailboxKey(email), maintenant)
	if (!boite.autorise) {
		if (compteLAdresse) freins.parAdresse.rendre(client, maintenant)
		return { autorise: false, raison: 'email', reessayerDansS: boite.reessayerDansS }
	}
	return { autorise: true }
}

/** Seconds before this client address may send again, or `undefined` when it may. Reads, takes nothing. */
export function secondesAvantUnMessage(
	client: string,
	freins: FreinsDeContact = FREINS_DE_CONTACT,
	maintenant = Date.now()
): number | undefined {
	if (estUneAdresseLocale(client)) return undefined
	const decision = freins.parAdresse.prendre(client, maintenant)
	if (decision.autorise) {
		freins.parAdresse.rendre(client, maintenant)
		return undefined
	}
	return decision.reessayerDansS
}

/** The largest body the proxy reads to find the mailbox: the form holds five short fields. */
const TAILLE_MAX_DU_CORPS = 64 * 1024

/**
 * The email field of a contact POST, whatever the encoding of the action. React prefixes the fields of a
 * Server Action in a multipart body (`1_email` once a state is bound; a plain form posts `email`), so the
 * name is matched by its end. `undefined` when there is none (a test in tests/unit/contact-frein.test.ts and
 * the integration test I34 fail if a change of React's encoding makes the mailbox brake blind).
 */
export function emailDuFormulaire(formulaire: FormData): string | undefined {
	for (const [nom, valeur] of formulaire.entries()) {
		if ((nom === 'email' || nom.endsWith('_email')) && typeof valeur === 'string') return valeur
	}
	return undefined
}

/** Reads the mailbox from a copy of a request. Never throws: a body that cannot be read counts for nothing. */
export async function emailDuCorps(requete: Request): Promise<string | undefined> {
	try {
		const taille = Number(requete.headers.get('content-length') ?? 0)
		if (taille > TAILLE_MAX_DU_CORPS) return undefined
		const type = requete.headers.get('content-type') ?? ''
		if (!type.startsWith('multipart/form-data') && !type.startsWith('application/x-www-form-urlencoded'))
			return undefined
		return emailDuFormulaire(await requete.clone().formData())
	} catch {
		return undefined
	}
}

/** Seconds before this mailbox may send again, or `undefined` when it may. Reads, takes nothing. */
export function secondesAvantUneBoite(
	email: string,
	freins: FreinsDeContact = FREINS_DE_CONTACT,
	maintenant = Date.now()
): number | undefined {
	const cle = mailboxKey(email)
	const decision = freins.parEmail.prendre(cle, maintenant)
	if (decision.autorise) {
		freins.parEmail.rendre(cle, maintenant)
		return undefined
	}
	return decision.reessayerDansS
}

/** Why a contact POST must be refused before the action runs, and for how long: the address first, then the mailbox. */
export async function secondesAvantUnMessageDeCetteRequete(
	requete: Request,
	client: string
): Promise<number | undefined> {
	const adresse = secondesAvantUnMessage(client)
	if (adresse !== undefined) return adresse
	const email = await emailDuCorps(requete)
	return email === undefined ? undefined : secondesAvantUneBoite(email)
}
