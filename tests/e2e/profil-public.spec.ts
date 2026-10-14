import { expect, type Page, test } from '@playwright/test'
import { type ProfilDePage, poserLesProfilsDePage } from '../fixtures/profils-de-page'
import { ECRANS } from '../outils/e2e'
import { payloadDeTest } from '../outils/payload-test'

/**
 * The public page of a profile, end to end (tickets 101 to 103; plan 02 E43 and E44), on profiles of
 * the bench that have their own names (tests/fixtures/profils-de-page.ts). The page is read twice: as
 * the server sends it, with no JavaScript (what a search engine reads), and in the browser at both
 * screen sizes.
 */

/** The keys a page must never carry in what it sends: what is private or reserved. */
const CLES_PRIVEES =
	/"(?:pro|strapiId|legacyUsername|statut|motif|verifie|verifieLe|siret|noteInterne|score|superMaquilleuse|coordonnees|telephone|contactPublic|consentiLe|sourceConsentement|codeInsee|latitude|longitude)"\s*:/

const MOTS_INTERDITS = /\b(?:undefined|null|NaN|Invalid Date)\b|&\s*km|\bnullkm\b/

let profils: ReadonlyMap<string, ProfilDePage>

test.beforeAll(async () => {
	test.setTimeout(180_000)
	profils = await poserLesProfilsDePage()
})

const profil = (cle: string): ProfilDePage => {
	const trouve = profils.get(cle)
	if (!trouve) throw new Error(`pas de profil d’essai « ${cle} »`)
	return trouve
}

/** The text of the page as the server sends it, tags and scripts out: the words a visitor would read. */
function texteVisible(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/g, ' ')
		.replace(/<style[\s\S]*?<\/style>/g, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
}

async function sansDebordement(page: Page): Promise<boolean> {
	return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
}

test.describe('E43 : le profil public, rendu par le serveur', { tag: '@mobile' }, () => {
	test('@smoke le HTML du serveur donne le nom en h1, la spécialité, la zone et la description', async ({
		request,
	}) => {
		const { slug } = profil('reference')
		const reponse = await request.get(`/profil/${slug}`)
		expect(reponse.status()).toBe(200)
		const html = await reponse.text()

		expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
		expect(html).toMatch(/<h1[^>]*>Page Alpha<\/h1>/)
		expect(html).toContain('Maquillage mariage')
		expect(html).toContain('Annecy et 30 km autour')
		expect(html).toContain('Disponible')
		expect(html).toContain('Vous en quelques mots')
		expect(html).toContain('Maquilleuse professionnelle installée à Annecy')
		// One Nav, one h1: the template and the page.
		expect(html.match(/<nav[\s>]/g)?.length).toBeGreaterThanOrEqual(1)
		expect(texteVisible(html)).not.toMatch(MOTS_INTERDITS)
		expect(html).not.toMatch(CLES_PRIVEES)
	})

	test('un profil indisponible le dit', async ({ request }) => {
		const html = await (await request.get(`/profil/${profil('indisponible').slug}`)).text()

		expect(html).toContain('Indisponible')
	})

	test('aucune coordonnée non publiée dans la page', async ({ request }) => {
		const html = await (await request.get(`/profil/${profil('sans-contact-public').slug}`)).text()

		expect(html).not.toContain('06 39 98 10 08')
		expect(html).not.toContain('louise-girard.example.test')
		expect(html).not.toMatch(CLES_PRIVEES)
	})

	test('les textes les plus longs : pas de débordement à 390 px, ni à 1440 px', async ({ page }, testInfo) => {
		await page.goto(`/profil/${profil('textes-maximaux').slug}`)
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

		for (const ecran of [ECRANS.mobile, ECRANS.chromium]) {
			await page.setViewportSize(ecran)
			expect(await sansDebordement(page), `à ${ecran.width} px`).toBe(true)
		}
		await page.setViewportSize(ECRANS.mobile)
		await testInfo.attach('profil-textes-maximaux-390px', {
			body: await page.screenshot({ fullPage: true }),
			contentType: 'image/png',
		})
	})
})

