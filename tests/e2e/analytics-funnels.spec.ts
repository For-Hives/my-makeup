import { expect, test } from '@playwright/test'
import { type SearchProfile, setSearchProfiles } from '../fixtures/search-profiles'
import { createAccount } from '../support/account-factory'
import { activateProfile } from '../support/active-profile'
import { agentByTest, fakeUmami, type ReadingFakeUmami } from '../support/fake-umami'
import { testPayload } from '../support/payload-test'
import { createContent, deleteContent, refreshProfilePages } from '../support/public-pages'

/**
 * The funnels of 27/10/2026, in a browser that is not automated: the fake Umami of the bench receives what the site
 * relays. A click on the foot of a page, a card outside a typed search, the view of a profile and where it came from,
 * the 404 and its address, the depth of the reading of an article, its links and its share buttons. Nothing personal
 * may reach it: no name of a profile, no query, no address of a link.
 */

let umami: ReadingFakeUmami
let reference: SearchProfile

const suffix = Date.now().toString(36)
const article = `essai-entonnoir-${suffix}`
const identifiers: { collection: 'articles'; id: number }[] = []
const madeAccounts: (number | string)[] = []

const LONG_CONTENT = [
	'Un début avec [un lien du site](/blog) et [un lien d’ailleurs](https://www.cnil.fr/).',
	...['Première', 'Deuxième', 'Troisième', 'Quatrième'].map(
		part => `## Partie ${part}\n\n${'Un texte fictif de l’essai, assez long pour compter. '.repeat(40)}`
	),
].join('\n\n')

test.describe.configure({ mode: 'serial' })

type Data = Record<string, unknown>
const dataOf = (recu: { corps: unknown }): Data => (recu.corps as { payload: { data: Data } }).payload.data

