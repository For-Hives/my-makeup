/**
 * The call to action that closes the public pages (issue 1067, redone in the look of the kit): two invitations in
 * a night panel, pill buttons of at least 44 px, a Bodoni title, and a text that reads without the background.
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

	test('le titre et la phrase sont ceux du site, au mot près', () => {
		const text = html
			.replace(/<[^>]+>/g, '')
			.replaceAll('&nbsp;', ' ')
			.replaceAll(' ', ' ')
			.replaceAll('&#x27;', "'")
		expect(text).toContain('Rejoignez My-Makeup, la communauté qui fait la différence.')
		expect(text).toContain(
			"Que vous cherchiez une maquilleuse ou que vous le soyez : la recherche est gratuite, et la page professionnelle l'est aussi."
		)
	})

	test('un titre h2 en Bodoni avec un seul mot en italique, jamais un second h1', () => {
		expect(html.match(/<h2/g)).toHaveLength(1)
		expect(html).not.toContain('<h1')
		expect(html).toMatch(/<h2 [^>]*font-display/)
		expect(html.match(/italic/g)).toHaveLength(1)
	})

	test('chaque bouton fait au moins 44 px de haut et montre son focus', () => {
		for (const href of ['/search', '/auth/signup']) {
			expect(link(href)).toMatch(/min-h-(11|12|13|14)\b/)
			expect(link(href)).toContain('focus-visible:outline')
			expect(link(href)).toContain('rounded-full')
		}
	})

	test('le fond est décoratif et seul le texte compte pour une lectrice d’écran', () => {
		expect(html).toMatch(/data-backdrop="static"[^>]*aria-hidden="true"|aria-hidden="true"[^>]*data-backdrop="static"/)
		expect(html).not.toContain('<canvas')
		expect(html).not.toContain('<img')
	})

	test('le cadre du kit : panneau de nuit, pas de rouge à lèvres, pas de police de l’espace', () => {
		expect(html).toContain('bg-art-night')
		for (const token of ['lipstick', 'font-body', 'bg-ink']) expect(html).not.toContain(token)
	})

	test('les deux clics gardent leurs valeurs de mesure', () => {
		expect(source).toContain("where: 'cta_recherche'")
		expect(source).toContain("where: 'cta_inscription'")
	})
})
