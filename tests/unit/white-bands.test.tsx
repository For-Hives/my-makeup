/**
 * No white band on the public pages (25/10/2026): the call to action sits on the page background without a white
 * frame, the footer follows it without a gap of another colour or a rule, and the full-width heads and sections of
 * the content pages do not paint white (white stays for real cards and panels).
 */

import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Cta } from '@/components/blocks/Cta'
import { Footer } from '@/components/layout/Footer'
import { LegalPage } from '@/components/legal/LegalPage'
import { SiteMapBody } from '@/components/site-map/SiteMapBody'
import { Benefits, CLIENT_PALETTE } from '@/components/static-pages/Benefits'

/** The class attributes of every element of a markup string, read from the opening tags only; the white pills are real buttons, not bands. */
function classes(html: string): string[] {
	return [...html.matchAll(/<[a-z][^>]*? class="([^"]*)"/g)]
		.map(match => match[1] ?? '')
		.filter(value => !value.includes('rounded-full'))
}

describe('the call to action', () => {
	const html = renderToStaticMarkup(<Cta />)

	test('has no white frame around the night panel', () => {
		expect(classes(html).some(value => /\bbg-white\b/.test(value))).toBe(false)
		expect(html).not.toContain('border-nude-200')
	})

	test('the panel is the child of the section, which keeps the page background and wide margins', () => {
		expect(html).toMatch(/<section class="[^"]*bg-art-paper[^"]*md:py-36[^"]*"/)
		expect(html).toMatch(/<div class="reveal art-cta-open [^"]*rounded-art-frame[^"]*bg-art-night/)
	})
})

describe('the footer', () => {
	const html = renderToStaticMarkup(<Footer />)

	test('follows the page without a margin of another colour', () => {
		const root = /^<div class="([^"]*)"/.exec(html)?.[1] ?? ''
		expect(root).not.toMatch(/\bmt-\d+\b/)
		expect(root).toContain('bg-art-paper')
	})

	test('does not start with a rule or a mark: no hairline, no top border on the foot', () => {
		const root = /^<div class="([^"]*)"/.exec(html)?.[1] ?? ''
		expect(root).not.toContain('border-t')
		expect(html).not.toContain('viewBox="0 0 400 12"')
	})
})

describe('the full-width sections of the content pages', () => {
	test('the advantages section keeps the page background', () => {
		const html = renderToStaticMarkup(
			<Benefits eyebrow="Test" items={[{ titre: 'Un', texte: 'Deux' }]} palette={CLIENT_PALETTE} />
		)
		expect(classes(html).some(value => /\bbg-white\b/.test(value))).toBe(false)
	})

	test('a legal page has no white head and no off-white article: it sits on the paper, its text in a white card', () => {
		const html = renderToStaticMarkup(
			<LegalPage titre="Titre" description="Une ligne." titreDuTexte="Le texte">
				<p>Texte.</p>
			</LegalPage>
		)
		for (const value of classes(html)) {
			// White is for the rounded card that holds the text, never for a full-width band.
			if (!/\brounded-art-frame\b/.test(value)) expect(value).not.toMatch(/\bbg-white\b/)
			expect(value).not.toMatch(/\bbg-neutral-50\b/)
		}
		expect(html).toContain('bg-art-paper')
	})

	test('the site plan has no white head and sits on the paper', () => {
		const html = renderToStaticMarkup(<SiteMapBody profils={[]} zones={[]} talents={[]} articles={[]} />)
		for (const value of classes(html)) {
			if (!/\brounded-art-frame\b/.test(value)) expect(value).not.toMatch(/\bbg-white\b/)
		}
		expect(html).toContain('bg-art-paper')
	})
})
