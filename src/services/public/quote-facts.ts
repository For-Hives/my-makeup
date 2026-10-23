import type { Payload } from 'payload'
import type { PublicProfileFacts } from '@/lib/quote/store'
import { readProfileUrlTarget } from './profiles'

/**
 * The facts the quote form depends on, read by the public reading of the profile (issue 1003): whether the profile is published, whether it
 * shows a way to reach its artist (a link that leads somewhere, the contact details only if she
 * published them), and whether she is on pause. `null` when the public does not read the profile (unknown,
 * hidden, not a slug of ours): the server then refuses the request like any other that cannot be taken.
 */
export async function readQuoteFacts(payload: Payload, slug: string): Promise<PublicProfileFacts | null> {
	const target = await readProfileUrlTarget(payload, slug)
	// An old address (a variant of the slug) is no slug of the profile: the form is only on the page at its slug.
	if (target.type !== 'profil' || target.profil.slug !== slug) return null
	return {
		published: target.publie,
		reachable: target.profil.liens.some(({ href }) => href),
		available: target.profil.disponible,
	}
}
