import type { PhotoId } from '@/lib/dashboard/photos'
import { MEDIA_ROUTE, type Network } from '@/lib/dashboard/photos-upload'

/**
 * Changes the alternative text of a photo she already sent (issue 1018), by the media route of Payload:
 * the rule is the existing one (`adminOrMediaOwner`, she changes her own media only). It is never a
 * reason to refuse a save: the text is a help, so a failure is told by `false` and nothing throws.
 */
export async function changeAlt(
	id: PhotoId,
	alt: string,
	network: Network = (address, options) => fetch(address, options)
): Promise<boolean> {
	try {
		const response = await network(`${MEDIA_ROUTE}/${encodeURIComponent(String(id))}?depth=0`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ alt }),
			credentials: 'same-origin',
		})
		return response.ok
	} catch {
		return false
	}
}
