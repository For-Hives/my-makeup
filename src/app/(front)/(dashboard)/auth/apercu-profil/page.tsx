import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PreviewBanner } from '@/components/dashboard/PreviewBanner'
import { ProfileView } from '@/components/profile/ProfileView'
import { requireArtist } from '@/lib/auth/session'
import { profileId } from '@/lib/dashboard/my-profile'
import { DASHBOARD_PATH, PREVIEW_PATH, previewState } from '@/lib/dashboard/preview'
import { requestUser } from '@/lib/dashboard/request'
import { readProfilePreview } from '@/services/public/profiles'

// Read per request: it depends on the session, and the build has no database. Private and never
// indexed: the headers of `/auth/*` (`private, no-store`, `noindex`) and the tag below.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Aperçu de mon profil', robots: { index: false, follow: false } }

/**
 * Her own public page, seen as a visitor sees it (ticket 139): the same content as
 * `/profil/<slug>`, drawn by the same component from the same public reading, even when the profile
 * is not listed yet or is hidden, with a banner that says where it stands. Only her profile can come
 * out of it: it is found by her session, no identifier or slug comes from the request. No structured
 * data and no canonical address: the page is not for a search engine.
 */
export default async function PreviewPage() {
	await requireArtist(PREVIEW_PATH)
	const context = await requestUser()
	const id = context === null ? null : await profileId(context.payload, context.utilisateur)
	const preview = context === null || id === null ? null : await readProfilePreview(context.payload, id)
	// No profile yet: her space says so, with the way to ask for one.
	if (preview === null) redirect(DASHBOARD_PATH)
	return (
		<>
			<PreviewBanner etat={previewState(preview.etat)} />
			<ProfileView profil={preview.profil} mesure={false} />
		</>
	)
}
