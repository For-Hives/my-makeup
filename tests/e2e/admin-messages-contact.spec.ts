import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { creerCompte } from '../outils/fabrique-comptes'
import { type Mail, mailsRecus } from '../outils/mailpit'
import { payloadDeTest } from '../outils/payload-test'

/**
 * The contact messages in the admin panel (ticket 163; plan 02 E58, E55 and E53).
 *
 * The application of the bench writes to the address of the domain reserved for tests: every mail of the
 * team lands in the same box, so a test reads the mail whose Reply-To is the address it gave its message.
 */

const EQUIPE = 'contact@example.test'
const unique = () => `visiteuse-${crypto.randomUUID()}@example.test`

/** A stored message, the way the form stores it, with the state of its mail. */
async function messageEnBase(etatMail: 'echec' | 'envoye', nom = 'Témoin') {
	const email = unique()
	// A name of its own: the list of another test of the same run may hold the same word.
	const nomUnique = `${nom}${crypto.randomUUID().slice(0, 8)}`
	const { id } = await (await payloadDeTest()).create({
		collection: 'demandes',
		data: {
			type: 'contact',
			statut: etatMail === 'envoye' ? 'transmise' : 'nouvelle',
			etatMail,
			prenom: 'Léa',
			nom: nomUnique,
			email,
			telephone: '01 99 00 12 34',
			message: 'Bonjour, une question sur le site.',
		},
		depth: 0,
	})
	return { id, email, nom: nomUnique }
}

const mailsDe = async (email: string): Promise<Mail[]> =>
	(await mailsRecus(EQUIPE)).filter(mail => mail.repondreA.some(({ adresse }) => adresse === email))

async function ouvrirEnAdmin(context: BrowserContext) {
	const admin = await creerCompte('admin')
	await context.addCookies(admin.session.cookies)
}

/** The panel is a long page: no horizontal scroll at the width of the screen. */
const sansDefilementHorizontal = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

test.describe('E58 : l’admin filtre les messages dont l’email a échoué et le renvoie', { tag: '@mobile' }, () => {
	test('le filtre ne garde que les échecs ; le renvoi envoie un mail, une seule fois même au double clic', async ({
		context,
		page,
	}, testInfo) => {
		const [echoue, parti] = [await messageEnBase('echec', 'Echoue'), await messageEnBase('envoye', 'Parti')]
		await ouvrirEnAdmin(context)

		await page.goto('/admin/collections/demandes')
		await expect(page.getByTestId('echecs-d-envoi')).toContainText('en échec')
		await page.waitForLoadState('networkidle')
		await page.getByTestId('echecs-d-envoi').getByRole('link').click()
		await expect(page).toHaveURL(/where(\[|%5B)etatMail(\]|%5D)(\[|%5B)equals(\]|%5D)=echec/)
		await expect(page.getByText(echoue.nom, { exact: true })).toBeVisible()
		await expect(page.getByText(parti.nom, { exact: true })).toHaveCount(0)

		await page.goto(`/admin/collections/demandes/${echoue.id}`)
		await page.waitForLoadState('networkidle')
		const bouton = page.getByRole('button', { name: 'Renvoyer l’email' })
		await expect(bouton).toBeVisible()
		expect(await sansDefilementHorizontal(page)).toBe(true)
		await testInfo.attach(`message-en-echec-${testInfo.project.name}`, {
			body: await page.screenshot({ fullPage: true }),
			contentType: 'image/png',
		})

		await bouton.dblclick()

		await expect(page.getByTestId('resultat-du-renvoi')).toHaveText('L’email a été renvoyé à l’équipe.')
		await expect.poll(async () => (await mailsDe(echoue.email)).length, { timeout: 15_000 }).toBe(1)
		// Nothing more comes after the result.
		await expect(
			expect
				.poll(async () => (await mailsDe(echoue.email)).length, { timeout: 2000, intervals: [200] })
				.toBeGreaterThan(1)
		).rejects.toThrow()
		const ligne = await (await payloadDeTest()).findByID({ collection: 'demandes', id: echoue.id, depth: 0 })
		expect(ligne).toMatchObject({ etatMail: 'envoye', statut: 'transmise' })

		// A message whose mail left shows no button.
		await page.goto(`/admin/collections/demandes/${parti.id}`)
		await page.waitForLoadState('networkidle')
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Renvoyer l’email' })).toHaveCount(0)
	})

	test('l’admin marque un message répondu, et ce que la visiteuse a écrit ne se modifie pas', async ({
		context,
		page,
	}) => {
		const message = await messageEnBase('envoye', 'Reponse')
		await ouvrirEnAdmin(context)

		await page.goto(`/admin/collections/demandes/${message.id}`)
		await page.waitForLoadState('networkidle')
		await expect(page.locator('#field-message')).toBeDisabled()
		await expect(page.locator('#field-email')).toBeDisabled()

		await page.locator('#field-statut').click()
		await page.getByRole('option', { name: 'Répondue' }).click()
		await page.getByRole('button', { name: 'Sauvegarder' }).first().click()

		await expect
			.poll(async () => (await (await payloadDeTest()).findByID({ collection: 'demandes', id: message.id })).statut)
			.toBe('repondue')
	})
})

test.describe('E55 : la rédaction ne voit pas les messages de contact', () => {
	test('ni dans le menu, ni par l’adresse de la collection, ni par l’API', async ({ context, page }) => {
		const message = await messageEnBase('envoye', 'Cache')
		const redaction = await creerCompte('redaction')
		await context.addCookies(redaction.session.cookies)

		await page.goto('/admin')
		await expect(page.getByRole('link', { name: 'Talents' }).first()).toBeVisible()
		await expect(page.locator('a[href="/admin/collections/demandes"]')).toHaveCount(0)
		await expect(page.getByText('Messages de contact')).toHaveCount(0)

		await page.goto('/admin/collections/demandes')
		await expect(page.getByText(message.nom, { exact: true })).toHaveCount(0)
		await expect(page.getByRole('heading', { name: 'Rien n’a été trouvé' })).toBeVisible()

		const api = await context.request.get(`/api/demandes/${message.id}`)
		expect(api.status()).toBe(403)
	})
})

test.describe('E53 : l’admin ouvre chaque collection sans erreur', () => {
	test('aucune erreur de console ni réponse 500 sur les huit listes', async ({ context, page }) => {
		test.setTimeout(90_000)
		await ouvrirEnAdmin(context)
		const erreurs: string[] = []
		page.on('pageerror', erreur => erreurs.push(`pageerror : ${erreur.message}`))
		page.on('console', message => {
			if (message.type() === 'error') erreurs.push(`console : ${message.text()}`)
		})
		page.on('response', reponse => {
			if (reponse.status() >= 500) erreurs.push(`${reponse.status()} ${new URL(reponse.url()).pathname}`)
		})

		for (const collection of [
			'admins',
			'pros',
			'profils',
			'media',
			'talents',
			'articles',
			'auth-evenements',
			'demandes',
		]) {
			await page.goto(`/admin/collections/${collection}`)
			await page.waitForLoadState('networkidle')
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
			await expect(page).toHaveURL(new RegExp(`/admin/collections/${collection}`))
		}

		expect(erreurs).toEqual([])
	})
})
