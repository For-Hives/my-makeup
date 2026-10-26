/**
 * The home hero « en arche » (decisions of 25/10/2026, docs/accueil.md): three elements and no more (the h1 on three
 * lines, type alone, one sentence, the guided search), the ribbon of the real specialties, the poster of the arch
 * and the rules of its film (when the videos come, when they play), the badge that leads to the search (26/10/2026),
 * the pause button that shows only at the keyboard focus, and the stylesheet rules that keep the loops behind the
 * script and under `no-preference`. What only a browser shows (the film playing, the ring turning, the swap, the
 * layout) is in tests/e2e/home-hero.spec.ts.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import {
	ARCH_OBSERVER_STEPS,
	archSeenBy,
	FILM_SIZE,
	FILM_STILLS,
	FILM_VIDEOS,
	FILM_VIEW_RATIO,
	type FilmConditions,
	fallbackOf,
	mountsFilm,
	POSTER_PRELOADS,
	pauseButtonName,
	playsFilm,
	STILL_PLACEHOLDERS,
} from '@/components/home/film'
import { ArchFilm, HeroStage, PauseButton } from '@/components/home/HeroFilm'
import * as homeHero from '@/components/home/HomeHero'
import { SEARCH_LINK } from '@/components/layout/links'
import { SPECIALTY_BULLETS } from '@/lib/specialty'
import { openWindow } from '../support/dom-react'
import { mainTitles, sha256, titleFingerprint } from '../support/url-parity'

const ROOT = join(import.meta.dir, '../..')
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8')
/** The h1 of the home page since 25/10/2026 (register line `accueil-titre`): no longer the one of the site online. */
const HOME_H1 = 'Trouvez la maquilleuse qui vous correspond près de chez vous.'
const ONLINE_H1 = "Trouver la maquilleuse qui vous correspond n'a jamais été aussi simple"
const { EXPLORE_LABEL, HomeHero, RIBBON_WORDS, RING_TEXT } = homeHero
const html = renderToStaticMarkup(<HomeHero />)

/** The opening tag and the inside of the first element whose opening tag matches. */
function element(markup: string, opening: RegExp): string {
	const start = markup.search(opening)
	expect(start).toBeGreaterThan(-1)
	return markup.slice(start)
}

describe('le titre : trois lignes, des mots seuls', () => {
	test('un seul h1, le nouveau titre (registre `accueil-titre`) : plus celui du site en ligne', () => {
		expect(mainTitles(html)).toEqual([HOME_H1])
		expect(titleFingerprint(html)).toEqual({ n: 1, sha: sha256(HOME_H1) })
		expect(mainTitles(html)).not.toContain(ONLINE_H1)
	})

	test('le texte du h1, lu comme un navigateur, n’a ni espace en trop ni espace manquante entre ses lignes', () => {
		// Parsed as a browser does, and read without collapsing the spaces: what textContent gives.
		const document = new JSDOM(html).window.document
		expect(document.querySelector('h1')?.textContent).toBe(HOME_H1)
		expect([...document.querySelectorAll('h1 .home-hero-line')].map(line => line.textContent)).toEqual([
			'Trouvez la maquilleuse',
			'qui vous correspond',
			'près de chez vous.',
		])
		// On a narrow phone « maquilleuse » takes a line of its own (globals.css): a span, so the text keeps its space.
		expect([...document.querySelectorAll('h1 .home-hero-split')].map(word => word.textContent)).toEqual(['maquilleuse'])
	})

	test('aucune image dans le titre, et plus aucun fichier de pastille servi', () => {
		// Andy, 25/10/2026: the film was « trop sensuel », two faces about to touch; the picture of the heading was a crop
		// of it (the lips of the two profiles). The heading is type alone now, and the crop is no longer served.
		const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? ''
		expect(h1).not.toMatch(/<(picture|img|svg)\b/)
		expect(Object.keys(homeHero)).not.toContain('HERO_PILL')
		expect(readdirSync(join(ROOT, 'public/assets/accueil')).filter(name => name.startsWith('pilule-'))).toEqual([])
		expect(read('src/app/(front)/globals.css')).not.toContain('.home-hero-pill')
	})

	test('le mot « qui vous correspond » est en italique rouge, et le titre entre par son masque', () => {
		expect(html).toContain('<em>qui vous correspond</em>')
		expect(element(html, /<h1\b/).slice(0, 80)).toContain('enter-mask')
	})
})

