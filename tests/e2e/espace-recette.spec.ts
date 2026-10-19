import { expect, type Locator, type Page, test } from '@playwright/test'
import sharp from 'sharp'
import { violationsGraves } from '../outils/axe'
import { type CompteDeTest, creerCompte } from '../outils/fabrique-comptes'
import { profilGenere } from '../outils/fabrique-profils'
import { payloadDeTest } from '../outils/payload-test'

/**
 * The final check of her space (ticket 142; plan 02 §9 P7, E37, E67, E68): played once, at 390 and
 * 1440 px, when every section is delivered. The sections each have their own spec; this one is what
 * they cannot say alone:
 *
 * - E67: axe finds no « serious » or « critical » violation on the page of the space, on the onboarding
 *   and on every panel, opened one after the other on the same full profile;
 * - E68 on every panel: Escape closes it and gives the focus back to the button that opened it;
 * - E37: a changed main photo reaches the public profile and its `og:image`;
 * - 200 % zoom (half the width in CSS pixels): nothing overflows sideways and no two elements overlap,
 *   on the page and in every panel.
 *
 * The orphans of the storage after the whole suite are not counted here but by the step that follows the
 * end-to-end tests in the CI (`bun run banc:rapprocher --hors-import`, ticket 137).
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

/** The 12 panels of the space: the name of the button that opens each. */
const PANNEAUX = [
	'Modifier mon identité',
	'Modifier ma description',
	'Modifier ma localisation',
	'Modifier mes compétences',
	'Modifier mes formations',
	'Modifier mes expériences',
	'Modifier mes langues',
	'Modifier mes réseaux',
	'Modifier mes coordonnées',
	'Modifier mes prestations',
	'Modifier ma photo principale',
	'Modifier mon portfolio',
] as const

const SUPPRESSION = 'Supprimer mon compte'

