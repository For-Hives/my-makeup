import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Footer } from '../../src/components/layout/Footer'
import { FOOTER_COLUMNS, NETWORKS } from '../../src/components/layout/links'

/** The foot of the public pages in the look of the art direction kit: the links and the texts of the site, the kit around them. */

const html = renderToStaticMarkup(<Footer />)

describe('the footer', () => {
	test('every link and every text of the site is still there', () => {
		for (const column of FOOTER_COLUMNS) {
			expect(html).toContain(`aria-label="${column.titre}"`)
			for (const link of column.liens) {
				expect(html).toContain(`href="${link.href}"`)
				expect(html).toContain(link.nom.replace(/&/g, '&amp;').replace(/'/g, '&#x27;'))
			}
		}
		for (const network of NETWORKS) {
			expect(html).toContain(`href="${network.href}"`)
			expect(html).toContain(`alt="${network.nom}"`)
		}
		expect(html).toContain('Sciez,')
		expect(html).toContain('Haute-Savoie')
		expect(html).toContain('Tous droits réservés')
	})

	test('the networks are round pill links of 44 px, the columns links are 44 px targets', () => {
		expect(html.match(/rounded-full border border-ink/g)).toHaveLength(NETWORKS.length)
		expect(html.match(/size-11/g)).toHaveLength(NETWORKS.length)
		const links = FOOTER_COLUMNS.flatMap(column => column.liens)
		expect(html.match(/inline-flex min-h-11 items-center/g)).toHaveLength(links.length)
	})

	test('hairlines and drawings are decoration, and no sparkle or flower', () => {
		expect(html).toContain('bg-art-paper')
		expect(html).toContain('border-hairline')
		expect(html).not.toMatch(/sparkle|flower|twinkle/i)
		for (const svg of html.match(/<svg[^>]*>/g) ?? []) expect(svg).toContain('aria-hidden="true"')
		expect(html).not.toContain('<title')
		expect(html).not.toContain('<script')
	})
})
