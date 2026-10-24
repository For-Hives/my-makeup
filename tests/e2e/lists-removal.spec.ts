import { expect, type Locator, type Page, test } from '@playwright/test'
import { createAccount, type TestAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { EDIT_PATH } from '../support/direct-edit-e2e'
import { testPayload } from '../support/payload-test'
import { fileForPayload } from '../support/photos'

/**
 * The last check of the lessons of October on the lists edited in place (ticket 178; docs/qualite.md §3,
 * rules L4 and L5), played in a real browser on every list of her page (the blocks of the direct edition, issue 1022):
 *
 * - L4: after a removal, the focus stays inside the editor, by the keyboard and by a click or a tap;
 * - L5: the status zone is there and empty when the editor opens, and each removal is said in it.
 *
 * The seven lists: languages, skills (the chips), experiences, courses, service offers, the options of an
 * offer, and the photos of the portfolio. Each list has two rows or more, so a removal never empties it.
 * The unit tests of each panel play the seven rules in a simulated window; this one is the proof in the
 * browser the visitors use. All made-up people and photos.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `203.0.113.${20 + (++counter % 200)}` })
)

/** The accounts a test made: their profiles would crowd the lists of the search specs. */
const created: number[] = []
test.afterEach(async () => {
	const payload = await testPayload()
	for (const account of created.splice(0)) {
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account } } })
		for (const { id } of docs) await payload.delete({ collection: 'profiles', id }).catch(() => undefined)
		await payload.delete({ collection: 'media', where: { owner: { equals: account } } }).catch(() => undefined)
		await payload.delete({ collection: 'pros', id: account }).catch(() => undefined)
	}
})

type Artist = TestAccount<'maquilleuse'>

const OPTION = (name: string) => ({ name, description: '', priceText: 'sur devis' })

/** A makeup artist whose seven lists each hold two or three rows, with a session in the browser. */
async function artistWithLists(context: { addCookies: (c: Artist['session']['cookies']) => Promise<void> }) {
	const account = await createAccount('maquilleuse')
	created.push(Number(account.id))
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
	const [sheet] = docs
	if (!sheet) throw new Error('pas de profil')
	const gallery: number[] = []
	for (let i = 0; i < 3; i++) {
		const media = await payload.create({
			collection: 'media',
			data: { owner: Number(account.id), alt: 'Photo du portfolio' },
			file: fileForPayload(),
		})
		gallery.push(media.id)
	}
	await payload.update({
		collection: 'profiles',
		id: sheet.id,
		data: {
			firstName: 'Léa',
			lastName: 'Listes',
			specialty: 'Maquillage mariée',
			// A commune far from the cities the search specs look at.
			city: { name: 'Lille', inseeCode: '59350' },
			languages: [{ name: 'Français' }, { name: 'Anglais' }, { name: 'Espagnol' }],
			skills: [{ name: 'Teint' }, { name: 'Yeux' }, { name: 'Lèvres' }],
			experiences: [
				{ company: 'Studio Fictif', jobTitle: 'Maquilleuse', city: 'Lyon', startDate: '2020-03-01' },
				{ company: 'Atelier Fictif', jobTitle: 'Cheffe maquilleuse', city: 'Lyon', startDate: '2022-01-01' },
			],
			courses: [
				{ diploma: 'CAP esthétique', school: 'École Fictive', graduatedAt: '2018-06-30' },
				{ diploma: 'BP esthétique', school: 'École Fictive', graduatedAt: '2019-06-30' },
			],
			serviceOffers: [
				{ name: 'Maquillage de mariée', priceText: 'à partir de 80 €', options: [OPTION('Essai'), OPTION('Cils')] },
				{ name: 'Maquillage de soirée', priceText: 'à partir de 50 €', options: [] },
			],
			gallery,
		},
	})
	await context.addCookies(account.session.cookies)
}

const isMobile = () => test.info().project.name === 'mobile'
const press = (cible: Locator) => (isMobile() ? cible.tap() : cible.click())

const editor = (page: Page) => page.locator('[data-direct-edit-editor]')

/** True when the element that has the focus is inside the open editor. */
const focusInPanel = (page: Page) =>
	page.evaluate(() => {
		const panel = document.querySelector('[data-direct-edit-editor]')
		const active = document.activeElement
		return Boolean(panel && active && active !== panel && panel.contains(active))
	})

