import Link from 'next/link'
import type { DefaultServerCellComponentProps } from 'payload'
import { cache } from 'react'
import { type AdminListProfile, adminProfileName } from '../../lib/profile/admin-list'

type Payload = DefaultServerCellComponentProps['payload']

/** One batch per page render: the rows ask in the same tick, one read answers them all. */
const batchOf = cache((): { ids: Set<string>; answers: Promise<Map<string, string | null>> | null } => ({
	ids: new Set(),
	answers: null,
}))

/**
 * The photos of the rows of one page, read once (not one read per row). The media is read with all its fields
 * (no `select`): the address of a thumbnail is built from the prefix and the file name, which a select of `url`
 * alone leaves out, and the address then misses its `media/` folder. The list is reached by admins only.
 */
function thumbnailsOf(payload: Payload, wanted: string): Promise<string | null> {
	const batch = batchOf()
	batch.ids.add(wanted)
	batch.answers ??= Promise.resolve().then(async () => {
		const found = new Map<string, string | null>()
		const ids = [...batch.ids]
		// A row that asks after this read starts opens the next batch.
		batch.ids = new Set()
		batch.answers = null
		const { docs } = await payload
			.find({
				collection: 'media',
				depth: 0,
				limit: ids.length,
				overrideAccess: true,
				pagination: false,
				where: { id: { in: ids } },
			})
			.catch(() => ({ docs: [] }))
		for (const media of docs) found.set(String(media.id), media.sizes?.thumbnail?.url ?? media.url ?? null)
		return found
	})
	return batch.answers.then(found => found.get(wanted) ?? null)
}

/** The photo a row shows, if any: the thumbnail, else the file itself. */
function thumbnailOf(payload: Payload, picture: unknown): Promise<string | null> {
	const id = typeof picture === 'object' && picture !== null ? (picture as { id?: unknown }).id : picture
	if (typeof id !== 'number' && typeof id !== 'string') return Promise.resolve(null)
	return thumbnailsOf(payload, String(id))
}

/**
 * The first cell of the list of profiles (ticket 308): her photo, then her name as a person, not her address.
 * The photo is decorative: the name beside it says who she is.
 *
 * It is the first column, so Payload asks it for the link to the document (`link`, `linkURL`): a custom cell has to
 * wrap its own content, Payload does not. Without it the list could be filtered and selected, but no profile opened.
 */
export async function ProfileName({ payload, rowData, link, linkURL }: DefaultServerCellComponentProps) {
	const profile = (rowData ?? {}) as AdminListProfile & { mainPicture?: unknown }
	const thumbnail = await thumbnailOf(payload, profile.mainPicture)
	const identity = (
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
	if (!link) return identity
	const href = linkURL ?? `/admin/collections/profiles/${String((rowData as { id?: unknown })?.id ?? '')}`
	return (
		<Link href={href} style={{ color: 'inherit', textDecoration: 'none' }}>
			{identity}
		</Link>
	)
}
