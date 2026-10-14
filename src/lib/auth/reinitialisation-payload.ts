import {
	commitTransaction,
	createLocalReq,
	initTransaction,
	killTransaction,
	type Payload,
	resetPasswordOperation,
} from 'payload'
import type { EnvoyerEmail } from '../emails/envoi'
import { composerEmail } from '../emails/gabarit'
import { contenuEmailReinitialisation } from '../emails/reinitialisation'
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
 *   own forgotten-password operation makes the token (one hour), and the mail leaves by the one
 *   door of the site (ticket 073, text and HTML), but AFTER the answer: `apres` schedules it (the
 *   Server Action gives `after`), and the answer waits for a floor of 300 ms. What the relay takes
 *   to send a mail therefore never reaches the visitor. The operation is called with its own mail
 *   off, which also switches off its interval of 15 seconds per account: `reserverLaDemande`
 *   keeps it, with the same atomic write as Payload's.
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
	/** The door of the mails of the site. */
	envoyer: EnvoyerEmail
	/** The address of the site, for the link of the mail. */
	site: string
	/** Minimum time between two mails to the same account. */
	intervalleMs?: number
	frein?: Frein
	journal?: Journaliser
	plancherMs?: number
}

/** As Payload's own `minRequestInterval`: one mail per account every 15 seconds. */
export const INTERVALLE_PAR_COMPTE_MS = 15_000

/**
 * Takes the place of the mail for this account, in one atomic write: the account is found only if no
 * request is recorded in the last `intervalleMs`. Gives the stored address and a way to give the place
 * back (when the mail did not leave), or nothing: unknown account, or a mail left a moment ago.
 */
async function reserverLaDemande(payload: Payload, email: string, intervalleMs: number) {
	const maintenant = Date.now()
	const demandeLe = new Date(maintenant).toISOString()
	const compte = (await payload.db.updateOne({
		collection: 'pros',
		data: { resetPasswordRequestedAt: demandeLe },
		options: { atomic: true },
		where: {
			and: [
				{ email: { equals: email.toLowerCase() } },
				{
					or: [
						{ resetPasswordRequestedAt: { exists: false } },
						{ resetPasswordRequestedAt: { equals: null } },
						{ resetPasswordRequestedAt: { less_than_equal: new Date(maintenant - intervalleMs).toISOString() } },
					],
				},
			],
		},
	})) as { id: number | string; email?: string } | null
	if (!compte?.email) return null
	const id = compte.id
	return {
		email: compte.email,
		rendre: () =>
			payload.db.updateOne({
				collection: 'pros',
				data: { resetPasswordRequestedAt: null },
				options: { atomic: true },
				where: { and: [{ id: { equals: id } }, { resetPasswordRequestedAt: { equals: demandeLe } }] },
			}),
	}
}

const attendre = (ms: number) => new Promise<void>(fin => setTimeout(fin, Math.max(0, ms)))

export async function demanderUnLien({
	payload,
	headers,
	email,
	apres,
	envoyer,
	site,
	intervalleMs = INTERVALLE_PAR_COMPTE_MS,
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
		let reservation: Awaited<ReturnType<typeof reserverLaDemande>> = null
		try {
			reservation = await reserverLaDemande(payload, adresse.email, intervalleMs)
			if (reservation) {
				const jeton = await payload.forgotPassword({
					collection: 'pros',
					data: { email: reservation.email },
					disableEmail: true,
				})
				if (jeton) await envoyer({ a: reservation.email, ...composerEmail(contenuEmailReinitialisation(jeton), site) })
			}
		} catch {
			// The mail did not leave: the place is given back, so that she can ask again at once.
			await reservation?.rendre().catch(() => undefined)
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
		// Claims the link first, in this transaction: the write locks the row, so that a second submit of
		// the same link waits for this one to commit, then finds the token gone and is refused.
		const reclame = await payload.db.updateOne({
			collection: 'pros',
			data: { resetPasswordRequestedAt: null },
			options: { atomic: true },
			req,
			where: {
				and: [
					{ resetPasswordToken: { equals: code } },
					{ resetPasswordExpiration: { greater_than: new Date().toISOString() } },
				],
			},
		})
		if (!reclame) throw Object.assign(new Error('Lien refusé.'), { status: 403 })
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
