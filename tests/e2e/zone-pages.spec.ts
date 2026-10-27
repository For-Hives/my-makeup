import { type APIRequestContext, expect, test } from '@playwright/test'
import { placeProfile, readDemoPhoto } from '../../src/demo-data/loading'
import { DEMO_PROFILES, type DemoProfile } from '../../src/demo-data/profiles'
import { createAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { testPayload } from '../support/payload-test'
import { refreshProfilePages } from '../support/public-pages'

/**
 * The page of a département (ticket 1015): three indexable profiles of Annecy make `/maquilleuses/haute-savoie`
 * indexable (the other tests of the run may add more, never fewer), with its canonical address, its structured
 * data and its line in the sitemap and in the plan of the site; a profile that becomes unavailable leaves the page
 * at the next visit; an unknown département, or one with no profile, answers 404. The bounds 0, 1, 2, 3 and 4 are
 * in tests/unit/zone-pages.test.ts.
 */

test.describe.configure({ mode: 'serial' })

function datasetType(key: string): DemoProfile {
	const type = DEMO_PROFILES.find(other => other.cle === key)
	if (!type) throw new Error(`Le profil type « ${key} » du jeu fictif manque.`)
	return type
}

const TEMPLATE = datasetType('reference')

const PAGE = '/maquilleuses/haute-savoie'

interface Seeded {
	id: number
	pro: number
	word: string
	headers: Record<string, string>
}

async function seed(index: number, run: string): Promise<Seeded> {
	const word = `Zone${run}${index}`
	const type: DemoProfile = {
		...TEMPLATE,
		cle: `essai-zone-${run}-${index}`,
		compte: { email: `essai-zone-${run}-${index}@example.test`, nom: `Essai ${word}` },
		profil: { ...TEMPLATE.profil, firstName: 'Essai', lastName: word, artistName: `Essai ${word} Maquillage` },
		photos: { principale: TEMPLATE.photos.principale, galerie: [] },
	}
	const placed = await placeProfile(await testPayload(), type, readDemoPhoto, false)
	const admin = await createAccount('admin')
	return { id: placed.profil, pro: placed.compte, word, headers: admin.session.enTetes }
}

async function remove(request: APIRequestContext, seeded: Seeded) {
	await request.delete(`/api/profiles/${seeded.id}`, { headers: seeded.headers })
	await request.delete(`/api/pros/${seeded.pro}`, { headers: seeded.headers })
	const payload = await testPayload()
	await payload.delete({ collection: 'media', where: { owner: { equals: seeded.pro } } }).catch(() => undefined)
}

let profiles: Seeded[] = []

test.beforeAll(async () => {
	test.setTimeout(180_000)
	const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`
	profiles = []
	for (const index of [1, 2, 3]) profiles.push(await seed(index, run))
})

test.afterAll(async ({ request }) => {
	for (const seeded of profiles) await remove(request, seeded)
})

test.describe('La page d’un département', { tag: '@mobile' }, () => {
	test('indexable avec trois profils : un seul h1, canonique, données structurées sans note, lisible sans JavaScript', async ({
		page,
		request,
	}) => {
		// The profiles are placed in this process, by Payload's local API: the application's cache of the page does
		// not hear of them, and a page rendered earlier in the run (the other project, the sitemap) would be served
		// without them. A save through the application refreshes the pages that list the profiles.
		for (const seeded of profiles) await refreshProfilePages(request, { id: seeded.id, specialite: null })
		const raw = await request.get(PAGE)
		expect(raw.status()).toBe(200)
		const html = await raw.text()
		expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
		expect(html).toContain('<link rel="canonical" href="https://my-makeup.fr/maquilleuses/haute-savoie"')
		expect(html).not.toMatch(/<meta name="robots" content="[^"]*noindex/i)
		const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map(
			match => match[1] ?? ''
		)
		expect(jsonLd.join(' ')).toContain('BreadcrumbList')
		expect(jsonLd.join(' ')).toContain('CollectionPage')
		expect(jsonLd.join(' ')).not.toMatch(/aggregateRating|ratingValue|telephone|email|address/i)
		for (const seeded of profiles) expect(html).toContain(seeded.word)

		const response = await page.goto(PAGE)
		expect(response?.status()).toBe(200)
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Haute-Savoie (74)')
		expect(await page.locator('[data-testid="bloc-maquilleuses"] li').count()).toBeGreaterThanOrEqual(3)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
		// Every control of the page is a target of 44 px at least.
		const small = await page.locator('main a.btn-primary, main button, main input').evaluateAll(elements =>
			elements
				.map(element => ({
					name: element.textContent?.trim() || element.getAttribute('name'),
					height: element.getBoundingClientRect().height,
				}))
				.filter(({ height }) => height > 0 && height < 44)
		)
		expect(small).toEqual([])
		expect(await violationsSevere(page)).toEqual([])
	})

	test('est dans le sitemap et dans le plan du site', async ({ request }) => {
		const sitemap = await (await request.get('/sitemap.xml')).text()
		expect(sitemap).toContain('<loc>https://my-makeup.fr/maquilleuses/haute-savoie</loc>')
		const plan = await (await request.get('/site-map')).text()
		expect(plan).toContain('href="/maquilleuses/haute-savoie"')
	})
})

test.describe('Une zone sans page', () => {
	test('un département inconnu, un code, une casse fausse et la racine répondent 404', async ({ request }) => {
		for (const path of ['/maquilleuses/inconnu', '/maquilleuses/74', '/maquilleuses/Haute-Savoie', '/maquilleuses'])
			expect((await request.get(path)).status(), path).toBe(404)
	})
})

test.describe('Un profil qui devient indisponible', () => {
	test('quitte la page au prochain passage', async ({ request }) => {
		test.setTimeout(180_000)
		const [leaving] = profiles
		if (!leaving) throw new Error('Aucun profil semé.')
		expect((await (await request.get(PAGE)).text()).includes(leaving.word)).toBe(true)
		const response = await request.patch(`/api/profiles/${leaving.id}`, {
			headers: leaving.headers,
			data: { available: false },
		})
		expect(response.ok()).toBe(true)
		await expect
			.poll(async () => (await (await request.get(PAGE)).text()).includes(leaving.word), { timeout: 60_000 })
			.toBe(false)
	})
})
