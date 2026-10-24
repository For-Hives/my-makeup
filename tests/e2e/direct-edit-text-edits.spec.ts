import { expect, test } from '@playwright/test'
import { block, editHarness, pen, SIZES } from '../support/direct-edit-e2e'
import { testPayload } from '../support/payload-test'

/**
 * Ce que les anciens panneaux de la description et des compétences (tickets 122 et 128) gardaient, repris sur les blocs
 * de l'édition directe (issue 1073) : les sauts de ligne sont gardés et montrés, le HTML collé est retiré, un nom de plus
 * de 70 caractères est refusé sans requête et la liste enregistrée garde la description de chaque compétence.
 */

for (const size of SIZES) {
	test.describe(`122 et 128 à ${size.width} px`, () => {
		test.use({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch })
		test.describe.configure({ timeout: 120_000 })
		const { open } = editHarness(size)

		test('la présentation : les sauts de ligne sont gardés et montrés, le HTML collé est retiré', async ({
			context,
			page,
		}) => {
			const profile = await open(page, context, 'reference')
			await pen(page, 'Modifier ma présentation').click()
			await page.locator('#direct-about-text').fill('Maquilleuse de mariée.\n\nJe me déplace dans toute la région.')
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant')
			const payload = await testPayload()
			const stored = () => payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })
			expect((await stored()).description).toBe('Maquilleuse de mariée.\n\nJe me déplace dans toute la région.')
			// The line breaks are shown, not folded: each line is a paragraph of the page.
			await page.reload()
			await expect(block(page, 'about').getByText('Maquilleuse de mariée.', { exact: true })).toBeVisible()
			await expect(block(page, 'about').getByText('Je me déplace dans toute la région.', { exact: true })).toBeVisible()

			await pen(page, 'Modifier ma présentation').click()
			await page.locator('#direct-about-text').fill('<b>Bonjour</b>\n<script>alert(1)</script>à toutes')
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant')
			expect((await stored()).description).toBe('Bonjour\nà toutes')
		})

		test('E30 : un nom de plus de 70 caractères est refusé sans requête, et la liste garde la description de chaque compétence', async ({
			context,
			page,
		}) => {
			const profile = await open(page, context, 'reference')
			const payload = await testPayload()
			await payload.update({
				collection: 'profiles',
				id: profile.id,
				data: { skills: [{ name: 'Teint', description: 'Peaux mates.' }] },
			})
			await page.reload()
			const uploads: string[] = []
			page.on('request', request => {
				if (request.method() === 'POST' && new URL(request.url()).pathname === '/auth/apercu-profil')
					uploads.push(request.url())
			})
			await pen(page, 'Modifier mes compétences').click()
			const field = page.getByLabel('Compétence', { exact: true })
			await field.fill('x'.repeat(71))
			await field.press('Enter')
			await expect(page.getByText('Une compétence ne doit pas dépasser 70 caractères.')).toBeVisible()
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByText('Une compétence ne doit pas dépasser 70 caractères.')).toBeVisible()
			expect(uploads).toHaveLength(0)

			await field.fill('Yeux')
			await field.press('Enter')
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(page.getByTestId('edit-status')).toHaveText('Enregistré à l’instant')
			const stored = (await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 })).skills ?? []
			expect(stored.map(({ name, description }) => [name, description ?? null])).toEqual([
				['Teint', 'Peaux mates.'],
				['Yeux', null],
			])
		})
	})
}
