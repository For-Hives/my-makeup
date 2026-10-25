/**
 * The home hero « en arche » (decision of 25/10/2026, docs/accueil.md): the h1 of the site online kept to the character
 * while its lines carry two pictures, the new paragraph, the three steps, the ribbon of the real specialties, the poster
 * of the arch and the rules of its film (when the videos come, when they play), the button of the badge, and the
 * stylesheet rules that keep the loops behind the script and under `no-preference`. What only a browser shows (the
 * film playing, the swap, the layout) is in tests/e2e/home-hero.spec.ts.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import {
	FILM_SIZE,
	FILM_STILLS,
	FILM_VIDEOS,
	type FilmConditions,
	fallbackOf,
	filmButtonName,
	mountsFilm,
	POSTER_PRELOADS,
	playsFilm,
} from '@/components/home/film'
import { ArchFilm, FilmButton, HeroStage } from '@/components/home/HeroFilm'
import { HERO_PILLS, HERO_STEPS, HomeHero, RIBBON_WORDS } from '@/components/home/HomeHero'
import { SPECIALTY_BULLETS } from '@/lib/specialty'
import { openWindow } from '../support/dom-react'
import { mainTitles, sha256, titleFingerprint } from '../support/url-parity'

const ROOT = join(import.meta.dir, '../..')
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8')
const ONLINE_H1 = "Trouver la maquilleuse qui vous correspond n'a jamais été aussi simple"
const html = renderToStaticMarkup(<HomeHero />)

/** The opening tag and the inside of the first element whose opening tag matches. */
function element(markup: string, opening: RegExp): string {
	const start = markup.search(opening)
	expect(start).toBeGreaterThan(-1)
	return markup.slice(start)
}

describe('le titre : le h1 du site en ligne, au caractère près', () => {
	test('un seul h1, dont le texte et l’empreinte sont ceux du site en ligne', () => {
		expect(mainTitles(html)).toEqual([ONLINE_H1])
		expect(titleFingerprint(html)).toEqual({ n: 1, sha: sha256(ONLINE_H1) })
	})

	test('le texte du h1, lu comme un navigateur, n’a ni espace en trop ni mot venu des images', () => {
		// Parsed as a browser does, and read without collapsing the spaces: what textContent gives.
		const text = new JSDOM(html).window.document.querySelector('h1')?.textContent
		expect(text).toBe(ONLINE_H1)
	})

	test('les deux images du titre sont décoratives, d’une taille donnée, AVIF puis WebP, et pèsent moins de 8 Ko', async () => {
		const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? ''
		const pictures = h1.match(/<picture>[\s\S]*?<\/picture>/g) ?? []
		expect(pictures).toHaveLength(2)
		expect(h1.match(/<img\b[^>]*>/g) ?? []).toHaveLength(2)
		for (const picture of pictures) {
			const image = /<img\b[^>]*>/.exec(picture)?.[0] ?? ''
			expect(image).toContain('alt=""')
			expect(image).toContain('aria-hidden="true"')
			expect(image).toMatch(/width="342"/)
			expect(image).toMatch(/height="171"/)
			// Lazy: React writes no preload for it in the head, and it is asked after the first paint (LCP of P01).
			expect(image).toContain('loading="lazy"')
			expect(image).not.toMatch(/fetchpriority/i)
			const webp = /src="([^"]+)"/.exec(image)?.[1] ?? ''
			const avif = /<source srcSet="([^"]+)" type="image\/avif"\/>/.exec(picture)?.[1] ?? ''
			expect(picture.indexOf('<source')).toBeLessThan(picture.indexOf('<img'))
			expect(webp).toMatch(/^\/assets\/accueil\/pilule-[a-z-]+-v1\.webp$/)
			expect(avif).toBe(webp.replace(/\.webp$/, '.avif'))
			// The crops of the final render, at three times their size on screen (1.9 × 0.95 em of a 60 px heading).
			for (const [src, format] of [
				[webp, 'webp'],
				[avif, 'heif'],
			] as const) {
				expect(statSync(join(ROOT, 'public', src)).size).toBeLessThan(8 * 1024)
				const meta = await sharp(join(ROOT, 'public', src)).metadata()
				expect([src, meta.format, meta.width, meta.height]).toEqual([src, format, 342, 171])
			}
		}
		expect(Object.values(HERO_PILLS).map(pill => pill.webp)).toEqual([
			'/assets/accueil/pilule-levres-v1.webp',
			'/assets/accueil/pilule-pinceau-v1.webp',
		])
		// The drafts (crops of the concept frames) are gone.
		for (const draft of ['pilule-levres-v0.webp', 'pilule-pinceau-v0.webp'])
			expect(existsSync(join(ROOT, 'public/assets/accueil', draft))).toBe(false)
	})

	test('le mot « qui vous correspond » est en italique rouge, et le titre entre par son masque', () => {
		expect(html).toContain('<em>qui vous correspond</em>')
		expect(element(html, /<h1\b/).slice(0, 80)).toContain('enter-mask')
	})
})

