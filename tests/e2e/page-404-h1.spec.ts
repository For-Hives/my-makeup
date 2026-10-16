import { expect, test } from '@playwright/test'

/**
 * Ticket 231: the 404 of an unknown profile, talent or article carries its h1 in the HTML the server sends, not
 * only in the stream the browser draws. The status and the `noindex` stay what they were. Read without a browser
 * (a robot, the host check of the switch day), at both screen sizes for the page the visitor sees.
 */
const ADRESSES = ['/profil/essai-inconnu-zz231', '/talent/essai-inconnu-zz231', '/blog/essai-inconnu-zz231'] as const

test.describe('Ticket 231 : la 404 d’un slug inconnu porte son h1 dans le HTML du serveur', { tag: '@mobile' }, () => {
	for (const adresse of ADRESSES) {
		test(`${adresse} : 404, noindex et h1 dans le HTML reçu`, async ({ request }) => {
			const reponse = await request.get(adresse)
			expect(reponse.status()).toBe(404)
			const html = await reponse.text()
			expect(html).toMatch(/<h1[^>]*>\s*404 - Page non trouvée\s*<\/h1>/)
			expect(html).toMatch(/<title>[^<]*Page non trouvée[^<]*<\/title>/)
			// Next marks the page by the robots tag or by the header, whichever it uses.
			expect(`${reponse.headers()['x-robots-tag'] ?? ''} ${html}`).toMatch(/noindex/)
			expect(html).not.toContain('__next_error__')
			// The French text of the page, and nothing of the requested slug in what a visitor reads (the scripts keep the path).
			const texte = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ')
			expect(texte).toContain('La page que vous cherchez n')
			expect(texte).not.toContain('zz231')
		})

		test(`${adresse} : la page est dessinée dans le gabarit`, async ({ page }) => {
			const reponse = await page.goto(adresse)
			expect(reponse?.status()).toBe(404)
			await expect(page.getByRole('heading', { level: 1, name: '404 - Page non trouvée' })).toBeVisible()
			await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
			await expect(page.getByRole('link', { name: /Retourner à l.accueil/ })).toBeVisible()
		})
	}
})
