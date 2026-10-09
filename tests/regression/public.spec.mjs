// Public pages against the fake Strapi (tests/regression/mock-api.mjs and
// its data, donnees-publiques.mjs), launched by tests/regression/run.mjs:
// profiles rendered on the server (UI-06), slugs, sitemap, robots, noindex
// and canonical (SEO-10), Open Graph and JSON-LD (SEO-12), the search by
// city (UI-07) and its honest title (UI-10), the width and quality of the
// artists' photos (UI-09). The raw HTML is read without JavaScript, as a
// crawler does.
// Web-first waits only, no fixed timeout.
import { expect, test } from '@playwright/test'
import { filter, getElementsByTagName, removeElement, textContent } from 'domutils'
import { parseDocument } from 'htmlparser2'
import { ARTICLES, PROFILS_PUBLICS, TALENTS } from './donnees-publiques.mjs'

const API = process.env.RG_API ?? 'http://127.0.0.1:4112'
const APP = process.env.RG_APP ?? 'http://localhost:3996'

// Never against the production: local hosts only
for (const cible of [API, APP]) {
	if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(cible).hostname))
		throw new Error(`cible non locale refusée : ${cible}`)
}

test.use({ testIdAttribute: 'data-cy' })

async function piloter(chemin, corps) {
	const reponse = await fetch(API + chemin, corps === undefined ? {} : { method: 'POST', body: JSON.stringify(corps) })
	return reponse.json()
}
const panne = corps => piloter('/__panne', corps)
const journal = async () => (await piloter('/__etat')).journal
// GET /api/searching with a term (the search), and without any (the whole
// directory, read once per visit instead of the search for a city alone)
const appelsRecherche = async () => (await journal()).filter(e => e.m === 'GET' && e.p === '/api/searching')
const recherches = async () => (await appelsRecherche()).filter(e => new URLSearchParams(e.q).has('search'))
const annuaires = async () => (await appelsRecherche()).filter(e => !new URLSearchParams(e.q).has('search'))

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
const decoder = texte => texte.replace(/&(amp|quot|#x27|#39|lt|gt);/g, (_, e) => ENTITES[e])
// The raw HTML is read with a real parser (entities decoded, scripts
// dropped), never with regular expressions over the markup.
function documentSansScripts(html) {
	const document = parseDocument(html)
	for (const script of getElementsByTagName('script', document)) {
		removeElement(script)
	}
	return document
}
function textes(noeud, acc = []) {
	if (noeud.type === 'text') acc.push(noeud.data)
	for (const enfant of noeud.children ?? []) {
		textes(enfant, acc)
	}
	return acc
}
function attributs(noeud, acc = []) {
	if (noeud.attribs) acc.push(...Object.values(noeud.attribs))
	for (const enfant of noeud.children ?? []) {
		attributs(enfant, acc)
	}
	return acc
}
// text a visitor sees, one space between text nodes
const texteVisible = html => textes(documentSansScripts(html)).join(' ')
const textesDes = (html, balise) =>
	getElementsByTagName(balise, documentSansScripts(html)).map(e => textes(e).join('').trim())
const metas = html => getElementsByTagName('meta', parseDocument(html)).map(e => ({ ...e.attribs }))
const meta = (html, cle) => metas(html).find(m => m.name === cle || m.property === cle)?.content
const canonical = html => /<link[^>]*rel="canonical"[^>]*href="([^"]*)"/.exec(html)?.[1] ?? null
const jsonLd = html =>
	[...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]))
// words a broken template prints: in the text, the attributes and the JSON-LD
const MOTS_INTERDITS = /\b(undefined|null|NaN|Invalid Date)\b|& ?km\b|\bnullkm\b/i
function motsInterdits(html) {
	const document = documentSansScripts(html)
	const visible = [...textes(document), ...attributs(document)].join('\n')
	const ld = jsonLd(html)
		.map(d => JSON.stringify(d))
		.join('\n')
	return [...`${visible}\n${ld}`.matchAll(new RegExp(MOTS_INTERDITS, 'gi'))].map(m => m[0])
}

async function html(request, chemin) {
	const reponse = await request.get(chemin, { maxRedirects: 0 })
	return { reponse, html: await reponse.text() }
}

const publiables = PROFILS_PUBLICS.filter(p => p.attendu.publiable)

// the h2 of the 9 cards of a public profile (ViewInfosProfil), in order
const TITRES_SECTIONS = [
	'Localisation & département',
	'Réseaux sociaux & contacts',
	'Compétences',
	'Langues',
	'Formations & diplômes',
	'Vous en quelques mots',
	'Portfolio',
	'Service(s) proposé(s)',
	'Expériences professionnelles',
]

