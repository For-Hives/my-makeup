import { expect, type Page, test } from '@playwright/test'
import { placeProfile, readDemoPhoto } from '../../src/demo-data/loading'
import { DEMO_PROFILES } from '../../src/demo-data/profiles'
import { setSearchProfiles, TEST_WORD } from '../fixtures/search-profiles'
import { violationsSevere } from '../support/axe'
import { SCREENS } from '../support/e2e'
import { testPayload } from '../support/payload-test'
import { refreshProfilePages } from '../support/public-pages'

/**
 * The filters and the sort of the search (issue 1011), at 390 px and at 1440 px: every choice is a link that keeps
 * the word and the city, the budget, the sort and the layout are in the address and survive the pages, an emptied
 * search says the filters did it. On each screen: no horizontal scroll, every control at least 44 px tall, axe finds no
 * « serious » or « critical » violation. Set `SCREENSHOT_DIR` to keep the screenshots. All made-up people.
 */

const SIZES = [SCREENS.mobile, SCREENS.chromium] as const
const WORD = encodeURIComponent(TEST_WORD)

/** A profile of its own, named by a word only it carries, that chose the bullet « Cinéma et scène ». */
const SPECIALTY_WORD = `Specialite${Date.now().toString(36)}`
let specialtyProfile: { id: number; slug: string }

test.beforeAll(async () => {
	test.setTimeout(180_000)
	await setSearchProfiles()
	const template = DEMO_PROFILES.find(type => type.cle === 'reference')
	if (!template) throw new Error('Le profil type « reference » du jeu fictif manque.')
	const placed = await placeProfile(
		await testPayload(),
		{
			...template,
			cle: `essai-${SPECIALTY_WORD.toLowerCase()}`,
			compte: { email: `essai-${SPECIALTY_WORD.toLowerCase()}@example.test`, nom: `Essai ${SPECIALTY_WORD}` },
			profil: {
				...template.profil,
				firstName: 'Essai',
				lastName: SPECIALTY_WORD,
				artistName: `Essai ${SPECIALTY_WORD} Maquillage`,
				specialtyBullets: ['screenStage'],
			},
			photos: { principale: template.photos.principale, galerie: [] },
		},
		readDemoPhoto,
		false
	)
	specialtyProfile = { id: placed.profil, slug: placed.slug }
})

test.afterAll(async () => {
	test.setTimeout(180_000)
	const payload = await testPayload()
	const profile = await payload
		.findByID({ collection: 'profiles', id: specialtyProfile.id, depth: 0, select: { pro: true } })
		.catch(() => null)
	if (!profile) return
	await payload.delete({ collection: 'profiles', id: specialtyProfile.id }).catch(() => undefined)
	const pro = typeof profile.pro === 'object' ? profile.pro.id : profile.pro
	if (pro !== undefined && pro !== null) await payload.delete({ collection: 'pros', id: pro }).catch(() => undefined)
})

async function checkScreen(page: Page, label: string): Promise<void> {
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
		`${label} : défilement horizontal`
	).toBeLessThanOrEqual(0)
	const small = await page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('main a, main button, main select, main summary')]
			.filter(element => {
				// A card is one target: its name link is stretched over the article, which is what is measured.
				const box = (element.closest('article') ?? element).getBoundingClientRect()
				if (box.width === 0 || box.height === 0) return false
				if (element.tagName === 'A' && element.closest('p')) return false
				return box.height < 44
			})
			.map(element => `${element.tagName} ${element.textContent?.trim().slice(0, 40)}`)
	)
	expect(small, `${label} : cibles de moins de 44 px`).toEqual([])
	expect(await violationsSevere(page), `${label} : axe`).toEqual([])
}

async function shot(page: Page, name: string): Promise<void> {
	if (process.env.SCREENSHOT_DIR)
		await page.screenshot({
			path: `${process.env.SCREENSHOT_DIR}/1011-${name}-${page.viewportSize()?.width}.png`,
			fullPage: true,
		})
}

/** The number in the h1 (« 6 résultats pour … »). */
async function countOf(page: Page): Promise<number> {
	const title = (await page.getByRole('heading', { level: 1 }).textContent()) ?? ''
	return Number(/^(\d+)/.exec(title)?.[1] ?? 0)
}

