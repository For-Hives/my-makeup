import { expect, test } from '@playwright/test'
import { createAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { testPayload } from '../support/payload-test'
import { fileForPayload } from '../support/photos'

/**
 * The completeness panel above her page (ticket 138 moved to issue 1022; plan 02 U01, I20): « Ton profil est
 * rempli à N % », every point to fill as a link that opens its block, the draft notice, and what the state
 * changes for her (hidden with its reason, paused, online); a save moves the panel without the page being
 * loaded again; nothing overflows at phone width. All made-up people.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${100 + (++counter % 50)}` })
)

/** The accounts a test made: a published profile left behind would show in the lists of the crawl (the page of a talent lists its profiles). */
const created: number[] = []
test.afterEach(async () => {
	const payload = await testPayload()
	for (const account of created.splice(0)) {
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account } } })
		for (const { id } of docs) await payload.delete({ collection: 'profiles', id }).catch(() => undefined)
		await payload.delete({ collection: 'pros', id: account }).catch(() => undefined)
	}
})

test.describe('138 : où en est le profil (1022 : au-dessus de sa page)', { tag: '@mobile' }, () => {
	test('U01 : profil vide, 6 points indispensables et 13 au total, chacun ouvre son bloc, sans débordement', async ({
		context,
		page,
	}) => {
		const account = await createAccount('maquilleuse')
		created.push(Number(account.id))
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')

		const block = page.getByTestId('completeness')
		await expect(block).toHaveAttribute('data-etat', 'vide')
		await expect(block.locator('#completeness-title')).toHaveText(/^Ton profil est rempli à \d+ %$/)
		const percent = Number((await block.locator('#completeness-title').innerText()).match(/\d+/)?.[0])
		await expect(block.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(percent))
		expect(percent).toBeLessThan(100)
		// « En brouillon »: plain words, the page is not online, and the six points that stand in the way.
		const notice = block.getByTestId('brouillon')
		await expect(notice.getByTestId('brouillon-pastille')).toHaveText('En brouillon')
		await expect(notice).toContainText('Ta page n’est pas encore en ligne : les clientes ne la voient pas.')
		await expect(block.locator('li')).toHaveCount(13)
		await expect(block.locator('[aria-labelledby="completeness-required"] li')).toHaveCount(6)
		await expect(block.locator('[aria-labelledby="completeness-required"]')).toContainText('Choisis ta commune.')
		await expect(block.locator('[aria-labelledby="completeness-required"]')).toContainText('Indique ta spécialité.')
		expect(await page.locator('h1').count()).toBe(1)

		await page.screenshot({ path: test.info().outputPath('completeness.png') })

		// A point opens the block that completes it, under the header, and the address does not change.
		await block.getByRole('link', { name: 'Ajoute ta photo principale.' }).click()
		await expect(page.locator('[data-direct-edit-editor]')).toContainText('Photo principale')
		await expect(page).toHaveURL(/\/auth\/profil$/)

		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
		expect(await violationsSevere(page)).toEqual([])
	})

	test('I20 : une description de 200 caractères enregistrée fait bouger le bloc sans recharger la page', async ({
		context,
		page,
	}) => {
		const account = await createAccount('maquilleuse')
		created.push(Number(account.id))
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')
		const heading = page.locator('#completeness-title')
		const before = await heading.innerText()
		await page.evaluate(() => {
			;(window as unknown as { __sansRechargement: boolean }).__sansRechargement = true
		})

		const required = page.locator('[aria-labelledby="completeness-required"] li')
		await expect(required).toHaveCount(6)
		const button = page.getByRole('button', { name: 'Modifier ma présentation' })
		if (test.info().project.name === 'mobile') await button.tap()
		else await button.click()
		await page.getByLabel(/Ce qui te distingue/).fill('a'.repeat(200))
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(required).toHaveCount(5)
		await expect(heading).not.toHaveText(before)
		await expect(page.getByTestId('completeness').getByRole('link', { name: /^Écris ta description/ })).toHaveCount(0)
		await expect(page.getByTestId('completeness').getByRole('link', { name: /Allonge ta description/ })).toHaveCount(0)
		// Same document: the page was not loaded again.
		expect(await page.evaluate(() => (window as unknown as { __sansRechargement?: boolean }).__sansRechargement)).toBe(
			true
		)
	})
})

