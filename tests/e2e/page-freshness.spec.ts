import { type APIRequestContext, expect, test } from '@playwright/test'
import { placeProfile, readDemoPhoto } from '../../src/demo-data/loading'
import { DEMO_PROFILES, type DemoProfile } from '../../src/demo-data/profiles'
import { createAccount } from '../support/account-factory'
import { testPayload } from '../support/payload-test'
import { createContent, deleteContent } from '../support/public-pages'

/**
 * The freshness of the public pages, end to end (ticket 117; plan 03 SEO-27, plan 02 I21): a change made
 * through the application is on the public pages within a minute (here: at the next visit, the tags expire
 * at once), and a page that did not change is served from the cache of Next without a query in the database.
 *
 * Each test works on a profile of its own, made for it (the profile type « actif mais pas publiable » of
 * the fictional set, under a name of its own), so the others do not see it. It is saved through the REST API
 * of the application, as the admin panel and the space do, so that the save reaches the cache of the server.
 * A write made with the Payload of the test (`payloadDeTest`) does not: that is how the tests prove that a
 * page is read from the cache, by changing the database behind its back.
 */

test.describe.configure({ mode: 'serial' })

/** Within a minute, the promise of the ticket. */
const ONE_MINUTE = 60_000

function datasetType(cle: string): DemoProfile {
	const type = DEMO_PROFILES.find(autre => autre.cle === cle)
	if (!type) throw new Error(`Le profil type « ${cle} » du jeu fictif manque.`)
	return type
}

const TEMPLATE = datasetType('actif-non-publiable')
const REFERENCE = datasetType('reference')

interface FreshnessProfile {
	id: number
	pro: number
	slug: string
	/** A word only this profile carries in its name: the search finds it by that word. */
	mot: string
	entetes: { Cookie: string; Origin: string }
}