describe('le texte, le formulaire et les trois lignes', () => {
	test('le surtitre et la nouvelle phrase, avec l’espace fine avant les deux-points', () => {
		expect(html).toContain('Maquilleuses professionnelles, partout en France')
		expect(html).toContain(
			'Mariage, soirée, photo : trouvez une maquilleuse professionnelle près de chez vous, découvrez son travail et écrivez-lui directement.'
		)
		expect(html).not.toContain('Trouvez la maquilleuse spécialisée dans le domaine que vous recherchez')
	})

	test('le formulaire guidé est dans le haut de page, la mesure de la recherche dans le même formulaire', () => {
		expect(html).toContain('action="/search"')
		const form = /<form\b[\s\S]*?<\/form>/.exec(html)?.[0] ?? ''
		expect(form).toContain('id="accueil-evenement"')
		expect(form).toContain('id="accueil-lieu"')
		expect(form).toContain('type="submit"')
	})

	test('les trois lignes de l’issue 1066, mot pour mot, numérotées i. ii. iii. sans que le numéro soit lu', () => {
		expect(HERO_STEPS).toEqual([
			'Cherchez par événement et par lieu',
			'Consultez des profils vérifiés',
			'Écrivez en direct à la maquilleuse',
		])
		const list = /<ol\b[\s\S]*?<\/ol>/.exec(html)?.[0] ?? ''
		for (const step of HERO_STEPS) expect(list).toContain(`<span>${step}</span>`)
		for (const numeral of ['i.', 'ii.', 'iii.']) expect(list).toContain(`aria-hidden="true">${numeral}</span>`)
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
		expect(picture).toMatch(/alt="[^"]{20,}"/)
		expect(picture).toContain('object-cover')
	})

	test('l’affiche attend son tour sur un téléphone ; dès 768 px, chaque préchargement est le fichier que la <picture> y prend', () => {
		// Below the first screen of a phone: asked once the page is laid out, never before the sentence is painted (P01).
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
		expect(POSTER_PRELOADS).toEqual([
			{
				href: taken('no-preference') ?? 'aucune',
				type: 'image/avif',
				media: '(min-width: 768px) and (prefers-reduced-motion: no-preference)',
			},
			{
				href: taken('reduce') ?? 'aucune',
				type: 'image/avif',
				media: '(min-width: 768px) and (prefers-reduced-motion: reduce)',
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
		// No video and no button in the HTML of the server: they come with the script, when motion is welcome.
		expect(html).not.toContain('<video')
		expect(html).not.toContain('data-hero-motion')
		expect(html).not.toMatch(/<button[^>]*home-hero-disc/)
	})

	test('le titre du film fait le tour du badge, avec une espace qui ne fond pas entre la fin et le début', () => {
		// An ordinary space at the end of an SVG text is dropped by the collapsing of white space: the dot then touched
		// the « L » where the ring closes. A no-break space is kept, and textLength spreads it like the others.
		expect(html).toContain(`L’OMBRE NETTE · UN FILM MY MAKEUP ·${String.fromCharCode(0xa0)}</textPath>`)
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

	test('les images fixes sont à la taille du rendu : nettes sur un écran de densité 2', async () => {
		for (const { src } of [...FILM_STILLS.start, ...FILM_STILLS.end]) {
			const { width, height } = await sharp(join(ROOT, 'public', src)).metadata()
			expect({ src, width, height }).toEqual({ src, ...FILM_SIZE })
		}
	})
})

describe('quand le film vient, quand il joue', () => {
	const ready: FilmConditions = {
		reducedMotion: false,
		saveData: false,
		inView: true,
		visible: true,
		settled: true,
		userPaused: false,
		refused: false,
	}

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
		for (const missing of [{ inView: false }, { visible: false }, { userPaused: true }, { refused: true }])
			expect(playsFilm({ ...ready, ...missing })).toBe(false)
	})

	test('le bouton dit ce qu’un appui fait', () => {
		expect(filmButtonName(false)).toBe('Mettre le film en pause')
		expect(filmButtonName(true)).toBe('Lire le film')
	})
})

describe('la partie qui bouge, dans une fausse fenêtre', () => {
	const jsdomWindow = openWindow()
	type Observer = { callback: (entries: { isIntersecting: boolean }[]) => void }
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
				constructor(callback: Observer['callback']) {
					observer = { callback }
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
				<FilmButton />
			</HeroStage>
		)

	async function see(isIntersecting: boolean): Promise<void> {
		await act(async () => {
			observer?.callback([{ isIntersecting }])
		})
	}

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

	test('mouvement réduit : rien ne bouge, aucune vidéo, et le disque n’est pas un bouton', async () => {
		setUp({ reduced: true })
		const zone = await mount()
		await see(true)
		const section = zone.querySelector('section')
		expect(section?.hasAttribute('data-hero-motion')).toBe(false)
		expect(zone.querySelector('video')).toBeNull()
		expect(zone.querySelector('button')).toBeNull()
		expect(zone.querySelector('.home-hero-disc')?.getAttribute('aria-hidden')).toBe('true')
	})

	test('avec le mouvement : l’intro, puis la boucle chargée dessous ; le bouton arrête et relance tout', async () => {
		setUp({ reduced: false })
		const zone = await mount()
		const section = zone.querySelector('section') as HTMLElement
		expect(section.getAttribute('data-hero-motion')).toBe('running')
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

		// The button stops the film and the loops, and says so; a second press plays again.
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

	test('l’anneau et le bandeau ne bougent que sous l’attribut posé par le script, et sous no-preference', () => {
		const motion = block.slice(block.indexOf('@media (prefers-reduced-motion: no-preference)'))
		expect(motion).toContain('.home-hero[data-hero-motion] .home-hero-ribbon-track {')
		expect(motion).toContain('.home-hero[data-hero-motion="paused"] .home-hero-ribbon-track {')
		expect(motion).toMatch(/\.home-hero\[data-hero-motion\] \.home-hero-ring \{\s*animation: [^;]*infinite paused;/)
		expect(motion).toContain('.home-hero[data-hero-motion="running"][data-film="playing"] .home-hero-ring {')
		// Before the motion block, nothing declares an animation or a transition.
		expect(block.slice(0, block.indexOf('@keyframes enter-arch'))).not.toMatch(/\b(animation|transition)\b/)
	})

	test('un tour d’anneau en 40 s, une longueur de bandeau en 60 s', () => {
		const tokens = /@theme static\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? ''
		expect(tokens).toMatch(/--duration-ring:\s*40s;/)
		expect(tokens).toMatch(/--duration-ribbon:\s*60s;/)
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
		const textCut = [
			...[...document.querySelectorAll('.home-hero-step-number')].map(number => number.textContent),
			...[...document.querySelectorAll('.home-hero-ribbon-list li')].map(item => item.textContent),
		]
		expect(chars(upright)).toBe(" 'Taeijlmnopqrstuvé")
		expect(chars([italic])).toBe(' cdeinopqrsuv')
		expect(chars(textCut)).toBe(' -.CEMPSacdefghilmnopqrstuvxèé’')
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
			'@font-face { font-family: hero-serif-fallback; src: local("Times New Roman"); ascent-override: 99.06%; descent-override: 35.22%; line-gap-override: 0%; size-adjust: 113.57%; }'
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

	test('la feuille de style prend la coupe dans le fichier : aucun réglage d’axe, le bandeau et les numéros en coupe de texte', () => {
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
		expect(familyOf('.home-hero-step-number')).toBe('var(--hero-serif-text)')
		expect(familyOf('.home-hero-ribbon-list li')).toBe('var(--hero-serif-text)')
	})
})
