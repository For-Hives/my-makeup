import { expect, type Page, test } from '@playwright/test'
import { violationsGraves } from '../outils/axe'
import { type CompteDeTest, creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest } from '../outils/payload-test'

/**
 * « Voir mon profil public » (ticket 139; plan 02 RG-06): a link that works at 390, 1024 and 1440 px,
 * a preview with the content of the public page, a banner that says where the profile stands, and a
 * page that is private and not indexed. All made-up people.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

let compteur = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${60 + (++compteur % 150)}` })
)

type Maquilleuse = CompteDeTest<'maquilleuse'>

const COMPLET = {
	prenom: 'Léa',
	nom: 'Aperçu',
	specialite: 'Maquillage mariée',
	description: 'Je maquille pour les mariages.',
	competences: [{ nom: 'Teint lumineux' }],
	langues: [{ nom: 'Français' }],
}

async function maquilleuse(
	context: { addCookies: (c: Maquilleuse['session']['cookies']) => Promise<void> },
	profil: Record<string, unknown>
): Promise<{ compte: Maquilleuse; slug: string }> {
	const compte = await creerCompte('maquilleuse')
	const payload = await payloadDeTest()
	const { docs } = await payload.find({ collection: 'profils', depth: 0, where: { pro: { equals: compte.id } } })
	const [fiche] = docs
	if (!fiche) throw new Error('pas de profil')
	await payload.update({ collection: 'profils', id: fiche.id, data: profil })
	await context.addCookies(compte.session.cookies)
	return { compte, slug: (await payload.findByID({ collection: 'profils', id: fiche.id, depth: 0 })).slug }
}

const debordement = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test.describe('139 : voir mon profil public', { tag: '@mobile' }, () => {
	test('RG-06 : le lien est visible, cliquable à 390, 1024 et 1440 px, et mène à l’aperçu', async ({
		context,
		page,
	}) => {
		await maquilleuse(context, COMPLET)
		for (const largeur of [390, 1024, 1440]) {
			await page.setViewportSize({ width: largeur, height: 900 })
			await page.goto('/auth/profil')
			const lien = page.getByRole('link', { name: 'Voir mon profil public' })
			await expect(lien).toBeVisible()
			const boite = await lien.boundingBox()
			expect(boite?.height ?? 0, `hauteur du lien à ${largeur} px`).toBeGreaterThanOrEqual(44)
			expect(await debordement(page), `débordement à ${largeur} px`).toBeLessThanOrEqual(0)
			await lien.click()
			await expect(page).toHaveURL(/\/auth\/apercu-profil$/)
			await expect(page.getByRole('heading', { level: 1, name: 'Léa Aperçu' })).toBeVisible()
			expect(await debordement(page), `débordement de l’aperçu à ${largeur} px`).toBeLessThanOrEqual(0)
		}
	})

	test('profil complet : le même contenu que la page publique, privé et noindex', async ({
		context,
		page,
		request,
	}) => {
		const { slug } = await maquilleuse(context, COMPLET)
		await page.goto('/auth/apercu-profil')
		const bandeau = page.getByTestId('bandeau-apercu')
		await expect(bandeau).toHaveAttribute('data-etat', 'non-publiable')

		const publique = await request.get(`/profil/${slug}`)
		expect(publique.status()).toBe(200)
		for (const texte of [
			'Léa Aperçu',
			'Maquillage mariée',
			'Je maquille pour les mariages.',
			'Teint lumineux',
			'Français',
		]) {
			await expect(page.getByRole('main')).toContainText(texte)
			expect(await publique.text()).toContain(texte)
		}

		const reponse = await page.request.get('/auth/apercu-profil')
		expect(reponse.headers()['cache-control']).toBe('private, no-store')
		expect(reponse.headers()['x-robots-tag']).toContain('noindex')
		expect(await page.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex')
		expect(await page.locator('link[rel="canonical"]').count()).toBe(0)
		expect(await page.locator('script[type="application/ld+json"]').count()).toBe(0)
		expect(await page.getByRole('heading', { level: 1 }).count()).toBe(1)
		expect(await violationsGraves(page)).toEqual([])
	})

	test('profil non listé : l’aperçu s’ouvre pour sa propriétaire, avec le bandeau', async ({
		context,
		page,
		request,
	}) => {
		const { slug } = await maquilleuse(context, { prenom: 'Zoé', nom: 'Brouillon', disponible: false })
		await page.goto('/auth/apercu-profil')
		await expect(page.getByTestId('bandeau-apercu')).toHaveAttribute('data-etat', 'indisponible')
		await expect(page.getByRole('heading', { level: 1, name: 'Zoé Brouillon' })).toBeVisible()
		await expect(page.getByRole('link', { name: 'Modifier mon profil' })).toBeVisible()
		// A visitor without a session is sent to the sign-in page, in one redirection.
		const visiteuse = await request.get('/auth/apercu-profil', { maxRedirects: 0 })
		expect(visiteuse.status()).toBe(307)
		expect(visiteuse.headers().location).toContain('/auth/signin?callbackUrl=%2Fauth%2Fapercu-profil')
		expect(slug).not.toBe('')
	})
})
