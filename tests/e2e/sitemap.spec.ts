import { type APIRequestContext, expect, test } from '@playwright/test'
import { SITE_ORIGIN } from '../../src/lib/frozen-urls'
import { NEUTRAL_NAME } from '../../src/lib/profile/display-name'
import { deliveredStaticPages } from '../../src/lib/seo/sitemap'
import { SEARCH_PROFILES, setSearchProfiles } from '../fixtures/search-profiles'
import { violationsSevere } from '../support/axe'
import { testPayload } from '../support/payload-test'
import { createContent, deleteContent, refreshProfilePages } from '../support/public-pages'

/**
 * The sitemap and the plan of the site, end to end (tickets 113 and 114; plan 02 E62): the addresses of
 * the sitemap are the indexable pages and those alone, each answers 200 with no redirection, and the plan
 * of the site lists the same pages, with the indexable profiles. The fictional profiles of the bench
 * (tests/fixtures/search-profiles.ts) say which profile belongs and which does not.
 */

test.describe.configure({ mode: 'serial' })

const locsOf = (xml: string): string[] => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1] ?? '')

/** The address on the bench: the same path, under the origin the tests ask. */
const onBench = (loc: string, baseURL: string): string => `${baseURL}${loc.slice(SITE_ORIGIN.length)}`

/** The slug of a profile type of the bench, and whether the public rules index it. */
async function profilesState(request: APIRequestContext) {
	const profiles = await setSearchProfiles()
	const first = profiles.get('reference')
	if (!first) throw new Error('le profil de référence manque au banc')
	await refreshProfilePages(request, first)
	return [...profiles].map(([key, profil]) => {
		const expected = SEARCH_PROFILES.get(key)?.attendu
		return { cle: key, slug: profil.slug, indexee: expected?.indexable === true && expected.status === 'published' }
	})
}

