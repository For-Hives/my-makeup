import { mailboxKey } from '../auth/canonical-email'
import type { ContactRateLimits } from '../contact/rate-limit'
import { takeContactSlot } from '../contact/rate-limit'
import { passTurnstileGate, type TurnstileCheck } from '../contact/turnstile'
import { composerEmail } from '../emails/layout'
import { quoteArtistEmailContent, quoteClientEmailContent } from '../emails/quote'
import type { Log } from '../emails/send'
import { parisDay } from '../weekly-stats'
import { QUOTE_RATE_LIMITS } from './rate-limit'
import { QUOTE_TRAP_FIELD, type QuoteErrors, type QuoteFormInput, type QuoteRequest, validateQuote } from './request'

/**
 * A quote request, server side (issue 1003). No `next` import: the Server Action calls it, and so do the tests.
 *
 * The order is the point:
 * 0. The trap field is hidden from every person: if it is filled, the answer is the success of anyone, and
 *    nothing is stored, sent or counted.
 * 1. The switch of the site (`QUOTE_REQUESTS`) is checked: off, nothing is stored and nothing is sent, whoever calls.
 * 2. The request is checked. One that fails a rule creates no row and sends no mail.
 *    Then, when Turnstile is set, the token is verified (src/lib/contact/turnstile.ts, the gate of the contact
 *    form); then the brakes (5 an hour by client address, 5 a day by mailbox). A refused request is neither
 *    stored nor sent.
 * 3. The profile is read again by the server: published, reachable, not on pause. The page that showed the
 *    form may be an hour old; it is never trusted.
 * 4. The request is stored (`new`, mail `pending`). If the store fails, nothing is sent and the client is told.
 * 5. The answer goes back, and the mails leave after it (`after`): first to the artist, at the address of her
 *    account, then the acknowledgement to the client. A mail that fails never loses the request: the row says
 *    `failed`, and the artist finds the request in her space all the same.
 *
 * What she typed is never in a log: a failure writes its kind, a word.
 */

/** Where a request goes: the profile and the address of the account of its artist (read now, never kept). */
export interface QuoteTarget {
	profileId: number
	recipient: string | undefined
}

export type QuoteMailState = 'sent' | 'failed'

/** The three things the flow does with the database. The real one is `payloadQuoteStore`. */
export interface QuoteStore {
	/** The profile at this slug if it takes requests now (published, reachable, available), else `null`. */
	target: (slug: string) => Promise<QuoteTarget | null>
	create: (profileId: number, quote: QuoteRequest, consentAt: Date) => Promise<number>
	mark: (id: number, mailStatus: QuoteMailState) => Promise<void>
}

/** The door of the mails, for the flow: one mail ready to leave. Throws when it did not leave. */
export type SendQuoteMail = (email: {
	a: string
	sujet: string
	texte: string
	html: string
	repondreA?: string
}) => Promise<void>

export type QuoteResult =
	| { ok: true }
	| { ok: false; code: 'indisponible' }
	| { ok: false; code: 'donnees-invalides'; errors: QuoteErrors }
	| { ok: false; code: 'verification-echouee' }
	| { ok: false; code: 'trop-de-demandes'; reessayerDansS: number }
	| { ok: false; code: 'enregistrement-impossible' }

export interface QuoteInput {
	form: QuoteFormInput
	/** The slug of the profile the form was on. */
	slug: string
	/** The switch of the site. */
	enabled: boolean
	now: Date
	store: QuoteStore
	send: SendQuoteMail
	/** The address of the site, for the link of the button of the mail to the artist. */
	site: string
	/** Runs the work after the answer: `after` of Next in a Server Action. A test hands one that waits. */
	after: (job: () => Promise<void>) => void
	log: Log
	/** The client address as `ipClient` gives it: the key of the brake by address. */
	client: string
	/** The brakes in use; the shared ones by default. */
	limits?: ContactRateLimits
	/** Set when Turnstile is on: the secret, and for a test brakes of its own. */
	turnstile?: TurnstileCheck
}

/** The kind of a failure, in a word: what a log may keep of an error that may quote what was typed. */
function failureKind(error: unknown): string {
	if (typeof error === 'object' && error !== null) {
		if ('code' in error && typeof error.code === 'string' && /^[A-Za-z0-9_]{2,30}$/.test(error.code)) return error.code
		if ('name' in error && typeof error.name === 'string' && /^[A-Za-z]{3,40}$/.test(error.name)) return error.name
	}
	return 'inconnue'
}

export async function saveQuoteRequest(input: QuoteInput): Promise<QuoteResult> {
	const { form, slug, enabled, now, store, send, site, log, client } = input
	const trap = form.get(QUOTE_TRAP_FIELD)
	// A script. It is shown the success of a person, which it cannot tell from a real one.
	if (typeof trap === 'string' && trap.trim() !== '') return { ok: true }

	if (!enabled) return { ok: false, code: 'indisponible' }

	const checked = validateQuote(form, parisDay(now))
	if (!checked.ok) return { ok: false, code: 'donnees-invalides', errors: checked.errors }
	const quote = checked.quote

	if (input.turnstile) {
		const gate = await passTurnstileGate({
			form,
			turnstile: input.turnstile,
			client,
			log,
			what: 'd’une demande de devis',
			noun: 'la demande',
		})
		if (!gate.ok)
			return gate.code === 'verification-echouee'
				? { ok: false, code: 'verification-echouee' }
				: { ok: false, code: 'trop-de-demandes', reessayerDansS: gate.reessayerDansS }
	}

	const place = takeContactSlot(client, quote.email, input.limits ?? QUOTE_RATE_LIMITS)
	if (!place.autorise) return { ok: false, code: 'trop-de-demandes', reessayerDansS: place.reessayerDansS }

	let target: QuoteTarget | null
	let id: number
	try {
		target = await store.target(slug)
		if (target === null) return { ok: false, code: 'indisponible' }
		id = await store.create(target.profileId, quote, now)
	} catch (error) {
		log.erreur(`Une demande de devis n’a pas pu être enregistrée (nature : ${failureKind(error)}).`)
		return { ok: false, code: 'enregistrement-impossible' }
	}

	const recipient = target.recipient
	input.after(async () => {
		let state: QuoteMailState = 'failed'
		if (recipient === undefined)
			log.erreur('Une demande de devis n’a pas de destinataire : le compte de la maquilleuse n’a pas d’adresse.')
		else {
			try {
				const mail = composerEmail(quoteArtistEmailContent(quote), site)
				await send({ a: recipient, repondreA: quote.email, sujet: mail.sujet, texte: mail.texte, html: mail.html })
				state = 'sent'
			} catch (error) {
				log.erreur(`L’email d’une demande de devis n’est pas parti (nature : ${failureKind(error)}).`)
			}
		}
		try {
			await store.mark(id, state)
		} catch (error) {
			log.erreur(`L’état de l’email d’une demande de devis n’a pas pu être écrit (nature : ${failureKind(error)}).`)
		}
		try {
			const mail = composerEmail(quoteClientEmailContent(), site)
			await send({ a: quote.email, sujet: mail.sujet, texte: mail.texte, html: mail.html })
		} catch (error) {
			log.erreur(`L’accusé d’une demande de devis n’est pas parti (nature : ${failureKind(error)}).`)
		}
	})
	return { ok: true }
}

// The key of the mailbox is the same as the contact form's: one person, one mailbox, whichever form she uses.
export { mailboxKey }
