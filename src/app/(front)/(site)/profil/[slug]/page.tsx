import config from '@payload-config'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { getPayload } from 'payload'
import { cache } from 'react'
import { ProfileView } from '@/components/profile/ProfileView'
import { ProfileViewCounter } from '@/components/profile/ProfileViewCounter'
import { serverEnv } from '@/lib/env'
import { quoteFormShown } from '@/lib/quote/shown'
import { serializeJsonLd } from '@/lib/seo/json-ld'
import { profileMetadata, profileStructuredData } from '@/lib/seo/profile'
import { profilePath } from '@/lib/slug'
import { writtenSegment } from '@/lib/urls/unknown-page'
import { cachedProfileUrl } from '@/services/public/cached'
import type { ProfileUrlTarget } from '@/services/public/profiles'
import { sendQuoteRequest } from './actions'

// The HTML is kept in the cache of Next (ticket 269). Nothing is rendered at build, which runs without a
// database: no address is generated ahead (`generateStaticParams`), the page is rendered at its first visit,
// then served from the cache. A save of the document refreshes it by its path and by its tag `profil:<slug>`
// (src/lib/revalidate.ts); the hour is the backstop of the reads of the data (src/services/public/cached.ts).
// Nothing in this page or in the layout of the site reads a cookie or a header: that is what keeps it cacheable.
export const revalidate = 3600
export const dynamicParams = true
export function generateStaticParams(): { slug: string }[] {
	return []
}

/** What the address leads to, read once for the metadata and the page of one request. */
const profileUrlTarget = cache(async (segment: string): Promise<ProfileUrlTarget> => {
	return cachedProfileUrl(await getPayload({ config }), writtenSegment(segment))
})

/**
 * Title, description, canonical address and robots (ticket 105). Indexed only when the profile can be
 * published (E66): otherwise a noindex tag and no canonical address. An unknown or hidden profile has
 * the 404 page, which Next marks noindex by itself.
 */
export async function generateMetadata({ params }: PageProps<'/profil/[slug]'>): Promise<Metadata> {
	const { slug } = await params
	const target = await profileUrlTarget(slug)
	return target.type === 'profil' ? profileMetadata(target.profil) : {}
}

/**
 * The public page of a profile, rendered by the server (tickets 101 to 105): her name in the only h1,
 * her speciality, her zone, her availability, her main photo and her description are in the HTML
 * served, with no JavaScript. What the address leads to is src/lib/profile/url.ts:
 * - a profile that is not hidden answers 200; when it cannot be published yet it carries a noindex tag
 *   and no canonical address, as on the site today;
 * - the old address by username, or a variant of the slug, answers one 308 to the slug;
 * - an unknown slug, a hidden profile and the profiles of the spam, which the import does not take,
 *   answer the 404 page in French.
 * The profile is read by the public reading only (src/services/public/profiles.ts), which never gives a
 * contact detail she did not publish.
 */
export default async function ProfilePage({ params }: PageProps<'/profil/[slug]'>) {
	const { slug } = await params
	const target = await profileUrlTarget(slug)
	if (target.type === 'redirection') permanentRedirect(profilePath(target.slug))
	if (target.type === 'inconnue') notFound()
	// The quote form (issue 1003): shown when the site offers it and this profile takes requests. The page is kept in
	// the cache, so the server checks all of it again when a request arrives. Reads the environment, never a cookie.
	const env = serverEnv()
	const quote = quoteFormShown({
		enabled: env.quoteRequests,
		published: target.publie,
		reachable: target.profil.liens.some(({ href }) => href),
		available: target.profil.disponible,
	})
		? { action: sendQuoteRequest, ...(env.turnstile && { siteKey: env.turnstile.siteKey }) }
		: undefined
	return (
		<div className="profile-art flex flex-1 flex-col bg-art-paper">
			<script
				type="application/ld+json"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: serializeJsonLd escapes <, > and &, so the data cannot close the tag.
				dangerouslySetInnerHTML={{ __html: serializeJsonLd(profileStructuredData(target.profil)) }}
			/>
			<ProfileView profil={target.profil} {...(quote && { quote })} />
			<ProfileViewCounter slug={target.profil.slug} />
		</div>
	)
}
