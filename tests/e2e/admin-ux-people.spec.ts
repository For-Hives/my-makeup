import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { placeProfile, readDemoPhoto } from '../../src/demo-data/loading'
import { LOADED_DEMO_PROFILES } from '../../src/demo-data/profiles'
import { createAccount } from '../support/account-factory'
import { keepSevere, REFERENCES } from '../support/axe'
import { withoutOutsideNetwork } from '../support/offline'
import { testPayload } from '../support/payload-test'

/**
 * Ticket 308 (audit UX no. 25, reduced): the admin panel shows people and helps to answer. The list of
 * profiles opens on the photo, the name and the zone; the sheet of a profile has « Voir la page publique »
 * and « Masquer… »; the communes of a zone to review are buttons; a contact message has « Répondre par
 * email »; dates are French. Screenshots at both widths are attached to the report. The axe violations
 * of Payload's own interface are not this ticket's (audit, journey 8): only the components added are held to zero.
 */

const aSuffix = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`

/** A profile of its own, of one of the types of the fictional set, under a name no other test reads. */
async function setProfile(cle: string, suffix: string) {
	const template = LOADED_DEMO_PROFILES.find(autre => autre.cle === cle)
	if (!template) throw new Error(`Le profil type « ${cle} » du jeu fictif manque.`)
	const type = {
		...template,
		cle: `essai-ux-${cle}-${suffix}`,
		compte: { email: `essai-ux-${cle}-${suffix}@example.test`, nom: `Essai UX ${suffix} ${cle}` },
		photos: { principale: template.photos.principale, galerie: [] },
	}
	const placed = await placeProfile(await testPayload(), type, readDemoPhoto, false)
	return { id: placed.profil, slug: placed.slug, email: type.compte.email }
}

async function remove(suffix: string): Promise<void> {
	const payload = await testPayload()
	const accounts = await payload.find({
		collection: 'pros',
		depth: 0,
		limit: 50,
		pagination: false,
		where: { email: { like: 'essai-ux-' } },
	})
	for (const { id, email } of accounts.docs) {
		if (!email.includes(`-${suffix}@`)) continue
		await payload.delete({ collection: 'media', where: { owner: { equals: id } } }).catch(() => undefined)
		await payload.delete({ collection: 'profiles', where: { pro: { equals: id } } }).catch(() => undefined)
		await payload.delete({ collection: 'pros', id }).catch(() => undefined)
	}
}

const shot = async (page: Page, name: string, testInfo: import('@playwright/test').TestInfo) =>
	testInfo.attach(`${name}-${testInfo.project.name}`, {
		body: await page.screenshot({ fullPage: true }),
		contentType: 'image/png',
	})

/**
 * Axe on the components of this ticket only (the criterion): the interface of Payload has violations of its
 * own, which are the business of the audit's journey 8.
 */
async function ownViolations(page: Page, ...testIds: string[]) {
	let axe = new AxeBuilder({ page }).withTags([...REFERENCES])
	for (const id of testIds) axe = axe.include(`[data-testid="${id}"]`)
	return keepSevere((await axe.analyze()).violations)
}

const noHorizontalScroll = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

test.describe('308 : l’administration montre des personnes et aide à répondre', { tag: '@mobile' }, () => {
	test('la liste des profils : photo, nom, zone ; un profil à l’étranger montre son pays ; dates françaises', async ({
		context,
		page,
	}, testInfo) => {
		test.setTimeout(150_000)
		const suffix = aSuffix()
		await context.addCookies((await createAccount('admin')).session.cookies)
		await withoutOutsideNetwork(context)
		try {
			const [abroad, empty] = await Promise.all([setProfile('zone-belgique', suffix), setProfile('vide', suffix)])
			await page.goto(`/admin/collections/profiles?limit=100&where[and][0][pro.email][like]=-${suffix}@`)
			const rows = page.locator('tbody tr')
			await expect(rows).toHaveCount(2)

			const abroadRow = rows.filter({ hasText: abroad.slug })
			await expect(abroadRow).toContainText(/Belgique/)
			await expect(abroadRow.locator('img')).toHaveCount(1)
			await expect(abroadRow).not.toContainText('Pas de Nom')
			const emptyRow = rows.filter({ hasText: empty.slug })
			await expect(emptyRow).toContainText('Sans nom')
			await expect(emptyRow).toContainText('Pas de zone')
			await expect(emptyRow).not.toContainText('Pas de Nom')

			// French dates: 22/10/2026 14:05.
			await expect(abroadRow).toContainText(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/)

			// The person comes first: her name is in the first cell with a content, her zone in the second.
			const header = await page.locator('thead th').allInnerTexts()
			expect(header.indexOf('Profil')).toBeLessThan(header.indexOf('Zone'))
			expect(header.indexOf('Zone')).toBeLessThan(header.indexOf('Adresse du profil'))

			expect(await noHorizontalScroll(page)).toBe(true)
			expect(await ownViolations(page, 'profile-name', 'profile-zone')).toEqual([])
			await shot(page, 'liste-des-profils', testInfo)
		} finally {
			await remove(suffix)
		}
	})

	test('la fiche : « Voir la page publique », et « Masquer… » demande avant de masquer', async ({
		context,
		page,
		request,
	}, testInfo) => {
		test.setTimeout(150_000)
		const suffix = aSuffix()
		await context.addCookies((await createAccount('admin')).session.cookies)
		await withoutOutsideNetwork(context)
		try {
			const profile = await setProfile('reference', suffix)
			const pageStatus = async () => (await request.get(`/profil/${profile.slug}`)).status()
			await page.goto(`/admin/collections/profiles/${profile.id}`)
			await page.waitForLoadState('networkidle')

			const link = page.getByRole('link', { name: 'Voir la page publique' })
			await expect(link).toHaveAttribute('href', `/profil/${profile.slug}`)
			await expect(link).toHaveAttribute('target', '_blank')
			expect(await pageStatus()).toBe(200)

			await page.getByRole('button', { name: 'Masquer…' }).click()
			const confirmation = page.getByRole('group', { name: 'Masquer ce profil' })
			await expect(confirmation).toBeVisible()
			await shot(page, 'masquer-confirmation', testInfo)
			// Cancelling writes nothing and leaves the page online.
			await confirmation.getByRole('button', { name: 'Annuler' }).click()
			await expect(confirmation).toHaveCount(0)
			expect(await pageStatus()).toBe(200)

			await page.getByRole('button', { name: 'Masquer…' }).click()
			await page.getByRole('button', { name: 'Masquer le profil' }).click()
			await expect(page.getByRole('status').filter({ hasText: 'Statut choisi : masqué' })).toBeVisible()
			// Nothing is written before the sheet is saved.
			expect(await pageStatus()).toBe(200)
			await page.locator('#action-save').click()
			await expect(page.getByText('Mis à jour avec succès').first()).toBeVisible()
			await expect.poll(pageStatus, { timeout: 60_000 }).toBe(404)
			expect((await (await testPayload()).findByID({ collection: 'profiles', id: profile.id, depth: 0 })).status).toBe(
				'hidden'
			)

			expect(await noHorizontalScroll(page)).toBe(true)
			expect(await ownViolations(page, 'profile-actions')).toEqual([])
		} finally {
			await remove(suffix)
		}
	})

	test('une zone à revoir : les communes sont des boutons, un appui enregistre et vide la revue', async ({
		context,
		page,
	}, testInfo) => {
		test.setTimeout(150_000)
		const suffix = aSuffix()
		await context.addCookies((await createAccount('admin')).session.cookies)
		await withoutOutsideNetwork(context)
		try {
			const profile = await setProfile('zone-a-revoir', suffix)
			const payload = await testPayload()
			await page.goto(`/admin/collections/profiles/${profile.id}`)
			await page.waitForLoadState('networkidle')

			await expect(page.getByRole('heading', { name: 'Communes possibles' })).toBeVisible()
			await expect(page.getByRole('button', { name: 'Choisir Valbrume (74)' })).toBeVisible()
			await shot(page, 'zone-a-revoir', testInfo)
			expect(await noHorizontalScroll(page)).toBe(true)
			expect(await ownViolations(page, 'zone-candidates')).toEqual([])

			await page.getByRole('button', { name: 'Choisir Hautcombe (74)' }).click()
			await expect(page.getByRole('status').filter({ hasText: 'Commune enregistrée : Hautcombe (74)' })).toBeVisible()

			const stored = await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })
			expect(stored.city).toMatchObject({ name: 'Hautcombe', inseeCode: '74991', postalCodes: ['74990'] })
			expect(stored.zoneReview?.reason ?? null).toBeNull()
			await page.reload()
			await expect(page.getByRole('button', { name: /^Choisir .+ \(\d{2,3}\)$/ })).toHaveCount(0)
		} finally {
			await remove(suffix)
		}
	})

	test('un message de contact : « Répondre par email » ouvre un mailto: sans le message, et ne change pas le statut', async ({
		context,
		page,
	}, testInfo) => {
		test.setTimeout(90_000)
		const email = `visiteuse-${crypto.randomUUID()}@example.test`
		const payload = await testPayload()
		const { id } = await payload.create({
			collection: 'contact-requests',
			data: {
				type: 'contact',
				status: 'forwarded',
				mailStatus: 'sent',
				firstName: 'Léa',
				lastName: 'Témoin',
				email,
				phone: '01 99 00 12 34',
				message: 'Bonjour, une question confidentielle sur le site.',
			},
			depth: 0,
		})
		await context.addCookies((await createAccount('admin')).session.cookies)
		await withoutOutsideNetwork(context)

		await page.goto(`/admin/collections/contact-requests/${id}`)
		await page.waitForLoadState('networkidle')
		const reply = page.getByRole('link', { name: 'Répondre par email' })
		await expect(reply).toBeVisible()
		const href = (await reply.getAttribute('href')) ?? ''
		expect(href).toBe(`mailto:${email}?subject=${encodeURIComponent('Re : votre message à My Makeup')}`)
		expect(decodeURIComponent(href)).not.toContain('confidentielle')
		await shot(page, 'message-repondre', testInfo)
		expect(await noHorizontalScroll(page)).toBe(true)
		expect(await ownViolations(page, 'reply-by-email')).toEqual([])

		// Opening the sheet changed nothing: the status is the team's to set.
		expect((await payload.findByID({ collection: 'contact-requests', id, depth: 0 })).status).toBe('forwarded')

		// The list shows French dates.
		await page.goto('/admin/collections/contact-requests')
		await expect(page.locator('tbody tr').first()).toContainText(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/)
	})
})
