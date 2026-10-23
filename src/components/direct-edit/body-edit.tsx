import type { BodyEdit } from '@/components/profile/edit-slots'
import { listBullets } from '@/lib/dashboard/bullets'
import type { DashboardProfile } from '@/lib/dashboard/cards'
import { COURSES } from '@/lib/dashboard/courses'
import { profileRows } from '@/lib/dashboard/list'
import { locationValues } from '@/lib/dashboard/location'
import type { DashboardPhotos } from '@/lib/dashboard/photos'
import { SERVICE_OFFERS } from '@/lib/dashboard/service-offers'
import { zoneReviewView } from '@/lib/dashboard/zone-review'
import type { PhotoUsageView } from '@/lib/photo-limits'
import { text } from '@/lib/profile/display-name'
import type { CitiesSearch } from '../dashboard/CityField'
import { AboutBlock, type AboutSave } from './blocks/AboutBlock'
import { BulletsBlock, type BulletsSave } from './blocks/BulletsBlock'
import { GalleryBlock, type GalleryWork, type MainPictureSave, type PortfolioSave } from './blocks/GalleryBlock'
import type { PlaceSave } from './blocks/PlaceBlock'
import { RowsBlock, type RowsSave } from './blocks/RowsBlock'
import { TravelBlock } from './blocks/TravelBlock'

/** The server actions the body of the page saves through: the ones of her space, given by the page. */
export interface BodyActions {
	saveAbout: AboutSave
	saveSkills: BulletsSave
	saveLanguages: BulletsSave
	saveCourses: RowsSave
	saveServices: RowsSave
	savePortfolio: PortfolioSave
	saveMainPicture: MainPictureSave
	savePlace: PlaceSave
	searchCities: CitiesSearch
}

/**
 * The editable body of her own page (issues 1016 to 1021): the functions `ProfileView` calls to wrap
 * each block below the header. Like `headerEdit`, it is built by the private route from her own profile
 * and the server actions of her space, so each save keeps the guards of those actions. The public page
 * never imports this file.
 */
export function bodyEdit({
	profile,
	photos,
	usage,
	actions,
	galleryWork,
}: {
	profile: DashboardProfile
	photos: DashboardPhotos
	/** What she stores and what the site allows (issue 309). */
	usage?: PhotoUsageView | undefined
	actions: BodyActions
	/** The browser work and the network of the gallery: the page gives none (the defaults), a test gives fakes. */
	galleryWork?: GalleryWork
}): Partial<BodyEdit> {
	const mainInGallery =
		photos.photo !== null && photos.galerie.some(photo => String(photo.id) === String(photos.photo?.id))
	return {
		travel: read => (
			<TravelBlock
				values={locationValues(profile)}
				save={actions.savePlace}
				search={actions.searchCities}
				review={zoneReviewView(profile.zoneReview)}
			>
				{read}
			</TravelBlock>
		),
		gallery: read => (
			<GalleryBlock
				photos={photos.galerie}
				mainId={mainInGallery ? (photos.photo?.id ?? null) : null}
				usage={usage}
				save={actions.savePortfolio}
				saveMain={actions.saveMainPicture}
				work={galleryWork}
			>
				{read}
			</GalleryBlock>
		),
		about: read => (
			<AboutBlock values={{ description: text(profile.description) }} save={actions.saveAbout}>
				{read}
			</AboutBlock>
		),
		skills: read => (
			<BulletsBlock list="skills" bullets={listBullets(profile.skills)} save={actions.saveSkills}>
				{read}
			</BulletsBlock>
		),
		languages: read => (
			<BulletsBlock list="languages" bullets={listBullets(profile.languages)} save={actions.saveLanguages}>
				{read}
			</BulletsBlock>
		),
		services: read => (
			<RowsBlock kind="services" rows={profileRows(SERVICE_OFFERS, profile)} save={actions.saveServices}>
				{read}
			</RowsBlock>
		),
		courses: read => (
			<RowsBlock kind="courses" rows={profileRows(COURSES, profile)} save={actions.saveCourses}>
				{read}
			</RowsBlock>
		),
	}
}
