import { devices, expect, test } from '@playwright/test'
import { barreDeCompletion, erreursDeLaPage, fichiersStockes, idsFichiers } from './espace-helpers.mjs'
import { COMPTE_TEST } from './mock-api.mjs'
import {
	API,
	appels,
	etat,
	inscrire,
	ouvrirProfil,
	panne,
	profilDeDepart,
	reinitialiserStrapi,
} from './outils-strapi.mjs'

test.use({ testIdAttribute: 'data-cy' })

test.beforeEach(async () => {
	await reinitialiserStrapi()
})

test.describe('UI-05 inscription et suppression', () => {
	// « Comment as-tu connu My Makeup ? », in the order shown
	const ORIGINES = [
		['instagram', 'Instagram'],
		['google', 'Recherche Google'],
		['bouche-a-oreille', 'Bouche-à-oreille'],
		['ecole', 'École de maquillage'],
		['autre', 'Autre'],
	]

	// RG-07, at 1440 px and on a phone. `appuyer` clicks, or taps on a phone.
	async function rg07(page, { appuyer = cible => cible.click() } = {}) {
		const erreurs = erreursDeLaPage(page)
		// bodies the browser sends to the API for the profile
		const corps = []
		// every request of the page to the fake Strapi or to an /api route of
		// the app, any method (the Umami sends go to /u/api/send)
		const versLApi = []
		page.on('request', requete => {
			const url = new URL(requete.url())
			if (url.pathname === '/api/me-makeup' && ['POST', 'PATCH'].includes(requete.method()))
				corps.push([requete.method(), requete.postDataJSON()])
			if (url.origin === new URL(API).origin || url.pathname.startsWith('/api/'))
				versLApi.push([requete.url(), requete.postData() ?? ''])
		})

		await panne({ delaiPostMs: 2500 })
		await inscrire(page)
		await expect(page.getByText('Initialisation du compte en cours...')).toBeVisible()
		const prenom = page.getByTestId('first_name')
		await expect(prenom).toBeVisible({ timeout: 15_000 })
		const avant = await etat()
		const [creation] = appels(avant.journal, 'POST', '/api/me-makeup')
		expect(creation.fin).toBeDefined() // answered before the name step

		// the optional question: 5 answers, none chosen, 44 px targets
		const question = page.getByRole('group', {
			name: /Comment as-tu connu My.Makeup/,
		})
		await expect(question).toBeVisible()
		for (const [valeur, libelle] of ORIGINES) {
			const choix = question.getByLabel(libelle, { exact: true })
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			await expect(choix).toHaveAttribute('data-cy', `onboarding-source-${valeur}`)
			await expect(choix).not.toBeChecked()
		}
		expect(await question.getByRole('radio').count()).toBe(ORIGINES.length)
		for (const libelle of await question.locator('label').all()) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			expect((await libelle.boundingBox()).height).toBeGreaterThanOrEqual(44)
		}
		// nothing wider than the screen
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)

		// 1 letter: refused by the form, nothing sent
		await prenom.fill('A')
		await page.getByTestId('last_name').fill('Bo')
		await appuyer(page.getByTestId('submit'))
		await expect(page.getByTestId('error-first-name')).toHaveText('Ton prénom doit contenir au moins 2 caractères.')
		expect(appels((await etat()).journal, 'PATCH', '/api/me-makeup')).toHaveLength(0)

		// an answer to the question, on its label; it can be taken back
		await appuyer(question.getByText('Instagram', { exact: true }))
		await expect(page.getByTestId('onboarding-source-instagram')).toBeChecked()
		const effacer = page.getByTestId('onboarding-source-effacer')
		await expect(effacer).toHaveText('Effacer ma réponse')
		expect((await effacer.boundingBox()).height).toBeGreaterThanOrEqual(44)

		// the save fails: its message, no « Bienvenue »
		await panne({ patch: 500 })
		await prenom.fill('Al')
		await appuyer(page.getByTestId('submit'))
		await expect(page.getByTestId('save-error')).toHaveText(
			"Le service est momentanément indisponible : tes modifications n'ont pas été enregistrées. Réessaie dans quelques minutes."
		)
		await expect(page.getByText(/Bienvenue sur My.Makeup/)).toHaveCount(0)

		// 2 letters stored, then « Bienvenue »
		await panne({ patch: null })
		await appuyer(page.getByTestId('submit'))
		await expect(page.getByText(/Bienvenue sur My.Makeup/)).toBeVisible()

		const apres = await etat()
		const compte = apres.comptes.find(c => c.email === 'nouvelle@test.local')
		expect(apres.profils[compte.id].first_name).toBe('Al')
		expect(apres.profils[compte.id].last_name).toBe('Bo')
		expect(appels(apres.journal, 'POST', '/api/me-makeup')).toHaveLength(1)
		const patchs = appels(apres.journal, 'PATCH', '/api/me-makeup')
		expect(patchs).toHaveLength(2)
		for (const patch of patchs) {
			expect(patch.t).toBeGreaterThanOrEqual(creation.fin)
			// the answer is never stored (UI-05)
			expect(patch.cles).not.toContain('source')
			expect(patch.cles).not.toContain('onboarding_source')
		}
		expect(corps.map(([methode]) => methode)).toEqual(['POST', 'PATCH', 'PATCH'])
		for (const [methode, envoye] of corps) {
			expect(Object.keys(envoye ?? {}), methode).not.toContain('source')
			expect(JSON.stringify(envoye), methode).not.toContain('instagram')
		}
		expect(JSON.stringify(apres.profils[compte.id])).not.toContain('instagram')
		// nor any other request to an API: no URL, no body holds it
		expect(versLApi.length).toBeGreaterThan(corps.length)
		for (const [url, donnees] of versLApi) {
			expect(url).not.toContain('instagram')
			expect(donnees, url).not.toContain('instagram')
		}

		// « Mon profil »: the private page of the account just created, with
		// the name of the onboarding (1 criterion of 13)
		await appuyer(page.getByTestId('profil'))
		await expect(page).toHaveURL(/\/auth\/profil$/)
		await expect(page.getByTestId('resume-name')).toHaveText('Al Bo')
		await expect(barreDeCompletion(page)).toHaveText('8% de complétion')

		// then deleted from there: back home, the account and its profile gone
		await appuyer(page.getByTestId('button-delete-account'))
		await appuyer(page.getByTestId('delete-account'))
		await expect(page).toHaveURL(/\/$/)
		const fin = await etat()
		expect(fin.comptes.map(c => c.email)).not.toContain('nouvelle@test.local')
		expect(fin.profils[compte.id]).toBeUndefined()
		expect(appels(fin.journal, 'DELETE', '/api/me-makeup')).toHaveLength(1)
		expect(erreurs).toEqual([])
	}

	test('RG-07 API lente (2,5 s) : un seul profil créé, le nom attend sa création, « Bienvenue » après l’enregistrement, l’origine jamais enregistrée', async ({
		page,
	}) => {
		await rg07(page)
	})

	test.describe('sur un téléphone', () => {
		const { defaultBrowserType, ...iphone } = devices['iPhone 13']
		test.use(iphone)

		test('RG-07 à la taille d’un iPhone 13 : même scénario, au doigt, sans débordement', async ({ page }) => {
			await rg07(page, { appuyer: cible => cible.tap() })
		})
	})

	test('création du profil en échec : message et « Réessayer », jamais l’étape du nom', async ({ page }) => {
		await panne({ post: 500 })
		await inscrire(page, 'autre@test.local')
		await expect(page.getByTestId('init-account-error')).toBeVisible()
		await expect(page.getByTestId('first_name')).toHaveCount(0)
		await panne({ post: null })
		await page.getByTestId('init-account-retry').click()
		await expect(page.getByTestId('first_name')).toBeVisible()
	})

	test('suppression du compte : refusée → message, toujours connectée, photos gardées ; acceptée → déconnectée, ses photos et ses envois supprimés', async ({
		page,
	}) => {
		// her main picture and 2 gallery pictures, one of her uploads on no
		// profile yet, and a file of another account
		const [principale, galerie1, galerie2] = await fichiersStockes(3)
		await profilDeDepart({
			main_picture: principale.id,
			image_gallery: [galerie1.id, galerie2.id],
		})
		const [envoi] = await fichiersStockes(1, COMPTE_TEST.id)
		const [autre] = await fichiersStockes(1, COMPTE_TEST.id + 1)
		const tous = [principale, galerie1, galerie2, envoi, autre].map(f => f.id)

		const erreurs = erreursDeLaPage(page)
		await ouvrirProfil(page)
		await panne({ suppression: 500 })
		await page.getByTestId('button-delete-account').click()
		await page.getByTestId('delete-account').click()
		await expect(page.getByTestId('delete-account-error')).toBeVisible()
		await expect(page).toHaveURL(/\/auth\/profil/)
		expect((await etat()).comptes).toHaveLength(1)
		expect(await idsFichiers()).toEqual(tous)

		await panne({ suppression: null })
		await page.getByTestId('delete-account').click()
		await expect(page).toHaveURL(/\/$/)
		const { comptes, profils, journal, fichiers } = await etat()
		expect(comptes).toHaveLength(0)
		expect(profils[COMPTE_TEST.id]).toBeUndefined()
		expect(appels(journal, 'DELETE', '/api/me-makeup')).toHaveLength(2)
		expect(fichiers.map(f => f.id)).toEqual([autre.id])
		const cookies = await page.context().cookies()
		expect(cookies.some(c => c.name.startsWith('next-auth.session-token'))).toBe(false)
		expect(erreurs).toEqual([])
	})
})
