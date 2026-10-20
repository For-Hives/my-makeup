import { expect, type Page, test } from '@playwright/test'
import { violationsSevere } from '../support/axe'
import { agentByTest, fakeUmami } from '../support/fake-umami'
import { type Mail, mailReceived } from '../support/mailpit'
import { testPayload } from '../support/payload-test'

/**
 * The contact page, end to end (tickets 158 and 160; plan 02 E50, E51 and E69).
 *
 * The application of the bench writes to the address of the domain reserved for tests (no CONTACT_TO is
 * set): every mail of the team lands in the same box, so a test reads the mail whose Reply-To is the
 * address it typed. Each test types an address of its own.
 */

const EQUIPE = 'contact@example.test'

const unique = () => `visiteuse-${crypto.randomUUID()}@example.test`

interface Saisie {
	prenom: string
	nom: string
	email: string
	telephone: string
	message: string
}

const saisie = (surcharge: Partial<Saisie> = {}): Saisie => ({
	prenom: 'Léa',
	nom: 'Témoin',
	email: unique(),
	telephone: '01 99 00 12 34',
	message: 'Bonjour, une question sur le site.',
	...surcharge,
})

async function ouvrir(page: Page) {
	await page.goto('/contact')
	// A click before the page has hydrated would send the form to the server as a plain GET.
	await page.waitForLoadState('networkidle')
}

async function remplir(page: Page, s: Saisie) {
	await page.getByLabel('Prénom').fill(s.prenom)
	await page.getByLabel('Nom', { exact: true }).fill(s.nom)
	await page.getByLabel('Email').fill(s.email)
	await page.getByLabel('Numéro de téléphone').fill(s.telephone)
	await page.getByLabel('Message').fill(s.message)
}

async function lignesDe(email: string) {
	const payload = await testPayload()
	return (
		await payload.find({ collection: 'contact-requests', where: { email: { equals: email } }, depth: 0, limit: 30 })
	).docs
}

async function mailsDe(email: string): Promise<Mail[]> {
	return (await mailReceived(EQUIPE)).filter(mail => mail.repondreA.some(({ adresse }) => adresse === email))
}

/** Nothing more comes: a count that must not pass `n` is watched for two seconds, without a fixed wait. */
async function neDepassePas(compte: () => Promise<number>, n: number) {
	await expect(expect.poll(compte, { timeout: 2000, intervals: [200] }).toBeGreaterThan(n)).rejects.toThrow()
}

test.describe('E50 : le message est écrit en base et envoyé à l’équipe', { tag: '@mobile' }, () => {
	test('la page, le formulaire, la confirmation, la ligne et le mail', async ({ page }) => {
		const s = saisie()
		await ouvrir(page)

		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contact')
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
		// The addresses of the team are there; no horizontal scroll, whatever the width.
		await expect(page.getByRole('link', { name: 'jobs@my-makeup.fr' })).toBeVisible()
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

		await remplir(page, s)
		await page.getByRole('button', { name: 'Envoyer l’email' }).click()

		await expect(page.getByTestId('contact-envoye')).toHaveText('Le message a bien été envoyé !')
		await expect(page.getByRole('status').filter({ hasText: 'a bien été envoyé' })).toBeVisible()

		await expect.poll(async () => (await mailsDe(s.email)).length, { timeout: 15_000 }).toBe(1)
		const [mail] = await mailsDe(s.email)
		expect(mail?.sujet).toBe('Nouveau message de contact')
		expect(mail?.repondreA).toEqual([{ nom: '', adresse: s.email }])
		expect(mail?.texte).toContain(s.message)

		const lignes = await lignesDe(s.email)
		expect(lignes).toHaveLength(1)
		expect(lignes[0]).toMatchObject({ type: 'contact', firstName: s.prenom, lastName: s.nom, phone: s.telephone })
		await expect.poll(async () => (await lignesDe(s.email))[0]?.status).toBe('forwarded')
	})

	test('aucune violation grave d’accessibilité, avec le formulaire vide et avec ses erreurs', async ({ page }) => {
		await ouvrir(page)
		expect(await violationsSevere(page)).toEqual([])

		await page.getByRole('button', { name: 'Envoyer l’email' }).click()
		await expect(page.getByTestId('erreur-prenom')).toHaveText('Le prénom est requis')
		expect(await violationsSevere(page)).toEqual([])
	})
})

