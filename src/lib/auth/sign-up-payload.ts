import { en } from '@payloadcms/translations/languages/en'
import { fr } from '@payloadcms/translations/languages/fr'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload } from 'payload'
import { alreadyRegisteredEmailContent } from '../emails/already-registered'
import { confirmationEmailContent } from '../emails/confirmation'
import { composerEmail } from '../emails/layout'
import { EmailSendFailed, type SendEmail } from '../emails/send'
import { INITIAL_NAMES_KEY } from '../profile/initial-names'
import { type AccountFound, findAccount } from './account-by-email'
import type { EventCode, Log } from './auth-log'
import { mailboxKey } from './canonical-email'
import { accountName, SIGN_UP_MESSAGES, type SignUpData, type SignUpErrors, type SignUpFailureCode } from './sign-up'
import { MAILBOX_RATE_LIMITS, type MailboxRateLimits, takeMailFor } from './sign-up-rate-limits'

/**
 * The sign-up of a makeup artist, once the form has been checked (tickets 082, 083 and 084).
 *
 * Everything happens in one transaction, the mail included: the account (and, with it, her empty
 * profile and its slug, made by the server), then the confirmation mail through the door of ticket
 * 073. If the mail cannot leave, nothing is kept: no account that nobody can confirm, and the
 * visitor can try again with the same address. Payload's own mail is turned off for this creation
 * (`disableVerificationEmail`), because it links to the admin panel she never opens.
 *
 * - `verifier` true (the default of the site, AUTH_VERIFY): the account starts unconfirmed and the
 *   mail goes with a link that confirms it. False: the account is confirmed at once, no mail leaves.
 * - An address that already has an account, or a Gmail variant of one (dots, `+tag`), is told to
 *   nobody (ticket 083). With the confirmation on, the answer is the one of a new address, down to
 *   the time it takes (a floor, `plancherMs`, applied last); no second account is made; the real
 *   owner reads « tu as déjà un compte » in her mailbox, at most once a minute and 5 a day for a
 *   mailbox. With the confirmation off, a new account is signed in at once and cannot be mistaken
 *   for a refused one, so the honest answer stays.
 * - The journal gets one row with the outcome, outside the transaction.
 *
 * No `next` import.
 */

/** How many times a sign-up is tried when only a collision of slugs stands in its way. */
const MAX_ATTEMPTS = 3

/**
 * The least time a sign-up takes, whatever its outcome. A new address creates an account and sends
 * a mail; a taken one only sends a mail: the floor hides the difference. It must stay above what
 * the slower of the two takes with the relay in use.
 */
export const SIGN_UP_FLOOR_MS = 1500

/**
 * `email-invalide`: Payload refused the form of the address (the form checks it first, so this is a rule
 * the form does not know, ticket 224). The answer is the sentence of the field, under the field.
 */
export type SignUpResult =
	| { ok: true; confirmee: boolean }
	| { ok: false; code: SignUpFailureCode }
	| { ok: false; code: 'email-invalide'; erreurs: SignUpErrors }

/** Why one try failed: a code of the sign-up, or a refusal of the address by its form. */
type AttemptCode = SignUpFailureCode | 'email-invalide'

export interface SignUpInputs {
	payload: Payload
	donnees: SignUpData
	verifier: boolean
	envoyer: SendEmail
	/** The origin the links of the mail are built on: the address of the site. */
	site: string
	journal?: Log
	/** The floor of the duration, in milliseconds. */
	plancherMs?: number
	/** The brakes by mailbox; a test hands its own. */
	freins?: MailboxRateLimits
}

/**
 * The sentences by which Payload says an email is taken: the one of the auth layer and the one of the
 * unique index, in French (the language of the site) and in English (what Payload writes when no
 * translation reaches it). A refusal of the form of the email says none of them.
 */
const UNIQUENESS_PHRASES: ReadonlySet<string> = new Set([
	fr.translations.error.userEmailAlreadyRegistered,
	fr.translations.error.valueMustBeUnique,
	en.translations.error.userEmailAlreadyRegistered,
	en.translations.error.valueMustBeUnique,
])

/** True for any refusal of Payload that names the field `email`. */
function isEmailError(erreur: unknown): boolean {
	const errors = (erreur as { data?: { errors?: { path?: string }[] } } | null)?.data?.errors
	return Array.isArray(errors) && errors.some(({ path }) => path === 'email')
}

/**
 * True for the refusal Payload gives when the email is already the login of another account, and only
 * for it: a refusal on the `email` path that is about its form (« veuillez entrer une adresse valide »)
 * is not « déjà utilisée » (ticket 224).
 */
export function isAddressAlreadyTaken(erreur: unknown): boolean {
	const errors = (erreur as { data?: { errors?: { path?: string; message?: unknown }[] } } | null)?.data?.errors
	return (
		Array.isArray(errors) &&
		errors.some(
			({ path, message }) => path === 'email' && typeof message === 'string' && UNIQUENESS_PHRASES.has(message)
		)
	)
}

export function failureCode(erreur: unknown): AttemptCode {
	if (isAddressAlreadyTaken(erreur)) return 'email-deja-pris'
	if (isEmailError(erreur)) return 'email-invalide'
	if (erreur instanceof EmailSendFailed) return 'email-non-envoye'
	return 'service-indisponible'
}

