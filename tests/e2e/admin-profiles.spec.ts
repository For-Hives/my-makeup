import { expect, test } from '@playwright/test'
import { placeProfile, readDemoPhoto } from '../../src/demo-data/loading'
import { DEMO_PROFILES, type DemoProfile } from '../../src/demo-data/profiles'
import { createAccount } from '../support/account-factory'
import { withoutOutsideNetwork } from '../support/offline'
import { testPayload } from '../support/payload-test'

/**
 * E53 and E56 without the journal (plan 02 §7.4; tickets 165 and 166): the admin opens every
 * collection of the panel without a console error or a 500, finds profiles with the filters of the
 * list, hides one from its sheet and the public page answers 404 within a minute; publishing it
 * again brings it back. Large screen only: the bench is shared, so the test counts what belongs to
 * the set of the bench, never a total.
 */

const COLLECTIONS = [
	'admins',
	'pros',
	'profiles',
	'media',
	'articles',
	'talents',
	'contact-requests',
	'auth-events',
	'deleted-accounts',
]
const ONE_MINUTE = 60_000

/** A profile of its own, of one of the types of the fictional set, under a name no other test reads. */
async function setProfile(cle: string, suffixe: string) {
	const template = DEMO_PROFILES.find(autre => autre.cle === cle)
	if (!template) throw new Error(`Le profil type « ${cle} » du jeu fictif manque.`)
	const type: DemoProfile = {
		...template,
		cle: `essai-admin-${cle}-${suffixe}`,
		compte: { email: `essai-admin-${cle}-${suffixe}@example.test`, nom: `Essai Admin ${suffixe} ${cle}` },
		photos: { principale: template.photos.principale, galerie: [] },
	}
	const pose = await placeProfile(await testPayload(), type, readDemoPhoto, false)
	return { id: pose.profil, pro: pose.compte, slug: pose.slug }
}

/** Takes the profiles of a test away, with their accounts and photos. */
async function remove(suffixe: string): Promise<void> {
	const payload = await testPayload()
	const accounts = await payload.find({
		collection: 'pros',
		depth: 0,
		limit: 50,
		pagination: false,
		where: { email: { like: `essai-admin-` } },
	})
	for (const { id, email } of accounts.docs) {
		if (!email.includes(`-${suffixe}@`)) continue
		await payload.delete({ collection: 'media', where: { owner: { equals: id } } }).catch(() => undefined)
		await payload.delete({ collection: 'profiles', where: { pro: { equals: id } } }).catch(() => undefined)
		await payload.delete({ collection: 'pros', id }).catch(() => undefined)
	}
}

/** The cookies of the session of a made-up admin. */
async function sessionDAdmin() {
	return (await createAccount('admin')).session.cookies
}

const aSuffix = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`

test.describe('L’admin retrouve, corrige et masque un profil', () => {
	test('E53 : chaque collection s’ouvre sans erreur ; la liste des profils se filtre', async ({ context, page }) => {
		test.setTimeout(180_000)
		const suffix = aSuffix()
		await context.addCookies(await sessionDAdmin())
		await withoutOutsideNetwork(context)
		try {
			// A reference profile (publishable), an empty one and one active but not publishable (no way to reach her).
			await Promise.all(['reference', 'vide', 'sans-contact-public'].map(cle => setProfile(cle, suffix)))
			const his = `where[and][1][pro.email][like]=-${suffix}@`

			const errors: string[] = []
			page.on('console', message => {
				if (message.type() === 'error') errors.push(message.text())
			})
			page.on('response', reponse => {
				if (reponse.status() >= 500) errors.push(`${reponse.status()} ${reponse.url()}`)
			})

			for (const collection of COLLECTIONS) {
				const response = await page.goto(`/admin/collections/${collection}`)
				expect(response?.status(), collection).toBeLessThan(500)
				await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
				await expect(
					page.locator('.collection-list, .table, tbody, .collection-list__no-results').first()
				).toBeVisible()
			}

			// The columns of the list: the address, the commune, the completeness, publishable, the status.
			await page.goto(`/admin/collections/profiles?limit=100&where[and][0][status][exists]=true&${his}`)
			const header = page.locator('thead')
			for (const column of ['Profil', 'Zone', 'Adresse du profil', 'Complétude', 'Publiable', 'Statut'])
				await expect(header).toContainText(column)
			await expect(page.locator('tbody tr')).toHaveCount(3)

			// The filters of the panel, as its address holds them.
			const filter = (champ: string, valeur: string) =>
				`/admin/collections/profiles?limit=100&where[and][0][${champ}][equals]=${valeur}&${his}`
			await page.goto(filter('publishable', 'false'))
			await expect(page.locator('tbody tr')).toHaveCount(2)
			await page.goto(filter('fullyEmpty', 'true'))
			await expect(page.locator('tbody tr')).toHaveCount(1)
			await page.goto(filter('status', 'published'))
			await expect(page.locator('tbody tr')).toHaveCount(2)
			await page.goto(filter('status', 'draft'))
			await expect(page.locator('tbody tr')).toHaveCount(1)

			expect(errors).toEqual([])
		} finally {
			await remove(suffix)
		}
	})

	test('E56 : masquer depuis la fiche donne un 404 public en moins d’une minute, republier le remet en ligne', async ({
		context,
		page,
		request,
	}) => {
		test.setTimeout(150_000)
		const suffix = aSuffix()
		const payload = await testPayload()
		await context.addCookies(await sessionDAdmin())
		const profile = await setProfile('reference', suffix)
		const slug = profile.slug
		const pageStatus = async () => (await request.get(`/profil/${slug}`)).status()
		const saveWith = async (choix: string, motif: string) => {
			await page.goto(`/admin/collections/profiles/${profile.id}`)
			// The form hydrates after it shows: a click that comes too early opens nothing, so it is made again.
			await expect(async () => {
				await page.locator('#field-chosenStatus .rs__control').click()
				await page.getByRole('option', { name: choix }).first().click({ timeout: 2_000 })
			}).toPass({ timeout: 20_000 })
			// Hiding and restoring need a reason of their own (issue 1005).
			await page.locator('#field-reason').fill(motif)
			await page.locator('#action-save').click()
			await expect(page.getByText('Mis à jour avec succès').first()).toBeVisible()
		}

		try {
			expect(await pageStatus()).toBe(200)
			await saveWith('Masqué', 'Photos sans rapport avec le maquillage.')
			await expect.poll(pageStatus, { timeout: ONE_MINUTE }).toBe(404)
			expect((await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })).status).toBe('hidden')

			await saveWith('Automatique', 'Photos remplacées, profil conforme.')
			await expect.poll(pageStatus, { timeout: ONE_MINUTE }).toBe(200)
			const sitemap = await (await request.get('/sitemap.xml')).text()
			expect(sitemap).toContain(`/profil/${slug}`)
		} finally {
			await remove(suffix)
		}
	})
})
