import config from '@payload-config'
import { getPayload } from 'payload'
import { ipClient } from '@/lib/auth/client-ip'
import { createRateLimit } from '@/lib/auth/rate-limit'
import { serverEnv } from '@/lib/env'
import { unsubscribeProfile } from '@/lib/reminders/store'
import { readUnsubscribeToken } from '@/lib/reminders/token'
import { isLocalAddress } from '@/lib/search/rate-limit'

// Never prerendered, never cached: each call writes.
export const dynamic = 'force-dynamic'

/** 30 calls a minute from one address: a person opens her link once. The address is a key to count, never written. */
const brake = createRateLimit({ nom: 'reminders-unsubscribe', limite: 30, fenetreMs: 60_000 })

const HEADERS = {
	'Cache-Control': 'no-store',
	'Content-Type': 'text/html; charset=utf-8',
	'X-Robots-Tag': 'noindex',
	'Referrer-Policy': 'no-referrer',
} as const

const page = (title: string, sentence: string): string =>
	`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5;color:#2b2024"><h1 style="font-size:1.4rem">${title}</h1><p>${sentence}</p><p><a href="/" style="display:inline-block;min-height:44px;min-width:44px;padding:11px 0;color:#b0245a;font-weight:600">Retour au site My Makeup</a></p></body></html>`

/**
 * The unsubscribe link of a reminder (issue 1006): `/api/reminders/unsubscribe?token=<profile>.<signature>`.
 *
 * - One click, no sign-in: opening the link stops the reminders of this profile, for good. A mail scanner that
 *   opens it by itself only stops reminders, the harmless way round.
 * - The token is signed with the secret of the application (src/lib/reminders/token.ts): it carries no address.
 * - The answer says the same whether the profile exists or not, so nobody learns which numbers are profiles.
 * - 400 for a token that is not ours, 429 past the brake. A POST does the same as a GET (a mail client's
 *   one-click unsubscribe sends a POST).
 */
async function unsubscribe(request: Request): Promise<Response> {
	const key = ipClient(request.headers)
	if (!isLocalAddress(key) && !brake.prendre(key).autorise)
		return new Response(page('Trop de demandes', 'Patiente un instant, puis ouvre de nouveau le lien.'), {
			status: 429,
			headers: HEADERS,
		})
	const token = new URL(request.url).searchParams.get('token') ?? ''
	const profileId = readUnsubscribeToken(serverEnv().payloadSecret, token)
	if (profileId === undefined)
		return new Response(
			page('Lien illisible', 'Ce lien de désinscription n’est pas valide. Copie-le en entier depuis ton email.'),
			{
				status: 400,
				headers: HEADERS,
			}
		)
	try {
		await unsubscribeProfile(await getPayload({ config }), profileId, new Date())
	} catch {
		return new Response(
			page('Une erreur s’est produite', 'Ta désinscription n’a pas pu être enregistrée. Réessaie dans un instant.'),
			{
				status: 500,
				headers: HEADERS,
			}
		)
	}
	return new Response(
		page(
			'C’est fait',
			'Tu ne recevras plus de rappels ni de courriels d’information de My Makeup sur ton profil. Tu peux toujours le compléter depuis ton espace.'
		),
		{ status: 200, headers: HEADERS }
	)
}

export const GET = unsubscribe
export const POST = unsubscribe
