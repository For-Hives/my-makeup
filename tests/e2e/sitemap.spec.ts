import { type APIRequestContext, expect, test } from '@playwright/test'
import { pagesFixesLivrees } from '../../src/lib/seo/sitemap'
import { SITE_ORIGIN } from '../../src/lib/urls-gelees'
import { PROFILS_DE_RECHERCHE, poserLesProfilsDeRecherche } from '../fixtures/profils-de-recherche'
import { creerContenu, rafraichirLesPagesDesProfils, supprimerContenu } from '../outils/pages-publiques'
import { payloadDeTest } from '../outils/payload-test'

/**
 * The sitemap and the plan of the site, end to end (tickets 113 and 114; plan 02 E62): the addresses of
 * the sitemap are the indexable pages and those alone, each answers 200 with no redirection, and the plan
 * of the site lists the same pages, with the publishable profiles. The fictional profiles of the bench
 * (tests/fixtures/profils-de-recherche.ts) say which profile belongs and which does not.
 */

test.describe.configure({ mode: 'serial' })

const locsDe = (xml: string): string[] => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1] ?? '')

/** The address on the bench: the same path, under the origin the tests ask. */
const surLeBanc = (loc: string, baseURL: string): string => `${baseURL}${loc.slice(SITE_ORIGIN.length)}`

/** The slug of a profile type of the bench, and whether the public rules index it. */
async function etatDesProfils(request: APIRequestContext) {
	const profils = await poserLesProfilsDeRecherche()
	const premier = profils.get('reference')
	if (!premier) throw new Error('le profil de référence manque au banc')
	await rafraichirLesPagesDesProfils(request, premier)
	return [...profils].map(([cle, profil]) => {
		const attendu = PROFILS_DE_RECHERCHE.get(cle)?.attendu
		return { cle, slug: profil.slug, indexee: attendu?.publiable === true && attendu.statut === 'publie' }
	})
}

test.describe('E62 : /sitemap.xml', () => {
	test('bien formé, les profils publiables, les talents, les articles et les pages fixes, et rien d’autre', {
		tag: '@smoke',
	}, async ({ request, baseURL }) => {
		test.setTimeout(180_000)
		const etat = await etatDesProfils(request)
		const suffixe = Date.now().toString(36)
		const talent = `essai-sitemap-talent-${suffixe}`
		const publie = `essai-sitemap-publie-${suffixe}`
		const brouillon = `essai-sitemap-brouillon-${suffixe}`
		const contenus = [
			{
				collection: 'talents' as const,
				id: await creerContenu(request, 'talents', { title: `Essai ${talent}`, slug: talent, _status: 'published' }),
			},
			{
				collection: 'articles' as const,
				id: await creerContenu(request, 'articles', { title: `Essai ${publie}`, slug: publie, _status: 'published' }),
			},
			{
				collection: 'articles' as const,
				id: await creerContenu(request, 'articles', { title: `Essai ${brouillon}`, slug: brouillon, _status: 'draft' }),
			},
		]
		try {
			const reponse = await request.get('/sitemap.xml', { maxRedirects: 0 })
			expect(reponse.status()).toBe(200)
			expect(reponse.headers()['content-type']).toContain('application/xml')
			const xml = await reponse.text()

			// Well formed: the prolog, one root, every <url> closed, and nothing the standard does not know.
			expect(xml).toMatch(
				/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/
			)
			expect(xml.trimEnd().endsWith('</urlset>')).toBe(true)
			expect(xml.match(/<url>/g)?.length).toBe(xml.match(/<\/url>/g)?.length)
			expect(xml).not.toMatch(/changefreq|priority/)
			const adresses = locsDe(xml)
			expect(adresses.length).toBe(xml.match(/<url>/g)?.length ?? -1)
			expect(new Set(adresses).size).toBe(adresses.length)
			for (const loc of adresses) {
				expect(loc, loc).toMatch(new RegExp(`^${SITE_ORIGIN}(/[^/\\s]+)*$`))
				expect(loc, loc).not.toMatch(/^https:\/\/[^/]+\/\/|[^:]\/\//)
				expect(loc, loc).not.toMatch(/\/(auth|api|admin|search|site-map|demande-envoyee|toutes-les-news)(\/|$)/)
			}

			// As many profiles as publishable ones.
			const payload = await payloadDeTest()
			const { totalDocs } = await payload.count({
				collection: 'profils',
				where: { and: [{ publiable: { equals: true } }, { statut: { equals: 'publie' } }] },
				overrideAccess: true,
			})
			expect(adresses.filter(loc => loc.startsWith(`${SITE_ORIGIN}/profil/`))).toHaveLength(totalDocs)
			for (const { cle, slug, indexee } of etat)
				expect(adresses.includes(`${SITE_ORIGIN}/profil/${slug}`), cle).toBe(indexee)

			// The pages and the documents.
			for (const page of pagesFixesLivrees())
				expect(adresses, page.chemin).toContain(page.chemin === '/' ? SITE_ORIGIN : `${SITE_ORIGIN}${page.chemin}`)
			expect(adresses).toContain(`${SITE_ORIGIN}/talent/${talent}`)
			expect(adresses).toContain(`${SITE_ORIGIN}/blog/${publie}`)
			expect(adresses).not.toContain(`${SITE_ORIGIN}/blog/${brouillon}`)

			// Every address answers 200 with no redirection, and is indexable: no noindex, its own canonical address.
			for (const loc of adresses) {
				const page = await request.get(surLeBanc(loc, baseURL ?? ''), { maxRedirects: 0 })
				expect(page.status(), loc).toBe(200)
				expect(page.headers()['x-robots-tag'] ?? '', loc).not.toMatch(/noindex/i)
				const html = await page.text()
				expect(html, loc).not.toMatch(/<meta name="robots" content="[^"]*noindex/i)
				expect(/<link rel="canonical" href="([^"]*)"/.exec(html)?.[1], loc).toBe(loc)
			}
		} finally {
			for (const { collection, id } of contenus) await supprimerContenu(request, collection, id)
		}
	})

	test('une page de la liste ôtée du site sort du sitemap : un article dépublié', async ({ request }) => {
		test.setTimeout(120_000)
		const slug = `essai-sitemap-retire-${Date.now().toString(36)}`
		const id = await creerContenu(request, 'articles', { title: `Essai ${slug}`, slug, _status: 'published' })
		await expect
			.poll(async () => (await (await request.get('/sitemap.xml')).text()).includes(`/blog/${slug}<`))
			.toBe(true)
		await supprimerContenu(request, 'articles', id)
		await expect
			.poll(async () => (await (await request.get('/sitemap.xml')).text()).includes(`/blog/${slug}<`))
			.toBe(false)
	})
})

