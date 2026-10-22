import { describe, expect, test } from 'bun:test'
import { OnboardingBanner, remainingStepsText } from '@/components/dashboard/OnboardingBanner'
import { openWindow } from '../support/dom-react'

/** The banner « Il te reste N étapes » at the top of her space (ticket 296). Made-up values only. */

const jsdomWindow = openWindow()

describe('le bandeau de l’accueil à finir', () => {
	test('le texte compte les étapes et accorde le singulier', () => {
		expect(remainingStepsText(3)).toBe('Il te reste 3 étapes pour être visible.')
		expect(remainingStepsText(2)).toBe('Il te reste 2 étapes pour être visible.')
		expect(remainingStepsText(1)).toBe('Il te reste 1 étape pour être visible.')
	})

	test('« Reprendre » mène à l’accueil, qui s’ouvre à la première étape non faite', async () => {
		const zone = await jsdomWindow.monter(<OnboardingBanner reste={2} premiere={2} />)
		const banner = zone.querySelector('[data-testid="bandeau-accueil"]')
		expect(banner?.getAttribute('data-restantes')).toBe('2')
		expect(banner?.getAttribute('data-premiere')).toBe('2')
		expect(zone.textContent).toContain('Il te reste 2 étapes pour être visible.')
		const link = zone.querySelector('a')
		expect(link?.getAttribute('href')).toBe('/auth/init-account')
		expect(link?.textContent).toContain('Reprendre')
		// The step is told to a screen reader, not shown twice.
		expect(link?.textContent).toContain('Zone')
	})
})
