import { expect, type Page, test } from '@playwright/test'
import { type PageProfile, setPageProfiles } from '../fixtures/page-profiles'
import { SCREENS } from '../support/e2e'
import { users } from '../support/lock'
import { testPayload } from '../support/payload-test'

/**
 * The public page of a profile, end to end (tickets 101 to 103; plan 02 E43 and E44), on profiles of
 * the bench that have their own names (tests/fixtures/page-profiles.ts). The page is read twice: as
 * the server sends it, with no JavaScript (what a search engine reads), and in the browser at both
 * screen sizes.
 */

/** The keys a page must never carry in what it sends: what is private or reserved. */
const PRIVATE_KEYS =
	/"(?:pro|strapiId|legacyUsername|statut|status|motif|reason|verifie|verified|verifieLe|verifiedAt|siret|noteInterne|internalNote|score|superMaquilleuse|superArtist|coordonnees|contactDetails|telephone|phone|contactPublic|publicContact|consentiLe|consentedAt|sourceConsentement|consentSource|codeInsee|inseeCode|latitude|longitude)"\s*:/

const FORBIDDEN_WORDS = /\b(?:undefined|null|NaN|Invalid Date)\b|&\s*km|\bnullkm\b/

let profiles: ReadonlyMap<string, PageProfile>

// One worker for the whole file, so that one set-up and one clean-up serve all its tests.
test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
	test.setTimeout(180_000)
	await users('profils-de-page', 1)
	profiles = await setPageProfiles()
})

// The profiles of the page are taken away at the end by the last process: left in the bench, they would crowd the
// lists of the search specs (pages of 20) and the slugs of the import spec.
test.afterAll(async () => {
	test.setTimeout(180_000)
	// The two projects (1440 and 390 px) share these profiles: the last one to end takes them away, or the
	// first one to end would delete what the other is still reading.
	if ((await users('profils-de-page', -1)) > 0 || !profiles) return
	const payload = await testPayload()
	for (const { id } of profiles.values()) {
		const profile = await payload
			.findByID({ collection: 'profiles', id, depth: 0, select: { pro: true } })
			.catch(() => null)
		if (!profile) continue
		await payload.delete({ collection: 'profiles', id })
		const pro = typeof profile.pro === 'object' ? profile.pro.id : profile.pro
		if (pro !== undefined && pro !== null) await payload.delete({ collection: 'pros', id: pro }).catch(() => undefined)
	}
})

const profile = (cle: string): PageProfile => {
	const found = profiles.get(cle)
	if (!found) throw new Error(`pas de profil d’essai « ${cle} »`)
	return found
}

/** The text of the page as the server sends it, tags and scripts out: the words a visitor would read. */
function visibleText(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/g, ' ')
		.replace(/<style[\s\S]*?<\/style>/g, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
}

async function withoutOverflow(page: Page): Promise<boolean> {
	return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
}

