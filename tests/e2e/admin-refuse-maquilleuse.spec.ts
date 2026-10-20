import { expect, test } from '@playwright/test'
import type { Where } from 'payload'
import { creerCompte } from '../support/account-factory'
import { payloadDeTest } from '../support/payload-test'

/**
 * E54 (plan 02 §7.4; ticket 094): a makeup artist, logged in, never opens the admin panel.
 * Her session is a real one, the same cookie as on the site; the panel answers « unauthorized »
 * and shows nothing of the panel, not even the link to an account page.
 */
test.describe('E54 : une maquilleuse connectée n’entre pas dans l’administration', { tag: '@mobile' }, () => {
	test('l’accueil, la liste des comptes et la page du compte de l’administration lui sont refusés', async ({
		context,
		page,
	}) => {
		// The panel has an admin: with none, Payload would offer to create the first account instead.
		await creerCompte('admin')
		const maquilleuse = await creerCompte('maquilleuse')
		await context.addCookies(maquilleuse.session.cookies)

		for (const chemin of ['/admin', '/admin/collections/admins', '/admin/collections/profiles', '/admin/account']) {
			await page.goto(chemin)

			await expect(page).toHaveURL(/\/admin\/unauthorized(?:\?|$)/)
			await expect(page.getByRole('heading', { level: 1, name: /Non autorisé/ })).toBeVisible()
			await expect(page.locator('a[href="/admin/account"]')).toHaveCount(0)
			await expect(page.locator('a[href^="/admin/collections/"]')).toHaveCount(0)
		}
	})
})

/**
 * The editing locks of the panel still work for the accounts of the panel (ticket 094): opening a
 * talent takes a lock in the name of the account, and a second account sees the document locked
 * and can take it over.
 */
test.describe('Les verrous d’édition du back-office marchent pour les comptes admin', () => {
	test('un second admin voit le talent verrouillé et reprend la main', async ({ browser }) => {
		const [premier, second, payload] = await Promise.all([
			creerCompte('admin'),
			creerCompte('redaction'),
			payloadDeTest(),
		])
		const talent = await payload.create({
			collection: 'talents',
			data: {
				title: 'Talent des verrous',
				slug: `talent-verrous-${crypto.randomUUID()}`,
				description: 'Un talent fictif pour les verrous.',
				content: '## Un talent\n\nUn talent fictif pour les verrous.\n',
				_status: 'published',
			},
		})
		const chemin = `/admin/collections/talents/${talent.id}`
		// The bench is shared with the other tests, which open documents in the panel too: only the
		// lock of this talent is read, never every lock of the database.
		const ceVerrou: Where = {
			and: [{ 'document.relationTo': { equals: 'talents' } }, { 'document.value': { equals: talent.id } }],
		}
		const [contextePremier, contexteSecond] = await Promise.all([browser.newContext(), browser.newContext()])
		try {
			await contextePremier.addCookies(premier.session.cookies)
			await contexteSecond.addCookies(second.session.cookies)
			const pagePremier = await contextePremier.newPage()
			const pageSecond = await contexteSecond.newPage()

			await pagePremier.goto(chemin)
			await expect(pagePremier.locator('input[name="title"]')).toHaveValue('Talent des verrous')
			// The panel takes the lock when the form first asks the server for its state: on the first edit.
			// The form hydrates after it shows: keys typed too early reach no handler and take no lock, so
			// the edit is made again until the lock is there (as admin-suppression-compte.spec.ts clicks).
			const verrous = async () =>
				(await payload.count({ collection: 'payload-locked-documents', where: ceVerrou })).totalDocs
			await expect(async () => {
				await pagePremier.locator('input[name="title"]').pressSequentially(' modifié')
				await expect.poll(verrous, { timeout: 3_000 }).toBe(1)
			}).toPass({ timeout: 30_000 })
			const verrou = (await payload.find({ collection: 'payload-locked-documents', depth: 0, where: ceVerrou })).docs[0]
			expect(verrou?.user).toEqual({ relationTo: 'admins', value: Number(premier.id) })

			await pageSecond.goto(chemin)
			await expect(pageSecond.getByText('Document verrouillé')).toBeVisible()
			await pageSecond.getByRole('button', { name: 'Prendre en charge' }).click()
			await expect(pageSecond.locator('input[name="title"]')).toBeEditable()
			await expect
				.poll(
					async () =>
						(await payload.findByID({ collection: 'payload-locked-documents', id: verrou?.id ?? 0, depth: 0 })).user
				)
				.toEqual({ relationTo: 'admins', value: Number(second.id) })
		} finally {
			await Promise.all([contextePremier.close(), contexteSecond.close()])
		}
	})
})
