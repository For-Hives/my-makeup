import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ErrorPage } from '../../src/components/layout/ErrorPage'
import { NotFoundPage } from '../../src/components/layout/NotFoundPage'

describe('pages d’erreur (069, E60)', () => {
	test('la page d’erreur parle français, demande noindex et ne montre aucune trace', () => {
		const html = renderToStaticMarkup(<ErrorPage reessayer={() => undefined} />)

		expect(html).toContain('Un problème est survenu')
		expect(html).toContain('<meta name="robots" content="noindex, nofollow"/>')
		expect(html).toContain('Réessayer')
		expect(html).not.toMatch(/ECONNREFUSED|password|postgres|stack|Error:|at \S+ \(/i)
	})

	test('les deux boutons de la page d’erreur ont une cible de 44 px au moins (299)', () => {
		const html = renderToStaticMarkup(<ErrorPage reessayer={() => undefined} />)

		const targets = html.match(/<(?:a|button)\b[^>]*class="[^"]*rounded-full[^"]*"/g) ?? []
		expect(targets).toHaveLength(2)
		for (const target of targets) expect(target, target).toMatch(/min-h-(11|13)/)
	})

	test('la 404 a un seul h1 et un lien vers l’accueil', () => {
		const html = renderToStaticMarkup(<NotFoundPage />)

		expect(html.match(/<h1/g)).toHaveLength(1)
		expect(html).toContain('404 - Page non trouvée')
		expect(html).toContain('href="/"')
	})
})
