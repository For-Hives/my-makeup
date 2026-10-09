import { devices, expect, test } from '@playwright/test'
import { dialogue, erreursDeLaPage } from './espace-helpers.mjs'
import { aller, connecter, ouvrirProfil, reinitialiserStrapi } from './outils-strapi.mjs'

test.use({ testIdAttribute: 'data-cy' })

test.beforeEach(async () => {
	await reinitialiserStrapi()
})

test.describe('UI-02 et UI-04 édition au doigt et au clavier', () => {
	registerespaceuietuieditionaudoigtetauclavier1Scenario1({})

	registerespaceuietuieditionaudoigtetauclavier1Scenario2({})

	registerespaceuietuieditionaudoigtetauclavier1Scenario3({})

	registerespaceuietuieditionaudoigtetauclavier1Scenario4({})

	registerespaceuietuieditionaudoigtetauclavier1Scenario5({})

	registerespaceuietuieditionaudoigtetauclavier1Scenario6({})

	// no edit control anywhere: the top of the page and the cards
	async function vuePubliqueSeule(page) {
		await expect(page.getByTestId('resume-name')).toHaveText('Testine Recette')
		await expect(page.getByTestId('profil-edit-view')).toBeVisible()
		for (const cy of [
			'update-resume-button',
			'update-picture-button',
			'update-description-button',
			'profil-public-view',
		]) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			await expect(page.getByTestId(cy), cy).toHaveCount(0)
		}
	}

	registerespaceuietuieditionaudoigtetauclavier1Scenario7({ vuePubliqueSeule })

	registerespaceuietuieditionaudoigtetauclavier1Scenario8({ vuePubliqueSeule })
})

function registerespaceuietuieditionaudoigtetauclavier1Scenario1() {
	test('RG-05 clavier : le bouton « Modifier » est visible au focus, Entrée ouvre, Échap et clic dehors ferment, défilement bloqué', async ({
		page,
	}) => {
		await ouvrirProfil(page)
		const bouton = page.getByTestId('update-description-button')

		// reached with Tab only
		let atteint = false
		for (let i = 0; i < 80 && !atteint; i++) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			await page.keyboard.press('Tab')
			atteint = await bouton.evaluate(b => document.activeElement === b)
		}
		expect(atteint).toBe(true)
		await expect(bouton).toBeVisible()
		await expect(bouton).toBeInViewport()
		const style = await bouton.evaluate(b => {
			const cs = getComputedStyle(b)
			const r = b.getBoundingClientRect()
			return {
				opacity: cs.opacity,
				anneau: cs.boxShadow,
				largeur: r.width,
				hauteur: r.height,
			}
		})
		expect(style.opacity).toBe('1')
		expect(style.anneau).not.toBe('none') // focus-visible ring
		expect(style.largeur).toBeGreaterThanOrEqual(44)
		expect(style.hauteur).toBeGreaterThanOrEqual(44)
		await expect(bouton).toHaveAccessibleName('Modifier votre description')

		await page.keyboard.press('Enter')
		const champ = page.getByTestId('description-input')
		await expect(champ).toBeVisible()
		// labels are linked to their field
		await expect(page.getByLabel('Description', { exact: true })).toBeVisible()
		// translucent backdrop (UI-04) and page scroll locked
		await expect(page.getByTestId('modal-backdrop')).toHaveCSS('background-color', 'rgba(107, 114, 128, 0.75)')
		const defilement = () => page.evaluate(() => getComputedStyle(document.documentElement).overflow)
		await expect.poll(defilement).toBe('hidden')
		await expect(page.getByRole('button', { name: 'Fermer' })).toBeVisible()

		await page.keyboard.press('Escape')
		await expect(champ).toBeHidden()
		await expect.poll(defilement).not.toBe('hidden')

		// a click outside the panel closes it too
		await bouton.click()
		await expect(champ).toBeVisible()
		await page.mouse.click(5, 5)
		await expect(champ).toBeHidden()
	})
}

function registerespaceuietuieditionaudoigtetauclavier1Scenario2() {
	test('toutes les cartes ont un bouton « Modifier » visible de 44 px, avec un anneau au focus clavier', async ({
		page,
	}) => {
		await ouvrirProfil(page)
		// a key pressed first: a focus() then counts as a keyboard focus
		await page.keyboard.press('Shift')
		for (const cy of [
			'update-resume-button',
			'update-location-button',
			'update-social-medias-button',
			'update-skills-button',
			'update-languages-button',
			'update-courses-button',
			'update-description-button',
			'update-portefolio-button',
			'update-service-offers-button',
			'update-experience-button',
		]) {
			const bouton = page.getByTestId(cy)
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			await expect(bouton, cy).toBeVisible()
			const boite = await bouton.boundingBox()
			expect(boite.height, cy).toBeGreaterThanOrEqual(44)
			expect(await bouton.evaluate(b => getComputedStyle(b).opacity), cy).toBe('1')
			const ombre = () => bouton.evaluate(b => getComputedStyle(b).boxShadow)
			// no ring before the focus, an indigo-600 one with it
			expect(await ombre(), cy).toBe('none')
			await bouton.focus()
			expect(await bouton.evaluate(b => b.matches(':focus-visible')), cy).toBe(true)
			expect(await ombre(), cy).toContain('rgb(79, 70, 229)')
		}
	})
}

