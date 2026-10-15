import type { Payload } from 'payload'
import { codeDeLEchec, MOT_DE_PASSE_MAX } from '../auth/connexion'
import { emailCanonique } from '../auth/email-canonique'
import { creerFrein } from '../auth/frein'
import { ipClient } from '../auth/ip-client'
import { ouvrirParMotDePasse } from '../auth/jeton'
import { supprimerLeCompteEtToutCeQuiEnDepend } from '../compte/suppression'
import {
	MESSAGES_DE_SUPPRESSION,
	modeDeConfirmation,
	type ResultatDeLaSuppression,
	schemaDeLaSuppression,
} from './confirmation-suppression'

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
 * - The deletion is the common cascade (`src/lib/compte/suppression.ts`). When the storage fails,
 *   nothing is deleted (I38) and she is told so.
 * - Two requests at once (a key held down, a double click) delete once.
 *
 * No `next` import: the tests load this file too. The Server Action clears the cookie.
 */

/** Wrong confirmations: 10 per address and per 15 minutes, and 10 per account (ticket 141). */
export const freinDeLaSuppression = creerFrein({ nom: 'suppression-compte', limite: 10, fenetreMs: 15 * 60 * 1000 })

export interface EntreesDeLaSuppression {
	payload: Payload
	/** The account of the session. */
	compte: { id: number | string }
	headers: Headers
	saisie: unknown
	frein?: Frein
	maintenant?: number
}

type Frein = typeof freinDeLaSuppression

/** True when Payload's own refusal was a 503 raised by the bin. */
const panneDuStockage = (erreur: unknown): boolean => (erreur as { status?: number } | null)?.status === 503

export async function supprimerMonCompte({
	payload,
	compte,
	headers,
	saisie,
	frein = freinDeLaSuppression,
	maintenant,
}: EntreesDeLaSuppression): Promise<ResultatDeLaSuppression> {
	const lue = schemaDeLaSuppression.safeParse(saisie)
	if (!lue.success) return { ok: false, message: MESSAGES_DE_SUPPRESSION.echec }

	const cles = [`adresse:${ipClient(headers)}`, `compte:${compte.id}`]
	const prises: string[] = []
	const rendre = () => {
		for (const cle of prises) frein.rendre(cle, maintenant)
	}
	for (const cle of cles) {
		if (!frein.prendre(cle, maintenant).autorise) {
			rendre()
			return { ok: false, message: MESSAGES_DE_SUPPRESSION.freine, freine: true }
		}
		prises.push(cle)
	}

	try {
		const stocke = await payload.findByID({
			collection: 'pros',
			depth: 0,
			disableErrors: true,
			id: compte.id,
			overrideAccess: true,
			select: { email: true, legacyProvider: true },
		})
		// The account is gone (deleted from another tab, or by an admin): her session is no longer one.
		if (stocke === null) {
			rendre()
			return { ok: false, message: MESSAGES_DE_SUPPRESSION.session, session: 'expiree' }
		}
		const mode = modeDeConfirmation(stocke)
		const juste =
			mode === 'email'
				? emailCanonique(lue.data.confirmation) === emailCanonique(String(stocke.email))
				: await motDePasseJuste(payload, String(stocke.email), lue.data.confirmation)
		if (!juste) return { ok: false, message: MESSAGES_DE_SUPPRESSION[mode === 'email' ? 'email' : 'motDePasse'] }
		// The confirmation was right: the places go back, whatever happens next.
		rendre()
		try {
			await supprimerLeCompteEtToutCeQuiEnDepend(payload, compte.id)
		} catch (erreur) {
			payload.logger.error(`[suppression] account ${compte.id}: the deletion failed, nothing was deleted`)
			return {
				ok: false,
				message: panneDuStockage(erreur) ? MESSAGES_DE_SUPPRESSION.stockage : MESSAGES_DE_SUPPRESSION.echec,
			}
		}
		return { ok: true }
	} catch (erreur) {
		if (erreur instanceof ErreurDeVerification) rendre()
		return { ok: false, message: MESSAGES_DE_SUPPRESSION.echec }
	}
}

/** The check of the password could not be made: not her failure. */
class ErreurDeVerification extends Error {}

/**
 * Is this the password of the account? Payload's own sign-in decides, as it does for the form of
 * the sign-in; the token it gives back is dropped, and the account goes right after. An address
 * not confirmed yet answers after the password was checked and found right.
 */
async function motDePasseJuste(payload: Payload, email: string, motDePasse: string): Promise<boolean> {
	if (motDePasse === '' || motDePasse.length > MOT_DE_PASSE_MAX) return false
	try {
		await ouvrirParMotDePasse(payload, 'pros', { email, password: motDePasse })
		return true
	} catch (erreur) {
		const code = codeDeLEchec(erreur)
		if (code === 'email-non-confirme') return true
		if (code === 'service-indisponible') throw new ErreurDeVerification()
		return false
	}
}
