import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { SkipLink } from '@/components/layout/SkipLink'
import { openWindow } from '../support/dom-react'

/**
 * The « Aller au contenu » link (ticket 304; audit UX, improvement 23): visible when it has the focus,
 * and it puts the focus in `main`. The Tab and Enter path in a browser: tests/e2e/profile-order-accessibility.spec.ts.
 */

describe('le lien « Aller au contenu »', () => {
	const jsdomWindow = openWindow()

	test('un lien vers le contenu, caché tant qu’il n’a pas le focus', () => {
		const html = renderToStaticMarkup(<SkipLink />)

		expect(html).toMatch(/<a [^>]*href="#contenu"[^>]*>Aller au contenu<\/a>/)
		expect(html).toContain('sr-only')
		expect(html).toContain('focus:not-sr-only')
	})

	test('Entrée place le focus dans main, qui n’entre pas pour autant dans l’ordre des tabulations', async () => {
		const zone = await jsdomWindow.monter(
			<>
				<SkipLink />
				<nav>
					<a href="/">Accueil</a>
				</nav>
				<main>
					<h1>Titre</h1>
				</main>
			</>
		)
		const main = zone.querySelector('main') as HTMLElement

		await jsdomWindow.cliquer(zone.querySelector('a') as HTMLElement)

		expect(jsdomWindow.w.document.activeElement).toBe(main)
		expect(main.getAttribute('tabindex')).toBe('-1')
	})

	test('une page sans main : le lien ne casse rien', async () => {
		const zone = await jsdomWindow.monter(<SkipLink />)

		await jsdomWindow.cliquer(zone.querySelector('a') as HTMLElement)

		expect(zone.querySelector('a')).not.toBeNull()
	})
})