describe('le texte et le formulaire : rien de plus', () => {
	test('une seule phrase courte, avec l’espace insécable après « à », qui ne redit pas les choix de la recherche', () => {
		const lede = new JSDOM(html).window.document.querySelector('.home-hero-lede')?.textContent
		expect(lede).toBe('Des maquilleuses professionnelles, à\u00a0contacter en direct.')
		// The events are the choices of the select and the words of the ribbon: the sentence does not list them again.
		expect(lede).not.toMatch(/mariage|soirée|shooting/i)
		expect(lede).not.toMatch(/\d/)
		expect(lede).not.toMatch(/milliers|gratuit|meilleur|garanti|paiement sécurisé|avis vérifiés/i)
		expect(html).not.toContain('Trouvez la maquilleuse spécialisée dans le domaine que vous recherchez')
	})

	test('ni surtitre ni lignes numérotées : le titre, la phrase et la recherche, dans cet ordre', () => {
		// Andy, 25/10/2026: fewer elements, to the essential. The eyebrow and the three lines i. ii. iii. are gone.
		const document = new JSDOM(html).window.document
		const text = document.querySelector('.home-hero-text')
		expect([...(text?.children ?? [])].map(child => child.className.split(' ')[0])).toEqual([
			'home-hero-title',
			'home-hero-lede',
			'home-hero-search',
		])
		expect(html).not.toContain('Maquilleuses professionnelles, partout en France')
		expect(document.querySelector('.home-hero ol')).toBeNull()
		for (const line of ['Cherchez par événement et par lieu', 'Consultez des profils vérifiés'])
			expect(html).not.toContain(line)
	})

	test('le formulaire guidé est dans le haut de page, la mesure de la recherche dans le même formulaire', () => {
		expect(html).toContain('action="/search"')
		const form = /<form\b[\s\S]*?<\/form>/.exec(html)?.[0] ?? ''
		expect(form).toContain('id="accueil-evenement"')
		expect(form).toContain('id="accueil-lieu"')
		expect(form).toContain('type="submit"')
	})

	test('les deux champs ont chacun une icône décorative du kit, un calendrier et un repère, sous leur libellé visible', () => {
		const form = /<form\b[\s\S]*?<\/form>/.exec(html)?.[0] ?? ''
		const icons = form.match(/<svg\b[^>]*class="guided-search-icon"[^>]*>[\s\S]*?<\/svg>/g) ?? []
		expect(icons).toHaveLength(2)
		for (const icon of icons) expect(icon).toContain('aria-hidden="true"')
		// The calendar and the pin of the art direction kit (`Icon`, the icons of the search page): no four-point star,
		// which Andy refused on 25/10/2026 (docs/direction-artistique.md).
		expect(icons[0]).toMatch(/<rect\b/)
		expect(icons[1]).toMatch(/<circle\b/)
		expect(form).not.toContain('M12 4c.5 4.6')
		expect(form).toContain('<label for="accueil-evenement" class="guided-search-label">Pour quel événement ?</label>')
		expect(form).toContain('<label for="accueil-lieu" class="guided-search-label">Où ?</label>')
		expect(form).not.toContain('sr-only')
	})

	test('l’ordre de l’entrée reste à deux rangs au plus (660 ms en tout)', () => {
		const source = read('src/components/home/HomeHero.tsx')
		expect(source).toMatch(/enterOrder\(index: 1 \| 2\)/)
		expect(source).not.toMatch(/enterOrder\(\s*[3-9]/)
	})
})

describe('le bandeau des spécialités', () => {
	test('ses mots sont les spécialités que la recherche connaît, sans ville, sans nombre, sans promesse', () => {
		expect(RIBBON_WORDS).toEqual(SPECIALTY_BULLETS.map(bullet => bullet.label))
		for (const word of RIBBON_WORDS) {
			expect(word).not.toMatch(/\d/)
			expect(word).not.toMatch(/milliers|paiement sécurisé|avis vérifiés|réservation|gratuit|meilleur/i)
		}
	})

	test('une liste lue, puis des copies cachées aux lecteurs d’écran ; pas une section de l’accueil', () => {
		const ribbon = element(html, /<div class="home-hero-ribbon"/)
		const lists = ribbon.match(/<ul\b[^>]*>/g) ?? []
		expect(lists).toHaveLength(4)
		expect(lists[0]).toContain('aria-label="Spécialités"')
		expect(lists.slice(1).every(list => list.includes('aria-hidden="true"'))).toBe(true)
		expect(html).not.toContain('home-section')
	})
})

describe('l’arche et son affiche', () => {
	const arch = element(html, /<div class="home-hero-arch"/)
	const picture = /<picture>[\s\S]*?<\/picture>/.exec(arch)?.[0] ?? ''

	test('le serveur dessine l’affiche : la fin du film avec un mouvement réduit, le début sinon, à une taille donnée', () => {
		for (const { src, type } of FILM_STILLS.end)
			expect(picture).toContain(`<source media="(prefers-reduced-motion: reduce)" srcSet="${src}" type="${type}"/>`)
		for (const { src, type } of FILM_STILLS.start) expect(picture).toContain(`<source srcSet="${src}" type="${type}"/>`)
		expect(picture).toContain(`src="${FILM_STILLS.start.at(-1)?.src}"`)
		expect(picture).toContain(`width="${FILM_SIZE.width}" height="${FILM_SIZE.height}"`)
		expect(picture).toContain('alt=""')
		expect(picture).toContain('object-cover')
	})

	test('la description du film est sur l’arche, toujours là : sur un téléphone l’affiche reste cachée tant que l’arche n’est pas vue', () => {
		// A screen reader moving through the page linearly passes the arch before it counts as seen: the description lives on
		// the box, which is never hidden, and the poster under it says nothing, so the description is read once.
		const box = /<div class="home-hero-arch"[^>]*>/.exec(arch)?.[0] ?? ''
		expect(box).toContain('role="img"')
		expect(box).toMatch(/aria-label="[^"]{20,}"/)
	})

	test('l’affiche attend son tour sur un téléphone ; là où l’arche est dans le premier écran, chaque préchargement est le fichier que la <picture> y prend', () => {
		// Below the first screen of a phone, upright or sideways: asked once the page is laid out, never before the largest
		// paint there (P01).
		const image = /<img\b[^>]*>/.exec(picture)?.[0] ?? ''
		expect(image).toContain('loading="lazy"')
		expect(image).not.toMatch(/fetchpriority/i)
		// What the <picture> takes in a browser that reads AVIF: the first source whose media applies, by motion setting.
		const sources = [...picture.matchAll(/<source (?:media="([^"]+)" )?srcSet="([^"]+)" type="([^"]+)"\/>/g)].map(
			([, media, src, type]) => ({ media, src, type })
		)
		expect(sources).toHaveLength(FILM_STILLS.start.length + FILM_STILLS.end.length)
		const taken = (motion: 'reduce' | 'no-preference') =>
			sources.find(
				source =>
					(source.media === undefined || source.media === `(prefers-reduced-motion: ${motion})`) &&
					source.type === 'image/avif'
			)?.src
		// The screens where the arch is in the first screen (film.ts, measured): from 64rem, beside the text, unless the
		// screen is very low; from 40rem, under the text, on a tablet held upright. Not a phone held sideways (844 × 390):
		// there the arch is under the text, far below the first screen. Each item carries the motion setting.
		expect(POSTER_PRELOADS).toEqual([
			{
				href: taken('no-preference') ?? 'aucune',
				type: 'image/avif',
				media:
					'(min-width: 64rem) and (min-height: 22rem) and (prefers-reduced-motion: no-preference), (min-width: 40rem) and (min-height: 50rem) and (prefers-reduced-motion: no-preference)',
			},
			{
				href: taken('reduce') ?? 'aucune',
				type: 'image/avif',
				media:
					'(min-width: 64rem) and (min-height: 22rem) and (prefers-reduced-motion: reduce), (min-width: 40rem) and (min-height: 50rem) and (prefers-reduced-motion: reduce)',
			},
		])
		// The hero writes them (React puts them in the head of the page), high priority: there the poster is the LCP.
		expect([...(html.match(/<link rel="preload"[^>]*>/g) ?? [])]).toEqual(
			POSTER_PRELOADS.map(
				({ href, type, media }) =>
					`<link rel="preload" href="${href}" as="image" type="${type}" fetchPriority="high" media="${media}"/>`
			)
		)
	})

	test('l’arche n’est jamais dans un bloc en fondu : elle entre par un masque', () => {
		const wrap = /<div class="([^"]*home-hero-arch-wrap[^"]*)"/.exec(html)?.[1] ?? ''
		expect(wrap).toContain('enter-arch')
		expect(wrap).not.toContain('enter-fade')
		// No video and no pause button in the HTML of the server: they come with the script, when motion is welcome.
		expect(html).not.toContain('<video')
		expect(html).not.toContain('data-hero-motion')
		expect(html).not.toContain('home-hero-pause')
	})

	test('sans script, l’image de fin, nette, couvre l’affiche du début : le film ne viendra pas la mettre au point', () => {
		const noscript = /<noscript>([\s\S]*?)<\/noscript>/.exec(arch)?.[1] ?? ''
		expect(noscript).toContain(`src="${fallbackOf(FILM_STILLS.end)}"`)
		for (const { src, type } of FILM_STILLS.end) expect(noscript).toContain(`<source srcSet="${src}" type="${type}"/>`)
		expect(noscript).toContain('alt=""')
		expect(noscript).toContain(`width="${FILM_SIZE.width}" height="${FILM_SIZE.height}"`)
	})

	test('chaque fichier du film existe, porte sa version dans son nom, et le meilleur format vient d’abord', () => {
		const all = [...FILM_VIDEOS.intro, ...FILM_VIDEOS.loop, ...FILM_STILLS.start, ...FILM_STILLS.end]
		for (const { src } of all) {
			expect(src).toMatch(/^\/assets\/accueil\/ombre-nette-[a-z]+-v\d+\.[a-z0-9.]+$/)
			expect(existsSync(join(ROOT, 'public', src))).toBe(true)
		}
		// A former render leaves the folder with its names: only the files listed here are served.
		const served = readdirSync(join(ROOT, 'public/assets/accueil')).filter(name => name.startsWith('ombre-nette-'))
		expect(served.sort()).toEqual(all.map(({ src }) => src.split('/').at(-1) ?? '').sort())
		// The codecs read from the files themselves (av1C, hvcC and avcC boxes): AV1 10 bits, then HEVC Main 10 for
		// Safari, then H.264 for what plays neither.
		for (const part of [FILM_VIDEOS.intro, FILM_VIDEOS.loop]) {
			expect(part.map(source => source.type)).toEqual([
				'video/mp4; codecs="av01.0.08M.10"',
				'video/mp4; codecs="hvc1.2.4.L120.90"',
				'video/mp4; codecs="avc1.640032"',
			])
		}
		for (const still of [FILM_STILLS.start, FILM_STILLS.end])
			expect(still.map(source => source.type)).toEqual(['image/avif', 'image/webp'])
		expect(FILM_SIZE.width / FILM_SIZE.height).toBeCloseTo(0.77, 2)
	})

	test('sous chaque image fixe, sa copie floue : 10 × 13 px, quelques centaines d’octets, faite de cette image', async () => {
		for (const [part, still] of [
			['start', FILM_STILLS.start],
			['end', FILM_STILLS.end],
		] as const) {
			const uri = STILL_PLACEHOLDERS[part]
			expect(uri).toMatch(/^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/)
			const bytes = Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64')
			expect(bytes.length).toBeLessThan(600)
			const copy = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true })
			expect([part, copy.info.width, copy.info.height]).toEqual([part, 10, 13])
			// A new render without new copies fails here: the copy is the still, made small (film.ts gives the recipe).
			const made = await sharp(join(ROOT, 'public', fallbackOf(still)))
				.resize(10, 13, { fit: 'cover' })
				.removeAlpha()
				.raw()
				.toBuffer()
			let sum = 0
			for (let index = 0; index < made.length; index++) sum += ((copy.data[index] ?? 0) - (made[index] ?? 0)) ** 2
			expect([part, Math.sqrt(sum / made.length) / 255 < 0.02]).toEqual([part, true])
		}
		// In the HTML of the arch, not in the stylesheet every page loads.
		expect(arch).toContain(`--arch-placeholder-start:url(${STILL_PLACEHOLDERS.start})`)
		expect(arch).toContain(`--arch-placeholder-end:url(${STILL_PLACEHOLDERS.end})`)
		expect(read('src/app/(front)/globals.css')).not.toContain('data:image/webp')
	})

	test('les images fixes sont à la taille du rendu : nettes sur un écran de densité 2', async () => {
		for (const { src } of [...FILM_STILLS.start, ...FILM_STILLS.end]) {
			const { width, height } = await sharp(join(ROOT, 'public', src)).metadata()
			expect({ src, width, height }).toEqual({ src, ...FILM_SIZE })
		}
	})
})

