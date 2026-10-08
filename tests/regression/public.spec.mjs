// Public pages against the fake Strapi (tests/regression/mock-api.mjs and
// its data, donnees-publiques.mjs), launched by tests/regression/run.mjs:
// profiles rendered on the server (UI-06), slugs, sitemap, robots, noindex
// and canonical (SEO-10), Open Graph and JSON-LD (SEO-12), the search by
// city (UI-07). The raw HTML is read without JavaScript, as a crawler does.
// Web-first waits only, no fixed timeout.
import { expect, test } from '@playwright/test'
import { ARTICLES, PROFILS_PUBLICS, TALENTS } from './donnees-publiques.mjs'

const API = process.env.RG_API ?? 'http://127.0.0.1:4112'
const APP = process.env.RG_APP ?? 'http://localhost:3996'

// Never against the production: local hosts only
for (const cible of [API, APP])
	if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(cible).hostname))
		throw new Error(`cible non locale refusée : ${cible}`)

test.use({ testIdAttribute: 'data-cy' })

async function piloter(chemin, corps) {
	const reponse = await fetch(
		API + chemin,
		corps === undefined ? {} : { method: 'POST', body: JSON.stringify(corps) }
	)
	return reponse.json()
}
const panne = corps => piloter('/__panne', corps)
const journal = async () => (await piloter('/__etat')).journal

test.beforeEach(async () => {
	await piloter('/__reset', {})
})