test.describe('UI-06 profils rendus côté serveur', () => {
	test('profil complet, HTML brut sans JavaScript : nom en seul h1, ville, spécialité, description, offres et photos ; 0 « undefined » ou « null » ; OG et JSON-LD', async ({
		request,
	}) => {
		const { reponse, html: page } = await html(request, '/profil/zoe-lefevre')
		expect(reponse.status()).toBe(200)

		expect(textesDes(page, 'h1')).toEqual(['Zoé Lefèvre'])
		const texte = texteVisible(page)
		for (const attendu of [
			'Maquillage mariée',
			'Annecy et 30 km autour',
			'Maquilleuse professionnelle diplômée',
			'Mariée',
			'à partir de 180 €',
			'Invitée',
			'45 €',
			'Shooting',
			'Ligne 1',
			'Ligne 2',
			'Essai supplémentaire',
			'60 €',
			'CAP esthétique',
			'janvier 2016 - aujourd’hui',
			'@studio.fictif',
		]) {
			expect(texte, attendu).toContain(attendu)
		}
		for (let n = 1; n <= 6; n++) {
			expect(page).toContain(`alt="Réalisation de Zoé Lefèvre (${n}/6)"`)
		}
		expect(motsInterdits(page)).toEqual([])
		// every card filled: its 9 titles, in order (what 'coquille vide'
		// checks the absence of)
		expect(textesDes(page, 'h2').filter(titre => TITRES_SECTIONS.includes(titre))).toEqual(TITRES_SECTIONS)

		// indexable, canonical on the slug
		expect(meta(page, 'robots')).toBeUndefined()
		expect(reponse.headers()['x-robots-tag']).toBeUndefined()
		expect(canonical(page)).toBe(`${APP}/profil/zoe-lefevre`)

		// SEO-12: Open Graph and Twitter
		expect(meta(page, 'og:title')).toBe('Zoé Lefèvre – Maquillage mariée à Annecy | My-Makeup')
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
		expect(personne.makesOffer.map(o => o.itemOffered['@type'])).toEqual(['Service', 'Service', 'Service'])
		expect(personne.makesOffer[0].priceSpecification).toEqual({
			'@type': 'PriceSpecification',
			minPrice: 180,
			priceCurrency: 'EUR',
		})
		expect(ariane['@type']).toBe('BreadcrumbList')
		expect(ariane.itemListElement.map(e => e.item)).toEqual([APP, `${APP}/profil/zoe-lefevre`])
		// never the email nor the phone in the structured data
		expect(JSON.stringify(jsonLd(page))).not.toMatch(/example\.test"|39 98|mailto|tel:/)
	})

	test('chaque profil de la fixture : 200, un seul h1, rien de cassé ; noindex et sans canonical exactement quand il n’est pas publiable', async ({
		request,
	}) => {
		for (const profil of PROFILS_PUBLICS) {
			const { slug, publiable } = profil.attendu
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			const { reponse, html: page } = await html(request, `/profil/${slug}`)
			expect(reponse.status(), slug).toBe(200)
			expect(textesDes(page, 'h1'), slug).toHaveLength(1)
			expect(motsInterdits(page), slug).toEqual([])
			expect(meta(page, 'robots') ?? null, slug).toBe(publiable ? null : 'noindex,follow')
			expect(canonical(page), slug).toBe(publiable ? `${APP}/profil/${slug}` : null)
			expect(
				jsonLd(page).map(d => d['@type']),
				slug
			).toEqual(publiable ? ['Person', 'BreadcrumbList'] : ['BreadcrumbList'])
			for (const cle of ['og:title', 'og:description', 'og:image', 'og:url']) {
				expect(meta(page, cle), `${slug} ${cle}`).toBeTruthy()
			}
		}
	})

	test('coquille vide : le h1 porte le prénom, aucune des 9 sections affichée', async ({ request }) => {
		const { html: page } = await html(request, '/profil/coquille-vide')
		expect(textesDes(page, 'h1')).toEqual(['Coquille'])
		const h2 = textesDes(page, 'h2')
		for (const titre of TITRES_SECTIONS) {
			expect(h2).not.toContain(titre)
		}
	})

	test('profil en partie rempli : ses h2 sont exactement ses sections remplies (ni langue, ni réseau, ni expérience sans entreprise ni poste)', async ({
		request,
	}) => {
		const profil = PROFILS_PUBLICS.find(p => p.attendu.slug === 'margot-partielle')
		const { reponse, html: page } = await html(request, `/profil/${profil.attendu.slug}`)
		expect(reponse.status()).toBe(200)
		expect(textesDes(page, 'h1')).toEqual(['Margot Partielle'])
		expect(textesDes(page, 'h2')).toEqual(profil.attendu.sections)
		expect(motsInterdits(page)).toEqual([])
	})

	test('offre tapée avec des lignes vides : aucun <p> ni <h3> vide dans la description et le prix, une ligne par ligne tapée', async ({
		request,
	}) => {
		const { html: page } = await html(request, '/profil/zoe-lefevre')
		const document = documentSansScripts(page)
		const blocs = filter(e => /^service-offer-(description|price)/.test(e.attribs?.['data-cy'] ?? ''), document)
		// 3 offers and 1 option, each with its description and its price
		expect(blocs).toHaveLength(8)
		const lignes = blocs.flatMap(bloc =>
			filter(e => e.name === 'p' || e.name === 'h3', bloc.children).map(e => ({
				balise: e.name,
				texte: textContent(e).trim(),
			}))
		)
		expect(lignes.filter(l => l.texte === '')).toEqual([])
		const descriptions = lignes.filter(l => l.balise === 'p').map(l => l.texte)
		expect(descriptions).toEqual(expect.arrayContaining(['Ligne 1', 'Ligne 2']))
		expect(lignes.filter(l => l.balise === 'h3').map(l => l.texte)).toEqual([
			'à partir de 180 €',
			'60 €',
			'45 €',
			'180 €',
		])
	})

	test('portfolio de plusieurs photos : flèches « Photo précédente » et « Photo suivante » dans le HTML brut', async ({
		request,
	}) => {
		const { html: page } = await html(request, '/profil/zoe-lefevre')
		const etiquettes = getElementsByTagName('button', parseDocument(page)).map(b => b.attribs['aria-label'])
		expect(etiquettes).toContain('Photo précédente')
		expect(etiquettes).toContain('Photo suivante')
	})

	test('dans un navigateur : même rendu une fois hydraté, aucune erreur', async ({ page }) => {
		const erreurs = []
		page.on('pageerror', e => erreurs.push(e.message))
		page.on('console', m => {
			// the pictures of the fake Strapi are not on an allowed host of
			// next/image: their 400 is expected here
			if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text())
		})
		await page.goto('/profil/zoe-lefevre')
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Zoé Lefèvre')
		await expect(page.getByRole('tab', { name: 'Invitée' })).toBeVisible()
		await page.getByRole('tab', { name: 'Invitée' }).click()
		await expect(page.getByText('Maquillage de soirée')).toBeVisible()
		expect(erreurs).toEqual([])
	})

	test('SEO-10 ancienne URL (username avec espace, majuscules) : 308 en un saut vers le slug', async ({ request }) => {
		for (const [ancienne, slug] of [
			['/profil/Zo%C3%A9%20Lef%C3%A8vre', 'zoe-lefevre'],
			['/profil/ZOE%20LEFEVRE', 'zoe-lefevre-2'],
			['/profil/LeaNantes', 'leanantes'],
			['/profil/Textes%20Max', 'textes-max'],
		]) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
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
		const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => decoder(m[1]))

		for (const loc of locs) {
			expect(loc.replace(/^https?:\/\//, ''), loc).not.toContain('//')
			expect(loc, loc).not.toMatch(/\s/)
			expect(new URL(loc).origin).toBe(APP)
		}
		expect(new Set(locs).size).toBe(locs.length)

		const profils = locs.filter(l => l.includes('/profil/'))
		expect(profils.sort()).toEqual(publiables.map(p => `${APP}/profil/${p.attendu.slug}`).sort())
		expect(profils).toHaveLength(publiables.length)
		for (const t of TALENTS) {
			expect(locs).toContain(`${APP}/talent/${t.slug}`)
		}
		for (const a of ARTICLES) {
			expect(locs).toContain(`${APP}/blog/${a.slug}`)
		}
		for (const page of ['', '/politique-de-confidentialite', '/cgu', '/contact']) {
			expect(locs).toContain(`${APP}${page}`)
		}
		for (const exclue of ['/auth', '/search', '/site-map', '/404', '/api']) {
			expect(locs.some(l => new URL(l).pathname.startsWith(exclue))).toBe(false)
		}

		const zoe = PROFILS_PUBLICS.find(p => p.attendu.slug === 'zoe-lefevre')
		expect(xml).toContain(`<loc>${APP}/profil/zoe-lefevre</loc>\n    <lastmod>${zoe.updatedAt}</lastmod>`)
		expect(xml).not.toMatch(/changefreq|priority/)
	})

	test('chaque URL du sitemap : 200, indexable, canonical vers elle-même (dont la politique de confidentialité), titre de 60 et description de 155 caractères au plus', async ({
		request,
	}) => {
		const xml = await (await request.get('/sitemap.xml')).text()
		const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => decoder(m[1]))
		expect(locs.length).toBeGreaterThan(20)
		for (const loc of locs) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			const { reponse, html: page } = await html(request, loc)
			expect(reponse.status(), loc).toBe(200)
			expect(meta(page, 'robots') ?? null, loc).toBeNull()
			expect(reponse.headers()['x-robots-tag'], loc).toBeUndefined()
			expect(canonical(page), loc).toBe(loc)
			expect(motsInterdits(page), loc).toEqual([])
			// 60 characters of title, 155 of description at most
			const titre = decoder(/<title[^>]*>([^<]*)<\/title>/.exec(page)?.[1] ?? '')
			expect(titre.length, loc).toBeGreaterThan(0)
			expect(titre.length, `${loc} ${titre}`).toBeLessThanOrEqual(60)
			const description = meta(page, 'description') ?? ''
			expect(description.length, loc).toBeGreaterThan(0)
			expect(description.length, `${loc} ${description}`).toBeLessThanOrEqual(155)
		}
	})

	test('robots.txt : le sitemap, /api fermé, ni Host ni /auth bloqué', async ({ request }) => {
		const reponse = await request.get('/robots.txt')
		expect(reponse.status()).toBe(200)
		const txt = await reponse.text()
		expect(txt).toContain(`Sitemap: ${APP}/sitemap.xml`)
		expect(txt).toMatch(/^Disallow: \/api\/$/m)
		expect(txt).not.toMatch(/Host:|Disallow: \/auth/)
	})

	test('/auth/* et /search : noindex (une seule meta et l’en-tête), sans canonical', async ({ request }) => {
		for (const chemin of [
			'/auth/signin',
			'/auth/signup',
			'/auth/mot-de-passe-oublie',
			'/auth/reinitialiser',
			'/auth/error?error=erreur-inconnue',
			'/search',
			'/search?city=Annecy',
		]) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
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

	test('SEO-12 talent : un seul h1, OG, fil d’Ariane ; article et accueil : OG', async ({ request }) => {
		const talent = await html(request, '/talent/maquillage-mariee')
		expect(textesDes(talent.html, 'h1')).toEqual(['Maquilleuse pour votre mariage'])
		expect(meta(talent.html, 'og:title')).toBe('Maquillage mariée | My-Makeup')
		expect(jsonLd(talent.html).map(d => d['@type'])).toEqual(['BreadcrumbList'])

		const article = await html(request, '/blog/prix-maquillage-mariee')
		expect(textesDes(article.html, 'h1')).toEqual(['Le prix d’un maquillage de mariée'])
		expect(meta(article.html, 'og:type')).toBe('article')
		// the SEO text of the editorial team, kept even under 70 characters
		expect(meta(article.html, 'description')).toBe(ARTICLES[0].seo_description)
		expect(meta(article.html, 'og:description')).toBe(ARTICLES[0].seo_description)
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
		for (const page of [talent.html, article.html, accueil.html]) {
			for (const cle of ['og:title', 'og:description', 'og:image', 'og:url', 'twitter:card']) {
				expect(meta(page, cle), cle).toBeTruthy()
			}
		}
		expect(meta(accueil.html, 'og:image')).toBe(`${APP}/assets/og-my-makeup.jpg`)
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
			if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text())
		})
		return erreurs
	}

	registerpublic1Scenario1({ erreursDeLaPage })

	// the form of a bare /search, as a visitor uses it (the removed Cypress
	// search.cy.js and profil-update-then-search.cy.js): nothing is read
	// before the submit, one search after it
	async function chercherDepuisLeFormulaire(page, { terme, ville }) {
		await page.goto('/search')
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rechercher une maquilleuse')
		expect(await appelsRecherche()).toHaveLength(0)
		await page.getByTestId('search-input').fill(terme)
		if (ville !== undefined) await page.getByTestId('city-input').fill(ville)
		await page.getByTestId('search-button').click()
	}

	registerpublic1Scenario2({ erreursDeLaPage, chercherDepuisLeFormulaire })

	registerpublic1Scenario3({ erreursDeLaPage, chercherDepuisLeFormulaire })

	registerpublic1Scenario4({ erreursDeLaPage, chercherDepuisLeFormulaire })

	test('profil vérifié (type 10 du plan 02 §6) : le badge « Pro » sur sa carte seulement', async ({ page }) => {
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
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aucun résultat pour « zzqq »')
		await expect(page.getByTestId('search-empty')).toContainText('Essayez un autre mot')
	})

	test('API en panne : message en moins de 10 s, puis « Réessayer » aboutit', async ({ page }) => {
		await panne({ recherche: 500 })
		await page.goto('/search?city=Annecy')
		await expect(page.getByTestId('search-error')).toBeVisible()
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('La recherche n’a pas abouti')
		await panne({ recherche: null })
		await page.getByTestId('search-retry').click()
		await expect(page.getByTestId('search-result').first()).toBeVisible()
	})

	registerpublic1Scenario5({})

	registerpublic1Scenario6({ erreursDeLaPage })

	registerpublic1Scenario7({})

	test('pages de 20 sans ville : au-delà de 50, la dernière page « Page 4 sur 4 »', async ({ page }) => {
		// the 60 made-up profiles, Camille Fictive and the description of
		// Nina: the searchable profiles that hold « fictive »
		await piloter('/__multiplier', { n: 60, city: 'Annecy' })
		await page.goto('/search?search=Fictive&page=4')
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('62 résultats pour « Fictive »')
		await expect(page.getByTestId('search-pagination')).toContainText('Page 4 sur 4')
		await expect(page.getByTestId('search-result')).toHaveCount(2)
		expect(await recherches()).toHaveLength(1)
		expect(await annuaires()).toHaveLength(0)
	})

	registerpublic1Scenario8({})
})

