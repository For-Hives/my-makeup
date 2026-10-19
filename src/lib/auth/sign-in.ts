import { AuthenticationError, UnverifiedEmail } from 'payload'
import { CompteBloque } from './blocked-account'
import type { CodeErreur } from './errors'
import { type Frein, freinDeConnexion } from './rate-limit'
import { ipClient } from './client-ip'
import type { JetonDeSession } from './token'
import type { CodeEvenement, Journaliser } from './auth-log'

/** A password longer than this is refused as wrong: hashing it would cost more than it proves. */
export const MOT_DE_PASSE_MAX = 1024

/** The shortest time a refusal of the credentials takes, whoever the account is (ticket 088). */
export const PLANCHER_DE_REFUS_MS = 300

/** The clock of the sign-in. A test hands it a fake one, so that it measures without waiting. */
export interface Horloge {
	maintenant: () => number
	attendre: (ms: number) => Promise<void>
}

const horlogeReelle: Horloge = {
	maintenant: () => Date.now(),
	attendre: ms => new Promise(resolve => setTimeout(resolve, ms)),
}

export type ResultatConnexion = { ok: true; token: string } | { ok: false; code: CodeErreur }

export interface EntreesDeConnexion {
	/** Signs the makeup artist in and gives the token back (`ouvrirParMotDePasse`). */
	ouvrir: (data: { email: string; password: string }) => Promise<JetonDeSession>
	headers: Headers
	email: unknown
	password: unknown
	frein?: Frein
	maintenant?: number
	/** Writes the journal row of the attempt (ticket 077). Its failure never changes the outcome. */
	journal?: Journaliser
	/**
	 * The old-hash path (ticket 087): called when Payload refuses the credentials, with the email and
	 * the password as typed. It does the same work whatever the account, and gives back `true` when
	 * the account held the password in its old hash and now holds it in Payload's format.
	 */
	herite?: (data: { email: string; password: string }) => Promise<boolean>
	/** The clock and the pause of the floor on a refusal (ticket 088). */
	horloge?: Horloge
}

const estTexte = (valeur: unknown): valeur is string => typeof valeur === 'string'

/**
 * The sign-in of a makeup artist by email and password.
 *
 * - Braked by client address before anything is checked (ticket 076); the place is given back when
 *   the sign-in succeeds.
 * - No composition rule on the password: an old account has one the sign-up rule would refuse
 *   (AUTH-11). The email is trimmed and lower-cased by Payload.
 * - Every refusal of the account (unknown address, wrong password) gives the same code: nothing says
 *   which one it is. One exception, on purpose (ticket 082): an address not yet confirmed, with the
 *   right password, says so, because the visitor has to go and click the link of her mail. The Local API is called with no `req`, so Payload's
 *   own brake hook (REST door) does not count this attempt a second time.
 * - An account of the old site has no password Payload knows: when Payload refuses, the password
 *   is checked against the old hash (`herite`); if it matches, the account takes the password in
 *   Payload's format, loses the old hash, and is signed in (ticket 087). The journal says `heritee`.
 * - A refusal of the credentials takes the same time whatever the cause (unknown address, wrong
 *   password, old account, account with no password): the same work, and no answer before
 *   `PLANCHER_DE_REFUS_MS` (ticket 088).
 * - Gives back the token for the caller to put in the cookie. It never gives back the account.
 */
export async function connecter(entrees: EntreesDeConnexion): Promise<ResultatConnexion> {
	const horloge = entrees.horloge ?? horlogeReelle
	const debut = horloge.maintenant()
	const { resultat, heritee } = await tenterLaConnexion(entrees, horloge, debut)
	const code = resultat.ok ? (heritee ? 'heritee' : 'ok') : resultat.code
	await noterLaTentative(entrees.journal, code, horloge.maintenant() - debut)
	return resultat
}

/** One row for the attempt. A journal that fails changes nothing for the visitor. */
async function noterLaTentative(
	journal: Journaliser | undefined,
	code: CodeEvenement,
	durationMs: number
): Promise<void> {
	if (!journal) return
	try {
		await journal({ type: 'sign-in', code, durationMs, method: 'password' })
	} catch {
		// `journaliser` never throws; a double might. The sign-in is not the journal's to fail.
	}
}

/**
 * The code of the sign-in error that Payload raised, as the visitor may be told: a refusal of the
 * account (4xx) is the generic one, a brake (429) says so, anything else is ours to report.
 */
export function codeDeLEchec(erreur: unknown): CodeErreur {
	const statut = (erreur as { status?: number } | null)?.status
	// Payload raises this one only after the password has been checked and found right: saying so
	// tells nothing to someone who does not hold the password.
	if (erreur instanceof UnverifiedEmail) return 'email-non-confirme'
	if (erreur instanceof CompteBloque) return 'compte-bloque'
	if (statut === 429) return 'trop-de-tentatives'
	if (erreur instanceof AuthenticationError || (statut !== undefined && statut >= 400 && statut < 500))
		return 'identifiants-invalides'
	return 'service-indisponible'
}

interface Tentative {
	resultat: ResultatConnexion
	/** The sign-in went through the old hash. */
	heritee: boolean
}

async function tenterLaConnexion(
	{ ouvrir, headers, email, password, frein = freinDeConnexion, maintenant, herite }: EntreesDeConnexion,
	horloge: Horloge,
	debut: number
): Promise<Tentative> {
	const cle = ipClient(headers)
	const decision = frein.prendre(cle, maintenant)
	if (!decision.autorise) return { resultat: { ok: false, code: 'trop-de-tentatives' }, heritee: false }

	if (
		!estTexte(email) ||
		!estTexte(password) ||
		email.trim() === '' ||
		password === '' ||
		password.length > MOT_DE_PASSE_MAX
	)
		return { resultat: { ok: false, code: 'identifiants-invalides' }, heritee: false }

	const heritee = false
	let code: CodeErreur
	try {
		const { token } = await ouvrir({ email, password })
		if (!token) return { resultat: { ok: false, code: 'service-indisponible' }, heritee }
		frein.rendre(cle, maintenant)
		return { resultat: { ok: true, token }, heritee }
	} catch (erreur) {
		code = codeDeLEchec(erreur)
	}

	// Payload refused the credentials: the account may still hold its password in the old hash.
	if (code === 'identifiants-invalides' && herite) {
		try {
			if (await herite({ email, password })) {
				const { token } = await ouvrir({ email, password })
				if (token) {
					frein.rendre(cle, maintenant)
					return { resultat: { ok: true, token }, heritee: true }
				}
				code = 'service-indisponible'
			}
		} catch (erreur) {
			code = codeDeLEchec(erreur)
			// Our own failure, not a refusal: it is not told as one.
			if (code === 'identifiants-invalides') code = 'service-indisponible'
		}
	}

	// Not the visitor's failure, or a right password: the place goes back.
	if (code === 'service-indisponible' || code === 'email-non-confirme' || code === 'compte-bloque')
		frein.rendre(cle, maintenant)
	if (code === 'identifiants-invalides') await attendreLePlancher(horloge, debut)
	return { resultat: { ok: false, code }, heritee }
}

/** Waits until the floor is reached since `debut`: a refusal never comes back sooner. */
async function attendreLePlancher(horloge: Horloge, debut: number): Promise<void> {
	const reste = PLANCHER_DE_REFUS_MS - (horloge.maintenant() - debut)
	if (reste > 0) await horloge.attendre(reste)
}
