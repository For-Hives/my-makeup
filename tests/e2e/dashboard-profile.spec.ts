import { expect, type Page, test } from '@playwright/test'
import { createAccount, type TestAccount } from '../support/account-factory'
import { activateProfile } from '../support/active-profile'
import { violationsSevere } from '../support/axe'
import { testPayload } from '../support/payload-test'
import { openSessionWithoutPassword } from '../support/session'

/**
 * The page of her space and the panel of her identity (tickets 118, 119, 120; plan 02 E16, E19, E30,
 * E31, E68, U54): the profile section by section, an identity that is saved for real or says it
 * was not, and a panel that works with a finger and with the keyboard. All made-up people.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${40 + (++counter % 150)}` })
)

type Artist = TestAccount<'maquilleuse'>

const IDENTITY = { firstName: 'Léa', lastName: 'Fictive', artistName: 'Studio Fictif', specialty: 'Maquillage mariée' }

/** A makeup artist with her profile filled in, a session in the browser. */
async function artist(
	context: { addCookies: (c: Artist['session']['cookies']) => Promise<void> },
	profil: Record<string, unknown> = IDENTITY
): Promise<Artist> {
	const account = await createAccount('maquilleuse')
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
	const [sheet] = docs
	if (!sheet) throw new Error('pas de profil')
	await payload.update({ collection: 'profiles', id: sheet.id, data: profil })
	await context.addCookies(account.session.cookies)
	return account
}

async function sheetOf(compte: Artist) {
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })
	const [sheet] = docs
	if (!sheet) throw new Error('pas de profil')
	return sheet
}

/** The requests that carry a Server Action to the page of the space. */
function followUploads(page: Page): string[] {
	const uploads: string[] = []
	page.on('request', requete => {
		if (requete.method() === 'POST' && new URL(requete.url()).pathname === '/auth/profil') uploads.push(requete.url())
	})
	return uploads
}

const modify = (page: Page) => page.getByRole('button', { name: 'Modifier mon identité' })
const dialogue = (page: Page) => page.getByRole('dialog', { name: 'Modifier mon identité' })

async function open(page: Page) {
	if (test.info().project.name === 'mobile') await modify(page).tap()
	else await modify(page).click()
	await expect(dialogue(page)).toBeVisible()
}

test.describe('118 : la page de l’espace', { tag: '@mobile' }, () => {
	test('les valeurs enregistrées, « à compléter » pour le reste, jamais « null »', async ({ context, page }) => {
		await artist(context, { ...IDENTITY, description: 'null', radiusKm: 0 })

		await page.goto('/auth/profil')

		await expect(page.getByTestId('carte-identite')).toContainText('Studio Fictif')
		await expect(page.getByTestId('carte-identite')).toContainText('Maquillage mariée')
		// A section with nothing stored says so.
		await expect(page.getByTestId('carte-competences')).toContainText('à compléter')
		await expect(page.getByTestId('carte-description')).toContainText('à compléter')
		await expect(page.getByTestId('carte-reseaux')).toContainText('à compléter')
		const text = await page.locator('main').innerText()
		expect(text).not.toMatch(/\bnull\b|undefined|NaN/)
	})

	test('un h1, une navigation, aucun débordement', async ({ context, page }) => {
		await artist(context)

		await page.goto('/auth/profil')
		await expect(page.getByTestId('carte-identite')).toBeVisible()

		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mon espace')
		await expect(page.getByRole('navigation').first()).toBeVisible()
		const overflow = await page.evaluate(() => {
			const { scrollWidth, clientWidth } = document.documentElement
			return scrollWidth - clientWidth
		})
		expect(overflow).toBeLessThanOrEqual(0)
		expect(await violationsSevere(page)).toEqual([])

		const folder = process.env.DASHBOARD_SCREENSHOTS
		if (folder) await page.screenshot({ fullPage: true, path: `${folder}/espace-${test.info().project.name}.png` })
	})

	test('U54 : A ne voit rien du profil de B, ni dans la page ni dans la charge RSC', async ({ context, page }) => {
		const b = await createAccount('maquilleuse')
		const payload = await testPayload()
		const sheetB = await sheetOf(b)
		await payload.update({
			collection: 'profiles',
			id: sheetB.id,
			data: { firstName: 'Zoéprivée', lastName: 'Autredame', specialty: 'Secret de B' },
		})
		const a = await artist(context)

		await page.goto('/auth/profil')
		await expect(page.getByTestId('carte-identite')).toContainText('Léa')

		const headers = { ...a.session.enTetes }
		const html = await page.context().request.get('/auth/profil', { headers: headers })
		const rsc = await page.context().request.get('/auth/profil', { headers: { ...headers, RSC: '1' } })
		for (const corps of [await page.content(), await html.text(), await rsc.text()]) {
			expect(corps).not.toContain('Zoéprivée')
			expect(corps).not.toContain('Secret de B')
			expect(corps).not.toContain(b.email)
		}
	})
})