// The photos of the fake Strapi announce 2000 × 1500 (mock-api.mjs); the
// image optimizer cannot fetch them here (127.0.0.1 is not one of its
// hosts), but the browser still picks a width in the srcset, which is what
// is checked: the width asked covers the width the photo is drawn at, or
// 3/4 of it from 2.5 dppx (src/lib/taille-image.js: 2.25x on a 3x phone).
const RATIO_FIXTURE = 2000 / 1500
const PHOTO_CARTE = '[data-cy="search-result"] img'
const ECRAN_TRES_DENSE = '(min-resolution: 2.5dppx)'
const part = dpr => (dpr >= 2.5 ? 0.75 : 1)

function candidats(srcset) {
	return srcset.split(', ').map(candidat => {
		const [url, largeur] = candidat.split(' ')
		const q = new URL(url, APP).searchParams.get('q')
		return { largeur: Number.parseInt(largeur, 10), q: Number(q) }
	})
}

// the width picked by the browser, the one the photo is drawn at and the
// one asked at that density, in device px (object-fit: cover)
async function largeurs(photo, dpr) {
	await photo.scrollIntoViewIfNeeded()
	await expect.poll(() => photo.evaluate(img => img.currentSrc)).toContain('/_next/image')
	const { currentSrc, largeur, hauteur } = await photo.evaluate(img => {
		const boite = img.getBoundingClientRect()
		return {
			currentSrc: img.currentSrc,
			largeur: boite.width,
			hauteur: boite.height,
		}
	})
	const dessinee = Math.max(largeur, hauteur * RATIO_FIXTURE) * dpr
	return {
		choisie: Number(new URL(currentSrc).searchParams.get('w')),
		dessinee,
		besoin: Math.ceil(dessinee * part(dpr) - 0.5),
	}
}