test.describe('E62 : /sitemap.xml', () => {
	test('bien formé, les profils indexables, les talents, les articles et les pages fixes, et rien d’autre', {
		tag: '@smoke',
	}, async ({ request, baseURL }) => {
		test.setTimeout(180_000)
		const state = await profilesState(request)
		const suffix = Date.now().toString(36)
		const talent = `essai-sitemap-talent-${suffix}`
		const published = `essai-sitemap-publie-${suffix}`
		const draft = `essai-sitemap-brouillon-${suffix}`
		const contents = [
			{
				collection: 'talents' as const,
				id: await createContent(request, 'talents', { title: `Essai ${talent}`, slug: talent, _status: 'published' }),
			},
			{
				collection: 'articles' as const,
				id: await createContent(request, 'articles', {
					title: `Essai ${published}`,
					slug: published,
					_status: 'published',
				}),
			},
			{
				collection: 'articles' as const,
				id: await createContent(request, 'articles', {
					title: `Essai ${draft}`,
					slug: draft,
					_status: 'draft',
				}),
			},
		]
		try {
			const response = await request.get('/sitemap.xml', { maxRedirects: 0 })
			expect(response.status()).toBe(200)
			expect(response.headers()['content-type']).toContain('application/xml')
			const xml = await response.text()

			// Well formed: the prolog, one root, every <url> closed, and nothing the standard does not know.
			expect(xml).toMatch(
				/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/
			)
			expect(xml.trimEnd().endsWith('</urlset>')).toBe(true)
			expect(xml.match(/<url>/g)?.length).toBe(xml.match(/<\/url>/g)?.length)
			expect(xml).not.toMatch(/changefreq|priority/)
			const urls = locsOf(xml)
			expect(urls.length).toBe(xml.match(/<url>/g)?.length ?? -1)
			expect(new Set(urls).size).toBe(urls.length)
			for (const loc of urls) {
				expect(loc, loc).toMatch(new RegExp(`^${SITE_ORIGIN}(/[^/\\s]+)*$`))
				expect(loc, loc).not.toMatch(/^https:\/\/[^/]+\/\/|[^:]\/\//)
				expect(loc, loc).not.toMatch(/\/(auth|api|admin|search|site-map|demande-envoyee|toutes-les-news)(\/|$)/)
			}

			// As many profiles as indexable ones.
			const payload = await testPayload()
			const { totalDocs } = await payload.count({
				collection: 'profiles',
				where: { and: [{ indexable: { equals: true } }, { status: { equals: 'published' } }] },
				overrideAccess: true,
			})
			expect(urls.filter(loc => loc.startsWith(`${SITE_ORIGIN}/profil/`))).toHaveLength(totalDocs)
			for (const { cle: key, slug, indexee: indexed } of state)
				expect(urls.includes(`${SITE_ORIGIN}/profil/${slug}`), key).toBe(indexed)

			// The pages and the documents.
			for (const page of deliveredStaticPages())
				expect(urls, page.chemin).toContain(page.chemin === '/' ? SITE_ORIGIN : `${SITE_ORIGIN}${page.chemin}`)
			expect(urls).toContain(`${SITE_ORIGIN}/talent/${talent}`)
			expect(urls).toContain(`${SITE_ORIGIN}/blog/${published}`)
			expect(urls).not.toContain(`${SITE_ORIGIN}/blog/${draft}`)

			// Every address answers 200 with no redirection, and is indexable: no noindex, its own canonical address.
			for (const loc of urls) {
				const page = await request.get(onBench(loc, baseURL ?? ''), { maxRedirects: 0 })
				expect(page.status(), loc).toBe(200)
				expect(page.headers()['x-robots-tag'] ?? '', loc).not.toMatch(/noindex/i)
				const html = await page.text()
				expect(html, loc).not.toMatch(/<meta name="robots" content="[^"]*noindex/i)
				expect(/<link rel="canonical" href="([^"]*)"/.exec(html)?.[1], loc).toBe(loc)
			}
		} finally {
			for (const { collection, id } of contents) await deleteContent(request, collection, id)
		}
	})

	test('une page de la liste ôtée du site sort du sitemap : un article dépublié', async ({ request }) => {
		test.setTimeout(120_000)
		const slug = `essai-sitemap-retire-${Date.now().toString(36)}`
		const id = await createContent(request, 'articles', { title: `Essai ${slug}`, slug, _status: 'published' })
		await expect
			.poll(async () => (await (await request.get('/sitemap.xml')).text()).includes(`/blog/${slug}<`))
			.toBe(true)
		await deleteContent(request, 'articles', id)
		await expect
			.poll(async () => (await (await request.get('/sitemap.xml')).text()).includes(`/blog/${slug}<`))
			.toBe(false)
	})
})

