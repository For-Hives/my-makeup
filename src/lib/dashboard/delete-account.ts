import type { Payload } from 'payload'
import { deleteAccountAndDependents } from '../account/deletion'
import { canonicalEmail } from '../auth/canonical-email'
import { ipClient } from '../auth/client-ip'
import { PASSWORD_RESET_CONTEXT } from '../auth/forgot-payload'
import { createRateLimit } from '../auth/rate-limit'
import { failureCode, MAX_PASSWORD_LENGTH } from '../auth/sign-in'
import { openWithPassword } from '../auth/token'
import { confirmationMode, DELETION_MESSAGES, type DeletionResult, deletionSchema } from './deletion-confirmation'

/**
 * She deletes her account from her space (ticket 141; plan 01 P7.7, AUTH-13; plan 02 E33, I36, I38).
 *
 * - **She confirms by retyping** her password, or her email address when her account holds no
 *   password she knows: the accounts that come from Google or Facebook (`legacyProvider`), whose
 *   password Payload holds is drawn at random. An account that came from Google and later chose a
 *   password still confirms by its address.
 * - **The identity is the session's**, never the request's: the caller hands the account of the
 *   session, this file reads the account again from the database.
 * - **A wrong confirmation deletes nothing** and counts as a failure for the brake: 10 per 15
 *   minutes, by client address AND by account, so that a stolen session cannot guess the password
 *   from many addresses. The brake never touches the sign-in, so nobody is locked out of her
 *   account by it. A place is given back when the failure is ours (the database, the storage).
 * - The deletion is the common cascade (`src/lib/account/deletion.ts`). When the storage fails,
 *   nothing is deleted (I38) and she is told so.
 * - Two requests at once (a key held down, a double click) delete once.
 *
 * No `next` import: the tests load this file too. The Server Action clears the cookie.
 */

/** Wrong confirmations: 10 per address and per 15 minutes, and 10 per account (ticket 141). */
export const deletionRateLimit = createRateLimit({
	nom: 'suppression-compte',
	limite: 10,
	fenetreMs: 15 * 60 * 1000,
})

export interface DeletionEntries {
	payload: Payload
	/** The account of the session. */
	compte: { id: number | string }
	headers: Headers
	saisie: unknown
	frein?: RateLimit
	maintenant?: number
}

type RateLimit = typeof deletionRateLimit

/** True when Payload's own refusal was a 503 raised by the bin. */
const storageOutage = (erreur: unknown): boolean => (erreur as { status?: number } | null)?.status === 503

export async function deleteMyAccount({
	payload,
	compte,
	headers,
	saisie,
	frein = deletionRateLimit,
	maintenant,
}: DeletionEntries): Promise<DeletionResult> {
	const parsed = deletionSchema.safeParse(saisie)
	if (!parsed.success) return { ok: false, message: DELETION_MESSAGES.echec }

	const keys = [`adresse:${ipClient(headers)}`, `compte:${compte.id}`]
	const taken: string[] = []
	const render = () => {
		for (const key of taken) frein.rendre(key, maintenant)
	}
	for (const key of keys) {
		if (!frein.prendre(key, maintenant).autorise) {
			render()
			return { ok: false, message: DELETION_MESSAGES.freine, freine: true }
		}
		taken.push(key)
	}

	try {
		const stored = await payload.findByID({
			collection: 'pros',
			depth: 0,
			disableErrors: true,
			id: compte.id,
			overrideAccess: true,
			select: { email: true, legacyProvider: true },
		})
		// The account is gone (deleted from another tab, or by an admin): her session is no longer one.
		if (stored === null) {
			render()
			return { ok: false, message: DELETION_MESSAGES.session, session: 'expiree' }
		}
		const mode = confirmationMode(stored)
		const correct =
			mode === 'email'
				? canonicalEmail(parsed.data.confirmation) === canonicalEmail(String(stored.email))
				: await isPasswordCorrect(payload, String(stored.email), parsed.data.confirmation)
		if (!correct) return { ok: false, message: DELETION_MESSAGES[mode === 'email' ? 'email' : 'motDePasse'] }
		// The confirmation was right: the places go back, whatever happens next.
		render()
		try {
			await deleteAccountAndDependents(payload, compte.id)
		} catch (error) {
			payload.logger.error(`[suppression] account ${compte.id}: the deletion failed, nothing was deleted`)
			return {
				ok: false,
				message: storageOutage(error) ? DELETION_MESSAGES.stockage : DELETION_MESSAGES.echec,
			}
		}
		return { ok: true }
	} catch (error) {
		if (error instanceof VerificationError) render()
		return { ok: false, message: DELETION_MESSAGES.echec }
	}
}

/** The check of the password could not be made: not her failure. */
export class VerificationError extends Error {}

/**
 * Is this the password of the account? Payload's own sign-in decides, as it does for the form of
 * the sign-in; the token it gives back is dropped, and the account goes right after. An address
 * not confirmed yet answers after the password was checked and found right.
 */
export async function isPasswordCorrect(payload: Payload, email: string, motDePasse: string): Promise<boolean> {
	if (motDePasse === '' || motDePasse.length > MAX_PASSWORD_LENGTH) return false
	try {
		// Marked as no sign-in: the date of the last sign-in stays what it was.
		await openWithPassword(payload, 'pros', { email, password: motDePasse }, { [PASSWORD_RESET_CONTEXT]: true })
		return true
	} catch (error) {
		const code = failureCode(error)
		if (code === 'email-non-confirme') return true
		if (code === 'service-indisponible') throw new VerificationError()
		return false
	}
}