test.describe('Plan du site (ticket 114)', () => {
	test(
		'un seul h1, les mêmes pages fixes que le sitemap, les profils publiables, et des liens qui répondent 200',
		{ tag: '@mobile' },
		async ({ page, request, baseURL }, testInfo) => {
			test.setTimeout(180_000)
			const etat = await etatDesProfils(request)
			const suffixe = Date.now().toString(36)
			const talent = `essai-plan-talent-${suffixe}`
			const publie = `essai-plan-publie-${suffixe}`
			const brouillon = `essai-plan-brouillon-${suffixe}`
			const contenus = [
				{
					collection: 'talents' as const,
					id: await creerContenu(request, 'talents', { title: `Essai ${talent}`, slug: talent, _status: 'published' }),
				},
				{
					collection: 'articles' as const,
					id: await creerContenu(request, 'articles', { title: `Essai ${publie}`, slug: publie, _status: 'published' }),
				},
				{
					collection: 'articles' as const,
					id: await creerContenu(request, 'articles', {
						title: `Essai ${brouillon}`,
						slug: brouillon,
						_status: 'draft',
					}),
				},
			]
			try {
				const reponse = await page.goto('/site-map')
				expect(reponse?.status()).toBe(200)
				expect(reponse?.headers()['x-robots-tag'] ?? '').not.toMatch(/noindex/i)
				await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
				await expect(page.getByRole('heading', { level: 1 })).toContainText('Le plan du site')
				await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE_ORIGIN}/site-map`)

				const liens = await page
					.locator('main a[href^="/"]')
					.evaluateAll(ancres => ancres.map(a => a.getAttribute('href') ?? ''))
				const chemins = liens.filter(href => !href.startsWith('/auth') && !href.startsWith('/search'))

				// The same fixed pages as the sitemap (the home page is the logo, not a link of the plan).
				const sitemap = locsDe(await (await request.get('/sitemap.xml')).text()).map(
					loc => loc.slice(SITE_ORIGIN.length) || '/'
				)
				const fixesDuSitemap = sitemap.filter(chemin => !/^\/(profil|talent|blog)\//.test(chemin) && chemin !== '/')
				for (const chemin of fixesDuSitemap) expect(liens, chemin).toContain(chemin)

				// The publishable profiles, and only them; the talents and the published articles.
				for (const { cle, slug, indexee } of etat) expect(liens.includes(`/profil/${slug}`), cle).toBe(indexee)
				expect(liens).toContain(`/talent/${talent}`)
				expect(liens).toContain(`/blog/${publie}`)
				expect(liens).not.toContain(`/blog/${brouillon}`)
				// Every profile of the sitemap is linked from the plan, and the other way round.
				const profilsDuSitemap = sitemap.filter(chemin => chemin.startsWith('/profil/'))
				expect(liens.filter(href => href.startsWith('/profil/')).sort()).toEqual(profilsDuSitemap.sort())

				// Every link answers 200, with no redirection.
				for (const chemin of new Set(chemins)) {
					const lien = await request.get(`${baseURL}${chemin}`, { maxRedirects: 0 })
					expect(lien.status(), chemin).toBe(200)
				}

				// The capture of the page at the size of the project (390 px wide on the phone).
				await page.screenshot({ path: testInfo.outputPath('plan-du-site.png'), fullPage: true })
			} finally {
				for (const { collection, id } of contenus) await supprimerContenu(request, collection, id)
			}
		}
	)
})