test.describe('E44 : les offres, les prix et les coordonnées publiées', { tag: '@mobile' }, () => {
	test('les offres et leurs prix formatés, les options dans l’ordre, sont dans le HTML du serveur', async ({
		request,
	}) => {
		const html = await (await request.get(`/profil/${profil('reference').slug}`)).text()

		expect(html).toContain('Service(s) proposé(s)')
		expect(html).toContain('À partir de 180\u00a0€')
		expect(html).toContain('À partir de 45\u00a0€')
		expect(html.indexOf('Maquillage de la mariée')).toBeLessThan(html.indexOf('Retouches jusqu’au dîner'))
		expect(html.indexOf('Retouches jusqu’au dîner')).toBeLessThan(html.indexOf('Essai maquillage'))
		expect(texteVisible(html)).not.toMatch(MOTS_INTERDITS)
	})

	test('un profil qui publie ses coordonnées les montre, un profil qui ne les publie pas n’en laisse rien', async ({
		request,
	}) => {
		const publie = await (await request.get(`/profil/${profil('reference').slug}`)).text()
		expect(publie).toContain('href="tel:0639981001"')
		expect(publie).toContain('href="mailto:contact@ines-morel.example.test"')
		expect(publie).not.toMatch(CLES_PRIVEES)

		const ferme = await (await request.get(`/profil/${profil('sans-contact-public').slug}`)).text()
		// The footer of the site has its own mail link: the profile is the <main> of the page.
		const profilSeul = ferme.slice(ferme.indexOf('<main'), ferme.indexOf('</main>'))
		expect(profilSeul).toContain('<h1')
		expect(profilSeul).not.toContain('tel:')
		expect(profilSeul).not.toContain('mailto:')
		expect(ferme).not.toContain('06 39 98 10 08')
		expect(ferme).not.toContain('louise-girard.example.test')
	})

	test('le profil aux textes maximaux : toutes les sections, pas de débordement à 390 px', async ({
		page,
	}, testInfo) => {
		await page.goto(`/profil/${profil('textes-maximaux').slug}`)
		for (const titre of ['Compétences', 'Langues', 'Service(s) proposé(s)', 'Expériences professionnelles'])
			await expect(page.getByRole('heading', { level: 2, name: titre })).toBeVisible()
		await page.setViewportSize(ECRANS.mobile)
		expect(await sansDebordement(page)).toBe(true)
		await testInfo.attach('profil-sections-390px', {
			body: await page.screenshot({ fullPage: true }),
			contentType: 'image/png',
		})
	})
})

test.describe('Les douze profils types du banc', () => {
	test('aucun « undefined » ni « null », un seul h1 ; le profil masqué et le brouillon répondent 404', async ({
		request,
	}) => {
		test.setTimeout(120_000)
		expect(profils.size).toBe(12)
		for (const [cle, { slug, type }] of profils) {
			const reponse = await request.get(`/profil/${slug}`)
			// A page answers for a published profile only, for now: ticket 104 gives the page of a draft a 200 in
			// noindex, as on the site today, and updates this line.
			if (type.attendu.statut !== 'publie') {
				expect(reponse.status(), cle).toBe(404)
				continue
			}
			expect(reponse.status(), cle).toBe(200)
			const html = await reponse.text()
			expect(html.match(/<h1[\s>]/g), cle).toHaveLength(1)
			expect(texteVisible(html), cle).not.toMatch(MOTS_INTERDITS)
			expect(html, cle).not.toMatch(CLES_PRIVEES)
		}
	})
})