describe('le badge de l’arche : « Explorer les maquilleuses », son nom tourne autour', () => {
	// Andy, 26/10/2026: « plutôt que d'avoir un bouton pause […] une petite flèche d'explorer avec un texte tout autour ».
	const document = new JSDOM(html).window.document
	const badge = document.querySelector('.home-hero-badge')

	test('un lien vers la recherche, celle de « Trouver une maquilleuse », nommé par les mots de son anneau', () => {
		const links = [...(badge?.querySelectorAll('a') ?? [])]
		expect(links).toHaveLength(1)
		const link = links[0] as HTMLAnchorElement
		expect(link.getAttribute('href')).toBe(SEARCH_LINK.href)
		expect(link.getAttribute('href')).toBe('/search')
		expect(link.getAttribute('aria-label')).toBe('Explorer les maquilleuses')
		expect(link.className).toBe('home-hero-disc')
		// The words a visitor reads round the disc are those of its name (WCAG 2.5.3, the label in the name).
		expect(RING_TEXT.toLowerCase().startsWith(EXPLORE_LABEL.toLowerCase())).toBe(true)
		// The arrow of the kit, which steps forward under the pointer (`.art-arrow`), drawn and hidden from readers.
		const arrow = link.querySelector('svg')
		expect(arrow?.getAttribute('class')).toBe('art-arrow home-hero-arrow')
		expect(arrow?.getAttribute('aria-hidden')).toBe('true')
		expect(link.textContent).toBe('')
	})

	test('le badge est hors de l’arche, qui est une image pour les lecteurs d’écran : le lien y garde son rôle', () => {
		expect(badge?.closest('[role="img"]')).toBeNull()
		expect(badge?.parentElement?.className).toContain('home-hero-arch-wrap')
		// Server markup: the link works without script and with reduced motion; no button there, the pause comes with
		// the script.
		expect(badge?.querySelector('button')).toBeNull()
	})

	test('l’anneau : le nom en capitales, une fois autour du cercle, décor caché aux lecteurs d’écran', () => {
		const ring = badge?.querySelector('svg.home-hero-ring')
		expect(ring?.getAttribute('aria-hidden')).toBe('true')
		expect(ring?.getAttribute('focusable')).toBe('false')
		expect(ring?.getAttribute('viewBox')).toBe('0 0 112 112')
		const textPath = ring?.querySelector('textPath')
		// A no-break space at the end: an ordinary one would be dropped, and the dot would touch the « E » where it closes.
		expect(textPath?.textContent).toBe('EXPLORER LES MAQUILLEUSES · ')
		expect(RING_TEXT).toBe(`${EXPLORE_LABEL.toUpperCase()} · `)
		// Spaced to fill its circle once: the length of the circle of radius 37 it runs on.
		const path = ring?.querySelector(`path#${textPath?.getAttribute('href')?.slice(1)}`)
		expect(path?.getAttribute('d')).toBe('M56 56m-37 0a37 37 0 1 1 74 0a37 37 0 1 1 -74 0')
		expect(Number(textPath?.getAttribute('textLength'))).toBeCloseTo(2 * Math.PI * 37, 1)
		expect(textPath?.getAttribute('lengthAdjust')).toBe('spacing')
	})

	test('le clic se mesure comme les autres chemins vers la recherche : `cta_click`, à part (`accueil_explorer`)', () => {
		// The catalogue holds the value (tests/unit/analytics-events.test.ts); the link reports it (TrackedLink).
		expect(read('src/components/home/HomeHero.tsx')).toContain(
			"suivi={{ nom: 'cta_click', proprietes: { where: 'accueil_explorer' } }}"
		)
	})
})