test.describe('UI-09 photos nettes', () => {
	test('carte de recherche : srcset jusqu’à 828 px et plus, qualité 85 ; la première chargée tout de suite, les autres plus tard', async ({
		page,
	}) => {
		await page.goto('/search?city=Annecy')
		const photo = page.locator(PHOTO_CARTE).first()
		await expect(photo).toHaveAttribute('srcset', /\s828w/)
		const liste = candidats(await photo.getAttribute('srcset'))
		expect(liste.some(c => c.largeur >= 828)).toBe(true)
		expect(Math.max(...liste.map(c => c.largeur))).toBeGreaterThanOrEqual(1920)
		for (const c of liste) {
			expect(c.q, `${c.largeur}w`).toBeGreaterThanOrEqual(85)
		}
		const sizes = await photo.getAttribute('sizes')
		expect(sizes).toMatch(/px/)
		expect(sizes.startsWith(`${ECRAN_TRES_DENSE} and `)).toBe(true)
		// the LCP of a phone: loaded at once and first; the others lazily
		await expect(photo).toHaveAttribute('loading', 'eager')
		await expect(photo).toHaveAttribute('fetchpriority', 'high')
		const deuxieme = page.locator(PHOTO_CARTE).nth(1)
		await expect(deuxieme).toHaveAttribute('loading', 'lazy')
		expect(await deuxieme.getAttribute('fetchpriority')).not.toBe('high')
	})

	test('/search : rien ne télécharge en même temps que la première photo, ni les profils préchargés ni la police d’icônes', async ({
		page,
	}) => {
		// the photos answer 1.5 s late: long enough for an early prefetch to show
		await page.route('**/_next/image?**', async route => {
			await new Promise(resolve => setTimeout(resolve, 1500))
			await route.continue()
		})
		const requetes = new Map()
		page.on('request', r => requetes.set(r, { url: r.url(), debut: Date.now() }))
		for (const fin of ['requestfinished', 'requestfailed']) {
			page.on(fin, r => {
				if (requetes.has(r)) requetes.get(r).fin = Date.now()
			})
		}
		await page.goto('/search?city=Annecy')
		const photo = page.locator(PHOTO_CARTE).first()
		await expect.poll(() => photo.evaluate(img => img.currentSrc)).toContain('/_next/image')
		const source = await photo.evaluate(img => img.currentSrc)
		// the profiles are still prefetched, once the photo is there
		await expect.poll(() => [...requetes.values()].some(r => /\/_next\/data\/.*\/profil\//.test(r.url))).toBe(true)
		const liste = [...requetes.values()]
		const finPhoto = liste.find(r => r.url === source)?.fin
		expect(finPhoto).toBeDefined()
		for (const r of liste.filter(r => /\/_next\/data\/.*\/profil\//.test(r.url))) {
			expect(r.debut, r.url).toBeGreaterThanOrEqual(finPhoto)
		}
		// the icon of the cards is drawn inline: no icon font on this page
		expect(liste.filter(r => /material-icons/.test(r.url))).toEqual([])
	})

	for (const ecran of [
		{ nom: 'téléphone 3x', width: 390, height: 844, dpr: 3, mobile: true },
		{ nom: 'tablette 2x', width: 768, height: 1024, dpr: 2, mobile: true },
		{ nom: 'ordinateur 2x', width: 1440, height: 900, dpr: 2, mobile: false },
		{ nom: 'grand écran 1x', width: 1920, height: 1080, dpr: 1, mobile: false },
	]) {
		test.describe(ecran.nom, () => {
			test.use({
				viewport: { width: ecran.width, height: ecran.height },
				deviceScaleFactor: ecran.dpr,
				isMobile: ecran.mobile,
				hasTouch: ecran.mobile,
			})

			test(`carte de recherche (${ecran.nom}) : la largeur choisie couvre la photo dessinée`, async ({ page }) => {
				await page.goto('/search?city=Annecy')
				const { choisie, dessinee, besoin } = await largeurs(page.locator(PHOTO_CARTE).first(), ecran.dpr)
				expect(choisie).toBeGreaterThanOrEqual(Math.min(besoin, 3840))
				// the LCP of a 3x phone: not the full density
				if (part(ecran.dpr) < 1) expect(choisie).toBeLessThan(dessinee)
			})

			test(`profil (${ecran.nom}) : photo principale (qualité 75) et portfolio (qualité 85) demandés à leur taille`, async ({
				page,
			}) => {
				await page.goto('/profil/zoe-lefevre')
				const principale = page.getByRole('img', { name: /^Photo de / })
				await expect(principale).toHaveAttribute('sizes', `${ECRAN_TRES_DENSE} 201px, 267px`)
				const premiere = await largeurs(principale, ecran.dpr)
				expect(premiere.choisie).toBeGreaterThanOrEqual(premiere.besoin)
				// the LCP of a profile on a 3x phone: the 640 of before UI-09
				if (part(ecran.dpr) < 1) expect(premiere.choisie).toBe(640)
				// the first photo, the active slide (lazy, but in view)
				const realisation = page.getByRole('img', { name: /^Réalisation de .* \(1\/6\)$/ }).first()
				await expect(realisation).toHaveAttribute('sizes', `${ECRAN_TRES_DENSE} 501px, 667px`)
				const portfolio = await largeurs(realisation, ecran.dpr)
				expect(portfolio.choisie).toBeGreaterThanOrEqual(Math.min(portfolio.besoin, 3840))
				for (const [photo, q] of [
					[principale, 75],
					[realisation, 85],
				]) {
					// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
					for (const c of candidats(await photo.getAttribute('srcset'))) {
						expect(c.q).toBe(q)
					}
				}
			})
		})
	}
})

test.describe('UI-10 recherche par ville : titre honnête', () => {
	const cartes = (page, section) => page.getByTestId(`search-results-${section}`).getByTestId('search-result')
	const zones = async (page, section) => cartes(page, section).getByTestId('search-result-zone').allTextContents()

	test('/search?city=Annecy : le titre ne compte que les profils d’Annecy, les autres villes à part, sous leur titre', async ({
		page,
	}) => {
		await page.goto('/search?city=Annecy')
		// 7 profiles of the fixture in Annecy (not the unavailable one) and the
		// test account; 5 elsewhere or without a city
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('8 résultats pour « Annecy »')
		await expect(cartes(page, 'locaux')).toHaveCount(8)
		// no département written by the profiles of Annecy: those that
		// travel, then the rest, each under its heading
		await expect(page.locator('[data-cy^="search-titre-"]')).toHaveText([
			'Autres maquilleuses qui se déplacent',
			'Autres maquilleuses',
		])
		await expect(cartes(page, 'deplacent')).toHaveCount(4)
		await expect(cartes(page, 'autres')).toHaveCount(1)
		for (const zone of await zones(page, 'locaux')) {
			expect(zone).toMatch(/Annecy/)
		}
		const ailleurs = [...(await zones(page, 'deplacent')), ...(await zones(page, 'autres'))]
		for (const zone of ailleurs) {
			expect(zone).not.toMatch(/Annecy/)
		}
		expect(ailleurs.join(' | ')).toMatch(/Nantes/)
		const ordre = await page.evaluate(() => {
			const dataCy = [
				'search-results-locaux',
				'search-titre-deplacent',
				'search-results-deplacent',
				'search-titre-autres',
				'search-results-autres',
			]
			const [premier, ...suivants] = dataCy.map(cle => document.querySelector(`[data-cy="${cle}"]`))
			let avant = premier
			return suivants.map(element => {
				const dansLOrdre = !!(avant.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
				avant = element
				return dansLOrdre
			})
		})
		expect(ordre).toEqual([true, true, true, true])
		// an empty city is said
		await expect(cartes(page, 'autres').filter({ hasText: 'Coquille' }).getByTestId('search-result-zone')).toHaveText(
			'Zone non renseignée'
		)
	})

	test('la ville d’abord, puis le département (code postal, code entre parenthèses, nom)', async ({ page }) => {
		await piloter('/__multiplier', { n: 1, city: 'Thonon-les-Bains 74200' })
		await piloter('/__multiplier', { n: 1, city: 'Annecy-le-Vieux (74)' })
		await page.goto(`/search?city=${encodeURIComponent('Annecy (74)')}`)
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('10 résultats pour « Annecy (74) »')
		const locaux = await zones(page, 'locaux')
		expect(locaux).toHaveLength(10)
		// 9 by the city (Annecy-le-Vieux included), then Thonon by its postal
		// code; the card shows the public place (UI-11)
		expect(locaux.slice(0, 9).every(z => /Annecy/.test(z))).toBe(true)
		expect(locaux[9]).toMatch(/Thonon-les-Bains \(74\)/)

		await page.goto('/search?city=Haute-Savoie')
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('2 résultats pour « Haute-Savoie »')
		// Annecy is in Haute-Savoie, but without geocoding nothing says so
		expect((await zones(page, 'locaux')).sort()).toEqual([
			expect.stringMatching(/Annecy-le-Vieux \(74\)/),
			expect.stringMatching(/Thonon-les-Bains \(74\)/),
		])
	})

	test('aucune maquilleuse de la ville : un titre à zéro, une phrase, les autres sous leur titre', async ({ page }) => {
		await page.goto('/search?city=Grenoble')
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aucun résultat pour « Grenoble »')
		await expect(page.getByTestId('search-aucun-local')).toContainText('« Grenoble »')
		await expect(page.getByTestId('search-results-locaux')).toHaveCount(0)
		// nobody in Grenoble: every searchable profile of the directory is
		// shown under the headings, the 11 that travel first
		await expect(page.getByTestId('search-result')).toHaveCount(13)
		await expect(page.locator('[data-cy^="search-titre-"]')).toHaveText([
			'Autres maquilleuses qui se déplacent',
			'Autres maquilleuses',
		])
		await expect(cartes(page, 'deplacent')).toHaveCount(11)
	})

	test('sans ville : une seule liste, comptée en entier', async ({ page }) => {
		await page.goto('/search?search=Soir%C3%A9e')
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^\d+ résultats pour « Soirée »$/)
		await expect(page.locator('[data-cy^="search-titre-"]')).toHaveCount(0)
		const total = Number((await page.getByRole('heading', { level: 1 }).textContent()).split(' ')[0])
		await expect(cartes(page, 'locaux')).toHaveCount(total)
	})

	test('annuaire clairsemé : après Annecy, les autres du 74, celles qui se déplacent, puis le reste, aucune deux fois ; l’annuaire lu une fois par visite', async ({
		page,
	}) => {
		// made up: Annecy with its postal code (the API writes « Annecy (74) »)
		// tells the département; Thonon is in it; Chambéry travels; Grenoble
		// without a radius comes last, with Coquille without a city
		for (const [city, action_radius] of [
			['Annecy 74000', 10],
			['Thonon-les-Bains 74200', null],
			['Chambéry (73)', 15],
			['Grenoble', null],
		]) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			await piloter('/__multiplier', { n: 1, city, action_radius })
		}
		await page.goto('/search?city=Annecy')
		// the title still counts Annecy only: the 8 and Annecy (74)
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('9 résultats pour « Annecy »')
		const titres = page.locator('[data-cy^="search-titre-"]')
		await expect(titres).toHaveText([
			'Autres maquilleuses du 74 (Haute-Savoie)',
			'Autres maquilleuses qui se déplacent',
			'Autres maquilleuses',
		])
		expect(await zones(page, 'departement')).toEqual(['Thonon-les-Bains (74)'])
		// the last updated first: Saint-Julien, Lyon, Nantes, Annemasse (the
		// fixture, 30 km), then Chambéry
		expect(await zones(page, 'deplacent')).toEqual([
			'Saint-Julien-en-Genevois et 30 km autour',
			'Lyon et 30 km autour',
			'Nantes et 30 km autour',
			'Annemasse et 30 km autour',
			'Chambéry (73) et 15 km autour',
		])
		expect(await zones(page, 'autres')).toEqual(['Grenoble', 'Zone non renseignée'])
		// every searchable profile, once
		const liens = await page.getByTestId('search-result').evaluateAll(cartes => cartes.map(a => a.getAttribute('href')))
		expect(liens).toHaveLength(17)
		expect(new Set(liens).size).toBe(liens.length)
		expect(await recherches()).toHaveLength(0)
		expect(await annuaires()).toHaveLength(1)

		// another city in the same visit: no call at all
		const formulaire = page.getByRole('search')
		await formulaire.getByLabel('Ville de la prestation').fill('Lyon')
		await formulaire.getByRole('button', { name: 'Trouver une maquilleuse' }).click()
		await expect(page).toHaveURL(/\/search\?city=Lyon$/)
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('1 résultat pour « Lyon »')
		await expect(cartes(page, 'autres').first()).toBeVisible()
		expect(await appelsRecherche()).toHaveLength(1)
	})

	test('un code postal tapé : son département est le lieu cherché, compté dans le titre', async ({ page }) => {
		await piloter('/__multiplier', { n: 1, city: 'Thonon-les-Bains 74200' })
		await piloter('/__multiplier', { n: 1, city: 'Annecy 74000' })
		await page.goto('/search?city=74000')
		// API #384 finds no « 74000 » (the public city is « Annecy (74) »):
		// the directory gives the two of the 74, Annecy alone is not known
		// to be in it (no geocoding)
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('2 résultats pour « 74000 »')
		expect((await zones(page, 'locaux')).sort()).toEqual([
			'Annecy (74) et 10 km autour',
			'Thonon-les-Bains (74) et 10 km autour',
		])
		await expect(page.getByTestId('search-titre-deplacent')).toHaveText('Autres maquilleuses qui se déplacent')
		await expect(page.getByTestId('search-titre-departement')).toHaveCount(0)
	})

	test('annuaire en panne : la recherche par ville dit son échec, « Réessayer » le relit', async ({ page }) => {
		await panne({ annuaire: 500 })
		await page.goto('/search?city=Annecy')
		await expect(page.getByTestId('search-error')).toBeVisible()
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('La recherche n’a pas abouti')
		await panne({ annuaire: null })
		await page.getByTestId('search-retry').click()
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('8 résultats pour « Annecy »')
		await expect(cartes(page, 'locaux')).toHaveCount(8)
		// the failed read is not kept: read again, never the search instead
		expect(await annuaires()).toHaveLength(2)
		expect(await recherches()).toHaveLength(0)
	})
})

function registerpublic1Scenario1({ erreursDeLaPage }) {
	test('/search?city=Annecy : sans erreur, un h1, la ville préremplie, un seul appel à l’API (l’annuaire)', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		await page.goto('/search?city=Annecy')
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^\d+ résultats pour « Annecy »$/)
		await expect(page.getByLabel('Ville de la prestation')).toHaveValue('Annecy')
		const cartes = page.getByTestId('search-result')
		await expect(cartes.first()).toBeVisible()
		// the unavailable profile is not in the results
		await expect(page.getByText('Inès Fictif')).toHaveCount(0)
		await expect(cartes.first()).toHaveAttribute('href', /^\/profil\//)
		expect(await appelsRecherche()).toHaveLength(1)
		expect(await annuaires()).toHaveLength(1)
		expect(erreurs).toEqual([])
	})
}

function registerpublic1Scenario2({ erreursDeLaPage, chercherDepuisLeFormulaire }) {
	test('formulaire de /search, un terme seul : /search?search=…, des cartes, une seule recherche, sans erreur', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		await chercherDepuisLeFormulaire(page, { terme: 'Soirée' })
		await expect(page).toHaveURL(/\/search\?search=Soir%C3%A9e$/)
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^\d+ résultats pour « Soirée »$/)
		await expect(page.getByTestId('search-result').first()).toBeVisible()
		const appels = await recherches()
		expect(appels).toHaveLength(1)
		// the term reaches the API, and no city
		const parametres = new URLSearchParams(appels[0].q)
		expect(parametres.get('search')).toBe('Soirée')
		expect(parametres.has('city')).toBe(false)
		expect(await annuaires()).toHaveLength(0)
		expect(erreurs).toEqual([])
	})
}

