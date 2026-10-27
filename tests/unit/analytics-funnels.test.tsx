import { beforeEach, describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { readDepth } from '@/components/analytics/ArticleDepth'
import { leftPage, measureDelegatedClick } from '@/lib/analytics/delegated'
import { CTA_PLACES, eventData } from '@/lib/analytics/events'
import { createTrack, type MeasuredWindow } from '@/lib/analytics/track'
import { articleLinkKind, budgetUse, notFoundPath, routeOf, viewOrigin } from '@/lib/analytics/values'

/**
 * The funnels of 27/10/2026: the addresses and origins the events carry (never a name, a query or a typed word), the
 * clicks the markup reports by itself (`data-cta`, `data-share`, `data-card-origin`, the links of an article) and the
 * depth of the reading of an article.
 */

const ROOT = path.resolve(import.meta.dir, '../..')
const ORIGIN = 'https://exemple.test'

describe('la route : le motif de la page, jamais son adresse', () => {
	test.each([
		['/', '/'],
		['/profil/zoe-fictive', '/profil/[slug]'],
		['/Profil/zoe-fictive?utm_source=x#haut', '/profil/[slug]'],
		['/talent/maquillage-mariee', '/talent/[slug]'],
		['/blog/un-article', '/blog/[slug]'],
		['/blog', '/blog'],
		['/maquilleuses/74', '/maquilleuses/[department]'],
		['/search?search=lea@example.test&city=Annecy', '/search'],
		['/auth/profil', '/auth/profil'],
		['/classement', '/classement'],
	])('%s : %s', (path, route) => {
		expect(routeOf(path)).toBe(route)
	})
})

describe('la 404 : l’adresse qui a manqué, sans le nom d’une maquilleuse', () => {
	test.each([
		['/profil/zoe-fictive', '/profil/[slug]'],
		['/PROFIL/ancien-nom/encore', '/profil/[slug]'],
		['/talent/maquillage-inconnu', '/talent/maquillage-inconnu'],
		['/blog/article-supprime?utm_source=x#haut', '/blog/article-supprime'],
		['/wp-login.php', '/wp-login.php'],
		['/search?search=lea@example.test', '/search'],
		['/contact/lea@example.test', '/contact/[masqué]'],
		['/contact/lea%40example.test', '/contact/[masqué]'],
		['/appel/06%2012%2034%2056%2078', '/appel/[masqué]'],
	])('%s : %s', (path, attendu) => {
		const found = notFoundPath(path)
		expect(found).toBe(attendu)
		expect(eventData('not_found', { kind: 'autre', path: found })).not.toBeNull()
	})
})

describe('le budget, l’origin d’une visite, la destination d’un lien d’article', () => {
	test('budgetUse : quelles bornes du prix ont été posées', () => {
		expect(budgetUse(null, null)).toBe('aucun')
		expect(budgetUse(50, null)).toBe('minimum')
		expect(budgetUse(null, 200)).toBe('maximum')
		expect(budgetUse(50, 200)).toBe('fourchette')
	})

	test.each([
		[null, '', 'direct'],
		[null, 'pas une adresse', 'direct'],
		[null, 'https://www.google.com/search?q=maquilleuse', 'externe'],
		[null, `${ORIGIN}/search?search=x`, 'recherche'],
		[null, `${ORIGIN}/maquilleuses/74`, 'zone'],
		[null, `${ORIGIN}/talent/maquillage-mariee`, 'talent'],
		[null, `${ORIGIN}/classement`, 'classement'],
		[null, `${ORIGIN}/blog/un-article`, 'blog'],
		[null, `${ORIGIN}/`, 'accueil'],
		[null, `${ORIGIN}/a-propos`, 'autre_page'],
		// Next moves from page to page without changing `document.referrer`: the page the link was clicked on wins.
		['/search', 'https://www.google.com/', 'recherche'],
		['/', '', 'accueil'],
		['/blog/un-article', '', 'blog'],
	] as const)('page quittée %p, référent %p : %s', (page, referrer, origin) => {
		expect(viewOrigin(page, referrer, ORIGIN)).toBe(origin)
	})

	test.each([
		['/search?city=Annecy', 'recherche'],
		['/auth/signup', 'inscription'],
		['/profil/zoe-fictive', 'profil'],
		['/talent/maquillage-mariee', 'interne'],
		['/blog/un-autre-article', 'interne'],
		[`${ORIGIN}/classement`, 'interne'],
		['https://www.cnil.fr/', 'externe'],
		['mailto:contact@example.test', 'externe'],
	] as const)('lien %s : %s, jamais l’adresse', (href, kind) => {
		expect(articleLinkKind(href, ORIGIN)).toBe(kind)
	})
})

describe('les clics que le balisage dit lui-même', () => {
	const received: { nom: string; donnees: Record<string, string | number | boolean> }[] = []
	const world: MeasuredWindow = {
		navigator: { webdriver: false },
		umami: { track: (nom, donnees) => void received.push({ nom, donnees }) },
	}
	const report = createTrack(() => ({ fenetre: world, production: true }))
	const document = new JSDOM('').window.document

	/** A fragment in the page of the test, and the link of a given id. */
	function link(html: string, id = 'lien'): Element {
		document.body.innerHTML = html
		const found = document.getElementById(id)
		if (!found) throw new Error(`pas de #${id}`)
		return found
	}
	const click = (target: Element | null, path = '/') => measureDelegatedClick(target, { origin: ORIGIN, path }, report)

	beforeEach(() => {
		received.length = 0
		leftPage.from = null
	})

	test('data-cta : cta_click avec le mot du lien et la route de la page, jamais l’adresse', () => {
		click(
			link('<footer><a id="lien" href="/contact" data-cta="footer_contact">Contact</a></footer>'),
			'/blog/un-article'
		)
		expect(received).toEqual([{ nom: 'cta_click', donnees: { where: 'footer_contact', page: '/blog/[slug]' } }])
	})

	test('le clic sur un enfant du lien compte, et un lien sans balise ne compte rien', () => {
		click(link('<a id="lien" href="/x" data-cta="nav_blog"><span id="dedans">Blog</span></a>', 'dedans'))
		expect(received.map(e => e.nom)).toEqual(['cta_click'])
		received.length = 0
		click(link('<a id="lien" href="/x">Rien</a>'))
		click(null)
		click(link('<p id="lien">pas un lien</p>'))
		expect(received).toEqual([])
	})

	test('un mot hors du catalogue ne part pas', () => {
		click(link('<a id="lien" href="/x" data-cta="un_mot_invente">x</a>'))
		expect(received).toEqual([])
	})

	test('data-share : share_click avec le réseau', () => {
		click(link('<a id="lien" href="https://www.linkedin.com/sharing" data-share="linkedin">in</a>'), '/blog/un-article')
		expect(received).toEqual([{ nom: 'share_click', donnees: { network: 'linkedin', page: '/blog/[slug]' } }])
	})

	test('une carte : l’origin, le profil et le rang parmi les cartes visibles (les cartes cachées ne comptent pas)', () => {
		document.body.innerHTML = `<ul>
			<li id="a"><a href="/profil/a" data-card-origin="mise_en_avant" data-card-pid="11">A</a></li>
			<li id="b"><a href="/profil/b" data-card-origin="mise_en_avant" data-card-pid="12">B</a></li>
			<li id="c"><a id="lien" href="/profil/c" data-card-origin="mise_en_avant" data-card-pid="v3-5">C</a></li>
		</ul>`
		// The stylesheet of « Mise en avant » hides the cards that were not drawn: they have no box.
		for (const id of ['a', 'b', 'c']) {
			const item = document.getElementById(id) as unknown as { getClientRects: () => unknown[] }
			item.getClientRects = () => (id === 'a' ? [] : [{}])
		}
		click(document.getElementById('lien'), '/')
		expect(received).toEqual([{ nom: 'card_click', donnees: { origin: 'mise_en_avant', rank: 2, pid: 'v3-5' } }])
	})

	test('un lien du texte d’un article : sa destination en un mot ; un lien de la page, hors du texte : rien', () => {
		click(
			link('<div data-article-body=""><p><a id="lien" href="https://www.cnil.fr/">cnil</a></p></div>'),
			'/blog/un-article'
		)
		expect(received).toEqual([{ nom: 'article_link_click', donnees: { kind: 'externe', page: '/blog/[slug]' } }])
		received.length = 0
		click(link('<div data-article-body=""><a id="lien" href="#section">ancre</a></div>'), '/blog/un-article')
		click(link('<main><a id="lien" href="https://www.cnil.fr/">cnil</a></main>'), '/blog/un-article')
		expect(received).toEqual([])
	})

	test('un lien du site garde la page quittée pour la vue du profil suivant ; un lien d’ailleurs non', () => {
		click(link('<a id="lien" href="/profil/zoe">Zoé</a>'), '/search')
		expect(leftPage.from).toBe('/search')
		leftPage.from = null
		click(link('<a id="lien" href="https://www.instagram.com/x/">ig</a>'), '/search')
		click(link('<a id="lien" href="#haut">haut</a>'), '/search')
		expect(leftPage.from).toBeNull()
	})

	test('rien d’autre que des mots, une route, un rang et un pid ne part, même avec une adresse et un texte personnels', () => {
		click(
			link(
				'<a id="lien" href="/contact?email=lea@example.test" data-cta="footer_contact">06 12 34 56 78 lea@example.test</a>'
			),
			'/profil/lea-dupont'
		)
		const everything = JSON.stringify(received)
		expect(everything).not.toContain('example.test')
		expect(everything).not.toContain('06 12')
		expect(everything).not.toContain('lea-dupont')
		expect(received).toEqual([{ nom: 'cta_click', donnees: { where: 'footer_contact', page: '/profil/[slug]' } }])
	})
})

describe('les mots des appels à l’action sont ceux du catalogue, et chacun sert', () => {
	function sources(dossier: string): string[] {
		return readdirSync(path.join(ROOT, dossier), { recursive: true, withFileTypes: true })
			.filter(entree => entree.isFile() && /\.tsx?$/.test(entree.name))
			.map(entree => path.join(entree.parentPath, entree.name))
	}
	const code = sources('src').map(fichier => readFileSync(fichier, 'utf8'))
	const used = new Set<string>()
	for (const text of code) {
		for (const found of text.matchAll(/data-cta="([a-z_]+)"/g)) used.add(found[1] ?? '')
		for (const found of text.matchAll(/\bcta: '([a-z_]+)'/g)) used.add(found[1] ?? '')
		for (const found of text.matchAll(/where: '((?:cta|nav|accueil)_[a-z_]+)'/g)) used.add(found[1] ?? '')
	}
	// The search button of the bar is told apart by the width of the screen, in TrackedLink.
	used.add('nav_recherche')
	used.add('nav_recherche_mobile')

	test('chaque mot posé dans le balisage est un mot du catalogue', () => {
		expect([...used].filter(mot => !(CTA_PLACES as readonly string[]).includes(mot))).toEqual([])
	})

	test('chaque mot du catalogue est posé quelque part : pas de mot mort', () => {
		expect(CTA_PLACES.filter(mot => !used.has(mot))).toEqual([])
	})
})

describe('la profondeur de lecture d’un article', () => {
	test('la part du texte passée sous le bas de l’écran, de 0 à 1', () => {
		// Text 2000 px high, its top at 700 px below the top of a 800 px screen: 100 px read.
		expect(readDepth(700, 2000, 800)).toBeCloseTo(0.05)
		expect(readDepth(-300, 2000, 800)).toBeCloseTo(0.55)
		expect(readDepth(-1000, 2000, 800)).toBeCloseTo(0.9)
		expect(readDepth(-5000, 2000, 800)).toBe(1)
		expect(readDepth(900, 2000, 800)).toBe(0)
		expect(readDepth(0, 0, 800)).toBe(0)
	})
})