// --- raw HTML ---
const ENTITES = {
	amp: '&',
	quot: '"',
	'#x27': "'",
	'#39': "'",
	lt: '<',
	gt: '>',
}
const decoder = texte =>
	texte.replace(/&(amp|quot|#x27|#39|lt|gt);/g, (_, e) => ENTITES[e])
const sansScripts = html =>
	html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
const textesDes = (html, balise) =>
	[
		...sansScripts(html).matchAll(
			new RegExp(`<${balise}[\\s>][\\s\\S]*?</${balise}>`, 'g')
		),
	].map(m => decoder(m[0].replace(/<[^>]*>/g, '').trim()))
const metas = html =>
	[...html.matchAll(/<meta\s([^>]*?)\/?>/g)].map(m =>
		Object.fromEntries(
			[...m[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map(a => [a[1], decoder(a[2])])
		)
	)
const meta = (html, cle) =>
	metas(html).find(m => m.name === cle || m.property === cle)?.content
const canonical = html =>
	/<link[^>]*rel="canonical"[^>]*href="([^"]*)"/.exec(html)?.[1] ?? null
const jsonLd = html =>
	[
		...html.matchAll(
			/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g
		),
	].map(m => JSON.parse(m[1]))
// words a broken template prints: in the text, the attributes and the JSON-LD
const MOTS_INTERDITS =
	/\b(undefined|null|NaN|Invalid Date)\b|&amp; ?km|\bnullkm\b/i
function motsInterdits(html) {
	const visible = sansScripts(html)
	const ld = jsonLd(html)
		.map(d => JSON.stringify(d))
		.join('\n')
	return [
		...`${visible}\n${ld}`.matchAll(new RegExp(MOTS_INTERDITS, 'gi')),
	].map(m => m[0])
}

async function html(request, chemin) {
	const reponse = await request.get(chemin, { maxRedirects: 0 })
	return { reponse, html: await reponse.text() }
}

const publiables = PROFILS_PUBLICS.filter(p => p.attendu.publiable)

test.describe('UI-06 profils rendus côté serveur', () => {
	test('profil complet, HTML brut sans JavaScript : nom en seul h1, ville, spécialité, description, offres et photos ; 0 « undefined » ou « null » ; OG et JSON-LD', async ({
		request,
	}) => {
		const { reponse, html: page } = await html(request, '/profil/zoe-lefevre')
		expect(reponse.status()).toBe(200)

		expect(textesDes(page, 'h1')).toEqual(['Zoé Lefèvre'])
		const texte = decoder(sansScripts(page).replace(/<[^>]*>/g, ' '))
		for (const attendu of [
			'Maquillage mariée',
			'Annecy et 30 km autour',
			'Maquilleuse professionnelle diplômée',
			'Mariée',
			'à partir de 180 €',
			'Invitée',
			'45 €',
			'Shooting',
			'90 €',
			'Essai supplémentaire',
			'60 €',
			'CAP esthétique',
			'janvier 2016 - aujourd’hui',
			'@studio.fictif',
		])
			expect(texte, attendu).toContain(attendu)
		for (let n = 1; n <= 6; n++)
			expect(page).toContain(`alt="Réalisation de Zoé Lefèvre (${n}/6)"`)
		expect(motsInterdits(page)).toEqual([])

		// indexable, canonical on the slug
		expect(meta(page, 'robots')).toBeUndefined()
		expect(reponse.headers()['x-robots-tag']).toBeUndefined()
		expect(canonical(page)).toBe(`${APP}/profil/zoe-lefevre`)

		// SEO-12: Open Graph and Twitter
		expect(meta(page, 'og:title')).toBe(
			'Zoé Lefèvre – Maquillage mariée à Annecy | My-Makeup'
		)
		expect(meta(page, 'og:description')?.length).toBeGreaterThanOrEqual(70)
		// a copy resized by Strapi, never the original of 1.4 MB
		expect(meta(page, 'og:image')).toBe(`${API}/media/1/large`)
		expect(meta(page, 'twitter:image')).toBe(`${API}/media/1/large`)
		expect(meta(page, 'og:url')).toBe(`${APP}/profil/zoe-lefevre`)
		expect(meta(page, 'og:type')).toBe('profile')
		expect(meta(page, 'twitter:card')).toBe('summary_large_image')

		// JSON-LD: Person offering services, and the breadcrumb
		const [personne, ariane] = jsonLd(page)
		expect(personne['@type']).toBe('Person')
		expect(personne.name).toBe('Zoé Lefèvre')
		expect(personne.url).toBe(`${APP}/profil/zoe-lefevre`)
		expect(personne.image).toBe(`${API}/media/1`)
		expect(personne.makesOffer.map(o => o.itemOffered['@type'])).toEqual([
			'Service',
			'Service',
			'Service',
		])
		expect(personne.makesOffer[0].priceSpecification).toEqual({
			'@type': 'PriceSpecification',
			minPrice: 180,
			priceCurrency: 'EUR',
		})
		expect(ariane['@type']).toBe('BreadcrumbList')
		expect(ariane.itemListElement.map(e => e.item)).toEqual([
			APP,
			`${APP}/profil/zoe-lefevre`,
		])
		// never the email nor the phone in the structured data
		expect(JSON.stringify(jsonLd(page))).not.toMatch(
			/example\.test"|39 98|mailto|tel:/
		)
	})

	test('chaque profil de la fixture : 200, un seul h1, rien de cassé ; noindex et sans canonical exactement quand il n’est pas publiable', async ({
		request,
	}) => {
		for (const profil of PROFILS_PUBLICS) {
			const { slug, publiable } = profil.attendu
			const { reponse, html: page } = await html(request, `/profil/${slug}`)
			expect(reponse.status(), slug).toBe(200)
			expect(textesDes(page, 'h1'), slug).toHaveLength(1)
			expect(motsInterdits(page), slug).toEqual([])
			expect(meta(page, 'robots') ?? null, slug).toBe(
				publiable ? null : 'noindex,follow'
			)
			expect(canonical(page), slug).toBe(
				publiable ? `${APP}/profil/${slug}` : null
			)
			expect(
				jsonLd(page).map(d => d['@type']),
				slug
			).toEqual(publiable ? ['Person', 'BreadcrumbList'] : ['BreadcrumbList'])
			for (const cle of ['og:title', 'og:description', 'og:image', 'og:url'])
				expect(meta(page, cle), `${slug} ${cle}`).toBeTruthy()
		}
	})

	test('coquille vide : le h1 porte le prénom, aucune section vide affichée', async ({
		request,
	}) => {
		const { html: page } = await html(request, '/profil/coquille-vide')
		expect(textesDes(page, 'h1')).toEqual(['Coquille'])
		for (const titre of [
			'Compétences',
			'Portfolio',
			'Service(s) proposé(s)',
			'Langues',
		])
			expect(textesDes(page, 'h2')).not.toContain(titre)
	})

	test('dans un navigateur : même rendu une fois hydraté, aucune erreur', async ({
		page,
	}) => {
		const erreurs = []
		page.on('pageerror', e => erreurs.push(e.message))
		page.on('console', m => {
			// the pictures of the fake Strapi are not on an allowed host of
			// next/image: their 400 is expected here
			if (m.type() === 'error' && !/Failed to load resource/.test(m.text()))
				erreurs.push(m.text())
		})
		await page.goto('/profil/zoe-lefevre')
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			'Zoé Lefèvre'
		)
		await expect(page.getByRole('tab', { name: 'Invitée' })).toBeVisible()
		await page.getByRole('tab', { name: 'Invitée' }).click()
		await expect(page.getByText('Maquillage de soirée')).toBeVisible()
		expect(erreurs).toEqual([])
	})

	test('SEO-10 ancienne URL (username avec espace, majuscules) : 308 en un saut vers le slug', async ({
		request,
	}) => {
		for (const [ancienne, slug] of [
			['/profil/Zo%C3%A9%20Lef%C3%A8vre', 'zoe-lefevre'],
			['/profil/ZOE%20LEFEVRE', 'zoe-lefevre-2'],
			['/profil/LeaNantes', 'leanantes'],
			['/profil/Textes%20Max', 'textes-max'],
		]) {
			const reponse = await request.get(ancienne, { maxRedirects: 0 })
			expect(reponse.status(), ancienne).toBe(308)
			expect(reponse.headers().location, ancienne).toBe(`/profil/${slug}`)
			const cible = await request.get(reponse.headers().location, {
				maxRedirects: 0,
			})
			expect(cible.status(), `${ancienne} → ${slug}`).toBe(200)
		}
	})

	test('profil inconnu : 404, jamais 500', async ({ request }) => {
		const reponse = await request.get('/profil/inconnue-zz9', {
			maxRedirects: 0,
		})
		expect(reponse.status()).toBe(404)
	})
})

test.describe('SEO-10 sitemap, robots, noindex, canonical', () => {
	test('sitemap : URL valides, 0 « // » hors protocole, un /profil/ par profil publiable, talents, articles et pages fixes, lastmod réel', async ({
		request,
	}) => {
		const reponse = await request.get('/sitemap.xml')
		expect(reponse.status()).toBe(200)
		expect(reponse.headers()['content-type']).toContain('application/xml')
		const xml = await reponse.text()
		const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m =>
			decoder(m[1])
		)

		for (const loc of locs) {
			expect(loc.replace(/^https?:\/\//, ''), loc).not.toContain('//')
			expect(loc, loc).not.toMatch(/\s/)
			expect(new URL(loc).origin).toBe(APP)
		}
		expect(new Set(locs).size).toBe(locs.length)

		const profils = locs.filter(l => l.includes('/profil/'))
		expect(profils.sort()).toEqual(
			publiables.map(p => `${APP}/profil/${p.attendu.slug}`).sort()
		)
		expect(profils).toHaveLength(publiables.length)
		for (const t of TALENTS) expect(locs).toContain(`${APP}/talent/${t.slug}`)
		for (const a of ARTICLES) expect(locs).toContain(`${APP}/blog/${a.slug}`)
		for (const page of [
			'',
			'/politique-de-confidentialite',
			'/cgu',
			'/contact',
		])
			expect(locs).toContain(`${APP}${page}`)
		for (const exclue of ['/auth', '/search', '/site-map', '/404', '/api'])
			expect(locs.some(l => new URL(l).pathname.startsWith(exclue))).toBe(false)

		const zoe = PROFILS_PUBLICS.find(p => p.attendu.slug === 'zoe-lefevre')
		expect(xml).toContain(
			`<loc>${APP}/profil/zoe-lefevre</loc>\n    <lastmod>${zoe.updatedAt}</lastmod>`
		)
		expect(xml).not.toMatch(/changefreq|priority/)
	})

	test('chaque URL du sitemap : 200, indexable, canonical vers elle-même (dont la politique de confidentialité)', async ({
		request,
	}) => {
		const xml = await (await request.get('/sitemap.xml')).text()
		const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m =>
			decoder(m[1])
		)
		expect(locs.length).toBeGreaterThan(20)
		for (const loc of locs) {
			const { reponse, html: page } = await html(request, loc)
			expect(reponse.status(), loc).toBe(200)
			expect(meta(page, 'robots') ?? null, loc).toBeNull()
			expect(reponse.headers()['x-robots-tag'], loc).toBeUndefined()
			expect(canonical(page), loc).toBe(loc)
			expect(motsInterdits(page), loc).toEqual([])
		}
	})

	test('robots.txt : le sitemap, /api fermé, ni Host ni /auth bloqué', async ({
		request,
	}) => {
		const reponse = await request.get('/robots.txt')
		expect(reponse.status()).toBe(200)
		const txt = await reponse.text()
		expect(txt).toContain(`Sitemap: ${APP}/sitemap.xml`)
		expect(txt).toMatch(/^Disallow: \/api\/$/m)
		expect(txt).not.toMatch(/Host:|Disallow: \/auth/)
	})

	test('/auth/* et /search : noindex (une seule meta et l’en-tête), sans canonical', async ({
		request,
	}) => {
		for (const chemin of [
			'/auth/signin',
			'/auth/signup',
			'/auth/mot-de-passe-oublie',
			'/auth/reinitialiser',
			'/auth/error?error=erreur-inconnue',
			'/search',
			'/search?city=Annecy',
		]) {
			const { reponse, html: page } = await html(request, chemin)
			expect(reponse.status(), chemin).toBe(200)
			expect(
				metas(page)
					.filter(m => m.name === 'robots')
					.map(m => m.content),
				chemin
			).toEqual(['noindex,follow'])
			expect(reponse.headers()['x-robots-tag'], chemin).toBe('noindex, follow')
			expect(canonical(page), chemin).toBeNull()
		}
	})

	test('SEO-12 talent : un seul h1, OG, fil d’Ariane ; article et accueil : OG', async ({
		request,
	}) => {
		const talent = await html(request, '/talent/maquillage-mariee')
		expect(textesDes(talent.html, 'h1')).toEqual([
			'Maquilleuse pour votre mariage',
		])
		expect(meta(talent.html, 'og:title')).toBe('Maquillage mariée | My-Makeup')
		expect(jsonLd(talent.html).map(d => d['@type'])).toEqual(['BreadcrumbList'])

		const article = await html(request, '/blog/prix-maquillage-mariee')
		expect(textesDes(article.html, 'h1')).toEqual([
			'Le prix d’un maquillage de mariée',
		])
		expect(meta(article.html, 'og:type')).toBe('article')
		// the SEO text of the editorial team, kept even under 70 characters
		expect(meta(article.html, 'description')).toBe(ARTICLES[0].seo_description)
		expect(meta(article.html, 'og:description')).toBe(
			ARTICLES[0].seo_description
		)
		expect(jsonLd(article.html)[0].itemListElement).toHaveLength(3)

		const accueil = await html(request, '/')
		expect(canonical(accueil.html)).toBe(APP)
		// E9: 60 characters of title, 70 to 155 of description, same in og:
		const titre = decoder(/<title[^>]*>([^<]*)<\/title>/.exec(accueil.html)[1])
		expect(titre.length).toBeLessThanOrEqual(60)
		const description = meta(accueil.html, 'description')
		expect(description.length).toBeGreaterThanOrEqual(70)
		expect(description.length).toBeLessThanOrEqual(155)
		expect(meta(accueil.html, 'og:description')).toBe(description)
		expect(meta(accueil.html, 'og:title')).toBe(titre)
		for (const page of [talent.html, article.html, accueil.html])
			for (const cle of [
				'og:title',
				'og:description',
				'og:image',
				'og:url',
				'twitter:card',
			])
				expect(meta(page, cle), cle).toBeTruthy()
		expect(meta(accueil.html, 'og:image')).toBe(
			`${APP}/assets/og-my-makeup.jpg`
		)
		const image = await request.get('/assets/og-my-makeup.jpg')
		expect(image.status()).toBe(200)
		expect(image.headers()['content-type']).toBe('image/jpeg')
	})
})

test.describe('UI-07 recherche', () => {
	// errors thrown in the page and logged by React (hydration…)
	function erreursDeLaPage(page) {
		const erreurs = []
		page.on('pageerror', e => erreurs.push(e.message))
		page.on('console', m => {
			if (m.type() === 'error' && !/Failed to load resource/.test(m.text()))
				erreurs.push(m.text())
		})
		return erreurs
	}
	const recherches = async () =>
		(await journal()).filter(e => e.m === 'GET' && e.p === '/api/searching')

	test('/search?city=Annecy : sans erreur, un h1, la ville préremplie, un seul appel à l’API', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		await page.goto('/search?city=Annecy')
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			/^\d+ maquilleuses à Annecy$/
		)
		await expect(page.getByLabel('Ville de la prestation')).toHaveValue(
			'Annecy'
		)
		const cartes = page.getByTestId('search-result')
		await expect(cartes.first()).toBeVisible()
		// the unavailable profile is not in the results
		await expect(page.getByText('Inès Fictif')).toHaveCount(0)
		await expect(cartes.first()).toHaveAttribute('href', /^\/profil\//)
		expect(await recherches()).toHaveLength(1)
		expect(erreurs).toEqual([])
	})

	test('profil vérifié (type 10 du plan 02 §6) : le badge « Pro » sur sa carte seulement', async ({
		page,
	}) => {
		await page.goto('/search?city=Annecy')
		const cartes = page.getByTestId('search-result')
		await expect(cartes.first()).toBeVisible()
		const verifiee = cartes.filter({ hasText: 'Rose Fictif' })
		await expect(verifiee).toHaveCount(1)
		await expect(verifiee.getByText('Pro', { exact: true })).toBeVisible()
		await expect(cartes.getByText('Pro', { exact: true })).toHaveCount(1)
	})

	test('aucun résultat : un h1 et un message utile', async ({ page }) => {
		await page.goto('/search?search=zzqq')
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			'Aucune maquilleuse pour « zzqq »'
		)
		await expect(page.getByTestId('search-empty')).toContainText(
			'Essayez un autre mot'
		)
	})

	test('API en panne : message en moins de 10 s, puis « Réessayer » aboutit', async ({
		page,
	}) => {
		await panne({ recherche: 500 })
		await page.goto('/search?city=Annecy')
		await expect(page.getByTestId('search-error')).toBeVisible()
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			'La recherche n’a pas abouti'
		)
		await panne({ recherche: null })
		await page.getByTestId('search-retry').click()
		await expect(page.getByTestId('search-result').first()).toBeVisible()
	})

	test('API coupée (aucune réponse) : message en moins de 10 s', async ({
		page,
	}) => {
		await panne({ delaiRechercheMs: 30_000 })
		const debut = Date.now()
		await page.goto('/search?search=mariage&city=Annecy')
		await expect(page.getByTestId('search-error')).toBeVisible({
			timeout: 10_000,
		})
		expect(Date.now() - debut).toBeLessThan(10_000)
	})

	test('ville seule depuis le formulaire de l’accueil : /search?city=…, un seul appel', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		await page.goto('/')
		const formulaire = page.getByRole('search')
		await formulaire.getByLabel('Ville de la prestation').fill('Lyon')
		await formulaire
			.getByRole('button', { name: 'Trouver une maquilleuse' })
			.click()
		await expect(page).toHaveURL(/\/search\?city=Lyon$/)
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			'1 maquilleuse à Lyon'
		)
		expect(await recherches()).toHaveLength(1)
		expect(erreurs).toEqual([])
	})

	test('pages de 20 : la page 2 sans nouvel appel, une nouvelle recherche en un appel', async ({
		page,
	}) => {
		await piloter('/__multiplier', { n: 30, city: 'Annecy' })
		await page.goto('/search?city=Annecy')
		const cartes = page.getByTestId('search-result')
		await expect(cartes).toHaveCount(20)
		await expect(page.getByTestId('search-pagination')).toContainText(
			'Page 1 sur 2'
		)
		await page.getByRole('link', { name: 'Page suivante' }).click()
		await expect(page).toHaveURL(/page=2/)
		await expect(page.getByTestId('search-pagination')).toContainText(
			'Page 2 sur 2'
		)
		expect(await cartes.count()).toBeGreaterThan(0)
		expect(await cartes.count()).toBeLessThanOrEqual(20)
		expect(await recherches()).toHaveLength(1)

		const formulaire = page.getByRole('search')
		await formulaire.getByLabel('Prestation recherchée').fill('mariage')
		await formulaire
			.getByRole('button', { name: 'Trouver une maquilleuse' })
			.click()
		await expect(page).toHaveURL(/search=mariage&city=Annecy$/)
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			/pour « mariage » à Annecy$/
		)
		expect(await recherches()).toHaveLength(2)
	})
})
