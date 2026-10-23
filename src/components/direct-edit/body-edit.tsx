import type { BodyEdit } from '@/components/profile/edit-slots'
import { listBullets } from '@/lib/dashboard/bullets'
import type { DashboardProfile } from '@/lib/dashboard/cards'
import { COURSES } from '@/lib/dashboard/courses'
import { profileRows } from '@/lib/dashboard/list'
import { SERVICE_OFFERS } from '@/lib/dashboard/service-offers'
import { text } from '@/lib/profile/display-name'
import { AboutBlock, type AboutSave } from './blocks/AboutBlock'
import { BulletsBlock, type BulletsSave } from './blocks/BulletsBlock'
import { RowsBlock, type RowsSave } from './blocks/RowsBlock'

/** The server actions the body of the page saves through: the ones of her space, given by the page. */
export interface BodyActions {
	saveAbout: AboutSave
	saveSkills: BulletsSave
	saveLanguages: BulletsSave
	saveCourses: RowsSave
	saveServices: RowsSave
}

/**
 * The editable body of her own page (issues 1016 to 1021): the functions `ProfileView` calls to wrap
 * each block below the header. Like `headerEdit`, it is built by the private route from her own profile
 * and the server actions of her space, so each save keeps the guards of those actions. The public page
 * never imports this file.
 */
export function bodyEdit({ profile, actions }: { profile: DashboardProfile; actions: BodyActions }): Partial<BodyEdit> {
	return {
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