function registerespaceuietuieditionaudoigtetauclavier1Scenario3() {
	test('interrupteur de disponibilité : 44 px, nommé par son label, au clavier', async ({ page }) => {
		await ouvrirProfil(page)
		await page.getByTestId('update-resume-button').click()
		const interrupteur = dialogue(page).getByRole('switch', {
			name: 'Disponibilité',
		})
		// measured once the opening (scale 95 % → 100 %) is over
		const cote = async () => {
			const { width, height } = await interrupteur.boundingBox()
			return Math.min(width, height)
		}
		await expect.poll(cote).toBeGreaterThanOrEqual(44)
		await expect(interrupteur).toHaveAttribute('aria-checked', 'true')
		await interrupteur.focus()
		await page.keyboard.press('Space')
		await expect(interrupteur).toHaveAttribute('aria-checked', 'false')
	})
}

function registerespaceuietuieditionaudoigtetauclavier1Scenario4() {
	test('10 modales : chaque champ a un label relié, aucun id en double, chaque commande fait 44 px', async ({
		page,
	}) => {
		await ouvrirProfil(page)
		for (const cy of [
			'update-resume-button',
			'update-location-button',
			'update-social-medias-button',
			'update-skills-button',
			'update-languages-button',
			'update-courses-button',
			'update-description-button',
			'update-portefolio-button',
			'update-service-offers-button',
			'update-experience-button',
		]) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			await page.getByTestId(cy).click()
			await expect(dialogue(page)).toBeVisible()
			// translucent backdrop behind every modal (UI-04)
			await expect(page.getByTestId('modal-backdrop'), cy).toHaveCSS('background-color', 'rgba(107, 114, 128, 0.75)')
			if (cy === 'update-service-offers-button') {
				// the fields of an option only exist once one is added
				await page.getByTestId('add-service-offers-option-button').click()
				await page.getByTestId('add-service-offers-option-button').click()
			}
			// measured once the opening (scale 95 % → 100 %) is over
			await expect
				.poll(() => dialogue(page).evaluate(p => getComputedStyle(p).transform))
				.toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/)
			const bilan = await dialogue(page).evaluate(panneau => {
				const nom = e => e.dataset.cy || e.id || e.getAttribute('aria-label') || e.outerHTML.slice(0, 120)
				const champs = [...panneau.querySelectorAll('input:not([type=hidden]), textarea, select, [role=switch]')]
				const ids = [...panneau.querySelectorAll('[id]')].map(e => e.id)
				const cibles = [...panneau.querySelectorAll('label[for]')].map(l => l.htmlFor)
				return {
					sansLabel: champs
						.filter(c => !(c.labels?.length || c.getAttribute('aria-label') || c.getAttribute('aria-labelledby')))
						.map(nom),
					idsEnDouble: ids.filter((id, i) => ids.indexOf(id) !== i),
					labelsSansChamp: cibles.filter(id => !panneau.querySelector(`[id="${CSS.escape(id)}"]`)),
					labelsPartages: cibles.filter((id, i) => cibles.indexOf(id) !== i),
					// buttons, switches, tabs and links shown, under 44 px (the
					// focus guards of Headless UI are aria-hidden, 1 px)
					ciblesPetites: [...panneau.querySelectorAll('button, [role=switch], [role=tab], a[href]')]
						.filter(e => {
							if (e.closest('[aria-hidden="true"]')) return false
							const { width, height } = e.getBoundingClientRect()
							return width > 0 && (width < 44 || height < 44)
						})
						.map(nom),
				}
			})
			expect(bilan, cy).toEqual({
				sansLabel: [],
				idsEnDouble: [],
				labelsSansChamp: [],
				labelsPartages: [],
				ciblesPetites: [],
			})
			await page.keyboard.press('Escape')
			await expect(dialogue(page)).toBeHidden()
		}
	})
}

function registerespaceuietuieditionaudoigtetauclavier1Scenario5() {
	test.describe('sur un téléphone', () => {
		const { defaultBrowserType, ...iphone } = devices['iPhone 13']
		test.use(iphone)

		test('RG-05 le premier tap ouvre la modale', async ({ page }) => {
			await ouvrirProfil(page)
			const bouton = page.getByTestId('update-description-button')
			await bouton.scrollIntoViewIfNeeded()
			await bouton.tap()
			await expect(page.getByTestId('description-input')).toBeVisible()
		})

		test('aucun débordement horizontal de l’espace', async ({ page }) => {
			await ouvrirProfil(page)
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
		})
	})
}