test.describe('E43 : le profil public, rendu par le serveur', { tag: '@mobile' }, () => {
	test('@smoke le HTML du serveur donne le nom en h1, la spécialité, la zone et la description', async ({
		request,
	}) => {
		const { slug } = profile('reference')
		const response = await request.get(`/profil/${slug}`)
		expect(response.status()).toBe(200)
		const html = await response.text()

		expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
		expect(html).toMatch(/<h1[^>]*>Page Alpha<\/h1>/)
		expect(html).toContain('Maquillage mariage')
		expect(html).toContain('Annecy et 30 km autour')
		expect(html).toContain('Prend de nouvelles dates')
		expect(html).toContain('À propos')
		expect(html).toContain('Maquilleuse professionnelle installée à Annecy')
		// One Nav, one h1: the template and the page.
		expect(html.match(/<nav[\s>]/g)?.length).toBeGreaterThanOrEqual(1)
		expect(visibleText(html)).not.toMatch(FORBIDDEN_WORDS)
		expect(html).not.toMatch(PRIVATE_KEYS)
	})

	// Ticket 223, constat 7: Next's router would answer its own error page; the proxy sends the site's 404.
	test('une adresse au pourcentage mal formé répond la page 404 du site, sous /profil, /talent et /blog', async ({
		request,
	}) => {
		for (const root of ['profil', 'talent', 'blog']) {
			const response = await request.get(`/${root}/%E0%A4%A`)
			expect(response.status(), root).toBe(404)
			expect(await response.text(), root).toContain('404 - Page non trouvée')
			expect(response.headers()['x-robots-tag'], root).toContain('noindex')
		}
	})

	test('un profil indisponible le dit', async ({ request }) => {
		const html = await (await request.get(`/profil/${profile('indisponible').slug}`)).text()

		expect(html).toContain('Indisponible')
	})

	test('aucune coordonnée non publiée dans la page', async ({ request }) => {
		const html = await (await request.get(`/profil/${profile('sans-contact-public').slug}`)).text()

		expect(html).not.toContain('06 39 98 10 08')
		expect(html).not.toContain('louise-girard.example.test')
		expect(html).not.toMatch(PRIVATE_KEYS)
	})

	test('les textes les plus longs : pas de débordement à 390 px, ni à 1440 px', async ({ page }, testInfo) => {
		await page.goto(`/profil/${profile('textes-maximaux').slug}`)
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

		for (const screen of [SCREENS.mobile, SCREENS.chromium]) {
			await page.setViewportSize(screen)
			expect(await withoutOverflow(page), `à ${screen.width} px`).toBe(true)
		}
		await page.setViewportSize(SCREENS.mobile)
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
		const source = await (await request.get(`/profil/${profile('reference').slug}`)).text()
		// The page, not its structured data (ticket 105), which names the offers too.
		const html = source.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')

		expect(html).toContain('Prestations et tarifs')
		expect(html).toContain('À partir de 180\u00a0€')
		expect(html).toContain('À partir de 45\u00a0€')
		expect(html.indexOf('Maquillage de la mariée')).toBeLessThan(html.indexOf('Retouches jusqu’au dîner'))
		expect(html.indexOf('Retouches jusqu’au dîner')).toBeLessThan(html.indexOf('Essai maquillage'))
		expect(visibleText(html)).not.toMatch(FORBIDDEN_WORDS)
	})

	test('un profil qui publie ses coordonnées les montre, un profil qui ne les publie pas n’en laisse rien', async ({
		request,
	}) => {
		const published = await (await request.get(`/profil/${profile('reference').slug}`)).text()
		expect(published).toContain('href="tel:0639981001"')
		expect(published).toContain('href="mailto:contact@ines-morel.example.test"')
		expect(published).not.toMatch(PRIVATE_KEYS)

		const closed = await (await request.get(`/profil/${profile('sans-contact-public').slug}`)).text()
		// The footer of the site has its own mail link: the profile is the <main> of the page.
		const singleProfile = closed.slice(closed.indexOf('<main'), closed.indexOf('</main>'))
		expect(singleProfile).toContain('<h1')
		expect(singleProfile).not.toContain('tel:')
		expect(singleProfile).not.toContain('mailto:')
		expect(closed).not.toContain('06 39 98 10 08')
		expect(closed).not.toContain('louise-girard.example.test')
	})

	test('le profil aux textes maximaux : toutes les sections, pas de débordement à 390 px', async ({
		page,
	}, testInfo) => {
		await page.goto(`/profil/${profile('textes-maximaux').slug}`)
		for (const title of ['Compétences', 'Langues', 'Prestations et tarifs', 'Expériences professionnelles'])
			await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible()
		await page.setViewportSize(SCREENS.mobile)
		expect(await withoutOverflow(page)).toBe(true)
		await testInfo.attach('profil-sections-390px', {
			body: await page.screenshot({ fullPage: true }),
			contentType: 'image/png',
		})
	})
})

