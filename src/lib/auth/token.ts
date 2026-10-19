import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import {
	type AuthCollectionSlug,
	commitTransaction,
	createLocalReq,
	getFieldsToSign,
	initTransaction,
	jwtSign,
	killTransaction,
	loginOperation,
	type Payload,
	type PayloadRequest,
	type TypedUser,
} from 'payload'
import { addSessionToUser } from 'payload/shared'

/** What a sign-in by password gives back to the server: the token and when it ends. Never to a client. */
export interface SessionToken {
	token?: string
	exp?: number
}

/**
 * Signs an account in and keeps the token that goes into the cookie.
 *
 * `payload.login` removes the token from its result when the collection says
 * `removeTokenFromResponses`, which `pros` does so that no answer of the API carries it. The
 * operation under it does not: this is the server's own path to the token, used by the sign-in
 * form and by the test tools. The caller puts the token in an HttpOnly cookie and nowhere else.
 */
export async function openWithPassword(
	payload: Payload,
	collection: AuthCollectionSlug,
	data: { email: string; password: string }
): Promise<SessionToken> {
	const result = await loginOperation({
		collection: payload.collections[collection],
		data,
		depth: 0,
		overrideAccess: true,
		req: await createLocalReq({}, payload),
	})
	return { token: result.token, exp: result.exp }
}

/** An account designated by its collection and its identifier. */
export interface DesignatedAccount {
	collection: AuthCollectionSlug
	id: number | string
}

/**
 * Holds a lock of PostgreSQL on one account until the end of the transaction of `req`: whoever asks
 * for the same account waits for the first to commit. Other accounts never wait for each other.
 */
async function reserveAccount(req: PayloadRequest, { collection, id }: DesignatedAccount): Promise<void> {
	const idTransaction = await req.transactionID
	// The adapter of the configuration is the PostgreSQL one; `sessions` holds the transaction of each request.
	const { sessions } = req.payload.db as unknown as Pick<PostgresAdapter, 'sessions'>
	const transaction = idTransaction === undefined || idTransaction === null ? undefined : sessions?.[idTransaction]
	await transaction?.db.execute(sql`select pg_advisory_xact_lock(hashtext(${`${collection}.sessions:${id}`}))`)
}

/**
 * Opens a session for an account without its password: the steps Payload takes once a password is
 * accepted, which the Google sign-in takes once Google has vouched for the address (ticket 090) —
 * a session recorded on the account (so that signing out can end it), then a token signed with its
 * identifier. The token is the same as a password sign-in gives: same fields, same lifetime, and the
 * session cookie carries it the same way.
 *
 * Nothing here checks that the account may sign in (confirmed, not blocked, Google's own): that is
 * the caller's rule. The sessions of an account are one list that Payload reads, extends and writes
 * back whole: two sign-ins of the same account at the same moment (two first passages through Google,
 * ticket 235) read the same list, and the second write collided with the first or erased it. So the
 * read and the write happen in one transaction, behind a lock on the account. `dureeS` replaces the lifetime of the collection (tests only).
 */
export async function openWithoutPassword(
	payload: Payload,
	{ collection, id }: DesignatedAccount,
	dureeS?: number
): Promise<Required<SessionToken>> {
	const collectionConfig = payload.collections[collection].config
	const req = await createLocalReq({}, payload)
	await initTransaction(req)
	let account: TypedUser
	let user: TypedUser
	let sid: string | undefined
	try {
		await reserveAccount(req, { collection, id })
		const found = await payload.db.findOne<TypedUser>({ collection, req, where: { id: { equals: id } } })
		if (!found) throw new Error(`Aucun compte « ${collection} » ne porte l’identifiant ${id}.`)
		account = found
		user = { ...found, collection } as TypedUser
		;({ sid } = await addSessionToUser({ collectionConfig, payload, req, user }))
		await commitTransaction(req)
	} catch (error) {
		await killTransaction(req)
		throw error
	}
	const { exp, token } = await jwtSign({
		fieldsToSign: getFieldsToSign({ collectionConfig, email: String(account.email), sid, user }),
		secret: payload.secret,
		tokenExpiration: dureeS ?? collectionConfig.auth.tokenExpiration,
	})
	return { exp, token }
}