for (const size of SIZES) {
	test.describe(`1011 à ${size.width} px`, () => {
		test.use({ viewport: size })

		test('le budget de l’adresse est lu, signalé, et réduit la liste ; sans prix assez variés, aucune tranche n’est devinée', async ({
			page,
		}) => {
			await page.goto(`/search?search=${WORD}&city=Annecy`)
			const all = await countOf(page)
			expect(all).toBeGreaterThan(1)
			await checkScreen(page, 'recherche')
			await shot(page, 'recherche')

			// The bench has one starting price for everyone: no band is offered (a cut would be a guess), and a budget
			// in the address is still read and shown as a choice of its own.
			await expect(page.getByRole('group', { name: 'Budget' })).toHaveCount(0)
			await page.goto(`/search?search=${WORD}&city=Annecy&maxPrice=50`)
			const budget = page.getByRole('group', { name: 'Budget' })
			await expect(budget.getByRole('link', { name: /^Jusqu’à 50/ })).toHaveAttribute('aria-current', 'true')
			const filtered = await countOf(page)
			expect(filtered).toBeGreaterThan(0)
			expect(filtered).toBeLessThan(all)
			await expect(page).toHaveURL(new RegExp(`search=${TEST_WORD}`))
			await expect(page).toHaveURL(/city=Annecy/)
			await expect(page.getByText('sur devis', { exact: false })).toBeVisible()
			await expect(page.getByRole('link', { name: 'Réinitialiser' })).toBeVisible()
			await checkScreen(page, 'filtre de budget')
			await shot(page, 'filtre-budget')
		})

		test('un budget d’un lien partagé reste visible, se lit dans l’adresse et se retire', async ({ page }) => {
			await page.goto(`/search?search=${WORD}&city=Annecy&minPrice=7&maxPrice=1234`)
			await expect(page.getByRole('link', { name: /^De 7 à 1234/ })).toHaveAttribute('aria-current', 'true')
			await page.getByRole('link', { name: 'Réinitialiser' }).click()
			await expect(page).toHaveURL(new RegExp(`/search\\?search=${TEST_WORD}&city=Annecy$`))
		})

		test('la présentation : la liste en cartes en ligne, la grille en cartes verticales, dans l’adresse', async ({
			page,
		}) => {
			await page.goto(`/search?search=${WORD}&city=Annecy`)
			const all = await countOf(page)
			await expect(page.locator('[data-profile-row-card]')).toHaveCount(all)
			await expect(page.locator('[data-profile-card]')).toHaveCount(0)
			await page.getByRole('link', { name: 'Grille' }).click()
			await expect(page).toHaveURL(/layout=grid/)
			await expect(page.locator('[data-profile-card]')).toHaveCount(all)
			await expect(page.getByRole('link', { name: 'Grille' })).toHaveAttribute('aria-current', 'true')
			await checkScreen(page, 'grille')
			await shot(page, 'grille')
			await page.getByRole('link', { name: 'Liste' }).click()
			await expect(page).not.toHaveURL(/layout/)
			await expect(page.locator('[data-profile-row-card]')).toHaveCount(all)
		})

		test('le tri par prix met le moins cher en premier, sans changer le nombre de résultats', async ({ page }) => {
			await page.goto(`/search?search=${WORD}&city=Annecy`)
			const all = await countOf(page)
			await page.goto(`/search?search=${WORD}&city=Annecy&sort=price`)
			expect(await countOf(page)).toBe(all)
			await expect(page.getByRole('group', { name: 'Trier par' }).getByRole('link', { name: /bas/ })).toHaveAttribute(
				'aria-current',
				'true'
			)
			const prices = await page
				.locator('main article')
				.evaluateAll(cards =>
					cards.map(card =>
						Number(/dès\s+(\d[\d\s  ]*)/.exec(card.textContent ?? '')?.[1]?.replace(/\D/g, '') ?? Number.NaN)
					)
				)
			const priced = prices.filter(price => !Number.isNaN(price))
			expect(priced.length).toBeGreaterThan(1)
			// The sort acts in each section: the first section is non-decreasing.
			const firstSection = await page
				.locator('section')
				.first()
				.locator('article')
				.evaluateAll(cards =>
					cards.map(card =>
						Number(/dès\s+(\d[\d\s  ]*)/.exec(card.textContent ?? '')?.[1]?.replace(/\D/g, '') ?? Number.NaN)
					)
				)
			const firstPriced = firstSection.filter(price => !Number.isNaN(price))
			expect(firstPriced).toEqual(firstPriced.toSorted((a, b) => a - b))
			await checkScreen(page, 'tri par prix')
		})

		test('la spécialité : seules les puces choisies par une maquilleuse sont proposées, et le filtre les garde', async ({
			page,
			request,
		}) => {
			await refreshProfilePages(request, { id: specialtyProfile.id, specialite: null })
			await page.goto(`/search?search=${SPECIALTY_WORD}`)
			const group = page.getByRole('group', { name: 'Spécialité' })
			await expect(group).toBeVisible()
			await expect(group.getByRole('link', { name: 'Toutes' })).toHaveAttribute('aria-current', 'true')
			await expect(group.getByRole('link', { name: 'Cinéma et scène' })).toBeVisible()

			await group.getByRole('link', { name: 'Cinéma et scène' }).click()
			await expect(page).toHaveURL(/specialty=screenStage/)
			await expect(page.locator(`a[href="/profil/${specialtyProfile.slug}"]`)).toBeVisible()
			await checkScreen(page, 'filtre de spécialité')

			await page.goto(`/search?search=${SPECIALTY_WORD}&specialty=wedding`)
			await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aucune maquilleuse ne correspond à ces filtres')
		})

		test('un filtre qui ne laisse personne le dit, et propose de le retirer', async ({ page }) => {
			// « Golf » is only the surname of a profile with no amount (« sur devis »).
			await page.goto('/search?search=Golf&maxPrice=50')
			await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aucune maquilleuse ne correspond à ces filtres')
			await expect(page.locator('main')).not.toContainText('Personne n’est encore inscrite')
			await checkScreen(page, 'filtre sans résultat')
			await shot(page, 'filtre-vide')
			await page.getByRole('link', { name: 'Voir toutes les maquilleuses de cette recherche' }).click()
			await expect(page).toHaveURL(/\/search\?search=Golf$/)
			await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^\d+ résultats? pour « Golf »$/)
		})

		test('une valeur inconnue est ignorée : l’adresse d’avant répond comme avant', async ({ page }) => {
			await page.goto(`/search?search=${WORD}&city=Annecy`)
			const before = await countOf(page)
			await page.goto(`/search?search=${WORD}&city=Annecy&maxPrice=3&minPrice=abc&layout=mosaic&sort=nimportequoi`)
			expect(await countOf(page)).toBe(before)
			await expect(page.getByRole('link', { name: 'Réinitialiser' })).toHaveCount(0)
			await expect(
				page.getByRole('group', { name: 'Trier par' }).getByRole('link', { name: 'Pertinence' })
			).toHaveAttribute('aria-current', 'true')
			await expect(page.locator('[data-profile-row-card]').first()).toBeVisible()
		})
	})
}