let compteur = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${10 + (++compteur % 200)}` })
)

/** The accounts a test made: their profiles would crowd the lists of the search specs. */
const creees: number[] = []
test.afterEach(async () => {
	const payload = await payloadDeTest()
	for (const compte of creees.splice(0)) {
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte } } })
		for (const { id } of docs) await payload.delete({ collection: 'profiles', id }).catch(() => undefined)
		await payload.delete({ collection: 'pros', id: compte }).catch(() => undefined)
	}
})

type Maquilleuse = CompteDeTest<'maquilleuse'>

const estMobile = () => test.info().project.name === 'mobile'
const appuyer = (cible: Locator) => (estMobile() ? cible.tap() : cible.click())

/** A makeup artist whose profile is full (identity, commune, texts, skills, offers), a session in the browser. */
async function maquilleusePleine(context: {
	addCookies: (c: Maquilleuse['session']['cookies']) => Promise<void>
}): Promise<{ compte: Maquilleuse; slug: string }> {
	const compte = await creerCompte('maquilleuse')
	creees.push(Number(compte.id))
	const payload = await payloadDeTest()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })
	const [fiche] = docs
	if (!fiche) throw new Error('pas de profil')
	// A commune far from the cities the search specs look at.
	const { slug: _, ...profil } = profilGenere(5, {
		communes: [{ nom: 'Lille', codeInsee: '59350', latitude: 50.63, longitude: 3.06 }],
	})
	const mis = await payload.update({ collection: 'profiles', id: fiche.id, data: profil })
	await context.addCookies(compte.session.cookies)
	return { compte, slug: mis.slug ?? '' }
}

/** Waits for the page of the space, whose cards are streamed. */
async function ouvrirLEspace(page: Page) {
	await page.goto('/auth/profil')
	await expect(page.getByRole('heading', { level: 1, name: 'Mon espace' })).toBeVisible()
	await expect(page.getByTestId('carte-identite')).toBeVisible()
}

const dialogue = (page: Page) => page.getByRole('dialog')

/**
 * The elements a person reads or touches that cover one another: the pairs of visible headings, links,
 * buttons and fields, neither inside the other, whose boxes share more than a few pixels. A field and its
 * own label never overlap in the markup of the site, so any pair found is a fault.
 */
async function chevauchements(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const SELECTEUR = 'h1, h2, h3, a[href], button, input, select, textarea, label, [role="switch"], [role="status"]'
		const racine = document.querySelector('[role="dialog"]') ?? document.body
		// One box per line of text: a link that wraps is not one wide box covering its neighbours.
		const visibles = [...racine.querySelectorAll<HTMLElement>(SELECTEUR)].flatMap(element => {
			const style = getComputedStyle(element)
			const cache = style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0
			// The « sr-only » helpers and the skip links are not read as boxes.
			const boites = [...element.getClientRects()].filter(boite => boite.width >= 4 && boite.height >= 4)
			return cache || boites.length === 0 ? [] : [{ element, boites }]
		})
		const nom = (element: HTMLElement) =>
			`${element.tagName.toLowerCase()}[${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 40)}]`
		const trouves: string[] = []
		for (let i = 0; i < visibles.length; i++) {
			for (let j = i + 1; j < visibles.length; j++) {
				const a = visibles[i]
				const b = visibles[j]
				if (!a || !b || a.element.contains(b.element) || b.element.contains(a.element)) continue
				const recouvre = a.boites.some(x =>
					b.boites.some(
						y =>
							Math.min(x.right, y.right) - Math.max(x.left, y.left) > 2 &&
							Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 2
					)
				)
				if (recouvre) trouves.push(`${nom(a.element)} / ${nom(b.element)}`)
			}
		}
		return trouves
	})
}

const debordement = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

/** Opens the panel, runs `controle` on it, closes it with Escape and checks that the focus is back on its button. */
async function parcourirLesPanneaux(page: Page, controle: (nom: string) => Promise<void>) {
	for (const nom of [...PANNEAUX, SUPPRESSION]) {
		const bouton = page.getByRole('button', { name: nom, exact: true })
		await bouton.scrollIntoViewIfNeeded()
		await appuyer(bouton)
		await expect(dialogue(page), nom).toBeVisible()
		await controle(nom)
		await page.keyboard.press('Escape')
		// A panel with a change asks before it closes: nothing is typed here, so the first Escape is enough.
		await expect(dialogue(page), nom).toHaveCount(0)
		await expect(bouton, nom).toBeFocused()
	}
}

test.describe('142 : la recette de l’espace', { tag: '@mobile' }, () => {
	test('E67, E68 : la page de l’espace et chacun des 12 panneaux et de la suppression : 0 violation grave, Échap rend le focus', async ({
		context,
		page,
	}) => {
		test.setTimeout(180_000)
		await maquilleusePleine(context)
		await ouvrirLEspace(page)

		// All the buttons the page offers are the ones the walk opens: a panel added later is not left out.
		const boutons = await page
			.locator('main button[aria-label^="Modifier m"]')
			.evaluateAll(noeuds => noeuds.map(noeud => noeud.getAttribute('aria-label')).sort())
		expect(boutons).toEqual([...PANNEAUX].sort())
		expect(await violationsGraves(page)).toEqual([])

		await parcourirLesPanneaux(page, async nom => {
			// Axe reads the dialog once the focus has moved into it.
			await expect(page.locator('[role="dialog"] :focus, [role="dialog"]:focus').first(), nom).toBeAttached()
			expect(await violationsGraves(page), nom).toEqual([])
		})

		const dossier = process.env.CAPTURES_ESPACE
		if (dossier) await page.screenshot({ fullPage: true, path: `${dossier}/recette-${test.info().project.name}.png` })
	})

	test('E67 : l’accueil en trois étapes, à chaque étape : 0 violation grave', async ({ context, page }) => {
		// A confirmed account whose profile is empty lands on the first step.
		const compte = await creerCompte('maquilleuse')
		creees.push(Number(compte.id))
		const payload = await payloadDeTest()
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })
		for (const { id } of docs) await payload.delete({ collection: 'profiles', id })
		await context.addCookies(compte.session.cookies)

		await page.goto('/auth/init-account')
		await expect(page).toHaveTitle(/Prépare ton profil/)
		await expect(page.locator('#accueil-titre-etape')).toBeVisible()
		expect(await violationsGraves(page)).toEqual([])

		await page.getByLabel('Prénom').fill('Léa')
		await page.getByLabel('Nom', { exact: true }).fill('Fictive')
		await page.getByLabel(/Spécialité/).fill('Maquillage mariée')
		await appuyer(page.getByRole('button', { name: /Continuer|Suivant|Enregistrer/ }).first())
		await expect(page.getByRole('combobox', { name: 'Ta commune' })).toBeVisible()
		expect(await violationsGraves(page)).toEqual([])
	})

	test('E37 : la photo principale changée : le profil public et son og:image suivent', async ({ context, page }) => {
		test.setTimeout(120_000)
		const { slug } = await maquilleusePleine(context)
		const photo = (couleur: string) =>
			sharp({ create: { width: 1600, height: 1200, channels: 3, background: couleur } })
				.jpeg()
				.toBuffer()

		const imageDePartage = async () => {
			const reponse = await page.request.get(`/profil/${slug}`)
			expect(reponse.status()).toBe(200)
			const html = await reponse.text()
			const balise = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1]
			return balise?.replaceAll('&amp;', '&') ?? ''
		}
		const changer = async (couleur: string, libelle: 'Choisir une photo' | 'Choisir une autre photo') => {
			await appuyer(page.getByRole('button', { name: 'Modifier ma photo principale', exact: true }))
			await expect(dialogue(page)).toBeVisible()
			await page.getByLabel(libelle).setInputFiles({
				name: `${couleur.slice(1)}.jpg`,
				mimeType: 'image/jpeg',
				buffer: await photo(couleur),
			})
			await expect(page.getByRole('img', { name: 'Aperçu de la photo choisie' })).toBeVisible({ timeout: 60_000 })
			await page.getByRole('button', { name: 'Enregistrer' }).click()
			await expect(dialogue(page)).toHaveCount(0, { timeout: 60_000 })
		}

		await ouvrirLEspace(page)
		await changer('#aa3355', 'Choisir une photo')
		const premiere = await imageDePartage()
		expect(new URL(premiere).pathname).toBe('/_next/image')

		await changer('#3355aa', 'Choisir une autre photo')
		const seconde = await imageDePartage()

		expect(new URL(seconde).pathname).toBe('/_next/image')
		expect(seconde).not.toBe(premiere)
		// The new picture is served, from the application, as an image.
		const lue = new URL(seconde)
		const reponse = await page.request.get(`${lue.pathname}${lue.search}`)
		expect(reponse.status()).toBe(200)
		expect(reponse.headers()['content-type']).toMatch(/^image\//)
		const { dominant } = await sharp(await reponse.body()).stats()
		// Blue now, red before: the picture a visitor shares is the new one.
		expect(dominant.b).toBeGreaterThan(dominant.r)
	})

	test('zoom à 200 % : ni défilement de côté ni chevauchement, sur la page et dans chaque panneau', async ({
		context,
		page,
	}) => {
		test.setTimeout(180_000)
		await maquilleusePleine(context)
		// 200 % of zoom halves the width in CSS pixels; the phone width is floored at 320, the width of WCAG 1.4.10.
		const taille = page.viewportSize()
		if (!taille) throw new Error('pas de taille')
		await page.setViewportSize({
			width: Math.max(320, Math.round(taille.width / 2)),
			height: Math.round(taille.height / 2),
		})
		await ouvrirLEspace(page)

		expect(await debordement(page), 'page').toBeLessThanOrEqual(0)
		expect(await chevauchements(page), 'page').toEqual([])

		await parcourirLesPanneaux(page, async nom => {
			expect(await debordement(page), nom).toBeLessThanOrEqual(0)
			expect(await chevauchements(page), nom).toEqual([])
		})
	})

	// The proof that the check can fail: without it, an empty list would prove nothing.
	test('le contrôle voit deux éléments qui se recouvrent, et pas un lien qui passe à la ligne', async ({ page }) => {
		await page.setContent(`<!doctype html><html lang="fr"><body style="width: 200px">
			<p>Un texte <a href="/a">avec un lien assez long pour passer à la ligne</a> <a href="/b">et un autre lien</a></p>
		</body></html>`)
		expect(await chevauchements(page)).toEqual([])

		await page.setContent(`<!doctype html><html lang="fr"><body>
			<button style="position: absolute; top: 10px; left: 10px; width: 100px; height: 40px">Un</button>
			<button style="position: absolute; top: 20px; left: 60px; width: 100px; height: 40px">Deux</button>
		</body></html>`)
		expect(await chevauchements(page)).toEqual(['button[Un] / button[Deux]'])
	})
})