test.describe('E51 : les erreurs sont en français, sous le champ, et le focus va au premier champ en erreur', () => {
	test('un formulaire vide, puis une adresse invalide : aucune ligne, aucun mail', async ({ page }) => {
		await ouvrir(page)
		await page.getByRole('button', { name: 'Envoyer l’email' }).click()

		await expect(page.getByTestId('erreur-prenom')).toHaveText('Le prénom est requis')
		await expect(page.getByTestId('erreur-nom')).toHaveText('Le nom est requis')
		await expect(page.getByTestId('erreur-email')).toHaveText('L’e-mail est invalide')
		await expect(page.getByTestId('erreur-telephone')).toHaveText('Le numéro de téléphone est requis')
		await expect(page.getByTestId('erreur-message')).toHaveText('Le message est requis')
		await expect(page.getByLabel('Prénom')).toBeFocused()
		await expect(page.getByLabel('Prénom')).toHaveAttribute('aria-invalid', 'true')

		// What is valid stays; the first field in error takes the focus.
		const s = saisie({ email: 'pas-une-adresse' })
		await remplir(page, s)
		await page.getByRole('button', { name: 'Envoyer l’email' }).click()
		await expect(page.getByTestId('erreur-email')).toHaveText('L’e-mail est invalide')
		await expect(page.getByTestId('erreur-prenom')).toHaveText('')
		await expect(page.getByLabel('Email')).toBeFocused()
		await expect(page.getByLabel('Prénom')).toHaveValue(s.prenom)
		await expect(page.getByLabel('Message')).toHaveValue(s.message)

		expect(await lignesDe(s.email)).toEqual([])
		expect(await mailsDe(s.email)).toEqual([])
	})
})

test.describe('E69 : le formulaire se remplit et s’envoie au clavier, les erreurs sont annoncées', {
	tag: '@mobile',
}, () => {
	test('Tab de champ en champ, Entrée envoie, le résumé est une alerte, le champ en erreur est décrit', async ({
		page,
	}) => {
		await ouvrir(page)
		await page.getByLabel('Prénom').focus()
		await page.keyboard.type('Léa')
		await page.keyboard.press('Tab')
		await page.keyboard.type('Témoin')
		// Enter in a text field sends the form: the e-mail is missing.
		await page.keyboard.press('Enter')

		await expect(page.getByRole('alert').filter({ hasText: 'corrigez les champs signalés' })).toBeVisible()
		const email = page.getByLabel('Email')
		await expect(email).toBeFocused()
		await expect(email).toHaveAttribute('aria-describedby', 'erreur-email')
		await expect(page.locator('#erreur-email')).toHaveText('L’e-mail est invalide')

		// The rest, still with the keyboard.
		const s = saisie({ prenom: 'Léa', nom: 'Témoin' })
		await page.keyboard.type(s.email)
		await page.keyboard.press('Tab')
		await page.keyboard.type(s.telephone)
		await page.keyboard.press('Tab')
		await page.keyboard.type(s.message)
		await page.keyboard.press('Tab')
		await page.keyboard.press('Tab')
		await expect(page.getByRole('button', { name: 'Envoyer l’email' })).toBeFocused()
		await page.keyboard.press('Enter')

		await expect(page.getByTestId('contact-envoye')).toBeVisible()
		// The first read of the worker starts the Payload client, which is slow when the machine is busy.
		await expect.poll(async () => (await lignesDe(s.email)).length, { timeout: 20_000 }).toBe(1)
	})
})

