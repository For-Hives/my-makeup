import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { createAccount } from '../support/account-factory'
import { type Mail, mailReceived } from '../support/mailpit'
import { withoutOutsideNetwork } from '../support/offline'
import { testPayload } from '../support/payload-test'

/**
 * The contact messages in the admin panel (ticket 163; plan 02 E58, E55 and E53).
 *
 * The application of the bench writes to the address of the domain reserved for tests: every mail of the
 * team lands in the same box, so a test reads the mail whose Reply-To is the address it gave its message.
 */

const TEAM = 'contact@example.test'
const unique = () => `visiteuse-${crypto.randomUUID()}@example.test`

/** A stored message, the way the form stores it, with the state of its mail. */
async function messageInBase(mailStatus: 'failed' | 'sent', nom = 'Témoin') {
	const email = unique()
	// A name of its own: the list of another test of the same run may hold the same word.
	const uniqueName = `${nom}${crypto.randomUUID().slice(0, 8)}`
	const { id } = await (await testPayload()).create({
		collection: 'contact-requests',
		data: {
			type: 'contact',
			status: mailStatus === 'sent' ? 'forwarded' : 'new',
			mailStatus,
			firstName: 'Léa',
			lastName: uniqueName,
			email,
			phone: '01 99 00 12 34',
			message: 'Bonjour, une question sur le site.',
		},
		depth: 0,
	})
	return { id, email, nom: uniqueName }
}

const mailsOf = async (email: string): Promise<Mail[]> =>
	(await mailReceived(TEAM)).filter(mail => mail.repondreA.some(({ adresse }) => adresse === email))

async function openInAdmin(context: BrowserContext) {
	const admin = await createAccount('admin')
	await context.addCookies(admin.session.cookies)
}

/** The panel is a long page: no horizontal scroll at the width of the screen. */
const withoutScrollHorizontal = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

test.describe('E58 : l’admin filtre les messages dont l’email a échoué et le renvoie', { tag: '@mobile' }, () => {
	test('le filtre ne garde que les échecs ; le renvoi envoie un mail, une seule fois même au double clic', async ({
		context,
		page,
	}, testInfo) => {
		const [failed, parti] = [await messageInBase('failed', 'Echoue'), await messageInBase('sent', 'Parti')]
		await openInAdmin(context)

		await page.goto('/admin/collections/contact-requests')
		await expect(page.getByTestId('echecs-d-envoi')).toContainText('en échec')
		await page.waitForLoadState('networkidle')
		await page.getByTestId('echecs-d-envoi').getByRole('link').click()
		await expect(page).toHaveURL(/where(\[|%5B)mailStatus(\]|%5D)(\[|%5B)equals(\]|%5D)=failed/)
		await expect(page.getByText(failed.nom, { exact: true })).toBeVisible()
		await expect(page.getByText(parti.nom, { exact: true })).toHaveCount(0)

		await page.goto(`/admin/collections/contact-requests/${failed.id}`)
		await page.waitForLoadState('networkidle')
		const button = page.getByRole('button', { name: 'Renvoyer l’email' })
		await expect(button).toBeVisible()
		expect(await withoutScrollHorizontal(page)).toBe(true)
		await testInfo.attach(`message-en-echec-${testInfo.project.name}`, {
			body: await page.screenshot({ fullPage: true }),
			contentType: 'image/png',
		})

		await button.dblclick()

		await expect(page.getByTestId('resultat-du-renvoi')).toHaveText('L’email a été renvoyé à l’équipe.')
		await expect.poll(async () => (await mailsOf(failed.email)).length, { timeout: 15_000 }).toBe(1)
		// Nothing more comes after the result.
		await expect(
			expect
				.poll(async () => (await mailsOf(failed.email)).length, { timeout: 2000, intervals: [200] })
				.toBeGreaterThan(1)
		).rejects.toThrow()
		const line = await (await testPayload()).findByID({ collection: 'contact-requests', id: failed.id, depth: 0 })
		expect(line).toMatchObject({ mailStatus: 'sent', status: 'forwarded' })

		// A message whose mail left shows no button.
		await page.goto(`/admin/collections/contact-requests/${parti.id}`)
		await page.waitForLoadState('networkidle')
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Renvoyer l’email' })).toHaveCount(0)
	})

	test('l’admin marque un message répondu, et ce que la visiteuse a écrit ne se modifie pas', async ({
		context,
		page,
	}) => {
		const message = await messageInBase('sent', 'Reponse')
		await openInAdmin(context)

		await page.goto(`/admin/collections/contact-requests/${message.id}`)
		await page.waitForLoadState('networkidle')
		await expect(page.locator('#field-message')).toBeDisabled()
		await expect(page.locator('#field-email')).toBeDisabled()

		await page.locator('#field-status').click()
		await page.getByRole('option', { name: 'Répondue' }).click()
		await page.getByRole('button', { name: 'Sauvegarder' }).first().click()

		await expect
			.poll(
				async () => (await (await testPayload()).findByID({ collection: 'contact-requests', id: message.id })).status
			)
			.toBe('answered')
	})
})

test.describe('E55 : la rédaction ne voit pas les messages de contact', () => {
	test('ni dans le menu, ni par l’adresse de la collection, ni par l’API', async ({ context, page }) => {
		const message = await messageInBase('sent', 'Cache')
		const editor = await createAccount('redaction')
		await context.addCookies(editor.session.cookies)

		await page.goto('/admin')
		await expect(page.getByRole('link', { name: 'Talents' }).first()).toBeVisible()
		await expect(page.locator('a[href="/admin/collections/contact-requests"]')).toHaveCount(0)
		await expect(page.getByText('Messages de contact')).toHaveCount(0)

		await page.goto('/admin/collections/contact-requests')
		await expect(page.getByText(message.nom, { exact: true })).toHaveCount(0)
		await expect(page.getByRole('heading', { name: 'Rien n’a été trouvé' })).toBeVisible()

		const api = await context.request.get(`/api/contact-requests/${message.id}`)
		expect(api.status()).toBe(403)
	})
})

test.describe('E53 : l’admin ouvre chaque collection sans erreur', () => {
	test('aucune erreur de console ni réponse 500 sur les huit listes', async ({ context, page }) => {
		test.setTimeout(90_000)
		await openInAdmin(context)
		await withoutOutsideNetwork(context)
		const errors: string[] = []
		page.on('pageerror', erreur => errors.push(`pageerror : ${erreur.message}`))
		page.on('console', message => {
			if (message.type() === 'error') errors.push(`console : ${message.text()}`)
		})
		page.on('response', reponse => {
			if (reponse.status() >= 500) errors.push(`${reponse.status()} ${new URL(reponse.url()).pathname}`)
		})

		for (const collection of [
			'admins',
			'pros',
			'profiles',
			'media',
			'talents',
			'articles',
			'auth-events',
			'contact-requests',
		]) {
			await page.goto(`/admin/collections/${collection}`)
			await page.waitForLoadState('networkidle')
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
			await expect(page).toHaveURL(new RegExp(`/admin/collections/${collection}`))
		}

		expect(errors).toEqual([])
	})
})
