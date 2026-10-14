import {
	commitTransaction,
	createLocalReq,
	initTransaction,
	killTransaction,
	type Payload,
	resetPasswordOperation,
} from 'payload'
import { type Frein, freinDeLaReinitialisation, freinDeLOubli } from './frein'
import { ipClient } from './ip-client'
import type { CodeEvenement, Journaliser } from './journal'
import {
	type CodeEchecDeLaDemande,
	type CodeEchecDeLaReinitialisation,
	jetonDeReinitialisation,
	PLANCHER_DE_LA_DEMANDE_MS,
	validerLAdresse,
	validerLeNouveauMotDePasse,
} from './mot-de-passe-oublie'
import { CONTEXTE_DE_REINITIALISATION } from './oubli-payload'

/**
 * The forgotten password, server side (tickets 085 and 086). Two steps, and no `next` import: the
 * Server Actions call them, and so do the tests.
 *
 * The request (`demanderUnLien`)
 * - Takes a place in the brake of the client address first, and never gives it back: a place given
 *   back only for a known address would tell which ones are known.
 * - Answers the same, in the same time, for an address with an account and one without. Payload's
 *   own forgotten-password operation does the work (token, one hour, one mail at most every 15
 *   seconds per account, silence for an unknown address), but AFTER the answer: `apres` schedules
 *   it (the Server Action gives `after`), and the answer waits for a floor of 300 ms. What the
 *   relay takes to send a mail therefore never reaches the visitor.
 * - Writes one journal row, `ok` whatever the address: the journal holds nothing that tells them apart.
 *
 * The choice of the new password (`reinitialiserLeMotDePasse`)
 * - One transaction: Payload's reset (new hash, all the sessions of the account emptied, the link
 *   spent), then the session that reset opens is dropped (she signs in with her new password, as on
 *   the old site), the hash of the old site is dropped (the old password must not work through the
 *   legacy path) and the token is erased.
 * - A code that is not ours, or whose link is spent or past its hour, is `code-invalide`.
 */

export type ResultatDeLaDemande = { ok: true } | { ok: false; code: CodeEchecDeLaDemande }

export interface EntreesDeLaDemande {
	payload: Payload
	headers: Headers
	email: unknown
	/** Runs the work after the answer: `after` of Next in a Server Action. A test hands one that waits. */
	apres: (travail: () => Promise<void>) => void
	frein?: Frein
	journal?: Journaliser
	plancherMs?: number
}

const attendre = (ms: number) => new Promise<void>(fin => setTimeout(fin, Math.max(0, ms)))

export async function demanderUnLien({
	payload,
	headers,
	email,
	apres,
	frein = freinDeLOubli,
	journal,
	plancherMs = PLANCHER_DE_LA_DEMANDE_MS,
}: EntreesDeLaDemande): Promise<ResultatDeLaDemande> {
	const debut = Date.now()
	const noter = async (code: CodeEvenement, dureeMs: number) => {
		try {
			await journal?.({ type: 'mot-de-passe-oublie', code, dureeMs })
		} catch {
			// The journal is not the request's to fail.
		}
	}

	if (!frein.prendre(ipClient(headers)).autorise) {
		await noter('trop-de-tentatives', Date.now() - debut)
		return { ok: false, code: 'trop-de-tentatives' }
	}
	const adresse = validerLAdresse(email)
	if (!adresse.ok) {
		await noter('donnees-invalides', Date.now() - debut)
		return { ok: false, code: adresse.code }
	}

	const travail = async () => {
		let code: CodeEvenement = 'ok'
		try {
			await payload.forgotPassword({ collection: 'pros', data: { email: adresse.email } })
		} catch {
			// No detail: the error of the relay names the address. A request that fails to send is the
			// visitor's to repeat; what she was told does not change.
			code = 'service-indisponible'
			try {
				payload.logger.error({ msg: 'Un lien de mot de passe oublié n’a pas pu partir.' })
			} catch {
				// The log itself failed.
			}
		}
		await noter(code, Date.now() - debut)
	}
	try {
		apres(travail)
	} catch {
		// Outside a request, `after` refuses: the work then runs here, in the background of this call.
		void travail()
	}

	await attendre(debut + plancherMs - Date.now())
	return { ok: true }
}

