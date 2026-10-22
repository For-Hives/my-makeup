import type { DefaultServerCellComponentProps } from 'payload'
import { type AdminListProfile, adminProfileZone } from '../../lib/profile/admin-list'

/** The second cell of the list of profiles (ticket 308): the zone as the public pages write it, countries included. */
export function ProfileZone({ rowData }: DefaultServerCellComponentProps) {
	return <span data-testid="profile-zone">{adminProfileZone(rowData as AdminListProfile)}</span>
}
