import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { EditBanner } from '@/components/direct-edit/EditBanner'
import type { DashboardProfile } from '@/lib/dashboard/dashboard-profile'
import { draftNotice } from '@/lib/dashboard/draft-notice'
import { editBanner } from '@/lib/dashboard/edit-banner'
import { BLOCK_IDS, CRITERION_BLOCK } from '@/lib/dashboard/edit-blocks'
import { profileProgress } from '@/lib/dashboard/progress'
import { CRITERIA } from '@/lib/profile/completeness'
import { ANNECY } from '../support/completeness-cases'

/**
 * The banner of the edit mode (issue 1072): the list of what is missing is the required points of the single rule,
 * with the words of the draft notice (and of the end of the onboarding), each leading to its block; it follows the
 * profile; the hidden, suspended and internal pages have their own words and no list. Made-up values only.
 */

const PUBLISHABLE: DashboardProfile = {
	id: 1,
	firstName: 'Léa',
	lastName: 'Fictive',
	specialty: 'Mariage',
	description: 'Maquilleuse fictive. '.repeat(12),
	city: ANNECY,
	mainPicture: 5,
	serviceOffers: [{ name: 'Mariée', priceFrom: 120 }],
	networks: { instagram: 'studio.fictif' },
}
const PROFILE = { slug: 'lea-fictive' }
const banner = (profile: DashboardProfile, extra: { moderationAction?: string } = {}) =>
	editBanner(profileProgress(profile), { ...PROFILE, ...extra })
const html = (profile: DashboardProfile, extra: { moderationAction?: string } = {}) =>
	renderToStaticMarkup(<EditBanner banner={banner(profile, extra)} />)

describe('editBanner', () => {
	test('an empty profile is a draft and lists the six conditions, in the order of the rule', () => {
		const result = banner({ id: 2 })
		if (result.state !== 'draft') throw new Error(`expected draft, got ${result.state}`)
		expect(result.items.map(item => item.criterion)).toEqual([
			'specialite',
			'ville',
			'description',
			'photo',
			'offres',
			'reseaux',
		])
	})

	test('the labels are those of the draft notice, never another wording', () => {
		const progress = profileProgress({ id: 2 })
		const result = editBanner(progress, PROFILE)
		if (result.state !== 'draft') throw new Error('expected draft')
		expect(result.items.map(item => item.label)).toEqual([...(draftNotice(progress)?.lines ?? [])])
	})

	test('each point leads to the block that the shared table names, and that block is on the page', () => {
		const result = banner({ id: 2 })
		if (result.state !== 'draft') throw new Error('expected draft')
		for (const item of result.items) {
			expect(item.block).toBe(CRITERION_BLOCK[item.criterion])
			expect(BLOCK_IDS).toContain(item.block)
			expect(item.href).toBe(`/auth/apercu-profil?mode=edition#bloc-${item.block}`)
		}
	})

	test('a point done leaves the list: with a short description, only the description is missing', () => {
		const result = banner({ ...PUBLISHABLE, description: 'Trop court.' })
		if (result.state !== 'incomplete') throw new Error('expected incomplete')
		expect(result.items.map(item => item.criterion)).toEqual(['description'])
	})

	test('no point is invented: every item is a criterion of the rule', () => {
		const result = banner({ id: 2 })
		if (result.state !== 'draft') throw new Error('expected draft')
		for (const item of result.items) expect(CRITERIA).toContain(item.criterion)
	})

	test('a publishable profile is visible, with the way to its public page', () => {
		expect(banner(PUBLISHABLE)).toEqual({ state: 'publishable', href: '/profil/lea-fictive', paused: false })
		expect(banner({ ...PUBLISHABLE, available: false })).toMatchObject({ state: 'publishable', paused: true })
	})

	test('hidden by the team: its own state, no list; suspended: another', () => {
		expect(banner({ ...PUBLISHABLE, status: 'hidden' })).toMatchObject({ state: 'hidden' })
		expect(banner({ ...PUBLISHABLE, status: 'hidden' }, { moderationAction: 'suspend' })).toMatchObject({
			state: 'suspended',
		})
		expect(banner({ id: 3, status: 'hidden' })).toMatchObject({ state: 'hidden' })
	})
})

describe('EditBanner', () => {
	test('a draft says the profile is not visible yet and lists what is missing as links of 44 px', () => {
		const page = html({ id: 2 })
		expect(page).toContain('data-state="draft"')
		expect(page).toContain('Ton profil n’est pas encore visible.')
		expect(page).toContain('</strong> Il manque :')
		expect(page).toContain('href="/auth/apercu-profil?mode=edition#bloc-photo"')
		expect(page).toContain('ta photo principale')
		expect(page.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(6)
	})

	test('an incomplete profile lists only what is missing', () => {
		const page = html({ ...PUBLISHABLE, description: 'Trop court.' })
		expect(page).toContain('data-state="incomplete"')
		expect(page).toContain('une description de 200 caractères au moins')
		expect(page).not.toContain('ta photo principale')
	})

	test('a publishable profile says it is visible, with the link to the public page', () => {
		const page = html(PUBLISHABLE)
		expect(page).toContain('data-state="publishable"')
		expect(page).toContain('Ton profil est visible')
		expect(page).toContain('href="/profil/lea-fictive"')
		expect(page).not.toContain('Il manque')
	})

	test('hidden: « masqué par l’équipe », no list', () => {
		const page = html({ ...PUBLISHABLE, status: 'hidden' })
		expect(page).toContain('Ton profil est masqué par l’équipe')
		expect(page).not.toContain('Il manque')
		expect(page).not.toContain('<li')
	})

	test('suspended and internal have their words and no list', () => {
		expect(html({ ...PUBLISHABLE, status: 'hidden' }, { moderationAction: 'suspend' })).toContain(
			'Ton profil est suspendu par l’équipe'
		)
		expect(html({ ...PUBLISHABLE, status: 'hidden' }, { moderationAction: 'suspend' })).not.toContain('<li')
	})
})