function registerpublic1Scenario3({ erreursDeLaPage, chercherDepuisLeFormulaire }) {
	test('formulaire de /search, un nom et une ville tapés : /search?search=…&city=…, la carte de la maquilleuse de cette ville, sans erreur', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		await chercherDepuisLeFormulaire(page, {
			terme: 'Nantaise',
			ville: 'Nantes',
		})
		await expect(page).toHaveURL(/\/search\?search=Nantaise&city=Nantes$/)
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('1 résultat pour « Nantaise » à « Nantes »')
		const cartes = page.getByTestId('search-result')
		await expect(cartes).toHaveCount(1)
		await expect(cartes).toContainText('Léa Nantaise')
		const appels = await recherches()
		expect(appels).toHaveLength(1)
		// the term and the city both reach the API, not only the page URL
		const parametres = new URLSearchParams(appels[0].q)
		expect(parametres.get('search')).toBe('Nantaise')
		expect(parametres.get('city')).toBe('Nantes')
		expect(await annuaires()).toHaveLength(0)
		expect(erreurs).toEqual([])
	})
}

function registerpublic1Scenario4({ erreursDeLaPage, chercherDepuisLeFormulaire }) {
	test('formulaire de /search, prénom et nom : la carte de cette maquilleuse ; ceux d’une maquilleuse indisponible : aucune carte, le message', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		await chercherDepuisLeFormulaire(page, { terme: 'Camille Fictive' })
		await expect(page).toHaveURL(/\/search\?search=Camille(\+|%20)Fictive$/)
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('1 résultat pour « Camille Fictive »')
		await expect(page.getByTestId('search-result')).toHaveCount(1)
		await expect(page.getByTestId('search-result')).toContainText('Camille Fictive')

		// available: false (Inès Fictif, ines-indispo): never a card
		await page.getByTestId('search-input').fill('Inès Fictif')
		await page.getByTestId('search-button').click()
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aucun résultat pour « Inès Fictif »')
		await expect(page.getByTestId('search-result')).toHaveCount(0)
		await expect(page.getByTestId('search-empty')).toContainText('Essayez un autre mot')
		expect(await recherches()).toHaveLength(2)
		expect(erreurs).toEqual([])
	})
}