test.describe('160 : un double clic ou Entrée maintenue n’envoient qu’un message', () => {
	test('double clic : une ligne, un mail', async ({ page }) => {
		const s = saisie()
		await ouvrir(page)
		await remplir(page, s)

		await page.getByRole('button', { name: 'Envoyer l’email' }).dblclick()
		await expect(page.getByTestId('contact-envoye')).toBeVisible()

		await expect.poll(async () => (await mailsDe(s.email)).length, { timeout: 15_000 }).toBe(1)
		// Let a second send show itself, if there was one.
		await neDepassePas(async () => (await lignesDe(s.email)).length, 1)
		expect(await lignesDe(s.email)).toHaveLength(1)
		expect(await mailsDe(s.email)).toHaveLength(1)
	})

	test('Entrée maintenue dans un champ : une ligne, un mail', async ({ page }) => {
		const s = saisie()
		await ouvrir(page)
		await remplir(page, s)

		await page.getByLabel('Nom', { exact: true }).focus()
		// A key held down repeats Enter without waiting for any answer.
		await Promise.all(Array.from({ length: 8 }, () => page.keyboard.press('Enter')))
		await expect(page.getByTestId('contact-envoye')).toBeVisible()

		await expect.poll(async () => (await mailsDe(s.email)).length, { timeout: 15_000 }).toBe(1)
		await neDepassePas(async () => (await lignesDe(s.email)).length, 1)
		expect(await lignesDe(s.email)).toHaveLength(1)
		expect(await mailsDe(s.email)).toHaveLength(1)
	})
})

test.describe('L’événement de contact', () => {
	// The default user agent of the headless browser says « HeadlessChrome », which is not measured: an ordinary
	// Chrome, with a mark of its own. The fake Umami is shared by every worker of the run, and the test reads
	// only what came from its browser (tests/support/fake-umami.ts).
	test.use(agentByTest())

	test('un message enregistré émet un événement, une fois, sans rien de ce qui a été saisi', async ({
		context,
		page,
		userAgent,
	}) => {
		// The filter of the page does not measure an automated browser: this one plays an ordinary one.
		await context.addInitScript(() => {
			Object.defineProperty(navigator, 'webdriver', { get: () => false })
		})
		const umami = fakeUmami().pourLAgent(userAgent)
		const evenements = async () => (await umami.envois('platform_contact_submit')).length
		const avant = await evenements()
		const s = saisie({ message: 'Un message très personnel MARQUEUR-ESSAI' })
		await ouvrir(page)
		await remplir(page, s)

		await page.getByRole('button', { name: 'Envoyer l’email' }).click()
		await expect(page.getByTestId('contact-envoye')).toBeVisible()

		await expect.poll(evenements, { timeout: 10_000 }).toBe(avant + 1)
		await neDepassePas(evenements, avant + 1)
		expect(await evenements()).toBe(avant + 1)
		const recus = (await umami.envois('platform_contact_submit')).slice(avant)
		const { payload } = recus[0]?.corps as { payload: { data: Record<string, unknown> } }
		expect(payload.data).toEqual({ ok: true, status: 200 })
		const tout = JSON.stringify(recus)
		for (const saisi of [s.prenom, s.nom, s.email, s.telephone, 'MARQUEUR-ESSAI']) expect(tout).not.toContain(saisi)
	})
})

