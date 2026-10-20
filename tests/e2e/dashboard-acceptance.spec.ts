import { expect, type Locator, type Page, test } from '@playwright/test'
import sharp from 'sharp'
import { createAccount, type TestAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { testPayload } from '../support/payload-test'
import { generatedProfile } from '../support/profile-factory'

/**
 * The final check of her space (ticket 142; plan 02 §9 P7, E37, E67, E68): played once, at 390 and
 * 1440 px, when every section is delivered. The sections each have their own spec; this one is what
 * they cannot say alone:
 *
 * - E67: axe finds no « serious » or « critical » violation on the page of the space, on the onboarding
 *   and on every panel, opened one after the other on the same full profile;
 * - E68 on every panel: Escape closes it and gives the focus back to the button that opened it;
 * - E37: a changed main photo reaches the public profile and its `og:image`;
 * - 200 % zoom (half the width in CSS pixels): nothing overflows sideways and no two elements overlap,
 *   on the page and in every panel.
 *
 * The orphans of the storage after the whole suite are not counted here but by the step that follows the
 * end-to-end tests in the CI (`bun run bench:reconcile --outside-import`, ticket 137).
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

/** The 12 panels of the space: the name of the button that opens each. */
const PANELS = [
	'Modifier mon identité',
	'Modifier ma description',
	'Modifier ma localisation',
	'Modifier mes compétences',
	'Modifier mes formations',
	'Modifier mes expériences',
	'Modifier mes langues',
	'Modifier mes réseaux',
	'Modifier mes coordonnées',
	'Modifier mes prestations',
	'Modifier ma photo principale',
	'Modifier mon portfolio',
] as const

const DELETION = 'Supprimer mon compte'

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${10 + (++counter % 200)}` })
)

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

type Artist = TestAccount<'maquilleuse'>

const isMobile = () => test.info().project.name === 'mobile'
const press = (cible: Locator) => (isMobile() ? cible.tap() : cible.click())

/** A makeup artist whose profile is full (identity, commune, texts, skills, offers), a session in the browser. */
async function fullArtist(context: {
	addCookies: (c: Artist['session']['cookies']) => Promise<void>
}): Promise<{ compte: Artist; slug: string }> {
	const account = await createAccount('maquilleuse')
	created.push(Number(account.id))
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
	const [sheet] = docs
	if (!sheet) throw new Error('pas de profil')
	// A commune far from the cities the search specs look at.
	const { slug: _, ...profile } = generatedProfile(5, {
		communes: [{ name: 'Lille', inseeCode: '59350', latitude: 50.63, longitude: 3.06 }],
	})
	const put = await payload.update({ collection: 'profiles', id: sheet.id, data: profile })
	await context.addCookies(account.session.cookies)
	return { compte: account, slug: put.slug ?? '' }
}

/** Waits for the page of the space, whose cards are streamed. */
async function openDashboard(page: Page) {
	await page.goto('/auth/profil')
	await expect(page.getByRole('heading', { level: 1, name: 'Mon espace' })).toBeVisible()
	await expect(page.getByTestId('carte-identite')).toBeVisible()
}

const dialogue = (page: Page) => page.getByRole('dialog')

/**
 * The elements a person reads or touches that cover one another: the pairs of visible headings, links,
 * buttons and fields, neither inside the other, whose boxes share more than a few pixels. A field and its
 * own label never overlap in the markup of the site, so any pair found is a fault.
 */
async function overlaps(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const SELECTOR = 'h1, h2, h3, a[href], button, input, select, textarea, label, [role="switch"], [role="status"]'
		const root = document.querySelector('[role="dialog"]') ?? document.body
		// One box per line of text: a link that wraps is not one wide box covering its neighbours.
		const visible = [...root.querySelectorAll<HTMLElement>(SELECTOR)].flatMap(element => {
			const style = getComputedStyle(element)
			const cache = style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0
			// The « sr-only » helpers and the skip links are not read as boxes.
			const mailboxes = [...element.getClientRects()].filter(boite => boite.width >= 4 && boite.height >= 4)
			return cache || mailboxes.length === 0 ? [] : [{ element, boites: mailboxes }]
		})
		const name = (element: HTMLElement) =>
			`${element.tagName.toLowerCase()}[${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 40)}]`
		const found: string[] = []
		for (let i = 0; i < visible.length; i++) {
			for (let j = i + 1; j < visible.length; j++) {
				const a = visible[i]
				const b = visible[j]
				if (!a || !b || a.element.contains(b.element) || b.element.contains(a.element)) continue
				const covers = a.boites.some(x =>
					b.boites.some(
						y =>
							Math.min(x.right, y.right) - Math.max(x.left, y.left) > 2 &&
							Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 2
					)
				)
				if (covers) found.push(`${name(a.element)} / ${name(b.element)}`)
			}
		}
		return found
	})
}

const overflow = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

/** Opens the panel, runs `controle` on it, closes it with Escape and checks that the focus is back on its button. */
async function browsePanels(page: Page, controle: (nom: string) => Promise<void>) {
	for (const name of [...PANELS, DELETION]) {
		const button = page.getByRole('button', { name: name, exact: true })
		await button.scrollIntoViewIfNeeded()
		await press(button)
		await expect(dialogue(page), name).toBeVisible()
		await controle(name)
		await page.keyboard.press('Escape')
		// A panel with a change asks before it closes: nothing is typed here, so the first Escape is enough.
		await expect(dialogue(page), name).toHaveCount(0)
		await expect(button, name).toBeFocused()
	}
}

test.describe('142 : la recette de l’espace', { tag: '@mobile' }, () => {
	test('E67, E68 : la page de l’espace et chacun des 12 panneaux et de la suppression : 0 violation grave, Échap rend le focus', async ({
		context,
		page,
	}) => {
		test.setTimeout(180_000)
		await fullArtist(context)
		await openDashboard(page)

		// All the buttons the page offers are the ones the walk opens: a panel added later is not left out.
		const buttons = await page
			.locator('main button[aria-label^="Modifier m"]')
			.evaluateAll(noeuds => noeuds.map(noeud => noeud.getAttribute('aria-label')).sort())
		expect(buttons).toEqual([...PANELS].sort())
		expect(await violationsSevere(page)).toEqual([])

		await browsePanels(page, async nom => {
			// Axe reads the dialog once the focus has moved into it.
			await expect(page.locator('[role="dialog"] :focus, [role="dialog"]:focus').first(), nom).toBeAttached()
			expect(await violationsSevere(page), nom).toEqual([])
		})

		const folder = process.env.DASHBOARD_SCREENSHOTS
		if (folder) await page.screenshot({ fullPage: true, path: `${folder}/recette-${test.info().project.name}.png` })
	})

	test('E67 : l’accueil en trois étapes, à chaque étape : 0 violation grave', async ({ context, page }) => {
		// A confirmed account whose profile is empty lands on the first step.
		const account = await createAccount('maquilleuse')
		created.push(Number(account.id))
		const payload = await testPayload()
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
		for (const { id } of docs) await payload.delete({ collection: 'profiles', id })
		await context.addCookies(account.session.cookies)

		await page.goto('/auth/init-account')
		await expect(page).toHaveTitle(/Prépare ton profil/)
		await expect(page.locator('#accueil-titre-etape')).toBeVisible()
		expect(await violationsSevere(page)).toEqual([])

		await page.getByLabel('Prénom').fill('Léa')
		await page.getByLabel('Nom', { exact: true }).fill('Fictive')
		await page.getByLabel(/Spécialité/).fill('Maquillage mariée')
		await press(page.getByRole('button', { name: /Continuer|Suivant|Enregistrer/ }).first())
		await expect(page.getByRole('combobox', { name: 'Ta commune' })).toBeVisible()
		expect(await violationsSevere(page)).toEqual([])
	})

	test('E37 : la photo principale changée : le profil public et son og:image suivent', async ({ context, page }) => {
		test.setTimeout(120_000)
		const { slug } = await fullArtist(context)
		const photo = (couleur: string) =>
			sharp({ create: { width: 1600, height: 1200, channels: 3, background: couleur } })
				.jpeg()
				.toBuffer()

		const shareImage = async () => {
			const response = await page.request.get(`/profil/${slug}`)
			expect(response.status()).toBe(200)
			const html = await response.text()
			const tag = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1]
			return tag?.replaceAll('&amp;', '&') ?? ''
		}
		const change = async (couleur: string, libelle: 'Choisir une photo' | 'Choisir une autre photo') => {
			await press(page.getByRole('button', { name: 'Modifier ma photo principale', exact: true }))
			await expect(dialogue(page)).toBeVisible()
			await page.getByLabel(libelle).setInputFiles({
				name: `${couleur.slice(1)}.jpg`,
				mimeType: 'image/jpeg',
				buffer: await photo(couleur),
			})
			await expect(page.getByRole('img', { name: 'Aperçu de la photo choisie' })).toBeVisible({ timeout: 60_000 })
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(dialogue(page)).toHaveCount(0, { timeout: 60_000 })
		}

		await openDashboard(page)
		await change('#aa3355', 'Choisir une photo')
		const first = await shareImage()
		expect(new URL(first).pathname).toBe('/_next/image')

		await change('#3355aa', 'Choisir une autre photo')
		const second = await shareImage()

		expect(new URL(second).pathname).toBe('/_next/image')
		expect(second).not.toBe(first)
		// The new picture is served, from the application, as an image.
		const read = new URL(second)
		const response = await page.request.get(`${read.pathname}${read.search}`)
		expect(response.status()).toBe(200)
		expect(response.headers()['content-type']).toMatch(/^image\//)
		const { dominant } = await sharp(await response.body()).stats()
		// Blue now, red before: the picture a visitor shares is the new one.
		expect(dominant.b).toBeGreaterThan(dominant.r)
	})

	test('zoom à 200 % : ni défilement de côté ni chevauchement, sur la page et dans chaque panneau', async ({
		context,
		page,
	}) => {
		test.setTimeout(180_000)
		await fullArtist(context)
		// 200 % of zoom halves the width in CSS pixels; the phone width is floored at 320, the width of WCAG 1.4.10.
		const size = page.viewportSize()
		if (!size) throw new Error('pas de taille')
		await page.setViewportSize({
			width: Math.max(320, Math.round(size.width / 2)),
			height: Math.round(size.height / 2),
		})
		await openDashboard(page)

		expect(await overflow(page), 'page').toBeLessThanOrEqual(0)
		expect(await overlaps(page), 'page').toEqual([])

		await browsePanels(page, async nom => {
			expect(await overflow(page), nom).toBeLessThanOrEqual(0)
			expect(await overlaps(page), nom).toEqual([])
		})
	})

	// The proof that the check can fail: without it, an empty list would prove nothing.
	test('le contrôle voit deux éléments qui se recouvrent, et pas un lien qui passe à la ligne', async ({ page }) => {
		await page.setContent(`<!doctype html><html lang="fr"><body style="width: 200px">
			<p>Un texte <a href="/a">avec un lien assez long pour passer à la ligne</a> <a href="/b">et un autre lien</a></p>
		</body></html>`)
		expect(await overlaps(page)).toEqual([])

		await page.setContent(`<!doctype html><html lang="fr"><body>
			<button style="position: absolute; top: 10px; left: 10px; width: 100px; height: 40px">Un</button>
			<button style="position: absolute; top: 20px; left: 60px; width: 100px; height: 40px">Deux</button>
		</body></html>`)
		expect(await overlaps(page)).toEqual(['button[Un] / button[Deux]'])
	})
})
