import { expect, type Locator, test } from '@playwright/test'
import { type PageProfile, setPageProfiles } from '../fixtures/page-profiles'
import { createAccount, type TestAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { users } from '../support/lock'
import { testPayload } from '../support/payload-test'
import { createContent, deleteContent } from '../support/public-pages'

/**
 * The accessibility of the 15 key pages (ticket 178; plan 02 §10.1 point 3): axe finds no « serious » or
 * « critical » violation on any of them, at 1440 px and at 390 px, the editing panels of her space included.
 *
 * - the 12 pages anyone can open: home, search, a public profile, a talent, the blog, an article, the contact
 *   page, a legal page, the sign-in, the sign-up, the forgotten-password page, and the 404;
 * - the 3 pages of her space: the space itself, the preview of her profile and the first step of the
 *   onboarding. On the space, four panels of different kinds are opened one after the other (a text, a
 *   commune search, a list with options, the portfolio): E67 and E68 (tests/e2e/dashboard-acceptance.spec.ts)
 *   walk all twelve and the deletion.
 *
 * Each page waits for its own heading before axe reads it. The list of the 15 is a value of this file, and the
 * last test fails if it does not hold 15 pages: a page cannot be dropped without the count saying so.
 * All made-up people.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `203.0.113.${230 + (++counter % 20)}` })
)

const suffix = Date.now().toString(36)
const talent = `essai-axe-talent-${suffix}`
const article = `essai-axe-article-${suffix}`
const content: { collection: 'talents' | 'articles'; id: number }[] = []
let profiles: ReadonlyMap<string, PageProfile>

// One worker for the whole file: one set-up and one clean-up serve all its tests.
test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
	test.setTimeout(180_000)
	await users('profils-de-page', 1)
	profiles = await setPageProfiles()
	content.push(
		{
			collection: 'talents',
			id: await createContent(request, 'talents', {
				title: `Talent ${suffix}`,
				slug: talent,
				pageTitle: 'Maquillage fictif : une maquilleuse près de chez vous',
				description: 'Une présentation écrite pour l’essai d’accessibilité.',
				content: '# Un titre du texte\n\nUn paragraphe avec du **gras**.\n',
				_status: 'published',
			}),
		},
		{
			collection: 'articles',
			id: await createContent(request, 'articles', {
				title: `Article ${suffix}`,
				slug: article,
				author: 'Une rédactrice fictive',
				content: '# Un titre du texte\n\nUn paragraphe avec un [lien](/blog) et du **gras**.\n',
				_status: 'published',
			}),
		}
	)
})

test.afterAll(async ({ request }) => {
	test.setTimeout(180_000)
	for (const { collection, id } of content) await deleteContent(request, collection, id)
	// The two projects share these profiles: the last one to end takes them away.
	if ((await users('profils-de-page', -1)) > 0 || !profiles) return
	const payload = await testPayload()
	for (const { id } of profiles.values()) {
		const profile = await payload
			.findByID({ collection: 'profiles', id, depth: 0, select: { pro: true } })
			.catch(() => null)
		if (!profile) continue
		await payload.delete({ collection: 'profiles', id })
		const pro = typeof profile.pro === 'object' ? profile.pro.id : profile.pro
		if (pro !== undefined && pro !== null) await payload.delete({ collection: 'pros', id: pro }).catch(() => undefined)
	}
})

/** The accounts a test made: their profiles would crowd the lists of the search specs. */
const created: number[] = []
test.afterEach(async () => {
	const payload = await testPayload()
	for (const account of created.splice(0)) {
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account } } })
		for (const { id } of docs) await payload.delete({ collection: 'profiles', id }).catch(() => undefined)
		await payload.delete({ collection: 'pros', id: account }).catch(() => undefined)
	}
})

interface KeyPage {
	name: string
	path: string
	/** The heading the page shows once it is ready; axe reads the page after it. */
	heading: string | RegExp
}

const profileSlug = (): string => {
	const found = profiles.get('reference')
	if (!found) throw new Error('pas de profil d’essai « reference »')
	return found.slug
}

/** The 12 pages anyone can open. The addresses that hold a slug are built when the test runs. */
const PUBLIC_PAGES: readonly (() => KeyPage)[] = [
	() => ({ name: 'l’accueil', path: '/', heading: /Trouver la maquilleuse/ }),
	() => ({ name: 'la recherche d’une ville', path: '/search?city=Annecy', heading: /\S/ }),
	() => ({ name: 'un profil public', path: `/profil/${profileSlug()}`, heading: /\S/ }),
	() => ({ name: 'un talent', path: `/talent/${talent}`, heading: `Talent ${suffix}` }),
	() => ({ name: 'le blog', path: '/blog', heading: /\S/ }),
	() => ({ name: 'un article', path: `/blog/${article}`, heading: `Article ${suffix}` }),
	() => ({ name: 'la page de contact', path: '/contact', heading: /\S/ }),
	() => ({ name: 'les mentions légales', path: '/mentions-legales', heading: /\S/ }),
	() => ({ name: 'la connexion', path: '/auth/signin', heading: /\S/ }),
	() => ({ name: 'l’inscription', path: '/auth/signup', heading: /\S/ }),
	() => ({ name: 'le mot de passe oublié', path: '/auth/mot-de-passe-oublie', heading: /\S/ }),
	() => ({ name: 'la page 404', path: '/cette-page-n-existe-pas', heading: /\S/ }),
]

