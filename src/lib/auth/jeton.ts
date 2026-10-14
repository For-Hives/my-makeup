import {
	type AuthCollectionSlug,
	createLocalReq,
	getFieldsToSign,
	jwtSign,
	loginOperation,
	type Payload,
	type TypedUser,
} from 'payload'
import { addSessionToUser } from 'payload/shared'

/** What a sign-in by password gives back to the server: the token and when it ends. Never to a client. */
export interface JetonDeSession {
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
export async function ouvrirParMotDePasse(
	payload: Payload,
	collection: AuthCollectionSlug,
	data: { email: string; password: string }
): Promise<JetonDeSession> {
	const resultat = await loginOperation({
		collection: payload.collections[collection],
		data,
		depth: 0,
		overrideAccess: true,
		req: await createLocalReq({}, payload),
	})
	return { token: resultat.token, exp: resultat.exp }
}

/** An account designated by its collection and its identifier. */
export interface CompteDesigne {
	collection: AuthCollectionSlug
	id: number | string
}

/**
 * Opens a session for an account without its password: the steps Payload takes once a password is
 * accepted, which the Google sign-in takes once Google has vouched for the address (ticket 090) —
 * a session recorded on the account (so that signing out can end it), then a token signed with its
 * identifier. The token is the same as a password sign-in gives: same fields, same lifetime, and the
 * session cookie carries it the same way.
 *
 * Nothing here checks that the account may sign in (confirmed, not blocked, Google's own): that is
 * the caller's rule. `dureeS` replaces the lifetime of the collection (tests only).
 */
export async function ouvrirSansMotDePasse(
	payload: Payload,
	{ collection, id }: CompteDesigne,
	dureeS?: number
): Promise<Required<JetonDeSession>> {
	const collectionConfig = payload.collections[collection].config
	const req = await createLocalReq({}, payload)
	const compte = await payload.db.findOne<TypedUser>({ collection, req, where: { id: { equals: id } } })
	if (!compte) throw new Error(`Aucun compte « ${collection} » ne porte l’identifiant ${id}.`)
	const user = { ...compte, collection } as TypedUser
	const { sid } = await addSessionToUser({ collectionConfig, payload, req, user })
	const { exp, token } = await jwtSign({
		fieldsToSign: getFieldsToSign({ collectionConfig, email: String(compte.email), sid, user }),
		secret: payload.secret,
		tokenExpiration: dureeS ?? collectionConfig.auth.tokenExpiration,
	})
	return { exp, token }
}
