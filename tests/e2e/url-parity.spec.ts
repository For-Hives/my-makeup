import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { setSearchProfiles } from '../fixtures/search-profiles'
import { createContent, deleteContent, refreshProfilePages } from '../support/public-pages'
import {
	benchCase,
	check,
	type DatasetData,
	type OldSiteTitles,
	type ParityCase,
	privateList,
	summary,
	writeSummary,
} from '../support/url-parity'

/**
 * I45 (ticket 072, plan 02 §7.3): every frozen address answers what the table promises, with the
 * same h1 as the old site. One run reports, by type of page, the addresses that are green and the
 * ones « à venir »; a type that is delivered fails the run on each address that is not green.
 *
 * - On the bench: the clear addresses of the inventory, the examples of the table, and the fictional
 *   set for the pages that depend on the data.
 * - On demand, on the imported copy: `PARITE_URLS_LISTE=<baseline csv of the measuring tool> bun run
 *   test:e2e tests/e2e/url-parity.spec.ts`. Real profile addresses are requested and never written:
 *   they show as « profil #n ».
 *
 * A type is delivered once its ticket is done: it joins the list below in the same commit, and an
 * address of it that stops answering right then fails the run. A type that is not in the list but
 * answers right is counted green all the same.
 */
// Playwright runs under Node, which wants an attribute on a JSON import: the file is read.
const old: OldSiteTitles = JSON.parse(readFileSync(new URL('../fixtures/url-parity-h1.json', import.meta.url), 'utf8'))

// Every family of the inventory is delivered. `slug-inconnu` came last (ticket 231): a 404 raised by `notFound()`
// reaches the browser as a stream with no h1 in the HTML of the server, so the proxy answers an unknown slug itself
// (src/proxy.ts, src/lib/urls/unknown-page.ts).
const DELIVERED: ReadonlySet<string> = new Set([
	'accueil',
	'recherche',
	'adresse-inconnue',
	'historiques',
	'llms-txt',
	'article',
	'talent',
	'barre-finale',
	'double-barre',
	'toutes-les-news',
	'blog',
	'api-nextauth',
	'api-sendmail',
	'sante',
	'fichiers-publics',
	'verification-bing',
	'verification-indexnow',
	'profil',
	'profil-ancien-nom',
	'profil-non-repris',
	'slug-inconnu',
	'demande-envoyee',
	'robots',
	'mentions-legales',
	'sitemap',
	'plan-du-site',
	'pages-fixes',
	'espace-connexion',
	'espace-prive',
	'espace-verification',
	'espace-racine',
	'espace-erreur',
	'espace-google',
	'mesure-script',
	'mesure-envoi',
	'mesure-autre',
])

/**
 * The three legal pages (ticket 112). `/mentions-legales` is a family of its own and is in the list above;
 * `/cgu` and `/politique-de-confidentialite` belong to the family of the fixed pages, which is delivered:
 * they are held green one by one here all the same, on a bench with the whole inventory.
 */
const LEGAL_PAGES = ['/mentions-legales', '/cgu', '/politique-de-confidentialite']

test('I45 : les adresses gelées répondent comme la table, avec le même h1', async ({ request, baseURL }) => {
	test.setTimeout(300_000)
	const privateValue = privateList()
	const contents: { collection: 'talents' | 'articles'; id: number }[] = []
	let caseOf: ParityCase[]
	if (privateValue) caseOf = privateValue
	else {
		// The bench holds made-up pages for the families that depend on the data.
		const profiles = await setSearchProfiles()
		const profile = (cle: string) => {
			const found = profiles.get(cle)
			if (!found) throw new Error(`pas de profil d’essai « ${cle} »`)
			return found
		}
		await refreshProfilePages(request, profile('reference'))
		const suffix = Date.now().toString(36)
		const talent = `essai-parite-${suffix}`
		const published = `essai-parite-publie-${suffix}`
		const draft = `essai-parite-brouillon-${suffix}`
		contents.push(
			{
				collection: 'talents',
				id: await createContent(request, 'talents', { title: `Essai ${talent}`, slug: talent, _status: 'published' }),
			},
			{
				collection: 'articles',
				id: await createContent(request, 'articles', {
					title: `Essai ${published}`,
					slug: published,
					_status: 'published',
				}),
			},
			{
				collection: 'articles',
				id: await createContent(request, 'articles', {
					title: `Essai ${draft}`,
					slug: draft,
					_status: 'draft',
				}),
			}
		)
		const dataset: DatasetData = {
			profilsVisibles: [...profiles.entries()].filter(([cle]) => cle !== 'masquee').map(([, { slug }]) => slug),
			profilsMasques: [profile('masquee').slug],
			ancienNom: { ecrit: encodeURIComponent('Essai Zoé'), slug: profile('ancien-nom-accentue').slug },
			talents: [talent],
			articlesPublies: [published],
			articlesBrouillons: [draft],
		}
		caseOf = benchCase(old, dataset)
	}
	expect(caseOf.length).toBeGreaterThan(30)

	try {
		const results = []
		for (const oneCase of caseOf) {
			// `//x` is a path of the site: written after the origin, it is not read as a host.
			const result = await check(oneCase, async adresse => {
				const response = await request.get(`${baseURL}${adresse}`, { maxRedirects: 0, failOnStatusCode: false })
				const headers = response.headers()
				return {
					status: response.status(),
					location: headers.location ?? null,
					contentType: headers['content-type'] ?? null,
					corps: () => response.text(),
				}
			})
			results.push({ cas: oneCase, resultat: result })
		}

		const lines = summary(results, DELIVERED)
		console.log(`\n${writeSummary(lines, DELIVERED)}\n`)
		for (const { cas: oneCase, resultat: result } of results)
			if (result.etat === 'ecart') console.log(`I45 écart connu ${oneCase.etiquette} : ${result.raison}`)
		expect(lines.flatMap(({ regressions }) => regressions)).toEqual([])
		if (!privateValue)
			for (const url of LEGAL_PAGES) {
				const found = results.find(({ cas: oneCase }) => oneCase.adresse === url)
				expect(found, `${url} est dans les cas`).toBeDefined()
				expect(found?.resultat.etat, url).toBe('vert')
			}
	} finally {
		for (const { collection, id } of contents) await deleteContent(request, collection, id)
	}
})