test.describe('292 : le vrai statut, masqué ou en pause', { tag: '@mobile' }, () => {
	async function profileOf(accountId: number | string) {
		const payload = await testPayload()
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: accountId } } })
		const [sheet] = docs
		if (!sheet) throw new Error('pas de profil')
		return { payload, id: sheet.id }
	}

	test('masquée par l’équipe : le motif, l’adresse, la jauge grise, aucune promesse fausse', async ({
		context,
		page,
	}) => {
		const account = await createAccount('maquilleuse')
		created.push(Number(account.id))
		const { payload, id } = await profileOf(account.id)
		await payload.update({
			collection: 'profiles',
			id,
			data: {
				firstName: 'Léa',
				lastName: 'Fictive',
				chosenStatus: 'hidden',
				reason: 'Photos sans rapport avec le maquillage.',
			},
		})
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')

		const block = page.getByTestId('completeness')
		await expect(block).toHaveAttribute('data-etat', 'masque')
		await expect(block).toContainText('Ta page est masquée par l’équipe My Makeup : elle n’est plus visible.')
		await expect(block).toContainText('Motif : Photos sans rapport avec le maquillage.')
		await expect(block.getByRole('link', { name: 'contact@my-makeup.fr' })).toBeVisible()
		await expect(block).not.toContainText(/publiable|apparaît dans la recherche|indexe/)
		await expect(block.getByRole('progressbar')).toHaveAttribute('data-grise', 'true')
		await page.screenshot({ path: test.info().outputPath('completeness-masque.png') })
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
		expect(await violationsSevere(page)).toEqual([])
	})

	test('en pause : une phrase, et « Reprendre les demandes » remet la disponibilité', async ({ context, page }) => {
		const account = await createAccount('maquilleuse')
		created.push(Number(account.id))
		const { payload, id } = await profileOf(account.id)
		await payload.update({
			collection: 'profiles',
			id,
			data: { firstName: 'Léa', lastName: 'Fictive', specialty: 'Mariage', available: false },
		})
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')

		const block = page.getByTestId('completeness')
		await expect(page.getByTestId('completeness-consequence')).toHaveText(
			'Tu es en pause : ta page reste en ligne, mais tu n’apparais pas dans la recherche.'
		)
		await page.screenshot({ path: test.info().outputPath('completeness-pause.png') })
		const button = block.getByRole('button', { name: 'Reprendre les demandes' })
		const box = await button.boundingBox()
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
		if (test.info().project.name === 'mobile') await button.tap()
		else await button.click()

		await expect(block.getByRole('status')).toContainText('Tu as repris les demandes')
		await expect(block.getByRole('button', { name: 'Reprendre les demandes' })).toHaveCount(0)
		await expect(page.getByTestId('completeness-consequence')).toHaveCount(0)
		const stored = await payload.findByID({ collection: 'profiles', id, depth: 0 })
		expect(stored.available).toBe(true)
		expect(await violationsSevere(page)).toEqual([])
	})
})