test.describe('161 : le champ piège et le frein', () => {
	test('le champ piège est hors de vue, hors du clavier et caché aux lecteurs d’écran', async ({ page }) => {
		await ouvrir(page)
		const piege = page.locator('input[name="commentaire"]')
		await expect(piege).toHaveAttribute('tabindex', '-1')
		await expect(piege).not.toBeInViewport()
		await expect(page.getByRole('textbox', { name: 'Laissez ce champ vide' })).toHaveCount(0)
		await expect(page.locator('[aria-hidden="true"]').filter({ has: piege })).toHaveCount(1)
	})

	test('un robot qui le remplit voit la confirmation, et rien n’est écrit ni envoyé', async ({ page }) => {
		const s = saisie()
		await ouvrir(page)
		await remplir(page, s)
		await page.locator('input[name="commentaire"]').evaluate((champ: HTMLInputElement) => {
			champ.value = 'http://spam.example'
		})
		await page.getByRole('button', { name: 'Envoyer l’email' }).click()

		await expect(page.getByTestId('contact-envoye')).toBeVisible()
		await neDepassePas(async () => (await lignesDe(s.email)).length + (await mailsDe(s.email)).length, 0)
		expect(await lignesDe(s.email)).toEqual([])
		expect(await mailsDe(s.email)).toEqual([])
	})

	test('la sixième demande de l’heure depuis la même adresse est refusée en 429, en français, la saisie gardée ; une autre adresse passe', async ({
		browser,
	}) => {
		test.setTimeout(120_000)
		const adresseCliente = `198.51.${100 + test.info().workerIndex}.${(Date.now() % 200) + 1}`
		const contexte = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': adresseCliente } })
		const page = await contexte.newPage()
		for (let i = 0; i < 5; i++) {
			await ouvrir(page)
			await remplir(page, saisie())
			await page.getByRole('button', { name: 'Envoyer l’email' }).click()
			await expect(page.getByTestId('contact-envoye')).toBeVisible()
		}

		const s = saisie()
		await ouvrir(page)
		await remplir(page, s)
		const refus = page.waitForResponse(
			reponse => reponse.request().method() === 'POST' && reponse.url().endsWith('/contact')
		)
		await page.getByRole('button', { name: 'Envoyer l’email' }).click()

		const reponse = await refus
		expect(reponse.status()).toBe(429)
		expect(Number(reponse.headers()['retry-after'])).toBeGreaterThan(0)
		await expect(page.getByTestId('erreur-contact')).toContainText('beaucoup de messages en peu de temps')
		await expect(page.getByLabel('Message')).toHaveValue(s.message)
		await expect(page.getByLabel('Email')).toHaveValue(s.email)
		expect(await lignesDe(s.email)).toEqual([])
		expect(await mailsDe(s.email)).toEqual([])
		await contexte.close()

		const autre = await browser.newContext({
			extraHTTPHeaders: { 'x-forwarded-for': `203.0.${100 + test.info().workerIndex}.${(Date.now() % 200) + 1}` },
		})
		const page2 = await autre.newPage()
		await ouvrir(page2)
		await remplir(page2, saisie())
		await page2.getByRole('button', { name: 'Envoyer l’email' }).click()
		await expect(page2.getByTestId('contact-envoye')).toBeVisible()
		await autre.close()
	})

	test('la vingt et unième demande du jour pour une même boîte est refusée en 429, d’où qu’elle vienne, la saisie gardée', async ({
		browser,
	}) => {
		test.setTimeout(120_000)
		const s = saisie({ email: `Boite.Pleine-${crypto.randomUUID()}@Example.test` })
		const jeton = `${100 + test.info().workerIndex}.${(Date.now() % 200) + 1}`
		const depuis = async (adresse: string) => {
			const contexte = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': adresse } })
			return { contexte, page: await contexte.newPage() }
		}

		// A first, real submit: it shows how the browser encodes the action, which the next 19 replay.
		const premiere = await depuis(`198.51.${jeton}`)
		await ouvrir(premiere.page)
		await remplir(premiere.page, s)
		const envoi = premiere.page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/contact'))
		await premiere.page.getByRole('button', { name: 'Envoyer l’email' }).click()
		const modele = await envoi
		await expect(premiere.page.getByTestId('contact-envoye')).toBeVisible()
		const corps = modele.postDataBuffer()
		expect(corps).not.toBeNull()
		const entetes = modele.headers()
		for (let i = 0; i < 19; i++) {
			const reponse = await premiere.contexte.request.post('/contact', {
				headers: {
					'next-action': entetes['next-action'] ?? '',
					'content-type': entetes['content-type'] ?? '',
					'x-forwarded-for': `192.0.2.${i + 1}`,
				},
				data: corps,
			})
			expect(reponse.status(), `rejeu ${i + 1}`).toBe(200)
		}
		await premiere.contexte.close()
		await expect.poll(async () => (await lignesDe(s.email)).length, { timeout: 30_000 }).toBe(20)

		const derniere = await depuis(`203.0.${jeton}`)
		await ouvrir(derniere.page)
		await remplir(derniere.page, s)
		const refus = derniere.page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/contact'))
		await derniere.page.getByRole('button', { name: 'Envoyer l’email' }).click()
		const reponse = await refus
		expect(reponse.status()).toBe(429)
		await expect(derniere.page.getByTestId('erreur-contact')).toContainText('beaucoup de messages en peu de temps')
		await expect(derniere.page.getByLabel('Message')).toHaveValue(s.message)
		await derniere.contexte.close()
	})
})