test.describe('Plan du site (ticket 114)', () => {
	test(
		'un seul h1, les mêmes pages fixes que le sitemap, les profils indexables, et des liens qui répondent 200',
		{ tag: '@mobile' },
		async ({ page, request, baseURL }, testInfo) => {
			test.setTimeout(180_000)
			const state = await profilesState(request)
			const suffix = Date.now().toString(36)
			const talent = `essai-plan-talent-${suffix}`
			const published = `essai-plan-publie-${suffix}`
			const draft = `essai-plan-brouillon-${suffix}`
			const contents = [
				{
					collection: 'talents' as const,
					id: await createContent(request, 'talents', { title: `Essai ${talent}`, slug: talent, _status: 'published' }),
				},
				{
					collection: 'articles' as const,
					id: await createContent(request, 'articles', {
						title: `Essai ${published}`,
						slug: published,
						_status: 'published',
					}),
				},
				{
					collection: 'articles' as const,
					id: await createContent(request, 'articles', {
						title: `Essai ${draft}`,
						slug: draft,
						_status: 'draft',
					}),
				},
			]
			try {
				const response = await page.goto('/site-map')
				expect(response?.status()).toBe(200)
				expect(response?.headers()['x-robots-tag'] ?? '').not.toMatch(/noindex/i)
				await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
				await expect(page.getByRole('heading', { level: 1 })).toContainText('Le plan du site')
				await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE_ORIGIN}/site-map`)

				const links = await page
					.locator('main a[href^="/"]')
					.evaluateAll(ancres => ancres.map(a => a.getAttribute('href') ?? ''))
				const paths = links.filter(href => !href.startsWith('/auth') && !href.startsWith('/search'))

				// The same fixed pages as the sitemap (the home page is the logo, not a link of the plan).
				const sitemap = locsOf(await (await request.get('/sitemap.xml')).text()).map(
					loc => loc.slice(SITE_ORIGIN.length) || '/'
				)
				const fixedSitemapEntries = sitemap.filter(
					chemin => !/^\/(profil|talent|blog)\//.test(chemin) && chemin !== '/'
				)
				for (const path of fixedSitemapEntries) expect(links, path).toContain(path)

				// The indexable profiles, and only them; the talents and the published articles.
				for (const { cle: key, slug, indexee: indexed } of state)
					expect(links.includes(`/profil/${slug}`), key).toBe(indexed)
				expect(links).toContain(`/talent/${talent}`)
				expect(links).toContain(`/blog/${published}`)
				expect(links).not.toContain(`/blog/${draft}`)
				// The sitemap and the plan agree on the profiles of this file, one way and the other. Not on every profile
				// of the bench: other tests publish and hide theirs while this one reads the two pages one after the other.
				const sitemapProfiles = sitemap.filter(chemin => chemin.startsWith('/profil/'))
				const itsProfiles = state.map(({ slug }) => `/profil/${slug}`)
				expect(itsProfiles.filter(chemin => links.includes(chemin)).sort()).toEqual(
					itsProfiles.filter(chemin => sitemapProfiles.includes(chemin)).sort()
				)

				// Every link answers 200, with no redirection. The talents and articles that other specs create for their
				// own test (`essai-…`) come and go while the two projects run side by side: the plan lists them for a moment,
				// then another test deletes them before this loop reaches them. Only this test's own are followed (ticket 176).
				const ofOtherTests = (path: string) =>
					/^\/(talent|blog)\/essai-/.test(path) && ![talent, published].some(slug => path.endsWith(`/${slug}`))
				for (const path of new Set(paths.filter(path => !ofOtherTests(path)))) {
					const link = await request.get(`${baseURL}${path}`, { maxRedirects: 0 })
					expect(link.status(), path).toBe(200)
				}

				// Each listed profile carries her real name (ticket 299), read from the HTML as a crawler gets it, without
				// JavaScript; none carries the neutral label.
				const html = await (await request.get('/site-map')).text()
				expect(html).not.toContain(NEUTRAL_NAME)
				for (const { cle: key, slug, indexee: indexed } of state) {
					if (!indexed) continue
					const label = await page.locator(`main a[href="/profil/${slug}"]`).innerText()
					expect(label, key).toMatch(/\S/)
					expect(label, key).not.toBe(NEUTRAL_NAME)
					expect(html, key).toContain(`>${label.replaceAll('&', '&amp;')}</a>`)
				}

				// No sideways scroll, targets of 44 px at least, no serious axe violation (ticket 299).
				expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
				const heights = await page
					.locator('main article li a')
					.evaluateAll(links => links.map(link => link.getBoundingClientRect().height))
				for (const height of heights) expect(height).toBeGreaterThanOrEqual(44)
				expect(await violationsSevere(page)).toEqual([])

				// The capture of the page at the size of the project (390 px wide on the phone).
				await page.screenshot({ path: testInfo.outputPath('plan-du-site.png'), fullPage: true })
			} finally {
				for (const { collection, id } of contents) await deleteContent(request, collection, id)
			}
		}
	)
})