describe('quand le film vient, quand il joue', () => {
	const ready: FilmConditions = {
		reducedMotion: false,
		saveData: false,
		inView: true,
		onScreen: true,
		visible: true,
		settled: true,
		userPaused: false,
		refused: false,
	}

	test('l’arche compte comme vue à 80 % d’elle, ou à 80 % de la hauteur de l’écran : jamais son seul haut', () => {
		// The shares a phone shows at load (measured in Chromium, film.ts): 0.40 at 412 × 823, 0.50 at 390 × 844, 0.65 at
		// 430 × 932. None is seen: the film waits for a scroll.
		expect(FILM_VIEW_RATIO).toBe(0.8)
		expect(archSeenBy({ ratio: 0.395, height: 153 }, 823)).toBe(false)
		expect(archSeenBy({ ratio: 0.503, height: 183 }, 844)).toBe(false)
		expect(archSeenBy({ ratio: 0.645, height: 262 }, 932)).toBe(false)
		expect(archSeenBy({ ratio: 0.8, height: 291 }, 844)).toBe(true)
		expect(archSeenBy({ ratio: 1, height: 523 }, 900)).toBe(true)
		// A phone held sideways (844 × 390): the arch, 539 px tall, never fits; filling the screen counts.
		expect(archSeenBy({ ratio: 0.72, height: 390 }, 390)).toBe(true)
		expect(archSeenBy({ ratio: 0.5, height: 270 }, 390)).toBe(false)
		expect(archSeenBy({ ratio: 0, height: 0 }, 0)).toBe(false)
	})

	test('les vidéos ne viennent qu’avec toutes les conditions : chacune manquante les retient', () => {
		expect(mountsFilm(ready)).toBe(true)
		for (const missing of [
			{ reducedMotion: true },
			{ saveData: true },
			{ inView: false },
			{ visible: false },
			{ settled: false },
			{ userPaused: true },
			{ refused: true },
		])
			expect(mountsFilm({ ...ready, ...missing })).toBe(false)
	})

	test('une fois là, le film s’arrête hors de l’écran, dans un onglet derrière ou sur demande, et repart sans attendre', () => {
		expect(playsFilm(ready)).toBe(true)
		expect(playsFilm({ ...ready, settled: false })).toBe(true)
		for (const missing of [{ onScreen: false }, { visible: false }, { userPaused: true }, { refused: true }])
			expect(playsFilm({ ...ready, ...missing })).toBe(false)
	})

	test('le film qui joue ne se fige pas quand l’arche commence à sortir de l’écran : il s’arrête quand elle en est sortie', () => {
		// The share that brings the film (80 %) is not the one that stops it: a scroll of a few hundred pixels on a
		// desktop leaves most of the arch in sight, and the film keeps playing until none of it is.
		expect(playsFilm({ ...ready, inView: false, onScreen: true })).toBe(true)
		expect(playsFilm({ ...ready, inView: false, onScreen: false })).toBe(false)
	})

	test('le bouton de pause dit ce qu’un appui fait', () => {
		expect(pauseButtonName(false)).toBe('Mettre le film en pause')
		expect(pauseButtonName(true)).toBe('Lire le film')
	})
})

