import type { Payload } from 'payload'
import { contactEmailContent } from '../emails/contact'
import { composerEmail } from '../emails/layout'
import { type Log, NO_RELAY, type SendEmail } from '../emails/send'
import { SITE_ORIGIN } from '../env'
import { CONTACT_TRAP_FIELD, type ContactErrors, type ContactMessage, validateMessage } from './message'
import { CONTACT_RATE_LIMITS, type ContactRateLimits, takeContactSlot } from './rate-limit'
import type { MailState, RequestStatus } from './states'
import { passTurnstileGate, type TurnstileCheck } from './turnstile'

/**
 * A contact message, server side (tickets 158 and 159). No `next` import: the Server Action calls it,
 * and so do the tests.
 *
 * The order is the point:
 * 0. The trap field (ticket 161) is hidden from every person: if it is filled, the answer is the success of
 *    anyone, and nothing is stored, sent or counted.
 * 1. The message is checked. A message that fails a rule creates no row and sends no mail, whoever
 *    called the action.
 *    Then, when Turnstile is set (ticket 1000), the token is verified: a refused, missing or spent token
 *    stores nothing; an outage on Cloudflare's side lets the message through under a tighter brake.
 *    Then the brakes (ticket 161): 5 an hour by client address, 20 a day by mailbox. A refused message is
 *    neither stored nor sent.
 * 2. It is stored in `contact-requests` (`new`, mail `pending`). If the store fails, nothing is sent and
 *    the visitor is told: a message that is not kept is not a message that was sent.
 * 3. The answer goes back, and the mail to the team leaves after it (`apres`: `after` of Next in a Server
 *    Action). The relay is never waited for by the visitor, so a relay that is silent changes nothing
 *    for her. The mail has a deadline of its own (`delaiMs`): past it, the row says `failed`.
 * 4. The row is told how the mail went: `sent` and `forwarded`, or `failed` (also when no relay is set: the
 *    mail did not leave, and an admin sends it again once one is, ticket 224). A mail that fails never
 *    loses the message, and the visitor sees the confirmation all the same.
 *
 * What she typed is never in a log: a failure writes its kind, a word, and nothing that the database
 * or the relay put in its error, which may quote the values.
 */

/** How long the mail to the team is given before the row says `failed`: under the 10 seconds a visitor may wait. */
export const SEND_TIMEOUT_MS = 8_000

/** The two writes the flow makes in `contact-requests`. The real one is `payloadStorage`; a test hands its own. */
export interface RequestStorage {
	creer: (message: ContactMessage) => Promise<number>
	marquer: (id: number, mailStatus: MailState, status?: RequestStatus) => Promise<void>
}

/** The store wired to a Payload instance: the Local API without access control, as the server writes the journal. */
export function payloadStorage(payload: Pick<Payload, 'create' | 'update'>): RequestStorage {
	return {
		creer: async message =>
			(
				await payload.create({
					collection: 'contact-requests',
					data: {
						type: 'contact',
						status: 'new',
						mailStatus: 'pending',
						firstName: message.prenom,
						lastName: message.nom,
						phone: message.telephone === '' ? undefined : message.telephone,
						email: message.email,
						message: message.message,
					},
					depth: 0,
				})
			).id,
		marquer: async (id, mailStatus, status) => {
			await payload.update({
				collection: 'contact-requests',
				id,
				data: { mailStatus, ...(status !== undefined && { status }) },
				depth: 0,
			})
		},
	}
}

export type ContactResult =
	| { ok: true }
	| { ok: false; code: 'donnees-invalides'; erreurs: ContactErrors }
	| { ok: false; code: 'enregistrement-impossible' }
	| { ok: false; code: 'verification-echouee' }
	| { ok: false; code: 'trop-de-messages'; reessayerDansS: number }

export interface ContactInput {
	/** What the form sent. */
	formulaire: { get: (nom: string) => unknown }
	stockage: RequestStorage
	/** The door of the mails of the site. */
	envoyer: SendEmail
	/** The address of the team. */
	destinataire: string
	/** Runs the work after the answer: `after` of Next in a Server Action. A test hands one that waits. */
	apres: (travail: () => Promise<void>) => void
	journal: Log
	delaiMs?: number
	/** The client address as `ipClient` gives it: the key of the brake by address. */
	client: string
	/** The brakes in use; the shared ones by default. */
	freins?: ContactRateLimits
	/** Set when Turnstile is on (ticket 1000): the secret, and for a test a short deadline and brakes of its own. */
	turnstile?: TurnstileCheck
}

