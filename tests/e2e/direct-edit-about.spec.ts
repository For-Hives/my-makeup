import { expect, test } from '@playwright/test'
import { DESCRIPTION_MAX } from '@/lib/dashboard/description'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { block, checkScreen, editHarness, pen, SIZES, shot as shotOf } from '../support/direct-edit-e2e'
import { testPayload } from '../support/payload-test'

/**
 * « À propos », skills, languages and courses of her own page in edit mode (issue 1016), at 390 px and
 * at 1440 px: the normal, hover, empty, editing and error states; no horizontal scroll, every control at
 * least 44 px, no « serious » or « critical » axe violation; and a visitor's page with no editing control.
 */

const shot = (page: Parameters<typeof shotOf>[0], name: string) => shotOf(page, '1016', name)
const NAMES = [
	'Modifier ma présentation',
	'Modifier mes compétences',
	'Modifier mes langues',
	'Modifier mes formations',
]

for (const size of SIZES) {
	test.describe(`1016 à ${size.width} px`, () => {
		test.use({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch })
		test.describe.configure({ timeout: 120_000 })
		const { open } = editHarness(size)

		test('l’état normal : quatre blocs, chacun un bouton, aucune erreur d’accessibilité', async ({ context, page }) => {
			await open(page, context, 'reference')
			for (const name of NAMES) await expect(pen(page, name)).toBeVisible()
			await checkScreen(page, 'normal')
			await shot(page, 'normal')
		})

		test('le survol (ou le focus clavier) montre qu’on peut modifier', async ({ context, page }) => {
			await open(page, context, 'reference')
			const about = block(page, 'about')
			await about.scrollIntoViewIfNeeded()
			const label = about.getByText('Modifier', { exact: true })
			await expect(label).toBeHidden()
			if (size.touch) await pen(page, 'Modifier ma présentation').focus()
			else await about.hover()
			await expect(label).toBeVisible()
			await shot(page, 'survol')
		})

		test('l’état vide : chaque bloc vide reste sur la page et dit quoi faire', async ({ context, page }) => {
			await open(page, context, 'vide')
			const empties = page.locator('[data-direct-edit-empty]')
			await expect(empties.filter({ hasText: 'Présente-toi en quelques lignes.' })).toBeVisible()
			await expect(empties.filter({ hasText: 'Ajoute tes compétences.' })).toBeVisible()
			await expect(empties.filter({ hasText: 'Ajoute les langues que tu parles.' })).toBeVisible()
			await expect(empties.filter({ hasText: 'Ajoute tes formations et tes diplômes.' })).toBeVisible()
			await checkScreen(page, 'vide')
			await shot(page, 'vide')
		})

		test('la présentation : la limite est dite, le texte est enregistré, la page est relue', async ({
			context,
			page,
		}) => {
			const profile = await open(page, context, 'reference')
			await pen(page, 'Modifier ma présentation').click()
			const editor = page.locator('[data-direct-edit-editor]')
			await expect(editor).toContainText('Présentation · je modifie')
			const field = page.locator('#direct-about-text')
			await expect(field).toBeFocused()
			await expect(page.getByTestId('about-counter')).toContainText(`sur ${DESCRIPTION_MAX} caractères`)
			await field.fill('x'.repeat(DESCRIPTION_MAX + 3))
			await expect(page.getByTestId('about-counter')).toContainText('3 de trop')
			await field.fill('Je maquille depuis huit ans, surtout des mariées et des invitées, à domicile.')
			await checkScreen(page, 'édition')
			await shot(page, 'edition')
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant')
			await expect(editor).toHaveCount(0)
			await expect(page.getByText('à domicile.', { exact: false }).first()).toBeVisible()
			const payload = await testPayload()
			const stored = await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })
			expect(stored.description).toBe('Je maquille depuis huit ans, surtout des mariées et des invitées, à domicile.')
			await expect(pen(page, 'Modifier ma présentation')).toBeFocused()
		})

		test('l’erreur : un réseau coupé est dit en français, la saisie reste, puis l’enregistrement passe', async ({
			context,
			page,
		}) => {
			const profile = await open(page, context, 'reference')
			await pen(page, 'Modifier ma présentation').click()
			await page.locator('#direct-about-text').fill('Un texte plus court mais honnête.')
			const cut = (route: {
				request: () => { method: () => string }
				abort: () => Promise<void>
				continue: () => Promise<void>
			}) => (route.request().method() === 'POST' ? route.abort() : route.continue())
			await page.route('**/auth/apercu-profil**', cut)
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByRole('alert').filter({ hasText: FAILURE_MESSAGE })).toBeVisible()
			await expect(page.locator('#direct-about-text')).toHaveValue('Un texte plus court mais honnête.')
			await expect(page.getByTestId('edit-status')).toContainText('Pas enregistré')
			await checkScreen(page, 'erreur')
			await shot(page, 'erreur')
			await page.unroute('**/auth/apercu-profil**', cut)
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant')
			const payload = await testPayload()
			expect((await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })).description).toBe(
				'Un texte plus court mais honnête.'
			)
		})

		test('les compétences : une puce ajoutée est enregistrée, un doublon est refusé', async ({ context, page }) => {
			const profile = await open(page, context, 'reference')
			await pen(page, 'Modifier mes compétences').click()
			const field = page.getByLabel('Compétence', { exact: true })
			await expect(field).toBeFocused()
			await field.fill('Peaux très matures')
			await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
			await field.fill('peaux très matures')
			await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
			await expect(page.getByRole('alert').filter({ hasText: 'déjà dans ta liste' })).toBeVisible()
			await field.fill('')
			await shot(page, 'puces')
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant')
			const payload = await testPayload()
			const stored = await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })
			expect(stored.skills?.map(skill => skill.name)).toContain('Peaux très matures')
			expect(stored.skills?.filter(skill => skill.name?.toLowerCase() === 'peaux très matures')).toHaveLength(1)
		})

		test('les formations : une ligne ajoutée est enregistrée avec la liste par un seul bouton', async ({
			context,
			page,
		}) => {
			const profile = await open(page, context, 'reference')
			await pen(page, 'Modifier mes formations').click()
			await page.getByRole('button', { name: 'Ajouter une formation' }).click()
			await page.getByLabel('Diplôme', { exact: true }).fill('Certificat de maquillage de scène')
			await page.getByRole('button', { name: 'Enregistrer cette formation' }).click()
			await expect(page.getByText('Le nom de l’école est requis.')).toBeVisible()
			await page.getByLabel('École', { exact: true }).fill('Académie Fictive')
			await checkScreen(page, 'formations')
			await page.getByRole('button', { name: 'Enregistrer cette formation' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant')
			const payload = await testPayload()
			const stored = await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })
			expect(stored.courses?.map(course => course.diploma)).toContain('Certificat de maquillage de scène')
		})

		test('au clavier : Entrée ouvre le bloc, Échap le ferme, le focus revient', async ({ context, page }) => {
			await open(page, context, 'reference')
			const languages = pen(page, 'Modifier mes langues')
			await languages.focus()
			await page.keyboard.press('Enter')
			await expect(page.locator('[data-direct-edit-editor]')).toContainText('Langues · je modifie')
			await page.keyboard.press('Escape')
			await expect(page.locator('[data-direct-edit-editor]')).toHaveCount(0)
			await expect(languages).toBeFocused()
		})

		test('la page publique ne porte aucun contrôle d’édition', async ({ context, page, request }) => {
			const profile = await open(page, context, 'reference')
			const visitor = await request.get(`/profil/${profile.slug}`)
			expect(visitor.status()).toBe(200)
			const html = await visitor.text()
			expect(html).not.toContain('data-direct-edit')
			expect(html).not.toContain('Modifier ma présentation')
		})
	})
}
