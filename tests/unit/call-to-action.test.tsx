/**
 * The call to action that closes the public pages (issue 1067): two invitations, a frame in the colors of the
 * public site (indigo, white, grays: the lipstick red is for what a makeup artist can change), buttons of at
 * least 44 px, and a text that reads without the background.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { Cta } from '@/components/blocks/Cta'

const html = renderToStaticMarkup(<Cta />)
const source = readFileSync(join(import.meta.dir, '../../src/components/blocks/Cta.tsx'), 'utf8')

/** The opening tag of the link that goes to `href`. */
function link(href: string): string {
	return new RegExp(`<a [^>]*href="${href}"[^>]*>`).exec(html)?.[0] ?? ''
}

describe('1067 : l’invitation à l’action', () => {
	test('deux invitations : la recherche et l’inscription, avec leurs mots', () => {
		expect(html).toMatch(/<a [^>]*href="\/search"[^>]*>[\s\S]*?Trouver ma maquilleuse/)
		expect(html).toMatch(/<a [^>]*href="\/auth\/signup"[^>]*>[\s\S]*?Je suis maquilleuse/)
	})

	test('un titre h2 et une phrase, jamais un second h1', () => {
		expect(html.match(/<h2/g)).toHaveLength(1)
		expect(html).not.toContain('<h1')
		expect(html).toMatch(/<p[ >]/)
	})

	test('chaque bouton fait au moins 44 px de haut et montre son focus', () => {
		for (const href of ['/search', '/auth/signup']) {
			expect(link(href)).toMatch(/min-h-(11|12|14)\b/)
			expect(link(href)).toContain('focus-visible:outline')
		}
	})

	test('le fond est décoratif et seul le texte compte pour une lectrice d’écran', () => {
		expect(html).toMatch(/data-backdrop="static"[^>]*aria-hidden="true"|aria-hidden="true"[^>]*data-backdrop="static"/)
		expect(html).not.toContain('<canvas')
		expect(html).not.toContain('<img')
	})

	test('la direction artistique du site public : pas de rouge à lèvres, pas de police de l’espace', () => {
		for (const token of ['lipstick', 'blush', 'nude-', 'font-display', 'font-body', 'bg-ink']) {
			expect(html).not.toContain(token)
		}
		expect(html).toContain('indigo-900')
	})

	test('les deux clics gardent leurs valeurs de mesure', () => {
		expect(source).toContain("where: 'cta_recherche'")
		expect(source).toContain("where: 'cta_inscription'")
	})
})
