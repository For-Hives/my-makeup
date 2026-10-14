import type { CollectionAfterErrorHook, CollectionAfterLoginHook, CollectionBeforeOperationHook } from 'payload'
import { codeDeLEchec } from './connexion'
import { journaliser } from './journal'

/**
 * The hooks of `pros` that write the journal of the REST door of the sign-in, `POST /api/pros/login`
 * (ticket 077), and keep the date of the last sign-in.
 *
 * As for the brake (src/lib/auth/frein-payload.ts), only a request that comes through REST is
 * written here: the Server Action calls the Local API, which has no headers, and writes its row
 * itself (`connecter`), so an attempt never leaves two rows.
 */

const CLE_DU_DEBUT = 'debutDeLaConnexion'

const estLaConnexionRest = (req: { payloadAPI?: string }, operation?: string): boolean =>
	req.payloadAPI === 'REST' && (operation === undefined || operation === 'login')

/** Notes when a sign-in starts, to give its duration. It runs before the brake: a braked attempt has a duration too. */
export const noterLeDebutDeLaConnexion: CollectionBeforeOperationHook = ({ operation, req }) => {
	if (operation === 'login') req.context[CLE_DU_DEBUT] = Date.now()
}

const dureeDepuis = (contexte: Record<string, unknown>): number | undefined => {
	const debut = contexte[CLE_DU_DEBUT]
	return typeof debut === 'number' ? Date.now() - debut : undefined
}

/**
 * The date of the last sign-in, kept on the account for both doors. It is written in the
 * transaction of the sign-in, which holds the account: an update outside of it would wait for the
 * sign-in to finish. A failure of this write is not the sign-in's to fail.
 */
export const retenirLaDerniereConnexion: CollectionAfterLoginHook = async ({ req, user }) => {
	try {
		await req.payload.update({
			collection: 'pros',
			data: { derniereConnexion: new Date().toISOString() },
			depth: 0,
			id: user.id,
			overrideAccess: true,
			req,
		})
	} catch {
		req.payload.logger.error({ msg: 'La date de dernière connexion n’a pas pu être écrite.' })
	}
	return user
}

/** A REST sign-in that succeeded: one row. */
export const noterLaConnexionRest: CollectionAfterLoginHook = async ({ req, user }) => {
	if (estLaConnexionRest(req))
		await journaliser(req.payload, { type: 'connexion', code: 'ok', dureeMs: dureeDepuis(req.context) })
	return user
}

/** A REST sign-in that failed, for whatever reason (wrong password, brake, address not confirmed, outage): one row. */
export const noterLEchecDeConnexionRest: CollectionAfterErrorHook = async ({ error, req }) => {
	const chemin = (() => {
		try {
			return new URL(req.url ?? '', 'http://localhost').pathname
		} catch {
			return ''
		}
	})()
	if (req.method !== 'POST' || !chemin.endsWith('/pros/login')) return
	await journaliser(req.payload, { type: 'connexion', code: codeDeLEchec(error), dureeMs: dureeDepuis(req.context) })
}
