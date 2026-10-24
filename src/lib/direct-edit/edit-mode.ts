import { DASHBOARD_PATH, FORMER_PREVIEW_PATH } from '../dashboard/preview'

/**
 * The two modes of her page (issues 1008 and 1022). Her space IS her profile: `/auth/profil` is the page in
 * edit mode, and `?mode=preview` is the same page as a visitor sees it. Both live on the private route, never
 * on the public address of the profile: the public HTML is shared and holds no editing control. The mode is
 * asked by the address, so a reload stays in it and the link is a plain link.
 */

export const EDIT_QUERY = 'mode'
export const PREVIEW_VALUE = 'preview'

/** Whether the `mode` of the address asks for the preview. A repeated parameter does not. */
export const isPreviewRequest = (value: string | string[] | undefined): boolean => value === PREVIEW_VALUE

/** The address of her page in edit mode. */
export const editPath = (): string => DASHBOARD_PATH

/** The address of her page as a visitor sees it. */
export const previewPath = (): string => `${DASHBOARD_PATH}?${EDIT_QUERY}=${PREVIEW_VALUE}`

/** The address of her account: password, sign-out and deletion. */
export const ACCOUNT_PATH = '/auth/account'

/**
 * Where the former address of the preview goes (ticket 139, issue 1022): `?mode=edition` of the former edit mode
 * to the page in edit mode, anything else to the preview; null for any other path. The proxy answers it with one
 * 308 (a redirect raised by a page is not reliably a 308), so that a bookmark or a link of an old email goes on.
 */
export function formerPreviewTarget(pathname: string, mode: string | null): string | null {
	if (pathname !== FORMER_PREVIEW_PATH) return null
	return mode === 'edition' ? editPath() : previewPath()
}
