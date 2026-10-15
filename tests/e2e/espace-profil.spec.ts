import { expect, type Page, test } from '@playwright/test'
import { violationsGraves } from '../outils/axe'
import { type CompteDeTest, creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest } from '../outils/payload-test'

/**
 * The page of her space and the panel of her identity (tickets 118, 119, 120; plan 02 E16, E19, E30,
 * E31, E68, U54): the profile section by section, an identity that is saved for real or says it
 * was not, and a panel that works with a finger and with the keyboard. All made-up people.
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

let compteur = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${40 + (++compteur % 150)}` })
)

type Maquilleuse = CompteDeTest<'maquilleuse'>

const IDENTITE = { prenom: 'Léa', nom: 'Fictive', nomArtiste: 'Studio Fictif', specialite: 'Maquillage mariée' }

/** A makeup artist with her profile filled in, a session in the browser. */
async function maquilleuse(
	context: { addCookies: (c: Maquilleuse['session']['cookies']) => Promise<void> },
	profil: Record<string, unknown> = IDENTITE
): Promise<Maquilleuse> {
	const compte = await creerCompte('maquilleuse')
	const payload = await payloadDeTest()
	const { docs } = await payload.find({ collection: 'profils', depth: 0, where: { pro: { equals: compte.id } } })
	const [fiche] = docs
	if (!fiche) throw new Error('pas de profil')
	await payload.update({ collection: 'profils', id: fiche.id, data: profil })
	await context.addCookies(compte.session.cookies)
	return compte
}

async function ficheDe(compte: Maquilleuse) {
	const payload = await payloadDeTest()
	const { docs } = await payload.find({ collection: 'profils', depth: 0, where: { pro: { equals: compte.id } } })
	const [fiche] = docs
	if (!fiche) throw new Error('pas de profil')
	return fiche
}

/** The requests that carry a Server Action to the page of the space. */
function suivreLesEnvois(page: Page): string[] {
	const envois: string[] = []
	page.on('request', requete => {
		if (requete.method() === 'POST' && new URL(requete.url()).pathname === '/auth/profil') envois.push(requete.url())
	})
	return envois
}

const modifier = (page: Page) => page.getByRole('button', { name: 'Modifier mon identité' })
const dialogue = (page: Page) => page.getByRole('dialog', { name: 'Modifier mon identité' })

async function ouvrir(page: Page) {
	if (test.info().project.name === 'mobile') await modifier(page).tap()
	else await modifier(page).click()
	await expect(dialogue(page)).toBeVisible()
}

test.describe('118 : la page de l’espace', { tag: '@mobile' }, () => {
	test('les valeurs enregistrées, « à compléter » pour le reste, jamais « null »', async ({ context, page }) => {
		await maquilleuse(context, { ...IDENTITE, description: 'null', rayonKm: 0 })

		await page.goto('/auth/profil')

		await expect(page.getByTestId('carte-identite')).toContainText('Studio Fictif')
		await expect(page.getByTestId('carte-identite')).toContainText('Maquillage mariée')
		// A section with nothing stored says so.
		await expect(page.getByTestId('carte-competences')).toContainText('à compléter')
		await expect(page.getByTestId('carte-description')).toContainText('à compléter')
		await expect(page.getByTestId('carte-reseaux')).toContainText('à compléter')
		const texte = await page.locator('main').innerText()
		expect(texte).not.toMatch(/\bnull\b|undefined|NaN/)
	})

	test('un h1, une navigation, aucun débordement', async ({ context, page }) => {
		await maquilleuse(context)

		await page.goto('/auth/profil')
		await expect(page.getByTestId('carte-identite')).toBeVisible()

		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mon espace')
		await expect(page.getByRole('navigation').first()).toBeVisible()
		const debordement = await page.evaluate(() => {
			const { scrollWidth, clientWidth } = document.documentElement
			return scrollWidth - clientWidth
		})
		expect(debordement).toBeLessThanOrEqual(0)
		expect(await violationsGraves(page)).toEqual([])

		const dossier = process.env.CAPTURES_ESPACE
		if (dossier) await page.screenshot({ fullPage: true, path: `${dossier}/espace-${test.info().project.name}.png` })
	})

	test('U54 : A ne voit rien du profil de B, ni dans la page ni dans la charge RSC', async ({ context, page }) => {
		const b = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const ficheB = await ficheDe(b)
		await payload.update({
			collection: 'profils',
			id: ficheB.id,
			data: { prenom: 'Zoéprivée', nom: 'Autredame', specialite: 'Secret de B' },
		})
		const a = await maquilleuse(context)

		await page.goto('/auth/profil')
		await expect(page.getByTestId('carte-identite')).toContainText('Léa')

		const enTetes = { ...a.session.enTetes }
		const html = await page.context().request.get('/auth/profil', { headers: enTetes })
		const rsc = await page.context().request.get('/auth/profil', { headers: { ...enTetes, RSC: '1' } })
		for (const corps of [await page.content(), await html.text(), await rsc.text()]) {
			expect(corps).not.toContain('Zoéprivée')
			expect(corps).not.toContain('Secret de B')
			expect(corps).not.toContain(b.email)
		}
	})
})

