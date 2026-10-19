import config from '@payload-config'
import { getPayload } from 'payload'
import { authLog } from '@/lib/auth/auth-log'
import { ipClient } from '@/lib/auth/client-ip'
import { SIGN_UP_FAILURE_MESSAGES } from '@/lib/auth/sign-up'
import { logRefusal, secondsBeforeSignUp } from '@/lib/auth/sign-up-refusal'

export const dynamic = 'force-dynamic'

/**
 * The answer to a sign-up the proxy has stopped (ticket 084): 429, with the sentence of the form in
 * French as its body. The proxy sends the request here only when the client address has used its 5
 * sign-ups of the hour, and the route checks it again: for any other client it is a 404.
 *
 * The body is plain text for a Server Action on purpose: the client script of Next throws it as the
 * message of the failed action, and the form shows it under its fields (`SignUpForm`).
 */
export async function POST(requete: Request): Promise<Response> {
	const client = ipClient(requete.headers)
	const wait = secondsBeforeSignUp(client)
	// Only a client past its 5 sign-ups finds this route: for anyone else it does not exist.
	if (wait === undefined) return new Response(null, { status: 404 })
	const payload = await getPayload({ config })
	await logRefusal(authLog(payload), client, 'sign-up', 'trop-de-tentatives')
	const message = SIGN_UP_FAILURE_MESSAGES['trop-de-tentatives']
	const requestHeaders = { 'cache-control': 'no-store', 'retry-after': String(wait) }
	// The script of Next reads the message of a failed action only from a response typed exactly
	// `text/plain`; a form posted without script gets a small page instead, in UTF-8.
	if (requete.headers.has('next-action'))
		return new Response(message, { status: 429, headers: { ...requestHeaders, 'content-type': 'text/plain' } })
	return new Response(
		`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Trop d’inscriptions</title></head><body><p>${message}</p></body></html>`,
		{ status: 429, headers: { ...requestHeaders, 'content-type': 'text/html; charset=utf-8' } }
	)
}
