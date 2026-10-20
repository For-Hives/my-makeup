import { expect, type Page, test } from '@playwright/test'
import { violationsGraves } from '../support/axe'
import { type CompteDeTest, creerCompte } from '../support/account-factory'
import { payloadDeTest } from '../support/payload-test'

/**
 * The availability in her space (ticket 124; plan 02 E19-E29): a switch that is saved for real, a
 * card that says so, a failure that leaves the stored state, a held key that toggles once, and an
 * imported profile with no value that reads « Disponible ». All made-up people.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

let compteur = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${100 + (++compteur % 100)}` })
)

type Maquilleuse = CompteDeTest<'maquilleuse'>

async function maquilleuse(
	context: { addCookies: (c: Maquilleuse['session']['cookies']) => Promise<void> },
	disponible: boolean | null = true
): Promise<Maquilleuse> {
	const compte = await creerCompte('maquilleuse')
	const payload = await payloadDeTest()
	const fiche = await ficheDe(compte)
	await payload.update({ collection: 'profiles', id: fiche.id, data: { firstName: 'Léa', lastName: 'Fictive' } })
	// An imported profile has no value: written under the hooks, as the import does.
	if (disponible === null)
		await payload.db.updateOne({ collection: 'profiles', id: fiche.id, data: { available: null }, returning: false })
	else await payload.update({ collection: 'profiles', id: fiche.id, data: { available: disponible } })
	await context.addCookies(compte.session.cookies)
	return compte
}

async function ficheDe(compte: Maquilleuse) {
	const payload = await payloadDeTest()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })
	const [fiche] = docs
	if (!fiche) throw new Error('pas de profil')
	return fiche
}

function suivreLesEnvois(page: Page): string[] {
	const envois: string[] = []
	page.on('request', requete => {
		if (requete.method() === 'POST' && new URL(requete.url()).pathname === '/auth/profil') envois.push(requete.url())
	})
	return envois
}

const interrupteur = (page: Page) => page.getByRole('switch', { name: 'Je suis disponible' })
const carte = (page: Page) => page.getByTestId('carte-disponibilite')

test.describe('124 : disponible ou indisponible', { tag: '@mobile' }, () => {
	test('E19-E29 : basculer, recharger : l’état est stocké, la carte et l’interrupteur le disent', async ({
		context,
		page,
	}) => {
		const compte = await maquilleuse(context)
		await page.goto('/auth/profil')
		await expect(carte(page)).toContainText('Disponible')
		await expect(interrupteur(page)).toHaveAttribute('aria-checked', 'true')

		if (test.info().project.name === 'mobile') await interrupteur(page).tap()
		else await interrupteur(page).click()

		await expect(interrupteur(page)).toHaveAttribute('aria-checked', 'false')
		await expect(carte(page)).toContainText('Pas disponible en ce moment')
		await expect(carte(page)).toContainText('n’apparaît plus dans les résultats de recherche')
		await expect(page.getByRole('status').filter({ hasText: 'Tu es indisponible' })).toBeVisible()
		expect((await ficheDe(compte)).available).toBe(false)

		await page.reload()
		await expect(interrupteur(page)).toHaveAttribute('aria-checked', 'false')
		await expect(carte(page)).toContainText('Pas disponible en ce moment')

		await interrupteur(page).click()
		await expect(interrupteur(page)).toHaveAttribute('aria-checked', 'true')
		await expect(carte(page)).not.toContainText('Pas disponible')
		expect((await ficheDe(compte)).available).toBe(true)
		expect(await violationsGraves(page)).toEqual([])
	})

	test('un profil importé sans valeur est affiché « Disponible »', async ({ context, page }) => {
		await maquilleuse(context, null)
		await page.goto('/auth/profil')

		await expect(carte(page)).toContainText('Disponible')
		await expect(carte(page)).not.toContainText('à compléter')
		await expect(interrupteur(page)).toHaveAttribute('aria-checked', 'true')
	})

	test('un échec : retour à l’état enregistré, le message le dit, rien n’est stocké', async ({ context, page }) => {
		const compte = await maquilleuse(context)
		await page.goto('/auth/profil')
		await expect(carte(page)).toContainText('Disponible')
		await page.route('**/auth/profil', route =>
			route.request().method() === 'POST' ? route.abort() : route.continue()
		)

		await interrupteur(page).click()

		await expect(page.getByRole('alert').filter({ hasText: 'L’enregistrement n’a pas abouti' })).toBeVisible()
		await expect(interrupteur(page)).toHaveAttribute('aria-checked', 'true')
		await expect(carte(page)).toContainText('Disponible')
		expect((await ficheDe(compte)).available).toBe(true)
	})

	test('un double clic, une touche maintenue : une seule bascule', async ({ context, page }) => {
		const compte = await maquilleuse(context)
		const envois = suivreLesEnvois(page)
		await page.goto('/auth/profil')
		await expect(carte(page)).toContainText('Disponible')

		await interrupteur(page).dblclick()
		await expect(interrupteur(page)).toHaveAttribute('aria-checked', 'false')
		await expect(interrupteur(page)).toBeEnabled()
		expect(envois).toHaveLength(1)

		// A held Enter: the first press, then its repeats.
		await interrupteur(page).focus()
		await page.keyboard.down('Enter')
		for (let rang = 0; rang < 5; rang++) await page.keyboard.down('Enter')
		await page.keyboard.up('Enter')
		await expect(interrupteur(page)).toHaveAttribute('aria-checked', 'true')
		await expect(interrupteur(page)).toBeEnabled()
		expect(envois).toHaveLength(2)
		expect((await ficheDe(compte)).available).toBe(true)
	})

	test('l’interrupteur est atteignable au clavier, assez grand pour un doigt', async ({ context, page }) => {
		await maquilleuse(context)
		await page.goto('/auth/profil')
		await expect(carte(page)).toBeVisible()

		await interrupteur(page).focus()
		await page.keyboard.press('Space')
		await expect(interrupteur(page)).toHaveAttribute('aria-checked', 'false')
		const boite = await interrupteur(page).boundingBox()
		expect(boite?.height ?? 0).toBeGreaterThanOrEqual(44)
		const debordement = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		)
		expect(debordement).toBeLessThanOrEqual(0)
	})
})