/** Waits until `instant` (a clock reading in milliseconds); nothing when it is past. */
export const waitUntil = (instant: number): Promise<void> =>
	new Promise(resolve => setTimeout(resolve, Math.max(0, instant - Date.now())))

export async function signUpAccount({
	payload,
	donnees,
	verifier,
	envoyer,
	site,
	journal,
	plancherMs = SIGN_UP_FLOOR_MS,
	freins = MAILBOX_RATE_LIMITS,
}: SignUpInputs): Promise<SignUpResult> {
	const start = Date.now()
	const record = async (code: EventCode) => {
		try {
			await journal?.({ type: 'sign-up', code, durationMs: Date.now() - start, method: 'password' })
		} catch {
			// The journal is not the sign-up's to fail.
		}
	}
	const result = await handle()
	// Last, after the journal: whatever happened, the answer leaves no sooner than the floor.
	await waitUntil(start + plancherMs)
	return result

	async function handle(): Promise<SignUpResult> {
		try {
			const existing = await findAccount(payload, donnees.email)
			if (existing) return await alreadyTaken(existing)
		} catch {
			await record('service-indisponible')
			return { ok: false, code: 'service-indisponible' }
		}
		// Two homonyms who sign up at the same moment compute the same free slug, and the second write
		// breaks the unicity of the slug: the whole transaction is rolled back, and the next try sees the
		// slug taken. The address and the mail are never retried: their refusal is the answer.
		let code: AttemptCode = 'service-indisponible'
		for (let trial = 1; trial <= MAX_ATTEMPTS; trial++) {
			const failure = await attempt()
			if (failure === undefined) {
				// The new address takes a place in the mailbox brakes, exactly as the « déjà un compte » mail
				// of a taken one does: a resend asked right after reads the same answer for both, so the
				// wall cannot be used to tell them apart. The result does not matter, this mail has left.
				if (verifier) takeMailFor(mailboxKey(donnees.email), freins)
				await record('ok')
				return { ok: true, confirmee: !verifier }
			}
			code = failure
			if (code === 'email-deja-pris') {
				// Two sign-ups with the same address at the same moment: the other one won. Told only if
				// the address really has an account now (any other refusal on the email is not that).
				const winner = await findAccount(payload, donnees.email).catch(() => undefined)
				if (winner) return await alreadyTaken(winner)
				code = 'service-indisponible'
			}
			if (code !== 'service-indisponible') break
		}
		if (code === 'email-invalide') {
			// The sentence of the field, the one the form gives for an address it refuses (never Payload's own words).
			await record('donnees-invalides')
			return { ok: false, code, erreurs: { email: SIGN_UP_MESSAGES.email.invalide } }
		}
		await record(code === 'email-non-envoye' ? 'service-indisponible' : code)
		return { ok: false, code }
	}

	/** The address has an account. Neutral when the confirmation is on, honest when it is off. */
	async function alreadyTaken(compte: AccountFound): Promise<SignUpResult> {
		if (!verifier) {
			await record('email-deja-pris')
			return { ok: false, code: 'email-deja-pris' }
		}
		if (takeMailFor(mailboxKey(compte.email), freins).autorise) {
			// An account still waiting for its confirmation gets its link again (she lost the first mail);
			// a confirmed one is told she has an account. The same choice as the resend (`resend.ts`).
			const content =
				!compte.verifie && compte.jeton ? confirmationEmailContent(compte.jeton) : alreadyRegisteredEmailContent()
			try {
				await envoyer({ a: compte.email, ...composerEmail(content, site) })
			} catch (error) {
				// The same refusal as a new address whose mail cannot leave: a relay in trouble splits nothing.
				await record('service-indisponible')
				return { ok: false, code: error instanceof EmailSendFailed ? 'email-non-envoye' : 'service-indisponible' }
			}
		}
		await record('email-deja-pris')
		return { ok: true, confirmee: false }
	}

	/** One try, in its own transaction: nothing when it succeeded, the code of its failure otherwise. */
	async function attempt(): Promise<AttemptCode | undefined> {
		const req = await createLocalReq({}, payload)
		await initTransaction(req)
		try {
			const account = await payload.create({
				collection: 'pros',
				data: { email: donnees.email, password: donnees.password, name: accountName(donnees), _verified: !verifier },
				depth: 0,
				// Her profile starts with the two names she typed (issue 1009).
				context: { [INITIAL_NAMES_KEY]: { firstName: donnees.prenom, lastName: donnees.nom } },
				disableVerificationEmail: true,
				overrideAccess: true,
				req,
			})
			if (verifier) {
				// The token is hidden from every read: the adapter gives it to the server alone.
				const row = await payload.db.findOne<{ id: number; _verificationToken?: string | null }>({
					collection: 'pros',
					req,
					where: { id: { equals: account.id } },
				})
				if (!row?._verificationToken) throw new Error('Le jeton de confirmation manque.')
				await envoyer(
					{ a: donnees.email, ...composerEmail(confirmationEmailContent(row._verificationToken), site) },
					{ context: req.context }
				)
			}
			await commitTransaction(req)
			return undefined
		} catch (error) {
			await killTransaction(req)
			return failureCode(error)
		}
	}
}