function registerpublic1Scenario5() {
	test('API coupée (aucune réponse) : message en moins de 10 s, pour la recherche comme pour l’annuaire', async ({
		page,
	}) => {
		await panne({ delaiRechercheMs: 30_000 })
		for (const chemin of ['/search?search=mariage&city=Annecy', '/search?city=Annecy']) {
			const debut = Date.now()
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			await page.goto(chemin)
			await expect(page.getByTestId('search-error')).toBeVisible({
				timeout: 10_000,
			})
			expect(Date.now() - debut, chemin).toBeLessThan(10_000)
		}
		expect(await recherches()).toHaveLength(1)
		expect(await annuaires()).toHaveLength(1)
	})
}

function registerpublic1Scenario6({ erreursDeLaPage }) {
	test('ville seule depuis le formulaire de l’accueil : /search?city=…, un seul appel (l’annuaire)', async ({
		page,
	}) => {
		const erreurs = erreursDeLaPage(page)
		await page.goto('/')
		const formulaire = page.getByRole('search')
		await formulaire.getByLabel('Ville de la prestation').fill('Lyon')
		await formulaire.getByRole('button', { name: 'Trouver une maquilleuse' }).click()
		await expect(page).toHaveURL(/\/search\?city=Lyon$/)
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('1 résultat pour « Lyon »')
		expect(await appelsRecherche()).toHaveLength(1)
		expect(await annuaires()).toHaveLength(1)
		expect(erreurs).toEqual([])
	})
}

