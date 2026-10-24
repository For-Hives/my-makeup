import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { DraftNotice } from '@/components/dashboard/DraftNotice'
import { OnboardingDone } from '@/components/dashboard/onboarding/OnboardingDone'
import type { DashboardProfile } from '@/lib/dashboard/cards'
import { draftNotice } from '@/lib/dashboard/draft-notice'
import { profileProgress } from '@/lib/dashboard/progress'
import { ANNECY } from '../support/completeness-cases'

/**
 * The draft notice (decision of 23/10/2026, issue 1009): a profile that is not publishable says so in
 * plain words, lists what it lacks from the single rule, and leads to the block to complete. A publishable
 * profile shows nothing of it. Made-up values only.
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

const EMPTY: DashboardProfile = { id: 2 }
const SHORT: DashboardProfile = { ...PUBLISHABLE, description: 'Trop court.' }

describe('draftNotice', () => {
	test('a publishable profile has no notice', () => {
		expect(draftNotice(profileProgress(PUBLISHABLE))).toBeNull()
	})

	test('a hidden page and a team account have none: they have their own words', () => {
		expect(draftNotice(profileProgress({ ...PUBLISHABLE, status: 'hidden' }))).toBeNull()
	})

	test('the lines are the required points of the rule, and the link goes to the first block missing', () => {
		const notice = draftNotice(profileProgress(SHORT))
		expect(notice?.lines).toHaveLength(1)
		expect(notice?.lines[0]).toContain('200 caractères')
		expect(notice?.href).toBe('/auth/profil#bloc-about')
	})

	test('an empty profile lists the six conditions', () => {
		expect(draftNotice(profileProgress(EMPTY))?.lines).toHaveLength(6)
	})
})

describe('DraftNotice', () => {
	test('it says the page is not online, tutoie, names the draft and has the button', () => {
		const notice = draftNotice(profileProgress(SHORT))
		if (notice === null) throw new Error('expected a notice')
		const html = renderToStaticMarkup(<DraftNotice notice={notice} />)
		expect(html).toContain('En brouillon')
		expect(html).toContain('Ta page n’est pas encore en ligne : les clientes ne la voient pas.')
		expect(html).toContain('Il te manque : ')
		expect(html).toContain('une description de 200 caractères au moins.')
		expect(html).toContain('Compléter ma page')
		expect(html).toContain('href="/auth/profil#bloc-about"')
		expect(html).not.toMatch(/red|lipstick-800|role="alert"/)
	})
})

describe('the last screen of the onboarding', () => {
	const props = {
		address: '',
		resume: false,
		editPath: '/auth/profil',
		dashboardPath: '/auth/profil',
	}

	test('not publishable: the notice, never « en ligne »', () => {
		const notice = draftNotice(profileProgress(SHORT))
		const html = renderToStaticMarkup(<OnboardingDone {...props} online={false} notice={notice} />)
		expect(html).toContain('En brouillon')
		expect(html).toContain('Ta page n’est pas encore en ligne')
		expect(html).not.toContain('Ta page est en ligne')
	})
})
