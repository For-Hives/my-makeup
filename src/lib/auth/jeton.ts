import { type AuthCollectionSlug, createLocalReq, loginOperation, type Payload } from 'payload'

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