test.describe('306 : la jauge honnête et « Ta page est en ligne ! »', { tag: '@mobile' }, () => {
	const CITY = { name: 'Lille', inseeCode: '59350' } as const

	/** A profile with the six essentials, but the contact channel when `contact` is false. */
	async function artist(contact: boolean) {
		const account = await createAccount('maquilleuse')
		created.push(Number(account.id))
		const payload = await testPayload()
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
		const [sheet] = docs
		if (!sheet) throw new Error('pas de profil')
		const media = await payload.create({
			collection: 'media',
			data: { owner: Number(account.id), alt: 'Photo principale' },
			file: fileForPayload(),
		})
		const profile = await payload.update({
			collection: 'profiles',
			id: sheet.id,
			data: {
				firstName: 'Léa',
				lastName: 'Fictive',
				specialty: 'Mariée',
				city: CITY,
				mainPicture: media.id,
				description: 'Maquilleuse fictive. '.repeat(12),
				serviceOffers: [{ name: 'Mariée', priceFrom: 120 }],
				...(contact ? { networks: { instagram: 'studio.fictif' } } : {}),
			},
		})
		return { account, payload, id: sheet.id, slug: profile.slug ?? '' }
	}

	test('cinq indispensables : un seul point à remplir, il ouvre son bloc, aucune carte « en ligne »', async ({
		context,
		page,
	}) => {
		const { account } = await artist(false)
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')
		const panel = page.getByTestId('completeness')
		await expect(panel.locator('li')).toHaveCount(7)
		await expect(panel.locator('[aria-labelledby="completeness-required"] li')).toHaveCount(1)
		await expect(page.getByTestId('page-en-ligne')).toHaveCount(0)

		// « En brouillon » (decision of 23/10/2026): plain words, what is missing, a link of 44 px to the block.
		const notice = panel.getByTestId('brouillon')
		await expect(notice.getByTestId('brouillon-pastille')).toHaveText('En brouillon')
		await expect(notice).toContainText('Ta page n’est pas encore en ligne : les clientes ne la voient pas.')
		const completeLink = panel
			.locator('[aria-labelledby="completeness-required"]')
			.getByRole('link', { name: /moyen de te contacter/ })
		expect((await completeLink.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
		await panel.screenshot({ path: test.info().outputPath('brouillon.png') })
		expect(await violationsSevere(page)).toEqual([])

		await completeLink.click()
		await expect(page.locator('#bloc-networks')).toBeVisible()
		await expect(page.locator('[data-direct-edit-editor]')).toContainText('Réseaux')
	})

	test('six indispensables : la page est en ligne, la carte donne l’adresse exacte, copie le lien et annonce « Lien copié »', async ({
		context,
		page,
	}) => {
		const { account, slug } = await artist(true)
		await context.grantPermissions(['clipboard-read', 'clipboard-write'])
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')
		await expect(page.getByTestId('brouillon')).toHaveCount(0)
		const card = page.getByTestId('page-en-ligne')
		await expect(card.getByRole('heading', { name: 'Ta page est en ligne !' })).toBeVisible()
		const address = `https://my-makeup.fr/profil/${slug}`
		await expect(card.getByTestId('page-en-ligne-adresse')).toHaveText(address)
		await expect(page.getByTestId('completeness-consequence')).toContainText('Google peut maintenant te trouver')

		await page.waitForLoadState('networkidle')
		const copy = card.getByRole('button', { name: 'Copier le lien' })
		expect((await copy.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
		await copy.click()
		await expect(card.getByRole('status')).toHaveText('Lien copié')
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(address)

		// The share sheet exists where the browser has one, and only there.
		const hasShare = await page.evaluate(() => typeof navigator.share === 'function')
		await expect(card.getByRole('button', { name: 'Partager' })).toHaveCount(hasShare ? 1 : 0)

		await card.getByText('Ajouter le lien à ma bio Instagram : comment faire').click()
		await expect(card.getByRole('listitem').first()).toBeVisible()
		await page.screenshot({ path: test.info().outputPath('page-en-ligne.png') })
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
		expect(await violationsSevere(page)).toEqual([])
	})

	test('masquée par l’équipe : la carte verte ne s’affiche pas', async ({ context, page }) => {
		const { account, payload, id } = await artist(true)
		await payload.update({ collection: 'profiles', id, data: { chosenStatus: 'hidden', reason: 'Essai.' } })
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')
		await expect(page.getByTestId('completeness')).toHaveAttribute('data-etat', 'masque')
		await expect(page.getByTestId('page-en-ligne')).toHaveCount(0)
		await expect(page.getByTestId('brouillon')).toHaveCount(0)
	})
})