describe('la partie qui bouge, dans une fausse fenêtre', () => {
	const jsdomWindow = openWindow()
	type Entry = {
		intersectionRatio: number
		isIntersecting: boolean
		intersectionRect: { height: number }
		rootBounds: { height: number }
	}
	type Observer = { callback: (entries: Entry[]) => void; threshold: readonly number[] }
	let observer: Observer | undefined
	let calls: string[] = []
	let refuse = false

	function setUp({
		reduced,
		saveData = false,
		withObserver = true,
	}: {
		reduced: boolean
		saveData?: boolean
		withObserver?: boolean
	}): void {
		const w = jsdomWindow.w as unknown as Record<string, unknown>
		w.matchMedia = (query: string) => ({
			matches: reduced && query.includes('prefers-reduced-motion: reduce'),
			addEventListener: () => {},
			removeEventListener: () => {},
		})
		Object.defineProperty(jsdomWindow.w.navigator, 'connection', { configurable: true, value: { saveData } })
		if (withObserver)
			(globalThis as Record<string, unknown>).IntersectionObserver = class {
				constructor(callback: Observer['callback'], options: { threshold: readonly number[] }) {
					observer = { callback, threshold: options.threshold }
				}
				observe() {}
				disconnect() {}
			}
		const media = (w.HTMLMediaElement as { prototype: Record<string, unknown> }).prototype
		media.play = function (this: HTMLVideoElement) {
			calls.push(`play ${this.loop ? 'loop' : 'intro'}`)
			return refuse
				? Promise.reject(new DOMException('refusé', 'NotAllowedError'))
				: Promise.resolve().then(() => this.dispatchEvent(new Event('playing')))
		}
		media.pause = function (this: HTMLVideoElement) {
			calls.push(`pause ${this.loop ? 'loop' : 'intro'}`)
			this.dispatchEvent(new Event('pause'))
		}
	}

	const mount = () =>
		jsdomWindow.monter(
			<HeroStage className="home-hero">
				<div className="home-hero-arch">
					<ArchFilm />
				</div>
				<PauseButton />
			</HeroStage>
		)

	/**
	 * What the observer reports of an arch 364 px tall in a screen 844 px tall (390 × 844): all of it (`true`), none of
	 * it (`false`), or a share of it, from its top (the arch peeks into the first screen of a phone).
	 */
	async function see(shown: boolean | number): Promise<void> {
		const ratio = shown === true ? 1 : shown === false ? 0 : shown
		await act(async () => {
			observer?.callback([
				{
					intersectionRatio: ratio,
					isIntersecting: ratio > 0,
					intersectionRect: { height: ratio * 364 },
					rootBounds: { height: 844 },
				},
			])
		})
	}

	/** The section says the arch was seen: on a phone, its still shows only then. */
	const seen = (zone: HTMLElement): string | null | undefined =>
		zone.querySelector('section')?.getAttribute('data-arch')

	beforeEach(() => {
		calls = []
		refuse = false
	})

	afterEach(() => {
		observer = undefined
		delete (globalThis as Record<string, unknown>).IntersectionObserver
		Reflect.deleteProperty(jsdomWindow.w.navigator, 'connection')
	})

	/** The phase the film says it is in (`data-film-phase`). */
	const phaseOf = (zone: HTMLElement): string | null | undefined =>
		zone.querySelector('[data-film-phase]')?.getAttribute('data-film-phase')

	test('mouvement réduit : rien ne bouge, aucune vidéo, et aucun bouton de pause qui ne commanderait rien', async () => {
		setUp({ reduced: true })
		const zone = await mount()
		await see(true)
		const section = zone.querySelector('section')
		expect(section?.hasAttribute('data-hero-motion')).toBe(false)
		expect(zone.querySelector('video')).toBeNull()
		expect(zone.querySelector('button')).toBeNull()
		// The arch is still seen: on a phone its still (the end of the film) replaces the blurred copy then.
		expect(seen(zone)).toBe('seen')
	})

	test('le haut de l’arche seul, comme un téléphone au chargement : ni vidéo ni arche vue ; au défilement, l’arche est vue pour de bon et le film vient', async () => {
		setUp({ reduced: false })
		const zone = await mount()
		// Reported at every twentieth of the arch, its threshold among them.
		expect(observer?.threshold).toEqual(ARCH_OBSERVER_STEPS)
		expect(observer?.threshold).toContain(FILM_VIEW_RATIO)
		// 430 × 932, the largest share a phone shows at load (0.65), past the load and the moment of rest.
		await see(0.65)
		await act(async () => {
			await new Promise(done => setTimeout(done, 400))
		})
		expect(zone.querySelector('video')).toBeNull()
		expect(seen(zone)).toBeNull()
		// A scroll brings most of the arch: seen, and the film comes.
		await see(FILM_VIEW_RATIO)
		expect(seen(zone)).toBe('seen')
		await jsdomWindow.attendre(() => zone.querySelector('video'))
		// Scrolled half out again: the still stays (seen for good) and the film keeps playing; it pauses once the arch is out.
		await see(0.3)
		expect(seen(zone)).toBe('seen')
		expect(calls.at(-1)).toBe('play intro')
		await see(false)
		expect(seen(zone)).toBe('seen')
		expect(calls.at(-1)).toBe('pause intro')
	})

	test('avec le mouvement : l’intro, puis la boucle chargée dessous ; le bouton de pause arrête et relance tout', async () => {
		setUp({ reduced: false })
		const zone = await mount()
		const section = zone.querySelector('section') as HTMLElement
		expect(section.getAttribute('data-hero-motion')).toBe('running')
		// A real button, named by its text (shown at the keyboard focus, globals.css), which says what a press does.
		const pause = zone.querySelector('button') as HTMLButtonElement
		expect(pause.className).toBe('home-hero-pause')
		expect(pause.getAttribute('type')).toBe('button')
		expect(pause.textContent).toBe('Mettre le film en pause')
		expect(pause.hasAttribute('aria-label')).toBe(false)
		expect(zone.querySelector('video')).toBeNull()
		await see(true)
		// After the load and a moment of rest (no requestIdleCallback in this window: a short timer).
		await jsdomWindow.attendre(() => zone.querySelector('video'))
		const videos = [...zone.querySelectorAll('video')]
		expect(videos.map(video => video.loop)).toEqual([true, false])
		for (const video of videos) {
			expect(video.muted).toBe(true)
			expect(video.getAttribute('preload')).toBe('auto')
			expect(video.getAttribute('aria-hidden')).toBe('true')
			expect([...video.querySelectorAll('source')].map(source => source.getAttribute('src'))).toEqual(
				(video.loop ? FILM_VIDEOS.loop : FILM_VIDEOS.intro).map(source => source.src)
			)
		}
		await jsdomWindow.attendre(() => (section.getAttribute('data-film') === 'playing' ? true : null))
		expect(calls).toEqual(['play intro'])
		expect(zone.querySelector('[data-film-phase]')?.getAttribute('data-film-phase')).toBe('intro')

		// The intro ends: the loop plays, then the intro is hidden.
		const intro = videos[1] as HTMLVideoElement
		await act(async () => {
			intro.dispatchEvent(new Event('ended'))
		})
		await jsdomWindow.attendre(() =>
			zone.querySelector('[data-film-phase]')?.getAttribute('data-film-phase') === 'loop' ? true : null
		)
		expect(calls).toContain('play loop')
		expect(intro.className).toContain('invisible')

		// The button stops the film and the loops (the ring and the ribbon), and says so; a second press plays again.
		await jsdomWindow.cliquer(jsdomWindow.bouton('Mettre le film en pause'))
		expect(section.getAttribute('data-hero-motion')).toBe('paused')
		expect(calls.at(-1)).toBe('pause loop')
		expect(section.hasAttribute('data-film')).toBe(false)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Lire le film'))
		expect(section.getAttribute('data-hero-motion')).toBe('running')
		await jsdomWindow.attendre(() => (calls.at(-1) === 'play loop' ? true : null))

		// Off the screen, the film pauses.
		await see(false)
		expect(calls.at(-1)).toBe('pause loop')
	})

	test('un play() refusé montre la fin du film à la place, et les vidéos s’en vont', async () => {
		setUp({ reduced: false })
		refuse = true
		const zone = await mount()
		await see(true)
		await jsdomWindow.attendre(() =>
			zone.querySelector('[data-film-phase]')?.getAttribute('data-film-phase') === 'refused' ? true : null
		)
		expect(zone.querySelector('video')).toBeNull()
		expect(zone.querySelector('img')?.getAttribute('src')).toBe(FILM_STILLS.end.at(-1)?.src)
	})

	test('Save-Data : aucune vidéo, l’image de fin à la place de l’affiche du début ; le bouton arrête encore le bandeau', async () => {
		setUp({ reduced: false, saveData: true })
		const zone = await mount()
		// Not while only the top of the arch shows: in the first screen of a phone it would be the largest paint.
		await see(0.5)
		expect(zone.querySelector('[data-film-phase] img')).toBeNull()
		await see(true)
		await jsdomWindow.attendre(() => (phaseOf(zone) === 'still' ? true : null))
		expect(zone.querySelector('video')).toBeNull()
		expect(zone.querySelector('[data-film-phase] img')?.getAttribute('src')).toBe(fallbackOf(FILM_STILLS.end))
		const section = zone.querySelector('section') as HTMLElement
		expect(section.hasAttribute('data-film')).toBe(false)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Mettre le film en pause'))
		expect(section.getAttribute('data-hero-motion')).toBe('paused')
	})

	test('sans IntersectionObserver : le film ne saurait pas quand jouer, l’image de fin le remplace', async () => {
		setUp({ reduced: false, withObserver: false })
		const zone = await mount()
		await jsdomWindow.attendre(() => (phaseOf(zone) === 'still' ? true : null))
		expect(zone.querySelector('video')).toBeNull()
		// No way to know when the arch is seen: it counts as seen, its image shows.
		await jsdomWindow.attendre(() => zone.querySelector('[data-film-phase] img'))
		expect(seen(zone)).toBe('seen')
		expect(zone.querySelector('[data-film-phase] img')?.getAttribute('src')).toBe(fallbackOf(FILM_STILLS.end))
	})

	test('mouvement réduit et Save-Data : rien de plus que l’affiche du serveur, qui montre déjà la fin', async () => {
		setUp({ reduced: true, saveData: true })
		const zone = await mount()
		await see(true)
		expect(phaseOf(zone)).toBe('wait')
		expect(zone.querySelector('[data-film-phase] img')).toBeNull()
	})
})

