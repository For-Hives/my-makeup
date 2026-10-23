import type { CollectionAfterErrorHook, CollectionBeforeOperationHook } from 'payload'
import { fakeVerificationWork } from './legacy'
import { type Clock, failureCode, REFUSAL_FLOOR_MS } from './sign-in'

/**
 * The equal time of a refused sign-in on the REST door, `POST /api/pros/login` (ticket 088). The
 * form does the same in `signInWithPassword`; without it here, a script would tell an unknown address (an
 * answer in a few milliseconds) from a known one (the password check, a few hundred) on the API.
 *
 * - `equalizeRestWork` (before the operation, after the brake): notes the moment the answer
 *   may leave, and when the address has no account that can check a password, does the work Payload
 *   would have done for a known one.
 * - `rememberRestFailures` (after an error): a refusal of the credentials waits for that moment.
 *
 * Only a request that comes through REST: the Server Action calls the Local API and does this in
 * `signInWithPassword`, so an attempt never waits twice.
 */

const FLOOR_KEY = 'plancherDeLaConnexion'

const realClock: Clock = {
	maintenant: () => Date.now(),
	attendre: ms => new Promise(resolve => setTimeout(resolve, ms)),
}

interface Dependencies {
	horloge?: Clock
	/** The work done for an address with no account; a test hands a double. */
	travailFictif?: (motDePasse: string) => Promise<void>
}

export const equalizeRestWork =
	({ horloge = realClock, travailFictif = fakeVerificationWork }: Dependencies = {}): CollectionBeforeOperationHook =>
	async ({ args, collection, operation, req }) => {
		if (operation !== 'login' || req.payloadAPI !== 'REST') return
		req.context[FLOOR_KEY] = horloge.maintenant() + REFUSAL_FLOOR_MS

		const data = (args as { data?: { email?: unknown; password?: unknown } }).data
		const email = typeof data?.email === 'string' ? data.email.toLowerCase().trim() : ''
		// Payload answers 400 to these before any lookup: nothing to equalise.
		if (!email || typeof data?.password !== 'string' || data.password.trim() === '') return

		// query-keys: ignore `collection` is admins or pros, both have an email (tests/unit/query-keys.test.ts)
		const account = (await req.payload.db.findOne({
			collection: collection.slug,
			req,
			where: { email: { equals: email } },
		})) as { hash?: unknown; salt?: unknown } | null
		// Payload checks the password of this row itself.
		if (typeof account?.salt === 'string' && typeof account?.hash === 'string') return
		await travailFictif(data.password)
	}

export const rememberRestFailures =
	({ horloge = realClock }: Dependencies = {}): CollectionAfterErrorHook =>
	async ({ error, req }) => {
		const floor = req.context[FLOOR_KEY]
		if (typeof floor !== 'number' || failureCode(error) !== 'identifiants-invalides') return
		// A timer may fire a hair early: wait again until the floor is really behind us.
		for (let remaining = floor - horloge.maintenant(); remaining > 0; remaining = floor - horloge.maintenant())
			await horloge.attendre(Math.ceil(remaining))
	}
