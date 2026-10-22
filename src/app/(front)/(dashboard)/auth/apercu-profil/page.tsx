import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PreviewBanner } from '@/components/dashboard/PreviewBanner'
import { EditBar } from '@/components/direct-edit/EditBar'
import { body, display } from '@/components/direct-edit/fonts'
import { headerEdit } from '@/components/direct-edit/header-edit'
import { OwnerEditSession } from '@/components/direct-edit/OwnerEditSession'
import { ProfileView } from '@/components/profile/ProfileView'
import { requireArtist } from '@/lib/auth/session'
import { artistProfile, profileId } from '@/lib/dashboard/my-profile'
import { readDashboardPhotos } from '@/lib/dashboard/photos'
import { DASHBOARD_PATH, PREVIEW_PATH, previewState } from '@/lib/dashboard/preview'
import { requestUser } from '@/lib/dashboard/request'
import { EDIT_QUERY, editPath, isEditRequest } from '@/lib/direct-edit/edit-mode'
import { readProfilePreview } from '@/services/public/profiles'
import { saveMyAvailability, saveMyIdentity, saveMyMainPicture } from '../profil/actions'
import { findMyCities, saveMyLocation } from '../profil/location-actions'

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
 *
 * With `?${EDIT_QUERY}=edition` (issue 1008) it is the same page in edit mode: the header becomes
 * editable in place, by the same component with its editing slots. Both modes are private and
 * `noindex`; the public address of the profile never carries an editing control.
 */
export default async function PreviewPage({ searchParams }: PageProps<'/auth/apercu-profil'>) {
	await requireArtist(isEditRequest((await searchParams)[EDIT_QUERY]) ? editPath() : PREVIEW_PATH)
	const editing = isEditRequest((await searchParams)[EDIT_QUERY])
	const context = await requestUser()
	const id = context === null ? null : await profileId(context.payload, context.utilisateur)
	const preview = context === null || id === null ? null : await readProfilePreview(context.payload, id)
	// No profile yet: her space says so, with the way to ask for one.
	if (context === null || preview === null) redirect(DASHBOARD_PATH)
	const state = previewState(preview.etat)
	const banner = <PreviewBanner etat={state} editable={!editing} />
	if (!editing) {
		return (
			<>
				{banner}
				<ProfileView profil={preview.profil} mesure={false} />
			</>
		)
	}
	const profile = await artistProfile(context.payload, context.utilisateur)
	if (profile === null) redirect(DASHBOARD_PATH)
	const photos = await readDashboardPhotos(context.payload, profile)
	return (
		<div className={`${display.variable} ${body.variable} flex flex-1 flex-col`}>
			<OwnerEditSession>
				<EditBar />
				{/* "This is your page as visitors see it" would be wrong here: only what needs her attention is said. */}
				{state.code === 'complet' ? null : banner}
				<ProfileView
					profil={preview.profil}
					mesure={false}
					edit={{
						header: headerEdit({
							profile,
							photos,
							actions: {
								savePhoto: saveMyMainPicture,
								saveIdentity: saveMyIdentity,
								savePlace: saveMyLocation,
								saveStatus: saveMyAvailability,
								searchCities: findMyCities,
							},
						}),
					}}
				/>
			</OwnerEditSession>
		</div>
	)
}
