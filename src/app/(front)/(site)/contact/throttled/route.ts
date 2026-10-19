import { ipClient } from '@/lib/auth/client-ip'
import { secondesAvantUnMessageDeCetteRequete } from '@/lib/contact/frein'
import { MESSAGE_TROP_DE_MESSAGES } from '@/lib/contact/message'

export const dynamic = 'force-dynamic'

/**
 * The answer to a contact message the proxy has stopped (ticket 161): 429, with the sentence of the form in
 * French as its body. The proxy sends the request here only when the client address has used its 5
 * messages of the hour or the mailbox of the form its 20 of the day, and the route checks it again: for any other client it is a 404.
 *
 * The body is plain text for a Server Action on purpose: the client script of Next throws it as the
 * message of the failed action, and the form shows it with her typing kept (`avecLEchecDuReseau`).
 */
export async function POST(requete: Request): Promise<Response> {
	const attente = await secondesAvantUnMessageDeCetteRequete(requete, ipClient(requete.headers))
	if (attente === undefined) return new Response(null, { status: 404 })
	const entetes = { 'cache-control': 'no-store', 'retry-after': String(attente) }
	// The script of Next reads the message of a failed action only from a response typed exactly `text/plain`.
	if (requete.headers.has('next-action'))
		return new Response(MESSAGE_TROP_DE_MESSAGES, {
			status: 429,
			headers: { ...entetes, 'content-type': 'text/plain' },
		})
	return new Response(
		`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Trop de messages</title></head><body><p>${MESSAGE_TROP_DE_MESSAGES}</p></body></html>`,
		{ status: 429, headers: { ...entetes, 'content-type': 'text/html; charset=utf-8' } }
	)
}
