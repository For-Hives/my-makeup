import { expect, test } from '@playwright/test'
import { violationsSevere } from '../support/axe'

/** A page with two faults axe knows: one « critical » (an image without a name), one « serious » (a contrast). */
const FAULTY_PAGE = `<!doctype html>
<html lang="fr">
	<head><title>Page fautive</title></head>
	<body>
		<main>
			<h1>Page fautive</h1>
			<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
			<p style="color: #bbbbbb; background: #ffffff">Un texte trop pâle pour être lu.</p>
		</main>
	</body>
</html>`

test.describe('Accessibilité : aucune violation « serious » ni « critical »', { tag: '@mobile' }, () => {
	test('l’accueil', async ({ page }) => {
		await page.goto('/')
		await expect(
			page.getByRole('heading', {
				level: 1,
				name: 'Trouvez la maquilleuse qui vous correspond près de chez vous.',
			})
		).toBeVisible()

		expect(await violationsSevere(page)).toEqual([])
	})

	// The proof that the check can fail: without it, an empty list would prove nothing.
	test('le contrôle voit les fautes d’une page fautive, avec leur niveau et leur élément', async ({ page }) => {
		await page.setContent(FAULTY_PAGE)

		const violations = await violationsSevere(page)

		expect(violations.map(({ regle, niveau, elements }) => ({ regle, niveau, elements }))).toEqual([
			{ regle: 'color-contrast', niveau: 'serious', elements: ['p'] },
			{ regle: 'image-alt', niveau: 'critical', elements: ['img'] },
		])
		expect(await violationsSevere(page, { sauf: ['img', 'p'] })).toEqual([])
	})
})
