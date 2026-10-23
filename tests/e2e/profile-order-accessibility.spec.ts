import { expect, type Page, test } from '@playwright/test'
import { type PageProfile, pageProfilesUnderPrefix, setPageProfiles } from '../fixtures/page-profiles'
import { violationsSevere } from '../support/axe'
import { SCREENS } from '../support/e2e'
import { testPayload } from '../support/payload-test'

/**
 * The page of a profile on a phone and on a computer, and the accessibility of the shell (tickets 290,
 * 301 and 304; audit UX improvements 1, 5 and 23): the contact bar, the order of the blocks, the folded
 * sections, the « Aller au contenu » link, and the contrast of `/a-propos`. Each test sets its own
 * screen size. Set `SCREENSHOT_DIR` to a folder to keep the screenshots of the screens it opens.
 */

let profiles: ReadonlyMap<string, PageProfile>

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
	test.setTimeout(180_000)
	// Profiles of their own (« Rang … »): the other page specs take theirs away at their end.
	profiles = await setPageProfiles(pageProfilesUnderPrefix('Rang'))
})

test.afterAll(async () => {
	test.setTimeout(180_000)
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

const profile = (key: string): PageProfile => {
	const found = profiles.get(key)
	if (!found) throw new Error(`pas de profil d’essai « ${key} »`)
	return found
}

const MOBILE = SCREENS.mobile
const COMPUTER = SCREENS.chromium

/** The top of a title from the top of the page, in px. */
const topOf = (page: Page, title: string) =>
	page
		.getByRole('heading', { level: 2, name: title })
		.evaluate(element => element.getBoundingClientRect().top + scrollY)

const leftOf = (page: Page, title: string) =>
	page.getByRole('heading', { level: 2, name: title }).evaluate(element => element.getBoundingClientRect().left)

async function saveShot(page: Page, name: string): Promise<void> {
	if (process.env.SCREENSHOT_DIR)
		await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${name}.png`, fullPage: true })
}

async function withoutOverflow(page: Page): Promise<boolean> {
	return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
}

test.describe('304 : l’ordre de la fiche', () => {
	test('à 390 px, « Prestations et tarifs » est dans les 1 400 premiers px, après le contact et avant le portfolio', async ({
		page,
	}) => {
		await page.setViewportSize(MOBILE)
		await page.goto(`/profil/${profile('reference').slug}`)
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

		const contact = await topOf(page, 'Réseaux sociaux & contacts')
		const services = await topOf(page, 'Prestations et tarifs')
		const portfolio = await topOf(page, 'Portfolio')
		const about = await topOf(page, 'À propos')
		const skills = await topOf(page, 'Compétences')
		const experiences = await topOf(page, 'Expériences professionnelles')

		expect(services).toBeLessThan(1400)
		expect(contact).toBeLessThan(services)
		expect(services).toBeLessThan(portfolio)
		expect(portfolio).toBeLessThan(about)
		expect(about).toBeLessThan(skills)
		expect(skills).toBeLessThan(experiences)
		expect(await withoutOverflow(page)).toBe(true)
		await saveShot(page, 'fiche-390')
	})

	test('à 1440 px, les deux colonnes gardent leur ordre : à propos, portfolio, prestations, expériences à droite', async ({
		page,
	}) => {
		await page.setViewportSize(COMPUTER)
		await page.goto(`/profil/${profile('reference').slug}`)
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

		const right = ['À propos', 'Portfolio', 'Prestations et tarifs', 'Expériences professionnelles']
		const tops = await Promise.all(right.map(title => topOf(page, title)))
		expect(tops).toEqual([...tops].sort((a, b) => a - b))
		const left = ['Réseaux sociaux & contacts', 'Compétences', 'Langues', 'Formations & diplômes']
		const leftTops = await Promise.all(left.map(title => topOf(page, title)))
		expect(leftTops).toEqual([...leftTops].sort((a, b) => a - b))
		expect(await leftOf(page, 'Compétences')).toBeLessThan(await leftOf(page, 'À propos'))
		expect(await withoutOverflow(page)).toBe(true)
		await saveShot(page, 'fiche-1440')
	})
})

test.describe('304 : les sections repliées', () => {
	test('à 390 px elles sont repliées et s’ouvrent au clavier ; le texte reste dans le HTML du serveur', async ({
		page,
		request,
	}) => {
		const { slug } = profile('reference')
		const html = await (await request.get(`/profil/${slug}`)).text()
		expect(html).toContain('Maquillage longue tenue')
		expect(html).toContain('Italien')

		await page.setViewportSize(MOBILE)
		await page.goto(`/profil/${slug}`)
		const skills = page.locator('details', { has: page.getByRole('heading', { name: 'Compétences' }) })
		await expect.poll(() => skills.evaluate(element => (element as HTMLDetailsElement).open)).toBe(false)
		await expect(page.getByText('Maquillage longue tenue')).toBeHidden()

		await skills.locator('summary').focus()
		await page.keyboard.press('Enter')
		await expect(page.getByText('Maquillage longue tenue')).toBeVisible()
		expect(await skills.evaluate(element => (element as HTMLDetailsElement).open)).toBe(true)
		await saveShot(page, 'fiche-390-section-ouverte')
	})

	test('à 1440 px elles restent ouvertes, un appui sur le titre ne les ferme pas', async ({ page }) => {
		await page.setViewportSize(COMPUTER)
		await page.goto(`/profil/${profile('reference').slug}`)
		const skills = page.locator('details', { has: page.getByRole('heading', { name: 'Compétences' }) })

		await expect(page.getByText('Maquillage longue tenue')).toBeVisible()
		await page.getByRole('heading', { name: 'Compétences' }).click()
		expect(await skills.evaluate(element => (element as HTMLDetailsElement).open)).toBe(true)
	})
})

test.describe('290 : le bouton « Contacter »', () => {
	test('à 390 px la barre est collée en bas ; elle s’arrête avant le pied de page', async ({ page }) => {
		await page.setViewportSize(MOBILE)
		await page.goto(`/profil/${profile('reference').slug}`)
		const bar = page.getByRole('button', { name: /^Contacter/ })
		await expect(bar).toBeVisible()
		const box = await bar.boundingBox()
		expect(box?.height).toBeGreaterThanOrEqual(44)
		expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(MOBILE.height)

		await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
		const footer = page.getByRole('contentinfo')
		await expect(footer).toBeInViewport()
		const barBottom = await bar.evaluate(element => element.getBoundingClientRect().bottom)
		const footerTop = await footer.evaluate(element => element.getBoundingClientRect().top)
		expect(barBottom).toBeLessThanOrEqual(footerTop + 1)
	})

	test('à 1440 px le bouton est sous l’en-tête et la feuille ouvre quatre actions de 44 px au moins', async ({
		page,
	}) => {
		await page.setViewportSize(COMPUTER)
		await page.goto(`/profil/${profile('reference').slug}`)
		await page.getByRole('button', { name: /^Contacter/ }).click()
		const sheet = page.getByRole('dialog')
		await expect(sheet).toBeVisible()
		const links = sheet.getByRole('link')
		await expect(links).toHaveCount(4)
		for (const box of await Promise.all((await links.all()).map(link => link.boundingBox())))
			expect(box?.height).toBeGreaterThanOrEqual(44)
		expect(await violationsSevere(page)).toEqual([])
		await saveShot(page, 'feuille-1440')
		await page.keyboard.press('Escape')
		await expect(sheet).toBeHidden()
	})

	test('à 390 px la feuille monte du bas, sans défilement horizontal, et axe ne relève rien de grave', async ({
		page,
	}) => {
		await page.setViewportSize(MOBILE)
		await page.goto(`/profil/${profile('reference').slug}`)
		await page.getByRole('button', { name: /^Contacter/ }).click()
		const sheet = page.getByRole('dialog')
		await expect(sheet).toBeVisible()
		const box = await sheet.boundingBox()
		expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThanOrEqual(MOBILE.height - 1)
		expect(await withoutOverflow(page)).toBe(true)
		expect(await violationsSevere(page)).toEqual([])
		await saveShot(page, 'feuille-390')
	})

	test('un profil sans canal de contact n’a aucun bouton', async ({ page }) => {
		await page.setViewportSize(MOBILE)
		await page.goto(`/profil/${profile('sans-contact-public').slug}`)
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
		await expect(page.getByRole('button', { name: /^Contacter/ })).toHaveCount(0)
		await saveShot(page, 'fiche-sans-contact-390')
	})
})

test.describe('23 : le lien d’évitement et le contraste', () => {
	for (const path of ['/a-propos', '/search']) {
		test(`${path} : le premier Tab atterrit sur « Aller au contenu », Entrée met le focus dans main`, async ({
			page,
		}) => {
			await page.setViewportSize(COMPUTER)
			await page.goto(path)
			await page.keyboard.press('Tab')
			const skip = page.getByRole('link', { name: 'Aller au contenu' })
			await expect(skip).toBeFocused()
			await expect(skip).toBeInViewport()

			await page.keyboard.press('Enter')
			expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('MAIN')
			await page.keyboard.press('Tab')
			expect(await page.evaluate(() => document.activeElement?.closest('main') !== null)).toBe(true)
		})
	}

	test('/a-propos : axe ne relève aucun contraste, à 1440 px comme à 390 px', async ({ page }) => {
		for (const screen of [COMPUTER, MOBILE]) {
			await page.setViewportSize(screen)
			await page.goto('/a-propos')
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
			expect(await violationsSevere(page), `à ${screen.width} px`).toEqual([])
			await saveShot(page, `a-propos-${screen.width}`)
		}
	})
})