test.describe('Les douze profils types du banc', () => {
	test('aucun « undefined » ni « null », un seul h1 ; le profil masqué répond 404, un brouillon 200 en noindex', async ({
		request,
	}) => {
		test.setTimeout(120_000)
		expect(profiles.size).toBe(12)
		for (const [key, { slug, type }] of profiles) {
			const response = await request.get(`/profil/${slug}`, { headers: { 'User-Agent': ROBOT } })
			if (type.attendu.status === 'hidden') {
				expect(response.status(), key).toBe(404)
				continue
			}
			expect(response.status(), key).toBe(200)
			const html = await response.text()
			expect(html.match(/<h1[\s>]/g), key).toHaveLength(1)
			expect(visibleText(html), key).not.toMatch(FORBIDDEN_WORDS)
			expect(html, key).not.toMatch(PRIVATE_KEYS)
			// Indexed only when the profile is publishable (E66).
			expect(/<meta name="robots" content="noindex/.test(html), key).toBe(type.attendu.publishable !== true)
		}
	})
})

/** A robot: it is sent the metadata in the head, as a search engine reads it. */
const ROBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

const OLD_NAME = 'Page Ancien Nom E46'

test.describe('E46 : l’ancienne adresse par nom d’utilisateur', () => {
	test.beforeAll(async () => {
		// The old username is written by the import only: the test writes it as the import does, without the access rules.
		const payload = await testPayload()
		await payload.update({
			collection: 'profiles',
			id: profile('indisponible').id,
			data: { legacyUsername: OLD_NAME },
			context: { import: true },
		})
		await payload.update({
			collection: 'profiles',
			id: profile('masquee').id,
			data: { legacyUsername: `${OLD_NAME} masquée` },
			context: { import: true },
		})
	})

	test('@smoke l’ancien nom, encodé dans l’adresse, redirige en un saut (308) vers le slug, qui répond 200', async ({
		request,
	}) => {
		const { slug } = profile('indisponible')
		const response = await request.get(`/profil/${encodeURIComponent(OLD_NAME)}`, { maxRedirects: 0 })

		expect(response.status()).toBe(308)
		expect(new URL(response.headers().location ?? '', 'http://x').pathname).toBe(`/profil/${slug}`)
		expect((await request.get(`/profil/${slug}`, { maxRedirects: 0 })).status()).toBe(200)
	})

	test('une variante du slug (majuscules) redirige elle aussi vers le slug', async ({ request }) => {
		const { slug } = profile('reference')
		const response = await request.get(`/profil/${slug.toUpperCase()}`, { maxRedirects: 0 })

		expect(response.status()).toBe(308)
		expect(new URL(response.headers().location ?? '', 'http://x').pathname).toBe(`/profil/${slug}`)
	})
})

test.describe('E47 : le profil masqué, l’inconnu et l’adresse impossible', () => {
	test('un profil masqué répond 404 en français, par son slug comme par son ancien nom, sans redirection', async ({
		request,
	}) => {
		const { slug } = profile('masquee')
		for (const url of [slug, slug.toUpperCase(), encodeURIComponent(`${OLD_NAME} masquée`)]) {
			const response = await request.get(`/profil/${url}`, { maxRedirects: 0 })
			expect(response.status(), url).toBe(404)
			expect(await response.text(), url).toContain('404 - Page non trouvée')
		}
	})

	test('une adresse qui ne peut mener nulle part répond 404, jamais 500', async ({ request }) => {
		for (const url of ['%00', 'a%00b', '%F0%9F%99%82', 'a'.repeat(300), '-']) {
			const response = await request.get(`/profil/${url}`, { maxRedirects: 0 })
			expect(response.status(), url).toBe(404)
		}
	})
})

test.describe('E66 : un profil non publiable est en noindex, sans adresse canonique', { tag: '@mobile' }, () => {
	for (const key of ['vide', 'actif-non-publiable']) {
		test(`« ${key} » répond 200, noindex, sans adresse canonique`, async ({ page, request }) => {
			const { slug } = profile(key)
			const html = await (await request.get(`/profil/${slug}`, { headers: { 'User-Agent': ROBOT } })).text()
			expect(html).toMatch(/<meta name="robots" content="noindex/)
			expect(html).not.toContain('rel="canonical"')

			const response = await page.goto(`/profil/${slug}`)
			expect(response?.status()).toBe(200)
			await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/)
			await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
		})
	}

	test('un profil publiable est indexable : adresse canonique, pas de noindex', async ({ page }) => {
		const { slug } = profile('reference')
		await page.goto(`/profil/${slug}`)

		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/profil/${slug}$`))
		await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0)
	})
})

test.describe('E44 : la galerie du portfolio', { tag: '@mobile' }, () => {
	test('six images avec leur texte alternatif, demandées depuis leur adresse d’origine, qui répond', async ({
		page,
		request,
	}) => {
		const { id, slug } = profile('reference')
		await page.goto(`/profil/${slug}`)
		const images = page.locator('[aria-roledescription="photo"] img')
		await expect(images).toHaveCount(6)

		// The addresses the portfolio is made from, as the database holds them, in the order she gave.
		const stored = await (await testPayload()).findByID({
			collection: 'profiles',
			id,
			depth: 1,
			overrideAccess: true,
		})
		const origins = (stored.gallery ?? []).map(photo => (typeof photo === 'object' ? photo.url : null))
		expect(origins).toHaveLength(6)

		for (let rank = 0; rank < 6; rank++) {
			const image = images.nth(rank)
			await expect(image).toHaveAttribute('alt', `Réalisation de Page Alpha (${rank + 1}/6)`)
			// The original address is inside the optimizer's address, unchanged.
			const src = (await image.getAttribute('src')) ?? ''
			expect(new URL(src, page.url()).searchParams.get('url')).toBe(origins[rank] ?? 'sans adresse')
			// The file itself answers with an image...
			const response = await request.get(origins[rank] ?? '')
			expect(response.ok(), origins[rank] ?? 'sans adresse').toBe(true)
			expect(response.headers()['content-type']).toMatch(/^image\//)
			// ...and so does the optimizer.
			const optimized = await request.get(new URL(src, page.url()).href)
			expect(optimized.status(), `optimiseur, photo ${rank + 1}`).toBe(200)
			expect(optimized.headers()['content-type']).toMatch(/^image\//)
		}

		// None is broken in the page: each one is drawn, once the browser has loaded it.
		for (let rank = 0; rank < 6; rank++) {
			const image = images.nth(rank)
			await image.scrollIntoViewIfNeeded()
			await expect
				.poll(
					() =>
						image.evaluate(
							element => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0
						),
					{
						message: `photo ${rank + 1} chargée`,
					}
				)
				.toBe(true)
		}
	})

	test('au clavier : la rangée prend le focus, les flèches changent de photo et la position est annoncée', async ({
		page,
	}) => {
		await page.goto(`/profil/${profile('reference').slug}`)
		const ranked = page.getByRole('group', { name: /^Photos de / })
		const position = page.locator('section[aria-roledescription="carrousel"] [aria-live="polite"]')
		await ranked.scrollIntoViewIfNeeded()
		await expect(position).toHaveText('Photo 1 sur 6')

		await ranked.focus()
		await expect(ranked).toBeFocused()
		await page.keyboard.press('ArrowRight')
		await expect(position).toHaveText('Photo 2 sur 6')
		await page.keyboard.press('ArrowRight')
		await expect(position).toHaveText('Photo 3 sur 6')
		// The row really moved: the third photo is at the left edge of the row.
		await expect
			.poll(async () =>
				ranked.evaluate(piste => {
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
		await page.goto(`/profil/${profile('reference').slug}`)
		const position = page.locator('section[aria-roledescription="carrousel"] [aria-live="polite"]')

		await page.getByRole('button', { name: 'Photo suivante' }).click()
		await expect(position).toHaveText('Photo 2 sur 6')
		await page.getByRole('button', { name: 'Photo précédente' }).click()
		await expect(position).toHaveText('Photo 1 sur 6')
	})

	test('un balayage du doigt change de photo : la position suit la rangée', async ({ page }) => {
		await page.goto(`/profil/${profile('reference').slug}`)
		const ranked = page.getByRole('group', { name: /^Photos de / })
		const position = page.locator('section[aria-roledescription="carrousel"] [aria-live="polite"]')
		await ranked.scrollIntoViewIfNeeded()

		// A swipe is a scroll of the row that ends on a photo (the snapping): the position is read at its end.
		await ranked.evaluate(piste => {
			const photo = piste.children.item(3)
			if (photo instanceof HTMLElement) piste.scrollTo({ left: photo.offsetLeft, behavior: 'instant' })
		})
		await expect(position).toHaveText('Photo 4 sur 6')
	})

	test('un profil sans galerie n’a pas de section portfolio', async ({ page, request }) => {
		const html = await (await request.get(`/profil/${profile('disponibilite-inconnue').slug}`)).text()
		expect(html).not.toContain('Portfolio')
		expect(html).toContain('Compétences')

		await page.goto(`/profil/${profile('disponibilite-inconnue').slug}`)
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
		await expect(page.getByRole('heading', { name: 'Portfolio' })).toHaveCount(0)
		await expect(page.locator('[aria-roledescription="photo"]')).toHaveCount(0)
	})

	test('le profil aux dix photos tient à 390 px sans déborder', async ({ page }, testInfo) => {
		await page.goto(`/profil/${profile('textes-maximaux').slug}`)
		await expect(page.locator('[aria-roledescription="photo"]')).toHaveCount(10)
		await page.setViewportSize(SCREENS.mobile)
		expect(await withoutOverflow(page)).toBe(true)
		await page.getByRole('heading', { name: 'Portfolio' }).scrollIntoViewIfNeeded()
		await testInfo.attach('portfolio-390px', { body: await page.screenshot(), contentType: 'image/png' })
	})
})
