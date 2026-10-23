import { expect, type Locator, test } from '@playwright/test'
import { createAccount, type TestAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { openFurtherCards } from '../support/further-cards'
import { testPayload } from '../support/payload-test'

/**
 * The three lists of rows of her space, in a real browser (ticket 176; plan 02 E21, E23, E24 and E27):
 * the commune and the radius, then the courses, the experiences and the service offers with their options. For each one: a row is added in the panel,
 * « Enregistrer » closes it with the saying that the list is saved, the card of the page shows the row, the
 * row is the one stored, and after a reload it is still there. Until now these lists had their round trip to
 * the database in the integration tests (tests/integration/dashboard-lists.test.ts) and their behaviour in
 * the panel tests, but no test in a browser. All made-up people.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${150 + (++counter % 100)}` })
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

async function artist(context: { addCookies: (c: Artist['session']['cookies']) => Promise<void> }) {
	const account = await createAccount('maquilleuse')
	created.push(Number(account.id))
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
	const [sheet] = docs
	if (!sheet) throw new Error('pas de profil')
	await payload.update({
		collection: 'profiles',
		id: sheet.id,
		data: { firstName: 'Léa', lastName: 'Listes', specialty: 'Maquillage mariée' },
	})
	await context.addCookies(account.session.cookies)
	return { id: sheet.id }
}

async function stored(id: number) {
	const payload = await testPayload()
	return payload.findByID({ collection: 'profiles', id, depth: 0 })
}

test.describe('E21, E23, E24, E27 : la zone et les listes de lignes, de bout en bout', { tag: '@mobile' }, () => {
	test('E21 : une commune choisie dans la liste officielle et un rayon, enregistrés, relus après rechargement', async ({
		context,
		page,
	}) => {
		const { id } = await artist(context)
		await page.goto('/auth/profil')
		await openFurtherCards(page)
		await press(page.getByRole('button', { name: 'Modifier ma localisation', exact: true }))
		const dialog = page.getByRole('dialog')
		await dialog.getByRole('combobox', { name: 'Où travailles-tu ?' }).fill('Lille')
		await press(page.getByRole('option', { name: /^Lille \(59\)/ }).first())
		await dialog.getByLabel('Rayon d’action (en km)').fill('35')
		expect(await violationsSevere(page)).toEqual([])
		await press(dialog.getByRole('button', { name: 'Enregistrer' }))

		await expect(dialog).toHaveCount(0)
		await expect(page.getByTestId('carte-localisation')).toContainText('Lille')
		const profile = await stored(id)
		expect(profile.city?.name).toBe('Lille')
		expect(profile.radiusKm).toBe(35)

		await page.reload()
		await openFurtherCards(page)
		await expect(page.getByTestId('carte-localisation')).toContainText('Lille')
	})

	test('E23 : une formation ajoutée, enregistrée, relue après rechargement', async ({ context, page }) => {
		const { id } = await artist(context)
		await page.goto('/auth/profil')
		await openFurtherCards(page)
		await press(page.getByRole('button', { name: 'Modifier mes formations', exact: true }))
		const dialog = page.getByRole('dialog')
		await dialog.getByLabel('Diplôme', { exact: true }).fill('CAP esthétique')
		await dialog.getByLabel('École', { exact: true }).fill('École Fictive')
		await dialog.getByLabel('Date d’obtention').fill('2018-06-30')
		await press(dialog.getByRole('button', { name: 'Ajouter', exact: true }))
		await expect(dialog.getByRole('button', { name: /^Retirer la formation CAP esthétique/ })).toBeVisible()
		expect(await violationsSevere(page)).toEqual([])
		await press(dialog.getByRole('button', { name: 'Enregistrer' }))

		await expect(dialog).toHaveCount(0)
		await expect(page.getByRole('status').filter({ hasText: 'Tes formations sont enregistrées.' })).toBeVisible()
		await expect(page.getByTestId('carte-formations')).toContainText('CAP esthétique - École Fictive - juin 2018')
		const rows = (await stored(id)).courses ?? []
		expect(rows.map(({ diploma, school }) => [diploma, school])).toEqual([['CAP esthétique', 'École Fictive']])
		expect(rows[0]?.graduatedAt?.slice(0, 10)).toBe('2018-06-30')

		await page.reload()
		await openFurtherCards(page)
		await expect(page.getByTestId('carte-formations')).toContainText('CAP esthétique - École Fictive')
	})

	test('E24 : une expérience ajoutée, enregistrée, relue après rechargement ; une fin avant le début est refusée', async ({
		context,
		page,
	}) => {
		const { id } = await artist(context)
		await page.goto('/auth/profil')
		await openFurtherCards(page)
		await press(page.getByRole('button', { name: 'Modifier mes expériences', exact: true }))
		const dialog = page.getByRole('dialog')
		await dialog.getByLabel('Poste', { exact: true }).fill('Maquilleuse')
		await dialog.getByLabel('Entreprise', { exact: true }).fill('Studio Fictif')
		await dialog.getByLabel('Ville', { exact: true }).fill('Lyon')
		await dialog.getByLabel('Début', { exact: true }).fill('2020-03-01')
		await dialog.getByLabel('Fin', { exact: true }).fill('2019-01-01')
		await press(dialog.getByRole('button', { name: 'Ajouter', exact: true }))
		await expect(dialog.getByText('La fin d’une expérience ne peut pas précéder son début.')).toBeVisible()
		await expect(dialog.getByRole('button', { name: /^Retirer l’expérience/ })).toHaveCount(0)

		await dialog.getByLabel('Fin', { exact: true }).fill('')
		await press(dialog.getByRole('button', { name: 'Ajouter', exact: true }))
		await expect(dialog.getByRole('button', { name: /^Retirer l’expérience Studio Fictif/ })).toBeVisible()
		expect(await violationsSevere(page)).toEqual([])
		await press(dialog.getByRole('button', { name: 'Enregistrer' }))

		await expect(dialog).toHaveCount(0)
		await expect(page.getByRole('status').filter({ hasText: 'Tes expériences sont enregistrées.' })).toBeVisible()
		await expect(page.getByTestId('carte-experiences')).toContainText('Maquilleuse - Studio Fictif - Lyon')
		const rows = (await stored(id)).experiences ?? []
		expect(rows.map(({ jobTitle, company, city }) => [jobTitle, company, city])).toEqual([
			['Maquilleuse', 'Studio Fictif', 'Lyon'],
		])
		expect(rows[0]?.startDate?.slice(0, 10)).toBe('2020-03-01')
		expect(rows[0]?.endDate ?? null).toBeNull()

		await page.reload()
		await openFurtherCards(page)
		await expect(page.getByTestId('carte-experiences')).toContainText('Maquilleuse - Studio Fictif')
	})

	test('E27 : une prestation chiffrée avec une option, enregistrée, relue après rechargement', async ({
		context,
		page,
	}) => {
		const { id } = await artist(context)
		await page.goto('/auth/profil')
		await openFurtherCards(page)
		await press(page.getByRole('button', { name: 'Modifier mes prestations', exact: true }))
		const dialog = page.getByRole('dialog')
		await dialog.locator('#serviceOffers-name').fill('Maquillage de soirée')
		await dialog.locator('#serviceOffers-price').fill('à partir de 60 €')
		await press(dialog.getByRole('button', { name: 'Ajouter', exact: true }))
		const line = dialog.locator('li[data-ligne]').first()
		await expect(line).toContainText('Maquillage de soirée')

		// The option goes in the row, opened by « Modifier ».
		await press(line.getByRole('button', { name: /^Modifier / }))
		await dialog.locator('#options-name').fill('Essai avant le jour J')
		await press(dialog.getByRole('button', { name: 'Ajouter l’option' }))
		await expect(dialog.locator('li[data-option]')).toHaveCount(1)
		await press(dialog.getByRole('button', { name: 'Valider la modification' }))
		expect(await violationsSevere(page)).toEqual([])
		await press(dialog.getByRole('button', { name: 'Enregistrer' }))

		await expect(dialog).toHaveCount(0)
		await expect(page.getByRole('status').filter({ hasText: 'Tes prestations sont enregistrées.' })).toBeVisible()
		await expect(page.getByTestId('carte-prestations')).toContainText('Maquillage de soirée')
		const offers = (await stored(id)).serviceOffers ?? []
		expect(offers.map(({ name, priceFrom }) => [name, priceFrom])).toEqual([['Maquillage de soirée', 60]])
		expect((offers[0]?.options ?? []).map(({ name }) => name)).toEqual(['Essai avant le jour J'])

		await page.reload()
		await openFurtherCards(page)
		await expect(page.getByTestId('carte-prestations')).toContainText('Maquillage de soirée')
	})
})
