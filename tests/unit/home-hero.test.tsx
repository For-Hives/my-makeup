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
import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
	FILM_SIZE,
	FILM_STILLS,
	FILM_VIDEOS,
	type FilmConditions,
	filmButtonName,
	mountsFilm,
	playsFilm,
} from '@/components/home/film'
import { ArchFilm, FilmButton, HeroStage } from '@/components/home/HeroFilm'
import { HERO_STEPS, HomeHero, RIBBON_WORDS } from '@/components/home/HomeHero'
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
		const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? ''
		// The text nodes as they are, without collapsing the spaces: what textContent gives.
		const text = h1.replace(/<[^>]*>/g, '').replaceAll('&#x27;', "'")
		expect(text).toBe(ONLINE_H1)
	})

	test('les deux images du titre sont décoratives, d’une taille donnée, et pèsent moins de 8 Ko', () => {
		const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? ''
		const pictures = h1.match(/<img\b[^>]*>/g) ?? []
		expect(pictures).toHaveLength(2)
		for (const picture of pictures) {
			expect(picture).toContain('alt=""')
			expect(picture).toContain('aria-hidden="true"')
			expect(picture).toMatch(/width="228"/)
			expect(picture).toMatch(/height="114"/)
			const src = /src="([^"]+)"/.exec(picture)?.[1] ?? ''
			expect(src).toMatch(/^\/assets\/accueil\/pilule-[a-z-]+-v\d+\.webp$/)
			expect(statSync(join(ROOT, 'public', src)).size).toBeLessThan(8 * 1024)
		}
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
		expect(picture).toContain(
			`<source media="(prefers-reduced-motion: reduce)" srcSet="${FILM_STILLS.end[0]?.src}" type="image/webp"/>`
		)
		expect(picture).toContain(`src="${FILM_STILLS.start.at(-1)?.src}"`)
		expect(picture).toContain(`width="${FILM_SIZE.width}" height="${FILM_SIZE.height}"`)
		expect(picture).toMatch(/alt="[^"]{20,}"/)
		expect(picture).toContain('object-cover')
	})

	test('l’arche n’est jamais dans un bloc en fondu : elle entre par un masque', () => {
		const wrap = /<div class="([^"]*home-hero-arch-wrap[^"]*)"/.exec(html)?.[1] ?? ''
		expect(wrap).toContain('enter-arch')
		expect(wrap).not.toContain('enter-fade')
		// No video and no button in the HTML of the server: they come with the script, when motion is welcome.
		expect(html).not.toContain('<video')
		expect(html).not.toContain('data-hero-motion')
		expect(html).not.toMatch(/<button[^>]*home-hero-disc/)
		expect(html).toContain('L’OMBRE NETTE · UN FILM MY MAKEUP · ')
	})

	test('chaque fichier du film existe, porte sa version dans son nom, et le meilleur format vient d’abord', () => {
		const all = [...FILM_VIDEOS.intro, ...FILM_VIDEOS.loop, ...FILM_STILLS.start, ...FILM_STILLS.end]
		for (const { src } of all) {
			expect(src).toMatch(/^\/assets\/accueil\/ombre-nette-[a-z]+-v\d+\.[a-z0-9.]+$/)
			expect(existsSync(join(ROOT, 'public', src))).toBe(true)
		}
		for (const part of [FILM_VIDEOS.intro, FILM_VIDEOS.loop]) {
			expect(part.map(source => source.type)).toEqual([
				'video/mp4; codecs="av01.0.04M.08"',
				'video/mp4; codecs="avc1.64001E"',
			])
		}
		expect(FILM_SIZE.width / FILM_SIZE.height).toBeCloseTo(0.77, 2)
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

	function setUp({ reduced }: { reduced: boolean }): void {
		const w = jsdomWindow.w as unknown as Record<string, unknown>
		w.matchMedia = (query: string) => ({
			matches: reduced && query.includes('prefers-reduced-motion: reduce'),
			addEventListener: () => {},
			removeEventListener: () => {},
		})
		;(globalThis as Record<string, unknown>).IntersectionObserver = class {
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
	})

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
	test('une instance à part, en coupe d’affichage avec son italique ; celle de l’édition directe ne change pas', () => {
		const font = read('src/components/home/hero-font.ts')
		expect(font).toContain("axes: ['opsz']")
		expect(font).toContain("style: ['normal', 'italic']")
		expect(font).toContain("display: 'swap'")
		expect(read('src/components/direct-edit/fonts.ts')).not.toContain('opsz')
		expect(read('src/components/home/HomeHero.tsx')).toContain('heroSerif.variable')
	})
})
