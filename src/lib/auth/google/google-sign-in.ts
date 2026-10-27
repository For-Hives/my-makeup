import { timingSafeEqual } from 'node:crypto'
import type { Payload } from 'payload'
import type { EventCode, Log } from '../auth-log'
import type { GoogleErrorCode } from '../errors'
import { googleCallbackRateLimit, type RateLimit } from '../rate-limit'
import { authLogRateLimit } from '../sign-up-rate-limits'
import { openWithoutPassword } from '../token'
import { type AccountRefusalCode, googleAccount } from './account'
import { type ConfigGoogle, codeClaims, discover, openCookie, type Query, RefusedToken } from './oidc'

/**
 * The return from Google (tickets 090 and 091), from the address it called to the session.
 *
 * `finishGoogleSignIn` believes nothing it has not checked: the cookie sealed at the
 * departure must come back, and its `state` must be the address's; only then is the code exchanged,
 * the ID token checked, the account found or made, and a session opened for it. Every refusal is
 * written to the journal (type « connexion », method « google ») and answered with one code of the
 * closed list of `errors.ts`: nothing Google sent, no address and no token is ever shown or kept.
 *
 * No `next` import: the route calls it with what it read from the request.
 */

export interface GoogleCallback {
	code: string | null
	state: string | null
	error: string | null
}

export type GoogleOutcome =
	| {
			ok: true
			token: string
			/** True for a first passage: the account has just been made. */
			nouveau: boolean
			/** Where she goes: the page she asked for, else her space (a new account included). */
			destination: string
	  }
	| { ok: false; code: GoogleErrorCode }

export interface CallbackInputs {
	payload: Payload
	config: ConfigGoogle
	/** The key the departure's cookie was sealed with. */
	secret: string
	retour: GoogleCallback
	/** The value of the sealed cookie, if the browser sent it. */
	cookie: string | undefined
	journal?: Log
	requeter?: Query
	maintenant?: () => number
	/**
	 * The client address (`ipClient`) the return comes from (ticket 223): it takes a place in the brake
	 * and bounds the `retour-invalide` rows of the journal. Without it nothing is braked (tests).
	 */
	client?: string
	frein?: RateLimit
}

const CODE_MAX = 2048

const sameText = (a: string, b: string): boolean => {
	const x = Buffer.from(a)
	const y = Buffer.from(b)
	return x.length === y.length && timingSafeEqual(x, y)
}

const URL_REFUSAL_CODE: Record<AccountRefusalCode, GoogleErrorCode> = {
	'email-non-verifie': 'google-email-non-verifie',
	'compte-refuse': 'email-deja-avec-mot-de-passe',
	'compte-bloque': 'compte-bloque',
	'service-indisponible': 'google-indisponible',
}

const AUTH_LOG_REFUSAL_CODE: Record<AccountRefusalCode, EventCode> = {
	'email-non-verifie': 'email-non-verifie',
	'compte-refuse': 'compte-refuse',
	'compte-bloque': 'compte-bloque',
	'service-indisponible': 'service-indisponible',
}

export async function finishGoogleSignIn({
	payload,
	config,
	secret,
	retour,
	cookie,
	journal,
	requeter,
	maintenant = Date.now,
	client,
	frein = googleCallbackRateLimit,
}: CallbackInputs): Promise<GoogleOutcome> {
	const start = Date.now()
	const record = async (type: 'sign-in' | 'sign-up', code: EventCode) => {
		// A script can send returns by the thousand: the rows of refusals are 3 an hour per address and
		// outcome, like those of the sign-up (ticket 084). The address is a key in memory, never written.
		if (
			client !== undefined &&
			(code === 'retour-invalide' || code === 'trop-de-tentatives') &&
			!authLogRateLimit.prendre(`${client}|google|${type}|${code}`).autorise
		)
			return
		try {
			await journal?.({ type, code, durationMs: Date.now() - start, method: 'google' })
		} catch {
			// The journal is not the sign-in's to fail.
		}
	}
	const refuse = async (code: EventCode, url: GoogleErrorCode): Promise<GoogleOutcome> => {
		await record('sign-in', code)
		return { ok: false, code: url }
	}

	// What Google said by itself (RFC 6749 §4.1.2.1): a refusal, an outage, or something else.
	const refuseCallback = (erreur: string): Promise<GoogleOutcome> => {
		if (erreur === 'access_denied') return refuse('annule', 'google-annule')
		if (erreur === 'server_error' || erreur === 'temporarily_unavailable')
			return refuse('service-indisponible', 'google-indisponible')
		return refuse('retour-invalide', 'google-echec')
	}

	if (client !== undefined && !frein.prendre(client).autorise) return refuse('trop-de-tentatives', 'trop-de-tentatives')

	const request = openCookie(cookie, secret, maintenant)
	if (!request || retour.state === null || !sameText(retour.state, request.state))
		return refuse('retour-invalide', 'google-echec')
	// She closed Google's screen, or refused: the state was ours, so this is a real answer.
	if (retour.error !== null) return refuseCallback(retour.error)
	if (retour.code === null || retour.code === '' || retour.code.length > CODE_MAX)
		return refuse('retour-invalide', 'google-echec')

	let claims: Awaited<ReturnType<typeof codeClaims>>
	try {
		const discovery = await discover(config.emetteur, { requeter, maintenant })
		claims = await codeClaims(config, discovery, { code: retour.code, demande: request }, { requeter, maintenant })
	} catch (error) {
		if (error instanceof RefusedToken) return refuse('retour-invalide', 'google-echec')
		// GoogleIndisponible, or anything unforeseen: the provider or the network, not the visitor.
		return refuse('service-indisponible', 'google-indisponible')
	}

	const account = await googleAccount(payload, claims)
	if (!account.ok) return refuse(AUTH_LOG_REFUSAL_CODE[account.code], URL_REFUSAL_CODE[account.code])

	let token: string
	try {
		;({ token } = await openWithoutPassword(payload, { collection: 'pros', id: account.id }))
	} catch {
		return refuse('service-indisponible', 'google-indisponible')
	}
	// The date of the last sign-in (the `afterLogin` hook does it for a password): a failure to write
	// it is not the sign-in's to fail.
	// Written by the adapter, not by `payload.update`: that one reads the whole account, sessions
	// included, and writes them back, so a session opened in between by another passage was erased
	// (ticket 235).
	await payload.db
		.updateOne({
			collection: 'pros',
			data: { lastSignInAt: new Date().toISOString() },
			id: account.id,
			returning: false,
		})
		.catch(() => undefined)
	// A session was opened: this return was no failure.
	if (client !== undefined) frein.rendre(client)
	if (account.nouveau) await record('sign-up', 'ok')
	await record('sign-in', 'ok')
	return {
		ok: true,
		token,
		nouveau: account.nouveau,
		destination: request.retour,
	}
}
