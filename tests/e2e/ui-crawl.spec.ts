import { expect, test } from '@playwright/test'
import { crawl } from '../../scripts/cutover/ui-crawl'
import { setSearchProfiles } from '../fixtures/search-profiles'
import { createContent, deleteContent, refreshProfilePages } from '../support/public-pages'
import {
	CRAWL_ADDRESS_COUNT,
	crawlPage,
	type DefectKind,
	findDefects,
	type PageFacts,
	UNKNOWN_PATH,
} from '../support/ui-crawl'

/**
 * The crawl of the interfaces on the bench (ticket 177, plan 02 §10.1 point 2): the command that a production host
 * is read with (scripts/cutover/ui-crawl.ts) opens 40 addresses at the phone and the desktop width on the local
 * application, and finds no defect. A second test plants one defect of each kind in a page and checks that
 * each is found, so that a crawl that sees nothing cannot pass for a clean one.
 */

const PLANTED_PATH = '/semis-du-crawl'
const FIXTURE_NAV = '<nav aria-label="Navigation principale"><a href="/">Accueil</a></nav>'

/** A page that is clean: one h1, one main navigation, nothing wider than the screen. */
const CLEAN_PAGE = `<!doctype html><html lang="fr"><head><title>Propre</title></head><body>${FIXTURE_NAV}<h1>Une page propre</h1><p>Rien à signaler.</p></body></html>`

/** A page with a defect of every kind the crawl reads in the page itself. */
const PLANTED_PAGE = `<!doctype html><html lang="fr"><head><title>Semée</title></head><body>
<h1>Premier titre</h1><h1>Second titre</h1>
<p>Bonjour undefined, votre ville est null.</p>
<div style="width:3000px;height:20px;background:#ccc">trop large</div>
<img src="/images-qui-n-existe-pas.png" alt="cassée" width="40" height="40">
<script>console.error('défaut semé dans la console')</script>
</body></html>`

test.describe('Crawl des interfaces (177)', () => {
	test('40 adresses, deux largeurs d’écran, aucun défaut', async ({ request, baseURL }) => {
		test.setTimeout(600_000)
		if (!baseURL) throw new Error('baseURL manque')
		const profiles = await setSearchProfiles()
		const first = profiles.values().next().value
		if (!first) throw new Error('le banc n’a aucun profil de recherche')
		await refreshProfilePages(request, first)
		const suffix = Date.now().toString(36)
		const created: { collection: 'talents' | 'articles'; id: number }[] = []
		try {
			for (let n = 1; n <= 6; n += 1) {
				created.push({
					collection: 'talents',
					id: await createContent(request, 'talents', {
						title: `Essai crawl talent ${n}`,
						slug: `essai-crawl-talent-${suffix}-${n}`,
						_status: 'published',
					}),
				})
				created.push({
					collection: 'articles',
					id: await createContent(request, 'articles', {
						title: `Essai crawl article ${n}`,
						slug: `essai-crawl-article-${suffix}-${n}`,
						_status: 'published',
					}),
				})
			}

			const lines: string[] = []
			const report = await crawl({
				settings: { target: new URL(baseURL) },
				onPage: result => {
					for (const defect of result.defects)
						lines.push(`[${result.screen}] ${result.address} ${defect.kind} : ${defect.detail}`)
				},
			})

			expect(report.addresses).toBe(CRAWL_ADDRESS_COUNT)
			expect(report.screens).toEqual(['mobile', 'desktop'])
			expect(report.pagesRead).toBe(CRAWL_ADDRESS_COUNT * 2)
			expect(report.pages.some(page => page.address === UNKNOWN_PATH && page.status === 404)).toBe(true)
			// The defects first, so that a failure says which address and what.
			expect(lines).toEqual([])
			expect(report.verdict).toBe('conforme')
		} finally {
			for (const content of created) await deleteContent(request, content.collection, content.id)
		}
	})

	test('un défaut semé exprès est trouvé, et une page propre ne donne rien', { tag: '@mobile' }, async ({ page }) => {
		await page.route(`**${PLANTED_PATH}`, route =>
			route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PLANTED_PAGE })
		)
		await page.route('**/page-propre-du-crawl', route =>
			route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: CLEAN_PAGE })
		)
		await page.route('**/page-en-panne-du-crawl', route =>
			route.fulfill({
				status: 500,
				contentType: 'text/html; charset=utf-8',
				body: CLEAN_PAGE,
			})
		)

		const planted = findDefects(await crawlPage(page, PLANTED_PATH))
		const kinds = new Set<DefectKind>(planted.map(defect => defect.kind))
		expect([...kinds].sort()).toEqual(['broken-image', 'console-error', 'h1', 'nav', 'overflow', 'visible-text'].sort())
		const text = planted.map(defect => defect.detail).join('\n')
		expect(text).toContain('2 h1')
		expect(text).toContain('undefined')
		expect(text).toContain('null')
		expect(text).toContain('défaut semé dans la console')

		const clean: PageFacts = await crawlPage(page, '/page-propre-du-crawl')
		expect(findDefects(clean)).toEqual([])

		const down = findDefects(await crawlPage(page, '/page-en-panne-du-crawl'))
		expect(down.map(defect => defect.kind)).toContain('status')
	})
})
