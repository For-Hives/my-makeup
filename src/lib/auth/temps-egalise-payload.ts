import type { CollectionAfterErrorHook, CollectionBeforeOperationHook } from 'payload'
import { codeDeLEchec, type Horloge, PLANCHER_DE_REFUS_MS } from './connexion'
import { travailDeVerificationFictif } from './herite'

/**
 * The equal time of a refused sign-in on the REST door, `POST /api/pros/login` (ticket 088). The
 * form does the same in `connecter`; without it here, a script would tell an unknown address (an
 * answer in a few milliseconds) from a known one (the password check, a few hundred) on the API.
 *
 * - `egaliserLeTravailRest` (before the operation, after the brake): notes the moment the answer
 *   may leave, and when the address has no account that can check a password, does the work Payload
 *   would have done for a known one.
 * - `retenirLesEchecsRest` (after an error): a refusal of the credentials waits for that moment.
 *
 * Only a request that comes through REST: the Server Action calls the Local API and does this in
 * `connecter`, so an attempt never waits twice.
 */

const CLE_DU_PLANCHER = 'plancherDeLaConnexion'

const horlogeReelle: Horloge = {
	maintenant: () => Date.now(),
	attendre: ms => new Promise(resolve => setTimeout(resolve, ms)),
}

interface Dependances {
	horloge?: Horloge
	/** The work done for an address with no account; a test hands a double. */
	travailFictif?: (motDePasse: string) => Promise<void>
}

export const egaliserLeTravailRest =
	({
		horloge = horlogeReelle,
		travailFictif = travailDeVerificationFictif,
	}: Dependances = {}): CollectionBeforeOperationHook =>
	async ({ args, collection, operation, req }) => {
		if (operation !== 'login' || req.payloadAPI !== 'REST') return
		req.context[CLE_DU_PLANCHER] = horloge.maintenant() + PLANCHER_DE_REFUS_MS

		const data = (args as { data?: { email?: unknown; password?: unknown } }).data
		const email = typeof data?.email === 'string' ? data.email.toLowerCase().trim() : ''
		// Payload answers 400 to these before any lookup: nothing to equalise.
		if (!email || typeof data?.password !== 'string' || data.password.trim() === '') return

		const compte = (await req.payload.db.findOne({
			collection: collection.slug,
			req,
			where: { email: { equals: email } },
		})) as { hash?: unknown; salt?: unknown } | null
		// Payload checks the password of this row itself.
		if (typeof compte?.salt === 'string' && typeof compte?.hash === 'string') return
		await travailFictif(data.password)
	}

export const retenirLesEchecsRest =
	({ horloge = horlogeReelle }: Dependances = {}): CollectionAfterErrorHook =>
	async ({ error, req }) => {
		const plancher = req.context[CLE_DU_PLANCHER]
		if (typeof plancher !== 'number' || codeDeLEchec(error) !== 'identifiants-invalides') return
		// A timer may fire a hair early: wait again until the floor is really behind us.
		for (let reste = plancher - horloge.maintenant(); reste > 0; reste = plancher - horloge.maintenant())
			await horloge.attendre(Math.ceil(reste))
	}
