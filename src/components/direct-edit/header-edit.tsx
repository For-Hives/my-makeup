import type { HeaderEdit } from '@/components/profile/edit-slots'
import { isAvailable } from '@/lib/dashboard/availability'
import type { DashboardProfile } from '@/lib/dashboard/cards'
import type { IdentityValues } from '@/lib/dashboard/identity'
import { locationValues } from '@/lib/dashboard/location'
import type { DashboardPhotos } from '@/lib/dashboard/photos'
import { zoneReviewView } from '@/lib/dashboard/zone-review'
import { text } from '@/lib/profile/display-name'
import type { CitiesSearch } from '../dashboard/CityField'
import { IdentityBlock, type IdentitySave } from './blocks/IdentityBlock'
import { PhotoBlock, type PhotoSave, type PhotoWork } from './blocks/PhotoBlock'
import { PlaceBlock, type PlaceSave } from './blocks/PlaceBlock'
import { StatusBlock, type StatusSave } from './blocks/StatusBlock'
import { EditorSlot } from './EditorFrame'

/** The server actions the header saves through: the ones of her space, given by the page. */
export interface HeaderActions {
	savePhoto: PhotoSave
	saveIdentity: IdentitySave
	savePlace: PlaceSave
	saveStatus: StatusSave
	searchCities: CitiesSearch
}

/**
 * The editable header of her own page (issue 1008): the functions `ProfileHeader` calls to wrap each
 * block. Built by the private route from her own profile (`artistProfile`, her account's reading) and
 * the server actions of her space, so each save keeps the guards of those actions: session read again,
 * origin checked, profile found by her account. The public page never imports this file.
 */
export function headerEdit({
	profile,
	photos,
	actions,
	photoWork,
}: {
	profile: DashboardProfile
	photos: DashboardPhotos
	actions: HeaderActions
	/** The browser work and the network of the photo: the page gives none (the defaults), a test gives fakes. */
	photoWork?: PhotoWork
}): HeaderEdit {
	const identity: IdentityValues = {
		prenom: text(profile.firstName),
		nom: text(profile.lastName),
		nomArtiste: text(profile.artistName),
		specialite: text(profile.specialty),
	}
	return {
		photo: read => (
			<PhotoBlock photo={photos.photo} missing={photos.principaleManquante} save={actions.savePhoto} {...photoWork}>
				{read}
			</PhotoBlock>
		),
		identity: (read, { missingSpecialty }) => (
			<IdentityBlock values={identity} save={actions.saveIdentity} missingSpecialty={missingSpecialty}>
				{read}
			</IdentityBlock>
		),
		place: read => (
			<PlaceBlock
				values={locationValues(profile)}
				save={actions.savePlace}
				search={actions.searchCities}
				review={zoneReviewView(profile.zoneReview)}
			>
				{read}
			</PlaceBlock>
		),
		status: read => (
			<StatusBlock available={isAvailable(profile.available)} save={actions.saveStatus}>
				{read}
			</StatusBlock>
		),
		panel: <EditorSlot />,
	}
}