describe('la feuille de style du haut de page', () => {
	const css = read('src/app/(front)/globals.css').replace(/\/\*[\s\S]*?\*\//g, '')
	const block = css.slice(css.indexOf('.home-hero {'), css.indexOf('.article-prose {'))

	test('aucune transparence par `opacity` : une teinte est une couleur', () => {
		expect(block.length).toBeGreaterThan(1000)
		const opacities = [...block.matchAll(/(?:^|[\s;{])opacity:\s*([^;]+);/g)].map(match => match[1]?.trim())
		expect(opacities.every(value => value === '1')).toBe(true)
	})

	test('l’anneau et le bandeau ne bougent que sous l’attribut posé par le script, et sous no-preference ; le bouton les arrête, le pointeur arrête le bandeau', () => {
		const start = block.indexOf('@media (prefers-reduced-motion: no-preference)')
		const motion = block.slice(start)
		// The ring turns as the kit's badge does (`art-spin`, one turn in 26 s), the ribbon slides: both only once the
		// script has said motion is welcome (without script nothing loops, WCAG 2.2.2).
		expect(motion).toMatch(
			/\.home-hero\[data-hero-motion\] \.home-hero-ring \{\s*animation: art-spin var\(--duration-ring\) linear infinite;/
		)
		expect(motion).toContain('.home-hero[data-hero-motion] .home-hero-ribbon-track {')
		// The pause button stops both with the film; like the kit's banner, the pointer and the focus stop the ribbon.
		expect(motion).toMatch(
			/\.home-hero\[data-hero-motion="paused"\] :is\(\.home-hero-ring, \.home-hero-ribbon-track\),\s*\.home-hero-ribbon:hover \.home-hero-ribbon-track,\s*\.home-hero-ribbon:focus-within \.home-hero-ribbon-track \{\s*animation-play-state: paused;/
		)
		// Before the motion block, nothing turns the ring.
		expect(block.slice(0, start)).not.toMatch(/animation[^;]*art-spin/)
		expect(css).toMatch(/@keyframes art-spin \{\s*to \{\s*transform: rotate\(360deg\);/)
		// Before the motion block, nothing declares an animation or a transition.
		expect(block.slice(0, block.indexOf('@keyframes enter-arch'))).not.toMatch(/\b(animation|transition)\b/)
	})

	test('la recherche se dessine selon la largeur qu’on lui donne : carte, deux champs côte à côte, puis une pilule', () => {
		// Container queries on the box of the search, not the width of the screen: beside the arch at 1024 px or alone at
		// 680 px, the pill comes where its placeholder and its button fit, nowhere else (the placeholder was cut at 640-695 px).
		expect(block).toMatch(/\.home-hero-search \{[^}]*container-type: inline-size;/)
		const containers = [...block.matchAll(/@container \(min-width: ([\d.]+)rem\)/g)].map(match => Number(match[1]))
		expect(containers).toEqual([30, 44.5, 47])
		const pill = block.slice(block.indexOf('@container (min-width: 44.5rem)'))
		// Up to 47rem where the column allows it (from 1366 px): the city gets room to be typed.
		expect(pill).toMatch(/\.guided-search \{[^}]*max-width: 47rem;[^}]*height: 4\.5rem;[^}]*border-radius: 9999px;/)
		expect(block).toMatch(/\.guided-search \{[^}]*max-width: 44\.5rem;/)
		// The card of a phone: its radius is the button's (28 px) plus its padding (8 px), so the corners are concentric.
		expect(block).toMatch(/\.guided-search \{[^}]*padding: 0\.5rem;[^}]*border-radius: 2\.25rem;/)
		expect(block).toMatch(/\.guided-search-submit \{[^}]*min-height: 3\.5rem;[^}]*border-radius: 9999px;/)
	})

	test('sur un téléphone, le titre part 2rem sous la barre et le haut de l’arche entre dans le premier écran ; son image attend que l’arche soit vue', () => {
		// No block as tall as the screen any more (it left two empty bands around the text): the text comes first, the
		// arch after it, whatever the height of the phone (docs/accueil.md, « Le LCP du téléphone »).
		expect(block).toMatch(/\.home-hero-grid \{[^}]*padding: 2rem 1\.5rem 0;/)
		expect(block).not.toMatch(/100svh|100vh/)
		// Its still out of the page until the arch is seen (a lazy image out of the page is not asked for), on a phone only:
		// there it would be the largest paint. The <picture> of the <noscript> still is not a direct child of the arch.
		expect(block).toMatch(
			/@media \(max-width: 39\.99rem\) \{\s*\.home-hero:not\(\[data-arch="seen"\]\) \.home-hero-arch > picture \{\s*display: none;\s*\}/
		)
		// Its blurred copy under it, the end of the film with reduced motion, as the still.
		expect(block).toMatch(
			/\.home-hero-arch::before \{[^}]*background: center \/ cover var\(--arch-placeholder-start\);[^}]*filter: blur\(10px\);/
		)
		expect(block).toMatch(
			/@media \(prefers-reduced-motion: reduce\) \{\s*\.home-hero-arch::before \{\s*background-image: var\(--arch-placeholder-end\);/
		)
	})

	test('une longueur de bandeau en 60 s, un tour d’anneau en 26 s : l’allure du badge du kit', () => {
		const tokens = /@theme static\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? ''
		expect(tokens).toMatch(/--duration-ribbon:\s*60s;/)
		expect(tokens).toMatch(/--duration-ring:\s*26s;/)
		expect(css).toMatch(/\.art-spin \{\s*animation: art-spin 26s linear infinite;/)
	})

	test('l’arche se dessine comme celles du site : la bande du kit décalée à droite et en haut, plus l’ombre nude', () => {
		const rule = (selector: string) => {
			const at = block.indexOf(`${selector} {`)
			expect(at).toBeGreaterThan(-1)
			return block.slice(at, block.indexOf('}', at))
		}
		const band = rule('.home-hero-arch-wrap::before')
		expect(band).toContain('background-color: var(--color-art-band);')
		expect(band).toContain('inset: calc(var(--band-y) * -1) calc(var(--band-x) * -1) 0 var(--band-x);')
		expect(band).not.toMatch(/nude|translateX/)
		expect(block).not.toMatch(/--color-nude-200/)
		// The white ring round the picture and the hairline inside it, as on the arch of a card (`.art-arch__img`).
		expect(rule('.home-hero-arch')).toContain('box-shadow: 0 0 0 2px #fff;')
		const hairline = rule('.home-hero-arch::after')
		expect(hairline).toContain('border: 1px solid rgb(255 255 255 / 0.7);')
		expect(hairline).toContain('pointer-events: none;')
	})

	test('le badge : le disque garde la taille du bouton de pause (44 px, 56 px dès 40rem), son anneau se lit, de l’air autour du texte', () => {
		const rem = 16
		const sizeOf = (rules: string, selector: string) =>
			Number(new RegExp(`\\${selector} \\{[^}]*width: ([\\d.]+)rem;`).exec(rules)?.[1])
		const wide = block.slice(block.indexOf('@media (min-width: 40rem)'))
		const phone = sizeOf(block, '.home-hero-badge') * rem
		const large = sizeOf(wide, '.home-hero-badge') * rem
		const inset = Number(/\.home-hero-disc \{[^}]*inset: ([\d.]+)rem;/.exec(block)?.[1]) * rem
		expect([phone - 2 * inset, large - 2 * inset]).toEqual([44, 56])
		// The text of the ring, 12.5 units of the 112 of its box: 11.2 px on a phone, 12.5 px beyond (the ring that went
		// on 26/10/2026 was 7 to 10 px, unreadable). Its baseline at 37 from the centre: air from the disc and from the
		// edge of the notch (56), the capitals standing about 0.72 of their size (measured in Chromium in the e2e test).
		const font = Number(/\.home-hero-ring \{[^}]*font-size: ([\d.]+)px;/.exec(block)?.[1])
		// The type of the kit's badge: Instrument Sans, semibold (RotatingBadge), already preloaded on the route.
		expect(block).toMatch(
			/\.home-hero-ring \{[^}]*font-family: var\(--font-instrument-sans\), ui-sans-serif, system-ui, sans-serif;[^}]*font-weight: 600;/
		)
		expect(read('src/components/art/RotatingBadge.tsx')).toMatch(/font-body[\s\S]*fontWeight="600"/)
		expect((font * phone) / 112).toBeGreaterThanOrEqual(11)
		expect((font * large) / 112).toBeGreaterThanOrEqual(12.5)
		for (const [box, disc] of [
			[phone, 44],
			[large, 56],
		] as const) {
			const scale = box / 112
			const fromDisc = 37 * scale - disc / 2
			const fromEdge = (56 - 37 - 0.72 * font) * scale
			expect(fromDisc).toBeGreaterThanOrEqual(8)
			expect(fromEdge).toBeGreaterThanOrEqual(7)
		}
	})

	test('le bouton de pause : hors de la vue jusqu’au focus du clavier, jamais retiré de l’ordre du clavier', () => {
		const at = block.indexOf('.home-hero-pause {')
		const pause = block.slice(at, block.indexOf('}', at))
		expect(pause).toContain('min-height: 2.75rem;')
		expect(block).toMatch(/\.home-hero-pause:not\(:focus\) \{\s*clip-path: inset\(50%\);\s*\}/)
		// Neither `display: none` nor `visibility: hidden`, which would take it out of the tab order, nor `opacity`.
		expect(block).not.toMatch(/\.home-hero-pause[^{]*\{[^}]*(display: none|visibility: hidden|opacity)/)
	})
})

describe('la police du haut de page', () => {
	const FONTS = 'src/components/home/fonts'
	const font = read('src/components/home/hero-font.ts')

	test('trois coupes statiques du dépôt, sous-ensembles légers, avec la licence à côté ; celle de l’édition directe ne change pas', () => {
		expect(font).toContain("from 'next/font/local'")
		expect(font).not.toContain("from 'next/font/google'")
		const cuts = [...font.matchAll(/path: '\.\/fonts\/([^']+)', weight: '400', style: '(normal|italic)'/g)].map(
			([, file, style]) => [file, style]
		)
		expect(cuts).toEqual([
			['bodoni-moda-display-regular.woff2', 'normal'],
			['bodoni-moda-display-italic.woff2', 'italic'],
			['bodoni-moda-text-italic.woff2', 'italic'],
		])
		// About 100 KB of variable font were preloaded before (LCP of P01), then 27 KB of cuts with every French letter:
		// each cut now holds the characters of its text only.
		for (const [file] of cuts) {
			const bytes = readFileSync(join(ROOT, FONTS, file ?? ''))
			expect([file, bytes.subarray(0, 4).toString('latin1')]).toEqual([file, 'wOF2'])
			expect(bytes.length).toBeLessThan(6 * 1024)
		}
		expect(read(`${FONTS}/OFL.txt`)).toContain('SIL OPEN FONT LICENSE Version 1.1')
		expect(read(`${FONTS}/OFL.txt`)).toContain('The Bodoni Moda Project Authors')
		expect(read('src/components/direct-edit/fonts.ts')).not.toContain('opsz')
	})

	test('chaque coupe garde sa table `prep`, le contrôle des pertes qui garde les déliés de moins d’un pixel', () => {
		// The font has no other instructions than this program (SCANCTRL, SCANTYPE). Cut with `--no-hinting`, the subsets
		// lost it, and FreeType (Chromium on Linux and Android) dropped the bars of « e » (« maquillcusc »): docs/accueil.md,
		// « Les déliés du titre ». The tags are read from the table directory of the WOFF2 file.
		const KNOWN = [
			'cmap',
			'head',
			'hhea',
			'hmtx',
			'maxp',
			'name',
			'OS/2',
			'post',
			'cvt ',
			'fpgm',
			'glyf',
			'loca',
			'prep',
		]
		const tagsOf = (bytes: Buffer): string[] => {
			const tags: string[] = []
			let at = 48
			const base128 = () => {
				let value = 0
				for (let i = 0; i < 5; i++) {
					const byte = bytes[at++] ?? 0
					value = value * 128 + (byte & 0x7f)
					if (!(byte & 0x80)) return value
				}
				throw new Error('UIntBase128 trop long')
			}
			for (let table = 0; table < bytes.readUInt16BE(12); table++) {
				const flags = bytes[at++] ?? 0
				const index = flags & 0x3f
				let tag = KNOWN[index] ?? `#${index}`
				if (index === 63) {
					tag = bytes.subarray(at, at + 4).toString('latin1')
					at += 4
				}
				base128()
				const version = flags >> 6
				if ((tag === 'glyf' || tag === 'loca') === (version === 0)) base128()
				tags.push(tag)
			}
			return tags
		}
		for (const file of readdirSync(join(ROOT, FONTS)).filter(name => name.endsWith('.woff2')))
			expect([file, tagsOf(readFileSync(join(ROOT, FONTS, file))).includes('prep')]).toEqual([file, true])
	})

	test('les caractères que chaque coupe dessine sont ceux de ses sous-ensembles : un texte changé demande de nouvelles coupes', () => {
		// The cuts hold these characters only (docs/accueil.md, « La police », the recipe): a character outside them would
		// be drawn by the fallback serif. A text of the hero that changes makes this test fail first, then the cuts are
		// made again; tests/e2e/home-hero.spec.ts checks in Chromium which fonts drew each text.
		const document = new JSDOM(html).window.document
		const chars = (texts: (string | null | undefined)[]) => [...new Set(texts.join(' '))].sort().join('')
		const title = document.querySelector('h1')
		const italic = title?.querySelector('em')?.textContent
		const upright = [...(title?.querySelectorAll('.home-hero-line') ?? [])].map(line =>
			[...line.childNodes]
				.filter(node => node.nodeName !== 'EM')
				.map(node => node.textContent)
				.join('')
		)
		const textCut = [...document.querySelectorAll('.home-hero-ribbon-list li')].map(item => item.textContent)
		expect(chars(upright)).toBe(' .Tacdehilmopqrsuvzè')
		expect(chars([italic])).toBe(' cdeinopqrsuv')
		expect(chars(textCut)).toBe(' -CEMPSacdefghilmnopqrstuvxèé’')
	})

	test('chaque coupe a sa variable, change sans attendre et se remplace par un repli serif ajusté ; le haut de page porte les deux', () => {
		expect(font.match(/display: 'swap'/g)).toHaveLength(2)
		// The fallback is set by hand (next/font reads the widths of a to z, which the subsets no longer all carry), with
		// the values next/font computed from the full cuts: Times New Roman at the measures of each cut.
		expect(font.match(/adjustFontFallback: false/g)).toHaveLength(2)
		expect(font).toContain("fallback: ['hero-serif-fallback'],")
		expect(font).toContain("fallback: ['hero-serif-text-fallback'],")
		const css = read('src/app/(front)/globals.css').replace(/\s+/g, ' ')
		expect(css).toContain(
			'@font-face { font-family: hero-serif-fallback; src: local("Times New Roman"); ascent-override: 98.55%; descent-override: 35.04%; line-gap-override: 0%; size-adjust: 114.16%; }'
		)
		expect(css).toContain(
			'@font-face { font-family: hero-serif-text-fallback; src: local("Times New Roman"); ascent-override: 105.29%; descent-override: 37.44%; line-gap-override: 0%; size-adjust: 106.85%; }'
		)
		expect(font).toContain("variable: '--font-hero-serif',")
		expect(font).toContain("variable: '--font-hero-serif-text',")
		// All preloaded: their text is in the first screen of a wide screen, a late swap would move it. Held out of the
		// preloads, the italic cuts were still asked before the paint of a phone, only later (docs/accueil.md, « La police »).
		expect(font).not.toContain('preload: false')
		expect(element(html, /<section\b/).slice(0, 120)).toMatch(
			/^<section class="home-hero --font-hero-serif --font-hero-serif-text"/
		)
	})

	test('la feuille de style prend la coupe dans le fichier : aucun réglage d’axe, le bandeau en coupe de texte', () => {
		const css = read('src/app/(front)/globals.css').replace(/\/\*[\s\S]*?\*\//g, '')
		const block = css.slice(css.indexOf('.home-hero {'), css.indexOf('.article-prose {'))
		expect(block.length).toBeGreaterThan(1000)
		expect(block).not.toMatch(/font-variation-settings|font-optical-sizing/)
		// The rule of a selector, found as text (`selector {` up to its `}`), then its font-family: no pattern built from
		// the selector, whose characters would each need escaping (CodeQL, incomplete escaping).
		const familyOf = (selector: string) => {
			const start = block.indexOf(`${selector} {`)
			if (start === -1) return undefined
			const rule = block.slice(start, block.indexOf('}', start))
			return /font-family: ([^;]+);/.exec(rule)?.[1]
		}
		expect(familyOf('.home-hero-title')).toBe('var(--hero-serif)')
		expect(familyOf('.home-hero-ribbon-list li')).toBe('var(--hero-serif-text)')
	})
})