test.describe('E44 : la galerie du portfolio', { tag: '@mobile' }, () => {
	test('six images avec leur texte alternatif, demandées depuis leur adresse d’origine, qui répond', async ({
		page,
		request,
	}) => {
		const { id, slug } = profil('reference')
		await page.goto(`/profil/${slug}`)
		const images = page.locator('[aria-roledescription="photo"] img')
		await expect(images).toHaveCount(6)

		// The addresses the portfolio is made from, as the database holds them, in the order she gave.
		const stocke = await (await payloadDeTest()).findByID({ collection: 'profils', id, depth: 1, overrideAccess: true })
		const origines = (stocke.galerie ?? []).map(photo => (typeof photo === 'object' ? photo.url : null))
		expect(origines).toHaveLength(6)

		for (let rang = 0; rang < 6; rang++) {
			const image = images.nth(rang)
			await expect(image).toHaveAttribute('alt', `Réalisation de Page Alpha (${rang + 1}/6)`)
			// The original address is inside the optimizer's address, unchanged.
			const src = (await image.getAttribute('src')) ?? ''
			expect(new URL(src, page.url()).searchParams.get('url')).toBe(origines[rang] ?? 'sans adresse')
			// The file itself answers with an image. (The optimizer of the bench refuses the loopback host of its
			// storage, so the picture it makes is not checked here: the address it is given is.)
			const reponse = await request.get(origines[rang] ?? '')
			expect(reponse.ok(), origines[rang] ?? 'sans adresse').toBe(true)
			expect(reponse.headers()['content-type']).toMatch(/^image\//)
		}
	})

	test('au clavier : la rangée prend le focus, les flèches changent de photo et la position est annoncée', async ({
		page,
	}) => {
		await page.goto(`/profil/${profil('reference').slug}`)
		const rangee = page.getByRole('group', { name: /^Photos de / })
		const position = page.locator('section[aria-roledescription="carrousel"] [aria-live="polite"]')
		await rangee.scrollIntoViewIfNeeded()
		await expect(position).toHaveText('Photo 1 sur 6')

		await rangee.focus()
		await expect(rangee).toBeFocused()
		await page.keyboard.press('ArrowRight')
		await expect(position).toHaveText('Photo 2 sur 6')
		await page.keyboard.press('ArrowRight')
		await expect(position).toHaveText('Photo 3 sur 6')
		// The row really moved: the third photo is at the left edge of the row.
		await expect
			.poll(async () =>
				rangee.evaluate(piste => {
					const photo = piste.children.item(2)
					return photo instanceof HTMLElement ? Math.abs(photo.offsetLeft - piste.scrollLeft) : Number.NaN
				})
			)
			.toBeLessThan(2)
		await page.keyboard.press('ArrowLeft')
		await expect(position).toHaveText('Photo 2 sur 6')
		await page.keyboard.press('End')
		await expect(position).toHaveText('Photo 6 sur 6')
		await page.keyboard.press('Home')
		await expect(position).toHaveText('Photo 1 sur 6')
	})

	test('les boutons « Photo suivante » et « Photo précédente »', async ({ page }) => {
		await page.goto(`/profil/${profil('reference').slug}`)
		const position = page.locator('section[aria-roledescription="carrousel"] [aria-live="polite"]')

		await page.getByRole('button', { name: 'Photo suivante' }).click()
		await expect(position).toHaveText('Photo 2 sur 6')
		await page.getByRole('button', { name: 'Photo précédente' }).click()
		await expect(position).toHaveText('Photo 1 sur 6')
	})

	test('un balayage du doigt change de photo : la position suit la rangée', async ({ page }) => {
		await page.goto(`/profil/${profil('reference').slug}`)
		const rangee = page.getByRole('group', { name: /^Photos de / })
		const position = page.locator('section[aria-roledescription="carrousel"] [aria-live="polite"]')
		await rangee.scrollIntoViewIfNeeded()

		// A swipe is a scroll of the row that ends on a photo (the snapping): the position is read at its end.
		await rangee.evaluate(piste => {
			const photo = piste.children.item(3)
			if (photo instanceof HTMLElement) piste.scrollTo({ left: photo.offsetLeft, behavior: 'instant' })
		})
		await expect(position).toHaveText('Photo 4 sur 6')
	})

	test('un profil sans galerie n’a pas de section portfolio', async ({ page, request }) => {
		const html = await (await request.get(`/profil/${profil('disponibilite-inconnue').slug}`)).text()
		expect(html).not.toContain('Portfolio')
		expect(html).toContain('Compétences')

		await page.goto(`/profil/${profil('disponibilite-inconnue').slug}`)
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
		await expect(page.getByRole('heading', { name: 'Portfolio' })).toHaveCount(0)
		await expect(page.locator('[aria-roledescription="photo"]')).toHaveCount(0)
	})

	test('le profil aux dix photos tient à 390 px sans déborder', async ({ page }, testInfo) => {
		await page.goto(`/profil/${profil('textes-maximaux').slug}`)
		await expect(page.locator('[aria-roledescription="photo"]')).toHaveCount(10)
		await page.setViewportSize(ECRANS.mobile)
		expect(await sansDebordement(page)).toBe(true)
		await page.getByRole('heading', { name: 'Portfolio' }).scrollIntoViewIfNeeded()
		await testInfo.attach('portfolio-390px', { body: await page.screenshot(), contentType: 'image/png' })
	})
})