export type ResultatDeLaReinitialisation = { ok: true } | { ok: false; code: CodeEchecDeLaReinitialisation }

export interface EntreesDeLaReinitialisation {
	payload: Payload
	headers: Headers
	/** The token of the cookie of the page, as it came. */
	jeton: unknown
	motDePasse: unknown
	confirmation: unknown
	frein?: Frein
	journal?: Journaliser
}

export async function reinitialiserLeMotDePasse({
	payload,
	headers,
	jeton,
	motDePasse,
	confirmation,
	frein = freinDeLaReinitialisation,
	journal,
}: EntreesDeLaReinitialisation): Promise<ResultatDeLaReinitialisation> {
	const debut = Date.now()
	const noter = async (code: CodeEvenement) => {
		try {
			await journal?.({ type: 'reinitialisation', code, dureeMs: Date.now() - debut })
		} catch {
			// The journal is not the reset's to fail.
		}
	}
	const cle = ipClient(headers)
	if (!frein.prendre(cle).autorise) {
		await noter('trop-de-tentatives')
		return { ok: false, code: 'trop-de-tentatives' }
	}

	if (typeof jeton !== 'string' || jeton === '') {
		await noter('lien-invalide')
		return { ok: false, code: 'code-absent' }
	}
	const code = jetonDeReinitialisation(jeton)
	if (!code) {
		await noter('lien-invalide')
		return { ok: false, code: 'code-invalide' }
	}
	const nouveau = validerLeNouveauMotDePasse(motDePasse, confirmation)
	if (!nouveau.ok) {
		await noter('donnees-invalides')
		return { ok: false, code: nouveau.code }
	}

	const req = await createLocalReq({ context: { [CONTEXTE_DE_REINITIALISATION]: true } }, payload)
	await initTransaction(req)
	try {
		const { user } = await resetPasswordOperation({
			collection: payload.collections.pros,
			data: { token: code, password: nouveau.motDePasse },
			depth: 0,
			overrideAccess: true,
			req,
		})
		// Through the adapter: these fields are written by no request. Emptying the sessions drops the
		// one the reset has just opened; she signs in with her new password. A write that holds an array
		// is a full upsert in the adapter, which needs the whole row (as Payload's own session writes do).
		const ligne = await payload.db.findOne<Record<string, unknown> & { id: number }>({
			collection: 'pros',
			req,
			where: { id: { equals: user.id } },
		})
		if (!ligne) throw new Error('Le compte a disparu pendant la réinitialisation.')
		await payload.db.updateOne({
			collection: 'pros',
			data: { ...ligne, sessions: [], legacyBcrypt: null, resetPasswordToken: null },
			id: user.id as number,
			req,
			returning: false,
		})
		await commitTransaction(req)
	} catch (erreur) {
		await killTransaction(req)
		const statut = (erreur as { status?: number } | null)?.status
		const refus = statut === 403 || statut === 400
		await noter(refus ? 'lien-invalide' : 'service-indisponible')
		return { ok: false, code: refus ? 'code-invalide' : 'service-indisponible' }
	}
	frein.rendre(cle)
	await noter('ok')
	return { ok: true }
}

/**
 * Whether the link of a cookie can still be used: ours in shape, known, and within its hour. The page
 * of the link asks it to say « plus valable » at once, instead of after the form. A failure of the
 * database says « yes »: the form then answers for itself.
 */
export async function lienEncoreValable(payload: Payload, jeton: unknown): Promise<boolean> {
	const code = jetonDeReinitialisation(jeton)
	if (!code) return false
	try {
		const ligne = await payload.db.findOne({
			collection: 'pros',
			where: {
				and: [
					{ resetPasswordToken: { equals: code } },
					{ resetPasswordExpiration: { greater_than: new Date().toISOString() } },
				],
			},
		})
		return Boolean(ligne)
	} catch {
		return true
	}
}