interface List {
	name: string
	/** The button of the block that opens the editor. */
	open: string
	/** The buttons that remove a row of the list, inside the editor. */
	removals: (page: Page) => Locator
	/** The zone that says each removal. */
	zone: (page: Page) => Locator
	/** What the status zone says after the removal of the first row. */
	announced: RegExp
	/** Opens the part of the editor the removals are in, when it is not in view at once. */
	prepare?: (page: Page) => Promise<void>
}

const announcement = (page: Page) => editor(page).getByTestId('removal-announcement')
const rowRemovals = (page: Page) => editor(page).locator('li[data-row] button[data-remove]')

const LISTS: readonly List[] = [
	{
		name: 'les langues',
		open: 'Modifier mes langues',
		removals: page => editor(page).locator('button[data-remove]'),
		zone: announcement,
		announced: /^Langue Français retirée$/,
	},
	{
		name: 'les compétences',
		open: 'Modifier mes compétences',
		removals: page => editor(page).locator('button[data-remove]'),
		zone: announcement,
		announced: /^Compétence Teint retirée$/,
	},
	{
		name: 'les expériences',
		open: 'Modifier mes expériences',
		removals: rowRemovals,
		zone: announcement,
		announced: /^Expérience Studio Fictif retirée$/,
	},
	{
		name: 'les formations',
		open: 'Modifier mes formations',
		removals: rowRemovals,
		zone: announcement,
		announced: /^Formation CAP esthétique retirée$/,
	},
	{
		name: 'les prestations',
		open: 'Modifier mes prestations',
		removals: rowRemovals,
		zone: announcement,
		announced: /^Prestation Maquillage de mariée retirée$/,
	},
	{
		name: 'les options d’une prestation',
		open: 'Modifier mes prestations',
		removals: page => editor(page).getByRole('button', { name: /^Retirer l’option / }),
		zone: announcement,
		announced: /^Option Essai retirée$/,
		prepare: async page => {
			await press(
				editor(page)
					.locator('li[data-row]')
					.first()
					.getByRole('button', { name: /^Modifier / })
			)
			await expect(editor(page).getByRole('button', { name: /^Retirer l’option / })).toHaveCount(2)
		},
	},
	{
		name: 'les photos du portfolio',
		open: 'Modifier mon portfolio',
		removals: page => editor(page).getByRole('button', { name: /^Retirer la photo / }),
		zone: page => editor(page).getByTestId('gallery-announcement'),
		announced: /^Photo 1 sur 3 de ton portfolio est retirée\./,
	},
]

test.describe('178 : chaque liste de sa page, au retrait d’une ligne', { tag: '@mobile' }, () => {
	for (const list of LISTS) {
		test(`L4, L5 : ${list.name} : le focus reste dans l’éditeur, le retrait est annoncé`, async ({ context, page }) => {
			test.setTimeout(90_000)
			await artistWithLists(context)
			await page.goto(EDIT_PATH)
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
			await page.waitForLoadState('networkidle')
			await press(page.getByRole('button', { name: list.open, exact: true }))
			await expect(editor(page)).toBeVisible()
			await list.prepare?.(page)

			// L5: the zone is there when the editor opens, and empty.
			const zone = list.zone(page)
			await expect(zone).toBeAttached()
			await expect(zone).toHaveText('')

			const removals = list.removals(page)
			const before = await removals.count()
			expect(before, `les lignes de ${list.name}`).toBeGreaterThanOrEqual(2)

			// By the keyboard: the button has the focus, Enter removes the row.
			await removals.first().focus()
			await removals.first().press('Enter')
			await expect(removals).toHaveCount(before - 1)
			await expect(zone).toHaveText(list.announced)
			expect(await focusInPanel(page), `focus après un retrait au clavier : ${list.name}`).toBe(true)

			// By a click or a tap, which never puts the focus on a field (it would open the keyboard of a phone).
			const announced = await zone.textContent()
			await press(removals.first())
			await expect(removals).toHaveCount(before - 2)
			await expect(zone).not.toHaveText(announced ?? '')
			await expect(zone).not.toHaveText('')
			expect(await focusInPanel(page), `focus après un retrait au clic : ${list.name}`).toBe(true)
			expect(await page.evaluate(() => document.activeElement?.tagName)).not.toMatch(/^(INPUT|TEXTAREA)$/)

			expect(await violationsSevere(page), list.name).toEqual([])
		})
	}
})
