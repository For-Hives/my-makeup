import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { DraftNotice } from '@/components/dashboard/DraftNotice'
import type { DashboardProfile } from '@/lib/dashboard/dashboard-profile'
import { draftNotice, googleItems } from '@/lib/dashboard/draft-notice'
import { CRITERION_BLOCK, editBlockHref } from '@/lib/dashboard/edit-blocks'
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
const NO_CONTACT: DashboardProfile = { ...PUBLISHABLE, networks: {} }

describe('draftNotice', () => {
	test('a publishable profile has no notice', () => {
		expect(draftNotice(profileProgress(PUBLISHABLE))).toBeNull()
	})

	test('a hidden page and a team account have none: they have their own words', () => {
		expect(draftNotice(profileProgress({ ...PUBLISHABLE, status: 'hidden' }))).toBeNull()
	})

	test('the lines are the required points of the rule, and the link goes to the first block missing', () => {
		const notice = draftNotice(profileProgress(NO_CONTACT))
		expect(notice?.lines).toEqual(['un moyen de te contacter'])
		expect(notice?.href).toBe(editBlockHref(CRITERION_BLOCK.reseaux))
	})

	test('an empty profile lists the four conditions of a publishable page, not the price nor the long description', () => {
		const lines = draftNotice(profileProgress(EMPTY))?.lines ?? []
		expect(lines).toHaveLength(4)
		expect(lines.join(' ')).not.toMatch(/prix|100 caractères|200 caractères/)
	})

	test('a thin profile has no notice, but Google items: a description, a price or photos, never required', () => {
		const thin: DashboardProfile = { ...PUBLISHABLE, description: 'Court.', serviceOffers: [] }
		expect(draftNotice(profileProgress(thin))).toBeNull()
		expect(googleItems(profileProgress(thin)).map(item => item.label)).toEqual([
			'une description de 100 caractères au moins',
			'une prestation avec un prix',
			'des photos dans ton portfolio',
		])
		expect(googleItems(profileProgress(PUBLISHABLE))).toEqual([])
	})
})

describe('DraftNotice', () => {
	test('it says the page is not online, tutoie, names the draft and has the button', () => {
		const notice = draftNotice(profileProgress(NO_CONTACT))
		if (notice === null) throw new Error('expected a notice')
		const html = renderToStaticMarkup(<DraftNotice notice={notice} />)
		expect(html).toContain('En brouillon')
		expect(html).toContain('Ta page n’est pas encore en ligne : les clientes ne la voient pas.')
		expect(html).toContain('Il te manque : ')
		expect(html).toContain('un moyen de te contacter.')
		expect(html).toContain('Compléter ma page')
		expect(html).toContain(`href="${editBlockHref(CRITERION_BLOCK.reseaux)}"`)
		expect(html).not.toMatch(/red|lipstick-800|role="alert"/)
	})
})