function registerespaceuietuieditionaudoigtetauclavier1Scenario6() {
	for (const largeur of [390, 1024, 1440]) {
		test(`RG-06 « Voir mon profil public » cliquable à ${largeur} px`, async ({ page }) => {
			await page.setViewportSize({ width: largeur, height: 900 })
			await ouvrirProfil(page)
			const lien = page.getByTestId('profil-public-view')
			await lien.scrollIntoViewIfNeeded()
			// nothing covers its center
			expect(
				await lien.evaluate(a => {
					const r = a.getBoundingClientRect()
					return a.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
				})
			).toBe(true)
			expect((await lien.boundingBox()).height).toBeGreaterThanOrEqual(44)
			await lien.click()
			await expect(page).toHaveURL(/publicView=true/)
			await expect(page.getByTestId('profil-edit-view')).toBeVisible()
			await expect(page.getByTestId('update-description-button')).toHaveCount(0)
		})
	}
}

function registerespaceuietuieditionaudoigtetauclavier1Scenario7({ vuePubliqueSeule }) {
	test('UI-02 ?publicView=true chargé directement, puis rechargé : vue publique seule ; « Modifier mon profil » rend la vue d’édition', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		page.on('console', m => {
			if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text())
		})
		expect(await connecter(page)).toBe(true)
		// the server already renders the public view: same page once hydrated
		const html = await (await page.context().request.get('/auth/profil?publicView=true')).text()
		expect(html).toContain('data-cy="profil-edit-view"')
		expect(html).not.toContain('data-cy="update-resume-button"')
		expect(html).not.toContain('data-cy="update-picture-button"')
		// aller() waits for the hydration: the old effects had run by then
		await aller(page, '/auth/profil?publicView=true')
		await vuePubliqueSeule(page)
		const session = page.waitForResponse(r => r.url().endsWith('/api/auth/session'))
		await page.reload()
		await session
		await vuePubliqueSeule(page)

		// « Modifier mon profil »: every edit control is back
		await page.getByTestId('profil-edit-view').click()
		await expect(page).not.toHaveURL(/publicView/)
		await expect(page.getByTestId('update-resume-button')).toBeVisible()
		await expect(page.getByTestId('update-picture-button')).toHaveCount(1)
		await expect(page.getByTestId('profil-edit-view')).toHaveCount(0)
		await expect(page.getByTestId('update-description-button')).toBeVisible()
		await expect(page.getByTestId('profil-public-view')).toBeVisible()
		expect(erreurs).toEqual([])
	})
}

function registerespaceuietuieditionaudoigtetauclavier1Scenario8({ vuePubliqueSeule }) {
	test('UI-02 la bascule de vue n’ajoute aucune entrée d’historique : modale ouverte puis retour du navigateur, on quitte l’espace sans modale bloquée', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		expect(await connecter(page)).toBe(true)
		await aller(page, '/')
		// to her space from the menu (navigation côté client)
		await page.getByRole('link', { name: 'Profil', exact: true }).click()
		await expect(page.getByTestId('resume-name')).toHaveText('Testine Recette')
		const entrees = await page.evaluate(() => history.length)
		await page.getByTestId('profil-public-view').click()
		await expect(page).toHaveURL(/publicView=true/)
		await vuePubliqueSeule(page)
		await page.getByTestId('profil-edit-view').click()
		await expect(page).not.toHaveURL(/publicView/)
		expect(await page.evaluate(() => history.length)).toBe(entrees)

		// Back (the usual way to dismiss a modal on Android) leaves her space
		await page.getByTestId('update-description-button').click()
		await expect(page.getByTestId('description-input')).toBeVisible()
		await page.goBack()
		await expect(page).toHaveURL(url => url.pathname === '/')
		await expect(dialogue(page)).toHaveCount(0)
		await expect(page.getByTestId('description-input')).toHaveCount(0)

		// Forward: her space in the edit view, each modal opens and closes
		await page.goForward()
		await expect(page).toHaveURL(url => url.pathname === '/auth/profil' && url.search === '')
		await expect(dialogue(page)).toBeHidden()
		await page.getByTestId('update-description-button').click()
		await expect(page.getByTestId('description-input')).toBeVisible()
		await page.keyboard.press('Escape')
		await expect(page.getByTestId('description-input')).toBeHidden()
		await page.getByTestId('update-resume-button').click()
		await expect(dialogue(page)).toBeVisible()
		await dialogue(page).getByTestId('close-modal').click()
		await expect(dialogue(page)).toBeHidden()
		expect(erreurs).toEqual([])
	})
}