/** A profile of its own: visible, but not publishable (its offers have no price). */
async function setProfile(): Promise<FreshnessProfile> {
	const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`
	const word = `Fraicheur${suffix}`
	const type: DemoProfile = {
		...TEMPLATE,
		cle: `essai-fraicheur-${suffix}`,
		compte: { email: `essai-fraicheur-${suffix}@example.test`, nom: `Essai ${word}` },
		profil: { ...TEMPLATE.profil, firstName: 'Essai', lastName: word, artistName: `Essai ${word} Maquillage` },
		photos: { principale: TEMPLATE.photos.principale, galerie: [] },
	}
	const pose = await placeProfile(await testPayload(), type, readDemoPhoto, false)
	const admin = await createAccount('admin')
	return { id: pose.profil, pro: pose.compte, slug: pose.slug, mot: word, entetes: admin.session.enTetes }
}

/** Takes the profile away through the application, and its photo: the lists forget it at once. */
async function removeProfile(request: APIRequestContext, profil: FreshnessProfile): Promise<void> {
	await request.delete(`/api/profiles/${profil.id}`, { headers: profil.entetes })
	await request.delete(`/api/pros/${profil.pro}`, { headers: profil.entetes })
	const payload = await testPayload()
	await payload.delete({ collection: 'media', where: { owner: { equals: profil.pro } } }).catch(() => undefined)
}

async function save(request: APIRequestContext, profil: FreshnessProfile, data: Record<string, unknown>) {
	const response = await request.patch(`/api/profiles/${profil.id}`, { headers: profil.entetes, data })
	if (!response.ok()) throw new Error(`L’enregistrement a répondu ${response.status()} : ${await response.text()}`)
}

/** What the page of the profile says, in its HTML. */
async function readPage(request: APIRequestContext, slug: string) {
	const response = await request.get(`/profil/${slug}`, { maxRedirects: 0 })
	const html = await response.text()
	return {
		statut: response.status(),
		html,
		noindex:
			/<meta name="robots" content="[^"]*noindex/i.test(html) ||
			/noindex/i.test(response.headers()['x-robots-tag'] ?? ''),
		canonique: /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1] ?? null,
	}
}

const inSitemap = async (request: APIRequestContext, slug: string) =>
	(await (await request.get('/sitemap.xml')).text()).includes(`/profil/${slug}<`)

const inSearch = async (request: APIRequestContext, mot: string, slug: string) =>
	(await (await request.get(`/search?search=${mot}`)).text()).includes(`/profil/${slug}"`)

const inPlan = async (request: APIRequestContext, slug: string) =>
	(await (await request.get('/site-map')).text()).includes(`/profil/${slug}"`)

test.describe('Fraîcheur des pages publiques (117)', () => {
	test('une description modifiée est visible en moins d’une minute', async ({ request }) => {
		test.setTimeout(180_000)
		const profile = await setProfile()
		try {
			// A first visit puts the page in the cache.
			const before = await readPage(request, profile.slug)
			expect(before.statut).toBe(200)
			expect(before.html).toContain('Maquilleuse à Annecy, je compose chaque maquillage')

			await save(request, profile, {
				description: `Une description fictive changée pour l’essai de fraîcheur ${profile.mot}, assez longue pour être lue.`,
			})

			await expect
				.poll(
					async () => (await readPage(request, profile.slug)).html.includes(`l’essai de fraîcheur ${profile.mot}`),
					{
						timeout: ONE_MINUTE,
					}
				)
				.toBe(true)
			expect((await readPage(request, profile.slug)).html).not.toContain(
				'Maquilleuse à Annecy, je compose chaque maquillage'
			)
		} finally {
			await removeProfile(request, profile)
		}
	})

	test('un profil masqué répond 404 et sort de la recherche, du plan du site et du sitemap', async ({ request }) => {
		test.setTimeout(180_000)
		const profile = await setProfile()
		try {
			// Publishable: it is in the three lists.
			await save(request, profile, { serviceOffers: REFERENCE.profil.serviceOffers })
			await expect.poll(() => inSitemap(request, profile.slug), { timeout: ONE_MINUTE }).toBe(true)
			await expect.poll(() => inSearch(request, profile.mot, profile.slug), { timeout: ONE_MINUTE }).toBe(true)
			await expect.poll(() => inPlan(request, profile.slug), { timeout: ONE_MINUTE }).toBe(true)
			expect((await readPage(request, profile.slug)).statut).toBe(200)

			await save(request, profile, { chosenStatus: 'hidden' })

			await expect.poll(async () => (await readPage(request, profile.slug)).statut, { timeout: ONE_MINUTE }).toBe(404)
			await expect.poll(() => inSearch(request, profile.mot, profile.slug), { timeout: ONE_MINUTE }).toBe(false)
			await expect.poll(() => inPlan(request, profile.slug), { timeout: ONE_MINUTE }).toBe(false)
			await expect.poll(() => inSitemap(request, profile.slug), { timeout: ONE_MINUTE }).toBe(false)
		} finally {
			await removeProfile(request, profile)
		}
	})

	test('un profil devenu publiable entre dans le sitemap et perd son noindex', async ({ request }) => {
		test.setTimeout(180_000)
		const profile = await setProfile()
		try {
			// Visible and not publishable: the page answers, in noindex, without a canonical address.
			const before = await readPage(request, profile.slug)
			expect(before.statut).toBe(200)
			expect(before.noindex).toBe(true)
			expect(before.canonique).toBeNull()
			expect(await inSitemap(request, profile.slug)).toBe(false)

			await save(request, profile, { serviceOffers: REFERENCE.profil.serviceOffers })

			await expect.poll(() => inSitemap(request, profile.slug), { timeout: ONE_MINUTE }).toBe(true)
			await expect
				.poll(async () => (await readPage(request, profile.slug)).noindex, { timeout: ONE_MINUTE })
				.toBe(false)
			expect((await readPage(request, profile.slug)).canonique).toBe(`https://my-makeup.fr/profil/${profile.slug}`)
		} finally {
			await removeProfile(request, profile)
		}
	})

	test('deux lectures d’une page inchangée ne demandent rien à la base', async ({ request }) => {
		test.setTimeout(180_000)
		const profile = await setProfile()
		try {
			await save(request, profile, { serviceOffers: REFERENCE.profil.serviceOffers })
			const name = (await readPage(request, profile.slug)).html.match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1]
			expect(name).toContain(profile.mot)

			// The page is in the cache. The database is then changed behind the back of the application (the
			// Payload of the test is no request of Next, so nothing is refreshed): a page that read the database
			// again would show it.
			const payload = await testPayload()
			const silent = `Description écrite en coulisse ${profile.mot}, que la base a et que la page ne doit pas montrer.`
			await payload.update({ collection: 'profiles', id: profile.id, data: { description: silent }, depth: 0 })
			const inBase = await payload.findByID({
				collection: 'profiles',
				id: profile.id,
				depth: 0,
				select: { description: true },
			})
			expect(inBase.description).toBe(silent)

			for (let read = 0; read < 2; read += 1) {
				const page = await readPage(request, profile.slug)
				expect(page.statut).toBe(200)
				expect(page.html).not.toContain('Description écrite en coulisse')
			}

			// A save through the application refreshes it: the database is read again, and says what it holds.
			await save(request, profile, { specialty: 'Maquillage artistique' })
			await expect
				.poll(async () => (await readPage(request, profile.slug)).html.includes('Description écrite en coulisse'), {
					timeout: ONE_MINUTE,
				})
				.toBe(true)
		} finally {
			await removeProfile(request, profile)
		}
	})

	test('un talent et un article sont servis du cache, et une modification publiée les rafraîchit', async ({
		request,
	}) => {
		test.setTimeout(180_000)
		const suffix = Date.now().toString(36)
		const talent = `essai-fraicheur-talent-${suffix}`
		const article = `essai-fraicheur-article-${suffix}`
		const idTalent = await createContent(request, 'talents', {
			title: `Essai ${talent}`,
			slug: talent,
			description: 'Présentation de départ.',
			_status: 'published',
		})
		const idArticle = await createContent(request, 'articles', {
			title: `Essai ${article}`,
			slug: article,
			excerpt: 'Extrait de départ.',
			_status: 'published',
		})
		try {
			const payload = await testPayload()
			for (const [path, collection, id, field, start] of [
				[`/talent/${talent}`, 'talents', idTalent, 'description', 'Présentation de départ.'],
				[`/blog/${article}`, 'articles', idArticle, 'excerpt', 'Extrait de départ.'],
			] as const) {
				expect(await (await request.get(path)).text(), path).toContain(start)
				// Behind the back of the application: a cached page does not show it.
				await payload.update({ collection, id, data: { [field]: 'Texte écrit en coulisse.' }, depth: 0 })
				for (let read = 0; read < 2; read += 1) expect(await (await request.get(path)).text(), path).toContain(start)
				// Through the application: it shows within a minute.
				const response = await request.patch(`/api/${collection}/${id}`, {
					headers: (await createAccount('admin')).session.enTetes,
					data: { [field]: 'Texte changé par la rédaction.' },
				})
				expect(response.ok(), path).toBe(true)
				await expect
					.poll(async () => (await (await request.get(path)).text()).includes('Texte changé par la rédaction.'), {
						timeout: ONE_MINUTE,
					})
					.toBe(true)
			}
		} finally {
			await deleteContent(request, 'talents', idTalent)
			await deleteContent(request, 'articles', idArticle)
		}
	})
})
