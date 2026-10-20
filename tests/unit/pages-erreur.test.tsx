import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { PageEnErreur } from '../../src/components/layout/PageEnErreur'
import { PageIntrouvable } from '../../src/components/layout/PageIntrouvable'

describe('pages d’erreur (069, E60)', () => {
	test('la page d’erreur parle français, demande noindex et ne montre aucune trace', () => {
		const html = renderToStaticMarkup(<PageEnErreur reessayer={() => undefined} />)

		expect(html).toContain('Un problème est survenu')
		expect(html).toContain('<meta name="robots" content="noindex, nofollow"/>')
		expect(html).toContain('Réessayer')
		expect(html).not.toMatch(/ECONNREFUSED|password|postgres|stack|Error:|at \S+ \(/i)
	})

	test('la 404 a un seul h1 et un lien vers l’accueil', () => {
		const html = renderToStaticMarkup(<PageIntrouvable />)

		expect(html.match(/<h1/g)).toHaveLength(1)
		expect(html).toContain('404 - Page non trouvée')
		expect(html).toContain('href="/"')
	})
})