test.describe('119 : l’identité s’enregistre pour de vrai', { tag: '@mobile' }, () => {
	test('modifier, enregistrer, recharger : la valeur est stockée, le message de réussite est annoncé, le slug ne bouge pas', async ({
		context,
		page,
	}) => {
		const compte = await maquilleuse(context)
		const slug = (await ficheDe(compte)).slug
		await page.goto('/auth/profil')
		await ouvrir(page)

		await page.getByLabel('Prénom').fill('  Inès  ')
		await page.getByLabel('Spécialité').fill('Effets spéciaux')
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(dialogue(page)).toHaveCount(0)
		await expect(page.getByRole('status').filter({ hasText: 'Ton identité est enregistrée.' })).toBeVisible()
		await expect(page.getByTestId('carte-identite')).toContainText('Inès')
		await expect(page.getByTestId('carte-identite')).toContainText('Effets spéciaux')
		await expect(modifier(page)).toBeFocused()

		await page.reload()
		await expect(page.getByTestId('carte-identite')).toContainText('Effets spéciaux')
		expect(await ficheDe(compte)).toMatchObject({ prenom: 'Inès', specialite: 'Effets spéciaux', slug })
	})

	test('E30 : hors bornes, un message sous le champ et aucune requête', async ({ context, page }) => {
		await maquilleuse(context)
		const envois = suivreLesEnvois(page)
		await page.goto('/auth/profil')
		await ouvrir(page)

		await page.getByLabel('Nom', { exact: true }).fill('A')
		await page.getByLabel('Prénom').fill('')
		await page.getByLabel('Spécialité').fill('x'.repeat(71))
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(page.getByText('Ton nom doit contenir au moins 2 caractères.')).toBeVisible()
		await expect(page.getByText('Indique ton prénom.')).toBeVisible()
		await expect(page.getByText('Ta spécialité ne doit pas dépasser 70 caractères.')).toBeVisible()
		expect(envois).toHaveLength(0)
		await expect(dialogue(page)).toBeVisible()
	})

	test('E31 : un échec du serveur laisse l’ancienne valeur et le dit ; fermer demande confirmation', async ({
		context,
		page,
	}) => {
		const compte = await maquilleuse(context)
		await page.goto('/auth/profil')
		await ouvrir(page)
		await page.route('**/auth/profil', route =>
			route.request().method() === 'POST' ? route.abort() : route.continue()
		)

		await page.getByLabel('Prénom').fill('Inès')
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(page.getByRole('alert').filter({ hasText: 'L’enregistrement n’a pas abouti' })).toBeVisible()
		await expect(page.getByLabel('Prénom')).toHaveValue('Inès')
		await expect(page.getByTestId('carte-identite')).toContainText('Léa')
		expect((await ficheDe(compte)).prenom).toBe('Léa')
		await expect(page.getByRole('status').filter({ hasText: 'enregistrée' })).toHaveCount(0)

		await page.getByRole('button', { name: 'Fermer' }).click()
		await expect(page.getByText('Tu as des modifications non enregistrées.')).toBeVisible()
		await page.getByRole('button', { name: 'Continuer à modifier' }).click()
		await expect(page.getByLabel('Prénom')).toHaveValue('Inès')

		await page.getByRole('button', { name: 'Fermer' }).click()
		await page.getByRole('button', { name: 'Abandonner mes modifications' }).click()
		await expect(dialogue(page)).toHaveCount(0)
		await expect(page.getByTestId('carte-identite')).toContainText('Léa')
		// Opened again: the stored values, not the abandoned ones.
		await ouvrir(page)
		await expect(page.getByLabel('Prénom')).toHaveValue('Léa')
	})

	test('un double clic n’envoie qu’un enregistrement', async ({ context, page }) => {
		await maquilleuse(context)
		const envois = suivreLesEnvois(page)
		await page.goto('/auth/profil')
		await ouvrir(page)

		await page.getByLabel('Nom', { exact: true }).fill('Dupont')
		await page.getByRole('button', { name: 'Enregistrer' }).dblclick()

		await expect(dialogue(page)).toHaveCount(0)
		await expect(page.getByTestId('carte-identite')).toContainText('Dupont')
		expect(envois).toHaveLength(1)
	})
})