const SPACE_PAGES = [
	{ name: 'l’espace', path: '/auth/profil' },
	{ name: 'l’aperçu du profil', path: '/auth/apercu-profil' },
	{ name: 'la première étape de l’accueil', path: '/auth/init-account' },
] as const

test.describe('178 : l’analyse automatique des 15 pages clés', { tag: '@mobile' }, () => {
	for (const [rank, makePage] of PUBLIC_PAGES.entries()) {
		test(`page ${rank + 1} sur 15, ouverte à tous : aucune violation grave`, async ({ page }) => {
			const { name, path, heading } = makePage()
			const response = await page.goto(path)
			expect(response?.status(), name).toBe(path.includes('n-existe-pas') ? 404 : 200)
			await expect(page.getByRole('heading', { level: 1 }).first(), name).toBeVisible()
			if (typeof heading === 'string')
				await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
			expect(await violationsSevere(page), name).toEqual([])
		})
	}

	test('la recherche sans résultat et le formulaire de contact avec ses erreurs : aucune violation grave', async ({
		page,
	}) => {
		await page.goto('/search?city=Annecy&search=zzzxqjkw')
		await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
		expect(await violationsSevere(page), 'la recherche sans résultat').toEqual([])

		await page.goto('/contact')
		await page.getByRole('button', { name: /Envoyer/ }).click()
		await expect(page.getByRole('alert').first()).toBeVisible()
		expect(await violationsSevere(page), 'le contact avec ses erreurs').toEqual([])
	})
})

type Artist = TestAccount<'maquilleuse'>
const isMobile = () => test.info().project.name === 'mobile'
const press = (cible: Locator) => (isMobile() ? cible.tap() : cible.click())

async function fullArtist(context: { addCookies: (c: Artist['session']['cookies']) => Promise<void> }) {
	const account = await createAccount('maquilleuse')
	created.push(Number(account.id))
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
	const [sheet] = docs
	if (!sheet) throw new Error('pas de profil')
	await payload.update({
		collection: 'profiles',
		id: sheet.id,
		data: {
			firstName: 'Léa',
			lastName: 'Axe',
			specialty: 'Maquillage mariée',
			city: { name: 'Lille', inseeCode: '59350' },
			description: 'Je maquille pour les mariages et les soirées. '.repeat(6),
			skills: [{ name: 'Teint' }, { name: 'Yeux' }],
			serviceOffers: [
				{
					name: 'Maquillage de mariée',
					priceText: 'à partir de 80 €',
					options: [{ name: 'Essai', description: '', priceText: 'sur devis' }],
				},
			],
		},
	})
	await context.addCookies(account.session.cookies)
}

test.describe('178 : les 3 pages de l’espace, panneaux ouverts', { tag: '@mobile' }, () => {
	test('l’espace et quatre panneaux de nature différente : aucune violation grave', async ({ context, page }) => {
		test.setTimeout(120_000)
		await fullArtist(context)
		await page.goto(SPACE_PAGES[0].path)
		await expect(page.getByRole('heading', { level: 1, name: 'Mon espace' })).toBeVisible()
		await expect(page.getByTestId('carte-identite')).toBeVisible()
		expect(await violationsSevere(page), SPACE_PAGES[0].name).toEqual([])

		for (const panel of [
			'Modifier mon identité',
			'Modifier ma localisation',
			'Modifier mes prestations',
			'Modifier mon portfolio',
		]) {
			const button = page.getByRole('button', { name: panel, exact: true })
			await button.scrollIntoViewIfNeeded()
			await press(button)
			await expect(page.getByRole('dialog'), panel).toBeVisible()
			await expect(page.locator('[role="dialog"] :focus, [role="dialog"]:focus').first(), panel).toBeAttached()
			expect(await violationsSevere(page), panel).toEqual([])
			await page.keyboard.press('Escape')
			await expect(page.getByRole('dialog'), panel).toHaveCount(0)
		}
	})

	test('l’aperçu du profil : aucune violation grave', async ({ context, page }) => {
		await fullArtist(context)
		await page.goto(SPACE_PAGES[1].path)
		await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
		expect(await violationsSevere(page), SPACE_PAGES[1].name).toEqual([])
	})

	test('la première étape de l’accueil : aucune violation grave', async ({ context, page }) => {
		const account = await createAccount('maquilleuse')
		created.push(Number(account.id))
		const payload = await testPayload()
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
		for (const { id } of docs) await payload.delete({ collection: 'profiles', id })
		await context.addCookies(account.session.cookies)
		await page.goto(SPACE_PAGES[2].path)
		await expect(page.locator('#accueil-titre-etape')).toBeVisible()
		expect(await violationsSevere(page), SPACE_PAGES[2].name).toEqual([])
	})

	test('la liste compte 15 pages différentes', () => {
		expect(PUBLIC_PAGES.length + SPACE_PAGES.length).toBe(15)
		expect(new Set(SPACE_PAGES.map(({ path }) => path)).size).toBe(SPACE_PAGES.length)
	})
})