test.describe('119 : l’identité s’enregistre pour de vrai', { tag: '@mobile' }, () => {
	test('modifier, enregistrer, recharger : la valeur est stockée, le message de réussite est annoncé, le slug ne bouge pas', async ({
		context,
		page,
	}) => {
		const account = await artist(context)
		const slug = (await sheetOf(account)).slug
		await page.goto('/auth/profil')
		await open(page)

		await page.getByLabel('Prénom').fill('  Inès  ')
		await page.getByLabel('Spécialité').fill('Effets spéciaux')
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(dialogue(page)).toHaveCount(0)
		await expect(page.getByRole('status').filter({ hasText: 'Ton identité est enregistrée.' })).toBeVisible()
		await expect(page.getByTestId('carte-identite')).toContainText('Inès')
		await expect(page.getByTestId('carte-identite')).toContainText('Effets spéciaux')
		await expect(modify(page)).toBeFocused()

		await page.reload()
		await expect(page.getByTestId('carte-identite')).toContainText('Effets spéciaux')
		expect(await sheetOf(account)).toMatchObject({ firstName: 'Inès', specialty: 'Effets spéciaux', slug })
	})

	test('E30 : hors bornes, un message sous le champ et aucune requête', async ({ context, page }) => {
		await artist(context)
		const uploads = followUploads(page)
		await page.goto('/auth/profil')
		await open(page)

		await page.getByLabel('Nom', { exact: true }).fill('A')
		await page.getByLabel('Prénom').fill('')
		await page.getByLabel('Spécialité').fill('x'.repeat(71))
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(page.getByText('Ton nom doit contenir au moins 2 caractères.')).toBeVisible()
		await expect(page.getByText('Indique ton prénom.')).toBeVisible()
		await expect(page.getByText('Ta spécialité ne doit pas dépasser 70 caractères.')).toBeVisible()
		expect(uploads).toHaveLength(0)
		await expect(dialogue(page)).toBeVisible()
	})

	test('E31 : un échec du serveur laisse l’ancienne valeur et le dit ; fermer demande confirmation', async ({
		context,
		page,
	}) => {
		const account = await artist(context)
		await page.goto('/auth/profil')
		await open(page)
		await page.route('**/auth/profil', route =>
			route.request().method() === 'POST' ? route.abort() : route.continue()
		)

		await page.getByLabel('Prénom').fill('Inès')
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(page.getByRole('alert').filter({ hasText: 'L’enregistrement n’a pas abouti' })).toBeVisible()
		await expect(page.getByLabel('Prénom')).toHaveValue('Inès')
		await expect(page.getByTestId('carte-identite')).toContainText('Léa')
		expect((await sheetOf(account)).firstName).toBe('Léa')
		await expect(page.getByRole('status').filter({ hasText: 'enregistrée' })).toHaveCount(0)

		await page.getByRole('button', { name: 'Fermer' }).click()
		await expect(page.getByText('Tu as des modifications non enregistrées.')).toBeVisible()
		await page.getByRole('button', { name: 'Continuer à modifier' }).click()
		await expect(page.getByLabel('Prénom')).toHaveValue('Inès')

		await page.getByRole('button', { name: 'Fermer' }).click()
		await page.getByRole('button', { name: 'Abandonner mes modifications' }).click()
		await expect(dialogue(page)).toHaveCount(0)
		await expect(page.getByTestId('carte-identite')).toContainText('Léa')
		// Opened again: the stored values, not the abandoned ones.
		await open(page)
		await expect(page.getByLabel('Prénom')).toHaveValue('Léa')
	})

	test('un double clic n’envoie qu’un enregistrement', async ({ context, page }) => {
		await artist(context)
		const uploads = followUploads(page)
		await page.goto('/auth/profil')
		await open(page)

		await page.getByLabel('Nom', { exact: true }).fill('Dupont')
		await page.getByRole('button', { name: 'Enregistrer' }).dblclick()

		await expect(dialogue(page)).toHaveCount(0)
		await expect(page.getByTestId('carte-identite')).toContainText('Dupont')
		expect(uploads).toHaveLength(1)
	})
})