function registerpublic1Scenario7() {
	test('pages de 20 : plus de 50 résultats, toutes les pages atteintes sans nouvel appel, une nouvelle recherche en un appel', async ({
		page,
	}) => {
		// 60 more in Annecy (API #384: 200 cards at most, no more cut at 50):
		// the 68 of Annecy counted (UI-10), then the 5 others of the directory,
		// one call in all
		await piloter('/__multiplier', { n: 60, city: 'Annecy' })
		await page.goto('/search?city=Annecy')
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('68 résultats pour « Annecy »')
		const cartes = page.getByTestId('search-result')
		await expect(cartes).toHaveCount(20)
		const pagination = page.getByTestId('search-pagination')
		await expect(pagination).toContainText('Page 1 sur 4')
		await page.getByRole('link', { name: 'Page suivante' }).click()
		await expect(page).toHaveURL(/page=2/)
		await expect(pagination).toContainText('Page 2 sur 4')
		await expect(cartes).toHaveCount(20)
		await page.getByRole('link', { name: 'Page suivante' }).click()
		await page.getByRole('link', { name: 'Page suivante' }).click()
		await expect(page).toHaveURL(/page=4/)
		await expect(pagination).toContainText('Page 4 sur 4')
		await expect(page.getByRole('link', { name: 'Page suivante' })).toHaveCount(0)
		// 73 = 60 + 13: the last 8 of Annecy, then the 4 that travel and
		// Coquille, without a city
		await expect(cartes).toHaveCount(13)
		for (const [section, n] of [
			['locaux', 8],
			['deplacent', 4],
			['autres', 1],
		]) {
			// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
			await expect(page.getByTestId(`search-results-${section}`).getByTestId('search-result')).toHaveCount(n)
		}
		expect(await recherches()).toHaveLength(0)
		expect(await annuaires()).toHaveLength(1)

		const formulaire = page.getByRole('search')
		await formulaire.getByLabel('Prestation recherchée').fill('mariage')
		await formulaire.getByRole('button', { name: 'Trouver une maquilleuse' }).click()
		await expect(page).toHaveURL(/search=mariage&city=Annecy$/)
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^\d+ résultats? pour « mariage » à « Annecy »$/)
		await expect(page.getByTestId('search-result').first()).toBeVisible()
		// a term: the search, never the directory
		expect(await recherches()).toHaveLength(1)
		expect(await annuaires()).toHaveLength(1)
	})
}

function registerpublic1Scenario8() {
	test('annuaire coupé à 200 cartes par l’API : la recherche par ville lit aussi la recherche, pour les profils de la ville laissés de côté', async ({
		page,
	}) => {
		// 200 more in Annecy, then one in Grenoble: same date, a larger id,
		// so the directory (the last updated first, 200 at most) leaves it out
		await piloter('/__multiplier', { n: 200, city: 'Annecy' })
		await piloter('/__multiplier', { n: 1, city: 'Grenoble' })
		await page.goto('/search?city=Grenoble')
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('1 résultat pour « Grenoble »')
		await expect(page.getByTestId('search-results-locaux').getByTestId('search-result-zone')).toHaveText([
			'Grenoble et 10 km autour',
		])
		expect(await annuaires()).toHaveLength(1)
		expect(await recherches()).toHaveLength(1)
	})
}