test.describe('120 : au doigt et au clavier', { tag: '@mobile' }, () => {
	test('le panneau s’ouvre au premier tap ou clic et occupe l’écran à 390 px', async ({ context, page }) => {
		await maquilleuse(context)
		await page.goto('/auth/profil')
		await ouvrir(page)

		await expect(page.getByLabel('Prénom')).toBeFocused()
		const taille = page.viewportSize()
		const boite = await dialogue(page).boundingBox()
		if (!taille || !boite) throw new Error('pas de mesure')
		if (taille.width <= 390) {
			expect(boite.width).toBe(taille.width)
			expect(boite.height).toBe(taille.height)
		}
		const dossier = process.env.CAPTURES_ESPACE
		if (dossier) await page.screenshot({ path: `${dossier}/panneau-${test.info().project.name}.png` })
		expect(await violationsGraves(page)).toEqual([])
	})

	test('E68 : parcours au clavier, le focus reste piégé, Échap ferme et rend le focus', async ({ context, page }) => {
		await maquilleuse(context)
		await page.goto('/auth/profil')
		await expect(page.getByTestId('carte-identite')).toBeVisible()

		await modifier(page).focus()
		await page.keyboard.press('Enter')
		await expect(dialogue(page)).toBeVisible()
		await expect(page.getByLabel('Prénom')).toBeFocused()

		// Seven turns of Tab, then back: the focus never leaves the dialog.
		for (let tour = 0; tour < 7; tour++) {
			await page.keyboard.press('Tab')
			expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true)
		}
		for (let tour = 0; tour < 7; tour++) {
			await page.keyboard.press('Shift+Tab')
			expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true)
		}

		await page.keyboard.press('Escape')
		await expect(dialogue(page)).toHaveCount(0)
		await expect(modifier(page)).toBeFocused()

		// With a change: the first Escape asks, the second goes back to the form.
		await page.keyboard.press('Enter')
		await page.getByLabel('Prénom').fill('Inès')
		await page.keyboard.press('Escape')
		await expect(page.getByText('Tu as des modifications non enregistrées.')).toBeVisible()
		await page.keyboard.press('Escape')
		await expect(page.getByText('Tu as des modifications non enregistrées.')).toHaveCount(0)
		await expect(dialogue(page)).toBeVisible()
	})

	test('Entrée maintenue : un seul enregistrement, panneau fermé, qui ne se rouvre pas', async ({ context, page }) => {
		const compte = await maquilleuse(context)
		const envois = suivreLesEnvois(page)
		await page.goto('/auth/profil')
		await ouvrir(page)
		await page.getByLabel('Nom', { exact: true }).fill('Maintenue')

		await page.getByRole('button', { name: 'Enregistrer' }).focus()
		// A held key: the first press, then its repeats.
		await page.keyboard.down('Enter')
		for (let rang = 0; rang < 5; rang++) await page.keyboard.down('Enter')
		await page.keyboard.up('Enter')

		await expect(dialogue(page)).toHaveCount(0)
		await expect(page.getByTestId('carte-identite')).toContainText('Maintenue')
		await expect(modifier(page)).toBeFocused()
		expect(envois).toHaveLength(1)
		expect((await ficheDe(compte)).nom).toBe('Maintenue')
	})

	test('Entrée maintenue sur « Modifier » : le panneau s’ouvre une fois et rien n’est enregistré', async ({
		context,
		page,
	}) => {
		await maquilleuse(context)
		const envois = suivreLesEnvois(page)
		await page.goto('/auth/profil')
		await expect(page.getByTestId('carte-identite')).toBeVisible()

		await modifier(page).focus()
		await page.keyboard.down('Enter')
		for (let rang = 0; rang < 5; rang++) await page.keyboard.down('Enter')
		await page.keyboard.up('Enter')

		await expect(dialogue(page)).toBeVisible()
		await expect(page.getByLabel('Prénom')).toBeFocused()
		expect(envois).toHaveLength(0)
	})

	test('le résultat est annoncé aux lecteurs d’écran : une région de statut hors du panneau', async ({
		context,
		page,
	}) => {
		await maquilleuse(context)
		await page.goto('/auth/profil')
		await ouvrir(page)
		await page.getByLabel('Nom', { exact: true }).fill('Annoncée')
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		const statut = page.getByRole('status').filter({ hasText: 'Ton identité est enregistrée.' })
		await expect(statut).toBeVisible()
		expect(await statut.evaluate(noeud => noeud.closest('[role="dialog"]') === null)).toBe(true)
		expect(await violationsGraves(page)).toEqual([])
	})
})