test.describe('Les entonnoirs de la mesure', () => {
	test.use(agentByTest())

	test.beforeAll(async ({ request }) => {
		test.setTimeout(180_000)
		const profiles = await setSearchProfiles()
		const found = profiles.get('reference')
		if (!found) throw new Error('pas de profil d’essai « reference »')
		reference = found
		identifiers.push({
			collection: 'articles',
			id: await createContent(request, 'articles', {
				title: `Article d’essai ${suffix}`,
				slug: article,
				author: 'Une rédactrice fictive',
				seo_description: 'Une description écrite pour l’essai des entonnoirs.',
				content: LONG_CONTENT,
				_status: 'published',
			}),
		})
	})

	test.afterAll(async ({ request }) => {
		for (const item of identifiers) await deleteContent(request, item.collection, item.id)
		const payload = await testPayload()
		for (const account of madeAccounts.splice(0)) {
			const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account } } })
			for (const { id } of docs) {
				await payload
					.delete({ collection: 'quote-requests', where: { profile: { equals: id } } })
					.catch(() => undefined)
				await payload.delete({ collection: 'profiles', id }).catch(() => undefined)
			}
			await payload.delete({ collection: 'pros', id: account }).catch(() => undefined)
		}
	})

	test.beforeEach(async ({ context, request, userAgent }) => {
		await refreshProfilePages(request, reference)
		await context.addInitScript(() => {
			Object.defineProperty(navigator, 'webdriver', { get: () => false })
		})
		umami = fakeUmami().pourLAgent(userAgent)
	})

	test('un lien du pied de page : le mot du lien et la route de la page, rien d’autre', async ({ page }) => {
		await page.goto('/a-propos')
		await page.locator('footer').getByRole('link', { name: 'Contact', exact: true }).click({ noWaitAfter: true })
		await expect.poll(async () => (await umami.envois('cta_click')).length, { timeout: 10_000 }).toBe(1)
		const [click] = await umami.envois('cta_click')
		expect(click ? dataOf(click) : {}).toEqual({ where: 'footer_contact', page: '/a-propos' })
	})

	test('le bloc du bas d’une page : le mot d’avant, et la page qui le distingue des autres', async ({ page }) => {
		await page.goto('/a-propos')
		await page.getByRole('link', { name: 'Je suis maquilleuse' }).first().click({ noWaitAfter: true })
		await expect.poll(async () => (await umami.envois('cta_click')).length, { timeout: 10_000 }).toBe(1)
		const [click] = await umami.envois('cta_click')
		expect(click ? dataOf(click) : {}).toEqual({ where: 'cta_inscription', page: '/a-propos' })
	})

	test('une carte de la liste d’avant la recherche : card_click avec l’origine et le rang, jamais search_result_click', async ({
		page,
	}) => {
		await page.goto('/search')
		const cards = page.locator('section[aria-labelledby="recherche-selection"] a[href^="/profil/"]')
		await expect(cards.first()).toBeVisible()
		await cards.first().click()
		await expect.poll(async () => (await umami.envois('card_click')).length, { timeout: 10_000 }).toBe(1)
		const [click] = await umami.envois('card_click')
		const data = click ? dataOf(click) : {}
		expect(Object.keys(data).sort()).toEqual(['origin', 'pid', 'rank'])
		expect(['plus_consultees', 'classement']).toContain(data.origin)
		expect(data.rank).toBe(1)
		expect((await umami.envois('search_result_click')).length).toBe(0)

		// The view of the profile she lands on says where she came from: the page she left, not the referrer of the browser.
		await expect.poll(async () => (await umami.envois('profile_view')).length, { timeout: 10_000 }).toBe(1)
		const [view] = await umami.envois('profile_view')
		const seen = view ? dataOf(view) : {}
		expect(Object.keys(seen).sort()).toEqual(['from', 'pid'])
		expect(seen.from).toBe('recherche')
		expect(seen.pid).toBe(data.pid)
	})

	test('la vue d’un profil ouvert directement : « direct », une fois, et pas de nouveau au rechargement', async ({
		page,
	}) => {
		await page.goto(`/profil/${reference.slug}`)
		await expect.poll(async () => (await umami.envois('profile_view')).length, { timeout: 10_000 }).toBe(1)
		const [view] = await umami.envois('profile_view')
		expect(view ? dataOf(view).from : null).toBe('direct')
		await page.reload()
		await page.waitForFunction(() => 'umami' in window)
		await page.waitForLoadState('networkidle')
		expect((await umami.envois('profile_view')).length).toBe(1)
	})

	test('la 404 : l’adresse qui a manqué, sans le nom d’un profil ni la requête', async ({ page }) => {
		await page.goto('/cette-page-n-existe-pas?email=lea@example.test')
		await expect.poll(async () => (await umami.envois('not_found')).length, { timeout: 10_000 }).toBe(1)
		const [missing] = await umami.envois('not_found')
		expect(missing ? dataOf(missing) : {}).toEqual({ kind: 'autre', path: '/cette-page-n-existe-pas' })

		await page.goto('/profil/profil-qui-n-existe-pas')
		await expect.poll(async () => (await umami.envois('not_found')).length, { timeout: 10_000 }).toBe(2)
		const [, profile] = await umami.envois('not_found')
		expect(profile ? dataOf(profile) : {}).toEqual({ kind: 'profil', path: '/profil/[slug]' })
		// Every send of Umami carries the `url` of the page as it always did; the data of the event carries the route only.
		expect(JSON.stringify((await umami.envois('not_found')).map(dataOf))).not.toContain('qui-n-existe-pas')
	})

	test('le devis : le premier champ, l’envoi, l’erreur de saisie puis la réussite, avec le profil et jamais ce qui est tapé', async ({
		context,
		page,
	}) => {
		await context.setExtraHTTPHeaders({ 'x-forwarded-for': '192.0.2.77' })
		const account = await createAccount('maquilleuse')
		madeAccounts.push(account.id)
		const payload = await testPayload()
		await activateProfile(account.id)
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
		const found = docs[0]
		if (!found) throw new Error('pas de profil')
		await payload.update({
			collection: 'profiles',
			id: found.id,
			data: {
				chosenStatus: 'published',
				available: true,
				networks: { instagram: 'https://www.instagram.com/fictive' },
			},
		})
		const { docs: fresh } = await payload.find({
			collection: 'profiles',
			depth: 0,
			where: { id: { equals: found.id } },
		})
		const slug = fresh[0]?.slug ?? ''
		const typed = `cliente-${crypto.randomUUID()}@example.test`

		await page.goto(`/profil/${slug}`)
		const send = page.getByRole('button', { name: 'Envoyer ma demande' })
		await page.getByLabel('Lieu de l’événement').fill('Annecy')
		await expect.poll(async () => (await umami.envois('devis_click')).length, { timeout: 10_000 }).toBe(1)
		// A second field changes nothing: the form was opened once.
		await page.getByLabel('Votre prénom').fill('Camille')
		await send.click()
		await expect.poll(async () => (await umami.envois('quote_submit')).length, { timeout: 10_000 }).toBe(1)
		await expect.poll(async () => (await umami.envois('quote_error')).length, { timeout: 10_000 }).toBe(1)
		const [error] = await umami.envois('quote_error')
		const [opened] = await umami.envois('devis_click')
		const pid = opened ? dataOf(opened).pid : null
		expect(opened ? dataOf(opened) : {}).toEqual({ pid, from: 'profil' })
		expect(error ? dataOf(error) : {}).toEqual({ pid, cause: 'validation' })

		await page.getByLabel('Date de l’événement').fill('2028-06-12')
		await page.getByLabel('Type de prestation').selectOption('wedding')
		await page.getByLabel('Votre message').fill('Mariage civil, une trentaine d’invités.')
		await page.getByLabel('Votre email').fill(typed)
		await page.getByLabel(/J’accepte que ma demande/).check()
		await send.click()
		await expect(page.getByTestId('devis-envoye')).toBeVisible()
		await expect.poll(async () => (await umami.envois('demande_envoyee')).length, { timeout: 10_000 }).toBe(1)
		const [sent] = await umami.envois('demande_envoyee')
		expect(sent ? dataOf(sent) : {}).toEqual({ pid, source: 'profil' })
		expect((await umami.envois('quote_submit')).length).toBe(2)
		expect((await umami.envois('devis_click')).length).toBe(1)
		const events = JSON.stringify(
			(await umami.recus())
				.map(recu => (recu.corps as { payload: { name?: string; data?: Data } }).payload)
				.filter(payload => payload.name !== undefined && payload.name !== 'web-vitals')
				.map(payload => payload.data)
		)
		for (const secret of [typed, 'Camille', 'Annecy', 'Mariage civil', slug]) expect(events).not.toContain(secret)
	})

	test('un article : 50 % puis 90 % une fois chacun, ses liens et son partage par mots, jamais par adresse', async ({
		page,
	}) => {
		await page.route('https://www.linkedin.com/**', route => route.fulfill({ body: 'ok' }))
		await page.route('https://www.cnil.fr/**', route => route.fulfill({ body: 'ok' }))
		await page.goto(`/blog/${article}`)
		await page.waitForFunction(() => 'umami' in window)
		// Nothing is read before the first scroll.
		await page.waitForLoadState('networkidle')
		expect((await umami.envois('article_depth_50')).length).toBe(0)

		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
		await expect.poll(async () => (await umami.envois('article_depth_90')).length, { timeout: 10_000 }).toBe(1)
		expect((await umami.envois('article_depth_50')).length).toBe(1)
		const [deep] = await umami.envois('article_depth_90')
		expect(deep ? dataOf(deep) : {}).toEqual({ page: '/blog/[slug]' })
		// Scrolling up and down again counts nothing more.
		await page.evaluate(() => window.scrollTo(0, 0))
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
		await page.waitForLoadState('networkidle')
		expect((await umami.envois('article_depth_50')).length).toBe(1)
		expect((await umami.envois('article_depth_90')).length).toBe(1)

		const [popup] = await Promise.all([
			page.waitForEvent('popup'),
			page
				.getByTestId('partage')
				.getByRole('link', { name: /LinkedIn/ })
				.click(),
		])
		await popup.close()
		await expect.poll(async () => (await umami.envois('share_click')).length, { timeout: 10_000 }).toBe(1)
		const [share] = await umami.envois('share_click')
		expect(share ? dataOf(share) : {}).toEqual({ network: 'linkedin', page: '/blog/[slug]' })

		// The link of the text opens in this tab (routed to nothing): the click is counted before the page leaves.
		await page
			.locator('[data-article-body]')
			.getByRole('link', { name: 'un lien d’ailleurs' })
			.click({ noWaitAfter: true })
		await expect.poll(async () => (await umami.envois('article_link_click')).length, { timeout: 10_000 }).toBe(1)
		const [link] = await umami.envois('article_link_click')
		expect(link ? dataOf(link) : {}).toEqual({ kind: 'externe', page: '/blog/[slug]' })
		// The data of the events carries words, never an address (the `url` of each send is the page, as it always was).
		const events = JSON.stringify(
			(await umami.recus())
				.map(recu => (recu.corps as { payload: { name?: string; data?: Data } }).payload)
				// The Web Vitals carry the page they measured, as they always did: they are not the events of the funnels.
				.filter(payload => payload.name !== undefined && payload.name !== 'web-vitals')
				.map(payload => payload.data)
		)
		expect(events).not.toContain('cnil.fr')
		expect(events).not.toContain(article)
	})
})