/** The kind of a failure, in a word: what a log may keep of an error that may quote what was typed. */
function failureKind(erreur: unknown): string {
	if (typeof erreur === 'object' && erreur !== null) {
		if ('code' in erreur && typeof erreur.code === 'string' && /^[A-Za-z0-9_]{2,30}$/.test(erreur.code))
			return erreur.code
		if ('name' in erreur && typeof erreur.name === 'string' && /^[A-Za-z]{3,40}$/.test(erreur.name)) return erreur.name
	}
	return 'inconnue'
}

/** Resolves with `envoye` or `echec`, or with `delai` once `ms` have passed: the mail is then left to finish alone. */
async function withTimeout(envoi: Promise<'envoye' | 'echec'>, ms: number): Promise<'envoye' | 'echec' | 'delai'> {
	let timer: ReturnType<typeof setTimeout> | undefined
	const timeout = new Promise<'delai'>(fin => {
		timer = setTimeout(() => fin('delai'), ms)
	})
	try {
		return await Promise.race([envoi, timeout])
	} finally {
		clearTimeout(timer)
	}
}

/** What the mail to the team needs: the form and `apres` are the business of the first send only. */
export type DispatchInput = Omit<ContactInput, 'formulaire' | 'apres' | 'client' | 'freins'>

/**
 * Sends the mail to the team and tells the row how it went. Never throws. Gives the state the row was
 * left in: the first send and the re-send of an admin (ticket 163) share it.
 */
export async function dispatch(
	id: number,
	message: ContactMessage,
	{ stockage, envoyer, destinataire, journal, delaiMs = SEND_TIMEOUT_MS }: DispatchInput
): Promise<'envoye' | 'echec'> {
	const mark = async (etat: MailState, statut?: RequestStatus) => {
		try {
			await stockage.marquer(id, etat, statut)
		} catch (error) {
			journal.erreur(
				`L’état de l’email d’un message de contact n’a pas pu être écrit (nature : ${failureKind(error)}).`
			)
		}
	}
	const sending: Promise<'envoye' | 'echec'> = (async () => {
		const email = composerEmail(contactEmailContent(message), SITE_ORIGIN)
		const issue = await envoyer({ a: destinataire, repondreA: message.email, ...email })
		if (issue === NO_RELAY) {
			// Nothing failed, and nothing left: the row must not say « transmise ». An admin sends it again once a relay is set.
			journal.erreur('L’email d’un message de contact n’est pas parti : aucun relais d’envoi n’est réglé.')
			return 'echec' as const
		}
		return 'envoye' as const
	})().catch((erreur: unknown) => {
		// The door already wrote its own line (kind of failure only); this one says which flow it was.
		journal.erreur(`L’email d’un message de contact n’est pas parti (nature : ${failureKind(erreur)}).`)
		return 'echec' as const
	})

	const issue = await withTimeout(sending, delaiMs)
	if (issue === 'envoye') {
		await mark('sent', 'forwarded')
		return 'envoye'
	}
	if (issue === 'echec') {
		await mark('failed')
		return 'echec'
	}
	journal.erreur('L’email d’un message de contact n’est pas parti : le service d’envoi ne répond pas à temps.')
	await mark('failed')
	// A relay that was only slow: if the mail leaves after all, the row says so.
	void sending.then(async fin => {
		if (fin === 'envoye') await mark('sent', 'forwarded')
	})
	return 'echec'
}

export async function saveContactMessage(entrees: ContactInput): Promise<ContactResult> {
	const trap = entrees.formulaire.get(CONTACT_TRAP_FIELD)
	// A script. It is shown the success of a person, which it cannot tell from a real one.
	if (typeof trap === 'string' && trap.trim() !== '') return { ok: true }

	const checked = validateMessage(entrees.formulaire)
	if (!checked.ok) return { ok: false, code: 'donnees-invalides', erreurs: checked.erreurs }

	if (entrees.turnstile) {
		const gate = await passTurnstileGate({
			form: entrees.formulaire,
			turnstile: entrees.turnstile,
			client: entrees.client,
			log: entrees.journal,
			what: 'd’un message de contact',
			noun: 'le message',
		})
		if (!gate.ok) return gate
	}

	const place = takeContactSlot(entrees.client, checked.message.email, entrees.freins ?? CONTACT_RATE_LIMITS)
	if (!place.autorise) return { ok: false, code: 'trop-de-messages', reessayerDansS: place.reessayerDansS }

	let id: number
	try {
		id = await entrees.stockage.creer(checked.message)
	} catch (error) {
		entrees.journal.erreur(`Un message de contact n’a pas pu être enregistré (nature : ${failureKind(error)}).`)
		return { ok: false, code: 'enregistrement-impossible' }
	}

	entrees.apres(async () => void (await dispatch(id, checked.message, entrees)))
	return { ok: true }
}
