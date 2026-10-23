import { expect, test } from '@playwright/test'
import { unsubscribeToken } from '../../src/lib/reminders/token'
import { createAccount } from '../support/account-factory'
import { violationsSevere } from '../support/axe'
import { testPayload } from '../support/payload-test'

/**
 * Issue 1006: the unsubscribe link of a reminder, opened in a browser at 390 and 1440 px. One click, no sign-in:
 * the page says it is done, fits the screen, its link is a target of 44 px, and axe finds nothing severe. A link
 * that is not ours is refused in the same layout. All made-up people; nothing is sent.
 */

const secret = process.env.PAYLOAD_SECRET ?? ''

let counter = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${100 + (++counter % 50)}` })
)

const made: (number | string)[] = []
test.afterEach(async () => {
	const payload = await testPayload()
	for (const account of made.splice(0)) {
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account } } })
		for (const { id } of docs) {
			await payload.delete({ collection: 'reminder-states', where: { profile: { equals: id } } }).catch(() => undefined)
			await payload.delete({ collection: 'profiles', id }).catch(() => undefined)
		}
		await payload.delete({ collection: 'pros', id: account }).catch(() => undefined)
	}
})

async function noHorizontalScroll(page: import('@playwright/test').Page) {
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	)
	expect(overflow).toBeLessThanOrEqual(0)
}

test('le lien d’un rappel désinscrit en un clic, sur une page qui tient l’écran', async ({ page }) => {
	const account = await createAccount('maquilleuse')
	made.push(account.id)
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
	const profile = docs[0]
	if (!profile) throw new Error('pas de profil')

	await page.goto(`/api/reminders/unsubscribe?token=${unsubscribeToken(secret, profile.id)}`)
	await expect(page.getByRole('heading', { name: 'C’est fait' })).toBeVisible()
	await noHorizontalScroll(page)
	const back = page.getByRole('link', { name: 'Retour au site My Makeup' })
	const box = await back.boundingBox()
	expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
	expect(await violationsSevere(page)).toEqual([])

	const { docs: states } = await payload.find({
		collection: 'reminder-states',
		depth: 0,
		where: { profile: { equals: profile.id } },
	})
	expect(states[0]?.unsubscribedAt).toBeTruthy()
})

test('un lien qui n’est pas le nôtre est refusé, dans la même mise en page', async ({ page }) => {
	const response = await page.goto(`/api/reminders/unsubscribe?token=1.${'A'.repeat(43)}`)
	expect(response?.status()).toBe(400)
	await expect(page.getByRole('heading', { name: 'Lien illisible' })).toBeVisible()
	await noHorizontalScroll(page)
	expect(await violationsSevere(page)).toEqual([])
})