test.describe('120 : au doigt et au clavier', { tag: '@mobile' }, () => {
	test('le panneau s’ouvre au premier tap ou clic et occupe l’écran à 390 px', async ({ context, page }) => {
		await artist(context)
		await page.goto('/auth/profil')
		await open(page)

		await expect(page.getByLabel('Prénom')).toBeFocused()
		const size = page.viewportSize()
		const mailbox = await dialogue(page).boundingBox()
		if (!size || !mailbox) throw new Error('pas de mesure')
		if (size.width <= 390) {
			expect(mailbox.width).toBe(size.width)
			expect(mailbox.height).toBe(size.height)
		}
		const folder = process.env.DASHBOARD_SCREENSHOTS
		if (folder) await page.screenshot({ path: `${folder}/panneau-${test.info().project.name}.png` })
		expect(await violationsSevere(page)).toEqual([])
	})

	test('E68 : parcours au clavier, le focus reste piégé, Échap ferme et rend le focus', async ({ context, page }) => {
		await artist(context)
		await page.goto('/auth/profil')
		await expect(page.getByTestId('carte-identite')).toBeVisible()

		await modify(page).focus()
		await page.keyboard.press('Enter')
		await expect(dialogue(page)).toBeVisible()
		await expect(page.getByLabel('Prénom')).toBeFocused()

		// Seven turns of Tab, then back: the focus never leaves the dialog.
		for (let tour = 0; tour < 7; tour++) {
			await page.keyboard.press('Tab')
			expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true)
		}
		for (let tour = 0; tour < 7; tour++) {
			await page.keyboard.press('Shift+Tab')
			expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true)
		}

		await page.keyboard.press('Escape')
		await expect(dialogue(page)).toHaveCount(0)
		await expect(modify(page)).toBeFocused()

		// With a change: the first Escape asks, the second goes back to the form.
		await page.keyboard.press('Enter')
		await page.getByLabel('Prénom').fill('Inès')
		await page.keyboard.press('Escape')
		await expect(page.getByText('Tu as des modifications non enregistrées.')).toBeVisible()
		await page.keyboard.press('Escape')
		await expect(page.getByText('Tu as des modifications non enregistrées.')).toHaveCount(0)
		await expect(dialogue(page)).toBeVisible()
	})

	test('Entrée maintenue : un seul enregistrement, panneau fermé, qui ne se rouvre pas', async ({ context, page }) => {
		const account = await artist(context)
		const uploads = followUploads(page)
		await page.goto('/auth/profil')
		await open(page)
		await page.getByLabel('Nom', { exact: true }).fill('Maintenue')

		await page.getByRole('button', { name: 'Enregistrer' }).focus()
		// A held key: the first press, then its repeats.
		await page.keyboard.down('Enter')
		for (let rank = 0; rank < 5; rank++) await page.keyboard.down('Enter')
		await page.keyboard.up('Enter')

		await expect(dialogue(page)).toHaveCount(0)
		await expect(page.getByTestId('carte-identite')).toContainText('Maintenue')
		await expect(modify(page)).toBeFocused()
		expect(uploads).toHaveLength(1)
		expect((await sheetOf(account)).lastName).toBe('Maintenue')
	})

	test('Entrée maintenue sur « Modifier » : le panneau s’ouvre une fois et rien n’est enregistré', async ({
		context,
		page,
	}) => {
		await artist(context)
		const uploads = followUploads(page)
		await page.goto('/auth/profil')
		await expect(page.getByTestId('carte-identite')).toBeVisible()

		await modify(page).focus()
		await page.keyboard.down('Enter')
		for (let rank = 0; rank < 5; rank++) await page.keyboard.down('Enter')
		await page.keyboard.up('Enter')

		await expect(dialogue(page)).toBeVisible()
		await expect(page.getByLabel('Prénom')).toBeFocused()
		expect(uploads).toHaveLength(0)
	})

	test('le résultat est annoncé aux lecteurs d’écran : une région de statut hors du panneau', async ({
		context,
		page,
	}) => {
		await artist(context)
		await page.goto('/auth/profil')
		await open(page)
		await page.getByLabel('Nom', { exact: true }).fill('Annoncée')
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		const status = page.getByRole('status').filter({ hasText: 'Ton identité est enregistrée.' })
		await expect(status).toBeVisible()
		expect(await status.evaluate(noeud => noeud.closest('[role="dialog"]') === null)).toBe(true)
		expect(await violationsSevere(page)).toEqual([])
	})
})

