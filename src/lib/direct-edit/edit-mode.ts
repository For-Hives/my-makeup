import { PREVIEW_PATH } from '../dashboard/preview'

/**
 * The edit mode of her own page (issue 1008). It lives on the private route of the preview, never on
 * the public address of the profile: the public HTML is shared and holds no editing control. The mode
 * is asked by the address (`?mode=edition`), so a reload stays in it and the link is a plain link.
 */

export const EDIT_QUERY = 'mode'
export const EDIT_VALUE = 'edition'

/** Whether the `mode` of the address asks for the edit mode. A repeated parameter does not. */
export const isEditRequest = (value: string | string[] | undefined): boolean => value === EDIT_VALUE

/** The address of her page in edit mode. */
export const editPath = (): string => `${PREVIEW_PATH}?${EDIT_QUERY}=${EDIT_VALUE}`
