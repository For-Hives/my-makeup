import type { DashboardPhoto } from '@/lib/dashboard/photos'

/** What a screen reader says of the thumbnail of her main photo on its card. */
export const MAIN_PHOTO_THUMBNAIL_ALT = 'Ta photo principale'

/**
 * The thumbnail of her main photo on its card (ticket 307), in place of the words « Photo ajoutée »:
 * she sees what the clients see first. A server component: the address is the one her space already
 * reads for the panel of the photo.
 */
export function MainPhotoThumbnail({ photo }: { photo: DashboardPhoto }) {
	return (
		// biome-ignore lint/performance/noImgElement: a small thumbnail of her own photo, at the size the card shows it
		<img
			src={photo.url}
			alt={MAIN_PHOTO_THUMBNAIL_ALT}
			width={96}
			height={96}
			loading="lazy"
			data-testid="photo-principale-vignette"
			className="h-24 w-24 rounded-full object-cover"
		/>
	)
}