test.describe('121 : la session expire pendant l’édition', { tag: '@mobile' }, () => {
	const PASSWORD = 'motdepasse-fictif'

	test('E32 : message, rien d’enregistré, une seule redirection, saisie retrouvée dans le même panneau, puis effacée', async ({
		context,
		page,
	}) => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		const payload = await testPayload()
		const sheet = await sheetOf(account)
		await payload.update({ collection: 'profiles', id: sheet.id, data: IDENTITY })
		// Active, so that the sign-in after the expiry brings her back to her space and not to the welcome (ticket 296).
		await activateProfile(account.id)
		await context.addCookies(account.session.cookies)
		const start = new Set<string>()
		page.on('response', reponse => {
			if (reponse.request().resourceType() !== 'document' || reponse.status() < 300 || reponse.status() >= 400) return
			// Chromium replays a request once for a client hint: that replay is not a redirection.
			const to = new URL(reponse.headers().location ?? '', reponse.url())
			if (to.href !== reponse.url()) start.add(new URL(reponse.url()).pathname)
		})
		await page.goto('/auth/profil')
		await open(page)
		await page.getByLabel('Prénom').fill('Inès')
		await page.getByLabel('Spécialité').fill('Effets spéciaux')

		// The session ends while she types: the browser now holds a token that has run out.
		const expired = await openSessionWithoutPassword(payload, { collection: 'pros', id: account.id }, process.env, {
			dureeS: -60,
		})
		await context.clearCookies()
		await context.addCookies(expired.cookies)
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		// One trip to the sign-in page, with the message; nothing was stored.
		await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fauth%2Fprofil&error=session-expiree$/)
		await expect(page.getByTestId('session-expiree')).toHaveText('Ta session a expiré, reconnecte-toi.')
		expect((await sheetOf(account)).firstName).toBe('Léa')
		expect([...start]).toEqual([])

		await page.getByLabel('Adresse email').fill(account.email)
		await page.getByLabel('Mot de passe').fill(PASSWORD)
		await page.getByRole('button', { name: 'Se connecter' }).click()

		// Back in her space: the same panel, her typing in it, the card still showing the stored values.
		await expect(page).toHaveURL(/\/auth\/profil$/)
		await expect(dialogue(page)).toBeVisible()
		await expect(page.getByText('on a retrouvé ce que tu avais saisi')).toBeVisible()
		await expect(page.getByLabel('Prénom')).toHaveValue('Inès')
		await expect(page.getByLabel('Spécialité')).toHaveValue('Effets spéciaux')
		await expect(page.getByTestId('carte-identite')).toContainText('Léa')

		await page.getByRole('button', { name: 'Enregistrer' }).click()
		await expect(dialogue(page)).toHaveCount(0)
		await expect(page.getByTestId('carte-identite')).toContainText('Effets spéciaux')
		expect(await sheetOf(account)).toMatchObject({ firstName: 'Inès', specialty: 'Effets spéciaux' })
		// Forgotten after the success: a reload opens nothing.
		expect(await page.evaluate(() => window.sessionStorage.length)).toBe(0)
		await page.reload()
		await expect(page.getByTestId('carte-identite')).toContainText('Effets spéciaux')
		await expect(dialogue(page)).toHaveCount(0)
	})

	test('abandonner après le retour efface la saisie ; une autre maquilleuse sur le navigateur ne la voit pas', async ({
		context,
		page,
	}) => {
		const account = await artist(context)
		await page.goto('/auth/profil')
		await expect(page.getByTestId('carte-identite')).toBeVisible()
		const key = await page.evaluate(
			([proprietaire]) => {
				const key = `mm:saisie:identite:${proprietaire}`
				window.sessionStorage.setItem(
					key,
					JSON.stringify({
						valeurs: { prenom: 'Gardée', nom: 'Fictive', nomArtiste: '', specialite: 'Teint' },
						le: Date.now(),
						redirigeLe: null,
					})
				)
				return key
			},
			[String(account.id)]
		)
		await page.evaluate(() =>
			window.sessionStorage.setItem(
				'mm:saisie:identite:autre',
				JSON.stringify({ valeurs: {}, le: Date.now(), redirigeLe: null })
			)
		)
		await page.reload()
		await expect(dialogue(page)).toBeVisible()
		await expect(page.getByLabel('Prénom')).toHaveValue('Gardée')

		await page.getByRole('button', { name: 'Fermer' }).click()
		await page.getByRole('button', { name: 'Abandonner mes modifications' }).click()
		await expect(dialogue(page)).toHaveCount(0)
		expect(await page.evaluate(k => window.sessionStorage.getItem(k), key)).toBeNull()
		await page.reload()
		await expect(dialogue(page)).toHaveCount(0)
	})
})
