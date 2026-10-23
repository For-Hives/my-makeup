import { expect, test } from '@playwright/test'
import { createAccount } from '../support/account-factory'
import { activateProfile } from '../support/active-profile'
import { violationsSevere } from '../support/axe'
import { waitMail } from '../support/mailpit'
import { testPayload } from '../support/payload-test'

/**
 * Issue 1003: the quote request form on the page of a profile, and the card « Demandes de devis » of her space,
 * at 390 and 1440 px. All made-up people; the mails land in the catcher of the bench.
 */

let counter = 0
test.beforeEach(({ context }) => context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${40 + (++counter % 50)}` }))

// What a test made is taken away at its end: a published profile left behind would show in the lists of the crawl.
const made: (number | string)[] = []
test.afterEach(async () => {
	const payload = await testPayload()
	for (const account of made.splice(0)) {
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account } } })
		for (const { id } of docs) {
			await payload.delete({ collection: 'quote-requests', where: { profile: { equals: id } } }).catch(() => undefined)
			await payload.delete({ collection: 'profiles', id }).catch(() => undefined)
		}
		await payload.delete({ collection: 'pros', id: account }).catch(() => undefined)
	}
})

async function publishedArtist(over: { networks?: boolean; available?: boolean } = {}) {
	const account = await createAccount('maquilleuse')
	made.push(account.id)
	const payload = await testPayload()
	await activateProfile(account.id)
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
	const profile = docs[0]
	if (!profile) throw new Error('pas de profil')
	await payload.update({
		collection: 'profiles',
		id: profile.id,
		data: {
			chosenStatus: 'published',
			available: over.available ?? true,
			...(over.networks !== false && { networks: { instagram: 'https://www.instagram.com/fictive' } }),
		},
	})
	const { docs: fresh } = await payload.find({
		collection: 'profiles',
		depth: 0,
		where: { id: { equals: profile.id } },
	})
	return { account, slug: fresh[0]?.slug ?? '' }
}

const noHorizontalScroll = (page: import('@playwright/test').Page) =>
	page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

test.describe('1003 : le formulaire sur la fiche', { tag: '@mobile' }, () => {
	test('il tient l’écran, ses cibles font 44 px, il annonce ses erreurs et envoie la demande', async ({ page }) => {
		const { account, slug } = await publishedArtist()
		await page.goto(`/profil/${slug}`)
		const form = page.getByTestId('devis-formulaire')
		await expect(page.getByRole('heading', { name: 'Demander un devis' })).toBeVisible()
		await form.scrollIntoViewIfNeeded()
		expect(await noHorizontalScroll(page)).toBe(true)

		for (const label of [
			'Date de l’événement',
			'Type de prestation',
			'Lieu de l’événement',
			'Votre message',
			'Votre prénom',
			'Votre email',
			'Votre téléphone (facultatif)',
		]) {
			const box = await page.getByLabel(label).boundingBox()
			expect(box?.height ?? 0, label).toBeGreaterThanOrEqual(44)
		}
		const send = page.getByRole('button', { name: 'Envoyer ma demande' })
		expect((await send.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
		expect((await page.locator('label[for="devis-consent"]').boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
		expect(await violationsSevere(page)).toEqual([])

		// Empty: one sentence under each field, the first one takes the focus.
		await send.click()
		await expect(page.getByTestId('erreur-devis-place')).toHaveText('Le lieu est requis')
		await expect(page.getByTestId('erreur-devis-consent')).toHaveText('Cochez la case pour envoyer votre demande')
		await expect(page.getByLabel('Date de l’événement')).toBeFocused()
		expect(await violationsSevere(page)).toEqual([])
		await form.screenshot({ path: test.info().outputPath('devis-erreurs.png') })

		await page.getByLabel('Date de l’événement').fill('2028-06-12')
		await page.getByLabel('Type de prestation').selectOption('wedding')
		await page.getByLabel('Lieu de l’événement').fill('Annecy')
		await page.getByLabel('Votre message').fill('Mariage civil, une trentaine d’invités, essai souhaité.')
		await page.getByLabel('Votre prénom').fill('Camille')
		await page.getByLabel('Votre email').fill(`cliente-${crypto.randomUUID()}@example.test`)
		await page.getByLabel(/J’accepte que ma demande/).check()
		await send.click()
		await expect(page.getByTestId('devis-envoye')).toContainText('Votre demande a bien été envoyée')
		await page.getByTestId('devis-envoye').screenshot({ path: test.info().outputPath('devis-envoye.png') })

		const mail = await waitMail({ pour: account.email, sujet: 'Nouvelle demande de devis sur My Makeup' })
		expect(mail.texte).toContain('Mariage civil')
		// The contact of the client is nowhere on the public page.
		expect(await page.content()).not.toContain('example.test')
	})

	test('sans moyen de la joindre, ou en pause : pas de formulaire', async ({ page }) => {
		const unreachable = await publishedArtist({ networks: false })
		await page.goto(`/profil/${unreachable.slug}`)
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
		await expect(page.getByTestId('devis-formulaire')).toHaveCount(0)
		const paused = await publishedArtist({ available: false })
		await page.goto(`/profil/${paused.slug}`)
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
		await expect(page.getByTestId('devis-formulaire')).toHaveCount(0)
	})
})

test.describe('1003 : le suivi dans son espace', { tag: '@mobile' }, () => {
	test('la demande arrive Nouvelle, elle la marque Répondue, rien ne déborde', async ({ context, page }) => {
		const { account, slug } = await publishedArtist()
		const payload = await testPayload()
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { slug: { equals: slug } } })
		await payload.create({
			collection: 'quote-requests',
			data: {
				profile: docs[0]?.id ?? 0,
				status: 'new',
				mailStatus: 'sent',
				eventDate: '2028-06-12',
				place: 'Annecy',
				serviceType: 'wedding',
				message: 'Mariage civil, une trentaine d’invités, essai souhaité.',
				clientFirstName: 'Camille',
				clientEmail: 'cliente@example.test',
				clientPhone: '06 12 34 56 78',
				consentAt: new Date().toISOString(),
			},
		})
		await context.addCookies(account.session.cookies)
		await page.goto('/auth/profil')
		const card = page.getByTestId('mes-devis')
		await expect(card.getByTestId('mon-devis-statut')).toHaveText('Nouvelle')
		await expect(card).toContainText('Camille')
		await card.scrollIntoViewIfNeeded()
		expect(await noHorizontalScroll(page)).toBe(true)
		for (const control of [
			card.getByRole('link', { name: 'Répondre par email' }),
			card.getByRole('link', { name: 'Appeler' }),
			card.getByRole('button', { name: 'Marquer comme répondue' }),
		])
			expect((await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
		expect(await violationsSevere(page)).toEqual([])
		await card.screenshot({ path: test.info().outputPath('mes-devis.png') })

		await card.getByRole('button', { name: 'Marquer comme répondue' }).click()
		await expect(card.getByTestId('mon-devis-statut')).toHaveText('Répondue')
	})
})
