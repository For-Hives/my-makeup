import { expect, test } from '@playwright/test'
import { checkHost, writeReport } from '../../scripts/cutover/host-check'
import { setSearchProfiles } from '../fixtures/search-profiles'
import { createContent, deleteContent, refreshProfilePages } from '../support/public-pages'

/**
 * I45, U61 to U64 on a real host (ticket 173): the command that checks a host reads every address of the
 * frozen inventory, the sitemap, the robots file, the old authentication routes and the script of the
 * audience measurement on the application of the bench, and finds all of it conform, with no 5xx.
 *
 * The pace (two requests per second) is proved by tests/unit/bascule-controle-hote.test.ts with a clock; here
 * the bench is read without waiting, so that the run stays short.
 */
/**
 * Families of the inventory whose pages are not all answered with an h1 yet: none. The 404 page of an unknown talent,
 * article or profile was the last one (ticket 228, constat 3); the proxy now answers it in full (ticket 231). The
 * set stays, empty, for a family a later change leaves out; a family that is not in it fails the run, and the day of
 * the switch the command is run with none.
 */
const A_VENIR: ReadonlySet<string> = new Set()

test('I45 sur un hôte : tout l’inventaire est conforme, aucun 5xx', async ({ request, baseURL }) => {
	test.setTimeout(300_000)
	if (!baseURL) throw new Error('baseURL manque')
	const profils = await setSearchProfiles()
	const reference = profils.get('reference')
	if (!reference) throw new Error('le profil de référence manque au banc')
	await refreshProfilePages(request, reference)
	const suffixe = Date.now().toString(36)
	const talent = `essai-hote-talent-${suffixe}`
	const article = `essai-hote-article-${suffixe}`
	const contenus = [
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
		const rapport = await checkHost({ cible: new URL(baseURL) }, { intervalleMs: 0, aVenir: A_VENIR })
		console.log(`\n${writeReport(rapport)}\n`)
		expect(rapport.defauts).toEqual([])
		expect(rapport.reponses5xx).toBe(0)
		expect(rapport.adresses.enEchec).toBe(0)
		expect(rapport.adresses.controlees).toBeGreaterThan(60)
		// The pages of the made-up set are in the sitemap, so the check read them.
		expect(rapport.sections.find(({ titre }) => titre === 'Sitemap')?.constats.join(' ')).toMatch(/profils/)
		expect(rapport.verdict).toBe('conforme')
	} finally {
		for (const { collection, id } of contenus) await deleteContent(request, collection, id)
	}
})
