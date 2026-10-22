import type { DefaultServerCellComponentProps } from 'payload'
import { type AdminListProfile, adminProfileName } from '../../lib/profile/admin-list'

/** The photo a row shows, if any: the thumbnail, else the file itself. */
async function thumbnailOf(
	payload: DefaultServerCellComponentProps['payload'],
	picture: unknown
): Promise<string | null> {
	const id = typeof picture === 'object' && picture !== null ? (picture as { id?: unknown }).id : picture
	if (typeof id !== 'number' && typeof id !== 'string') return null
	const media = await payload
		.findByID({
			collection: 'media',
			depth: 0,
			disableErrors: true,
			id,
			// The row is one the list already gave to the admin; only an address is read.
			overrideAccess: true,
			select: { url: true, sizes: true },
		})
		.catch(() => null)
	return media?.sizes?.thumbnail?.url ?? media?.url ?? null
}

/**
 * The first cell of the list of profiles (ticket 308): her photo, then her name as a person, not her address.
 * The photo is decorative: the name beside it says who she is.
 */
export async function ProfileName({ payload, rowData }: DefaultServerCellComponentProps) {
	const profile = rowData as AdminListProfile & { mainPicture?: unknown }
	const thumbnail = await thumbnailOf(payload, profile.mainPicture)
	return (
		<span data-testid="profile-name" style={{ alignItems: 'center', display: 'inline-flex', gap: '0.75rem' }}>
			{thumbnail ? (
				// biome-ignore lint/performance/noImgElement: the admin panel is outside the site's image pipeline
				<img
					alt=""
					height={40}
					src={thumbnail}
					style={{ borderRadius: '50%', flex: 'none', height: 40, objectFit: 'cover', width: 40 }}
					width={40}
				/>
			) : (
				<span
					aria-hidden="true"
					style={{
						background: 'var(--theme-elevation-100)',
						borderRadius: '50%',
						flex: 'none',
						height: 40,
						width: 40,
					}}
				/>
			)}
			<span>{adminProfileName(profile)}</span>
		</span>
	)
}
