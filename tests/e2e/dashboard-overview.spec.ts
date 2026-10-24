import { expect, test } from '@playwright/test'
import { createAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { testPayload } from '../support/payload-test'
import { fileForPayload } from '../support/photos'

/**
 * The summary of her space (ticket 138 moved to issue 1073; plan 02 U01, I20): where her page stands (visible, a draft,
 * hidden by the team with its reason, paused), « Ton profil est rempli à N % », and every point that misses as a link to
 * its block of the edit mode; no editor of her profile on the page; nothing overflows at phone width. All made-up people.
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

test.describe('138 : où en est le profil', { tag: '@mobile' }, () => {
	test('U01 : profil vide, 6 points indispensables et 13 au total, chacun mène à son bloc de l’édition, aucun éditeur', async ({
		context,
		page,
	}) => {
		const account = await createAccount('maquilleuse')
		created.push(Number(account.id))
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')

		const block = page.getByTestId('avancement')
		await expect(block).toHaveAttribute('data-etat', 'vide')
		await expect(block).toHaveAttribute('data-statut', 'draft')
		await expect(page.getByTestId('avancement-score')).toHaveText(/^Ton profil est rempli à \d+ %$/)
		await expect(page.getByTestId('brouillon-pastille')).toHaveText('En brouillon')
		await expect(page.getByTestId('avancement-consequence')).toContainText('Les clientes ne la voient pas encore.')
		await expect(block.locator('li')).toHaveCount(13)
		await expect(block.locator('[aria-labelledby="avancement-requis"] li')).toHaveCount(6)
		expect(await page.locator('h1').count()).toBe(1)
		await block.screenshot({ path: test.info().outputPath('avancement.png') })

		// No editor of her profile lives here: the way to change anything is the edit mode.
		await expect(page.locator('button[aria-label^="Modifier m"]')).toHaveCount(0)
		await expect(page.getByRole('dialog')).toHaveCount(0)
		await expect(page.getByTestId('modifier-mon-profil')).toHaveAttribute('href', '/auth/apercu-profil?mode=edition')

		// A point leads to its block of the edit mode.
		await block.getByRole('link', { name: 'Ajoute ta photo principale.' }).click()
		await expect(page).toHaveURL(/\/auth\/apercu-profil\?mode=edition#bloc-photo$/)
		await expect(page.locator('#bloc-photo')).toBeVisible()
	})

	test('un point manquant disparaît du résumé une fois la présentation écrite (I20)', async ({ context, page }) => {
		const account = await createAccount('maquilleuse')
		created.push(Number(account.id))
		const payload = await testPayload()
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')
		const required = page.locator('[aria-labelledby="avancement-requis"] li')
		await expect(required).toHaveCount(6)
		const before = await page.getByTestId('avancement-score').innerText()

		await payload.update({ collection: 'profiles', id: docs[0]?.id as number, data: { description: 'a'.repeat(200) } })
		await page.reload()
		await expect(required).toHaveCount(5)
		await expect(page.getByTestId('avancement-score')).not.toHaveText(before)
		await expect(page.getByTestId('avancement').getByRole('link', { name: /^Écris ta description/ })).toHaveCount(0)
	})
})

test.describe('1073 : « Mon espace » est un tableau de bord', { tag: '@mobile' }, () => {
	test('les deux boutons, le statut, l’avancement, puis le compte, sans défilement de côté, avec des cibles de 44 px', async ({
		context,
		page,
	}) => {
		const account = await createAccount('maquilleuse')
		created.push(Number(account.id))
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')
		await expect(page.getByRole('heading', { level: 1, name: 'Mon espace' })).toBeVisible()
		const edit = page.getByTestId('modifier-mon-profil')
		const view = page.getByTestId('voir-mon-profil-public')
		await expect(edit).toHaveText('Modifier mon profil')
		await expect(view).toHaveText('Voir ma page')
		for (const button of [edit, view]) expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
		const top = (locator: typeof edit) => locator.evaluate(node => node.getBoundingClientRect().top + window.scrollY)
		const order = [
			await top(edit),
			await top(page.getByTestId('avancement')),
			await top(page.getByTestId('carte-disponibilite')),
			await top(page.getByTestId('mon-compte')),
		]
		expect([...order].sort((a, b) => a - b)).toEqual(order)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
		expect(await violationsSevere(page)).toEqual([])
		const folder = process.env.SCREENSHOT_DIR
		if (folder)
			await page.screenshot({ path: `${folder}/1073-espace-${page.viewportSize()?.width}.png`, fullPage: true })
		// « Voir ma page » is the preview of her page; « Modifier mon profil » is the edit mode.
		await view.click()
		await expect(page).toHaveURL(/\/auth\/apercu-profil$/)
	})

	test('le SIRET et « Activité vérifiée » : l’état est dit, un lien mène au bloc de l’édition', async ({
		context,
		page,
	}) => {
		const account = await createAccount('maquilleuse')
		created.push(Number(account.id))
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')
		const card = page.getByTestId('activite')
		await expect(card).toHaveAttribute('data-activity-state', 'none')
		await expect(card).toContainText('Activité vérifiée')
		await card.getByRole('link', { name: 'Ajouter mon SIRET' }).click()
		await expect(page).toHaveURL(/\/auth\/apercu-profil\?mode=edition#bloc-siret$/)
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

		const block = page.getByTestId('avancement')
		await expect(block).toHaveAttribute('data-etat', 'masque')
		await expect(block).toContainText('Ta page est masquée par l’équipe My Makeup : elle n’est plus visible.')
		await expect(block).toContainText('Motif : Photos sans rapport avec le maquillage.')
		await expect(block.getByRole('link', { name: 'contact@my-makeup.fr' })).toBeVisible()
		await expect(block).not.toContainText(/publiable|apparaît dans la recherche|indexe/)
		await expect(block.getByRole('progressbar')).toHaveAttribute('data-grise', 'true')
		await page.screenshot({ path: test.info().outputPath('avancement-masque.png') })
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

		const block = page.getByTestId('avancement')
		await expect(page.getByTestId('avancement-pause')).toHaveText(
			'Tu es en pause : ta page reste en ligne, mais tu n’apparais pas dans la recherche.'
		)
		await page.screenshot({ path: test.info().outputPath('avancement-pause.png') })
		const button = block.getByRole('button', { name: 'Reprendre les demandes' })
		const box = await button.boundingBox()
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
		if (test.info().project.name === 'mobile') await button.tap()
		else await button.click()

		await expect(block.getByRole('status')).toContainText('Tu as repris les demandes')
		await expect(block.getByRole('button', { name: 'Reprendre les demandes' })).toHaveCount(0)
		await expect(page.getByTestId('avancement-pause')).toHaveCount(0)
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

	test('cinq indispensables : un seul point à remplir, il mène au bloc de l’édition, aucune carte « en ligne »', async ({
		context,
		page,
	}) => {
		const { account } = await artist(false)
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')
		await expect(page.getByTestId('avancement').locator('li')).toHaveCount(7)
		await expect(page.getByTestId('avancement').locator('[aria-labelledby="avancement-requis"] li')).toHaveCount(1)
		await expect(page.getByTestId('page-en-ligne')).toHaveCount(0)

		// « En brouillon » (decision of 23/10/2026): plain words, what is missing, a link of 44 px to the block.
		await expect(page.getByTestId('brouillon-pastille')).toHaveText('En brouillon')
		await expect(page.getByTestId('avancement-consequence')).toContainText('Les clientes ne la voient pas encore.')
		const completeLink = page
			.getByTestId('avancement')
			.locator('[aria-labelledby="avancement-requis"]')
			.getByRole('link', { name: /moyen de te contacter/ })
		expect((await completeLink.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
		await page.getByTestId('avancement').screenshot({ path: test.info().outputPath('brouillon.png') })
		expect(await violationsSevere(page)).toEqual([])

		await completeLink.click()
		await expect(page).toHaveURL(/\/auth\/apercu-profil\?mode=edition#bloc-networks$/)
		await expect(page.locator('#bloc-networks')).toBeVisible()
	})

	test('six indispensables : 6/6, la carte donne l’adresse exacte, copie le lien et annonce « Lien copié »', async ({
		context,
		page,
	}) => {
		const { account, slug } = await artist(true)
		await context.grantPermissions(['clipboard-read', 'clipboard-write'])
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')
		await expect(page.getByTestId('avancement')).toHaveAttribute('data-statut', 'visible')
		await expect(page.getByTestId('statut-pastille')).toHaveText('Visible')
		await expect(page.getByTestId('brouillon-pastille')).toHaveCount(0)
		const card = page.getByTestId('page-en-ligne')
		await expect(card.getByRole('heading', { name: 'Ta page est en ligne !' })).toBeVisible()
		const address = `https://my-makeup.fr/profil/${slug}`
		await expect(card.getByTestId('page-en-ligne-adresse')).toHaveText(address)
		await expect(page.getByTestId('avancement-consequence')).toContainText('Google peut la trouver')

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
		await expect(page.getByTestId('avancement')).toHaveAttribute('data-etat', 'masque')
		await expect(page.getByTestId('page-en-ligne')).toHaveCount(0)
		await expect(page.getByTestId('brouillon-pastille')).toHaveCount(0)
	})
})
