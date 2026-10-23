import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { checkHost, writeReport } from '../../scripts/cutover/host-check'
import { DEMO_ARTICLES, DEMO_TALENTS } from '../../src/demo-data/editorial'
import { setSearchProfiles } from '../fixtures/search-profiles'
import { createContent, deleteContent, refreshProfilePages } from '../support/public-pages'
import type { OldSiteTitles } from '../support/url-parity'

/**
 * I45, U61 to U64 on a real host (ticket 173): the command that checks a host reads every address of the
 * frozen inventory, the sitemap, the robots file, the old authentication routes and the script of the
 * audience measurement on the application of the bench, and finds all of it conform, with no 5xx.
 *
 * The pace (two requests per second) is proved by tests/unit/cutover-host-check.test.ts with a clock; here
 * the bench is read without waiting, so that the run stays short.
 */
/**
 * Families of the inventory whose pages are not all answered with an h1 yet: none. The 404 page of an unknown talent,
 * article or profile was the last one (ticket 228, constat 3); the proxy now answers it in full (ticket 231). The
 * set stays, empty, for a family a later change leaves out; a family that is not in it fails the run, and the day of
 * the switch the command is run with none.
 */
const UPCOMING: ReadonlySet<string> = new Set()

/**
 * The h1 of the old site, less the pages of the bench's own set (ticket 256). The talents and the articles of
 * the set (src/demo-data/) take slugs of the real site, and `tests/e2e/bench-dataset.spec.ts` loads them into the
 * database every other test shares and leaves them there: once they are in the sitemap, the command compares their
 * made-up h1 with the real one of the old site and reports a difference, whenever that test ran first. Those
 * pages keep the check that applies to any page (one h1, the right status); only the comparison with the old text,
 * which means nothing for a made-up page, is dropped.
 */
const madeUpPages = new Set([
	...DEMO_TALENTS.map(({ slug }) => `/talent/${slug}`),
	...DEMO_ARTICLES.map(({ slug }) => `/blog/${slug}`),
])
const oldTitles = Object.fromEntries(
	Object.entries(
		JSON.parse(readFileSync(new URL('../fixtures/url-parity-h1.json', import.meta.url), 'utf8')) as OldSiteTitles
	).filter(([address]) => !madeUpPages.has(address.replace(/\/$/, '')))
) as OldSiteTitles

test('I45 sur un hôte : tout l’inventaire est conforme, aucun 5xx', async ({ request, baseURL }) => {
	test.setTimeout(300_000)
	if (!baseURL) throw new Error('baseURL manque')
	const profiles = await setSearchProfiles()
	const reference = profiles.get('reference')
	if (!reference) throw new Error('le profil de référence manque au banc')
	await refreshProfilePages(request, reference)
	const suffix = Date.now().toString(36)
	const talent = `essai-hote-talent-${suffix}`
	const article = `essai-hote-article-${suffix}`
	const contents = [
		{
			collection: 'talents' as const,
			id: await createContent(request, 'talents', { title: `Essai ${talent}`, slug: talent, _status: 'published' }),
		},
		{
			collection: 'articles' as const,
			id: await createContent(request, 'articles', { title: `Essai ${article}`, slug: article, _status: 'published' }),
		},
	]
	try {
		const report = await checkHost(
			{ cible: new URL(baseURL) },
			{ intervalleMs: 0, aVenir: UPCOMING, anciens: oldTitles }
		)
		console.log(`\n${writeReport(report)}\n`)
		expect(report.defauts).toEqual([])
		expect(report.reponses5xx).toBe(0)
		expect(report.adresses.enEchec).toBe(0)
		expect(report.adresses.controlees).toBeGreaterThan(60)
		// The pages of the made-up set are in the sitemap, so the check read them.
		expect(report.sections.find(({ titre }) => titre === 'Sitemap')?.constats.join(' ')).toMatch(/profils/)
		expect(report.verdict).toBe('conforme')
	} finally {
		for (const { collection, id } of contents) await deleteContent(request, collection, id)
	}
})
