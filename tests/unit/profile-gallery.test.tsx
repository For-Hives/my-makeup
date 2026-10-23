import { describe, expect, test } from 'bun:test'
import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { type GalleryPhoto, ProfileGallery } from '@/components/profile/ProfileGallery'
import { openWindow } from '../support/dom-react'

/**
 * The portfolio of a public profile (ticket 103): its photos, their alternative text, and the keyboard.
 * The scrolling itself (a swipe, the snapping) needs a real browser: tests/e2e/public-profile.spec.ts, E44.
 */

const photos = (nombre: number): GalleryPhoto[] =>
	Array.from({ length: nombre }, (_, rang) => ({
		url: `https://photos.example.test/media/photo-${rang + 1}.webp`,
		width: 400,
		height: 300,
	}))

const jsdomWindow = openWindow()

/** The row of photos: the one element that takes the focus. */
const track = (zone: Element): HTMLElement => {
	const found = zone.querySelector<HTMLElement>('[tabindex="0"]')
	if (!found) throw new Error('la rangée de photos manque')
	return found
}

async function press(cible: Element, key: string): Promise<boolean> {
	let event: Event | undefined
	await act(async () => {
		event = new jsdomWindow.w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
		cible.dispatchEvent(event)
	})
	return event?.defaultPrevented ?? false
}

const position = (zone: Element): string => zone.querySelector('[aria-live="polite"]')?.textContent ?? ''

describe('E44 : la galerie au clavier', () => {
	test('chaque photo a son texte alternatif « Réalisation de <nom> (n/N) », demandée depuis son adresse d’origine', () => {
		const html = renderToStaticMarkup(<ProfileGallery photos={photos(6)} nom="Inès Morel" />)

		for (let n = 1; n <= 6; n++) expect(html).toContain(`alt="Réalisation d’Inès Morel (${n}/6)"`)
		expect(html.match(/<img /g)).toHaveLength(6)
		// The optimizer is asked for the original address, whatever width it picks.
		expect(html).toContain(`url=${encodeURIComponent('https://photos.example.test/media/photo-1.webp')}`)
		expect(html).toContain('Photo 1 sur 6')
		expect(html).toContain('aria-roledescription="carrousel"')
	})

	test('une seule photo : pas de boutons ni de position à annoncer', () => {
		const html = renderToStaticMarkup(<ProfileGallery photos={photos(1)} nom="Inès Morel" />)

		expect(html).toContain('alt="Réalisation d’Inès Morel (1/1)"')
		expect(html).not.toContain('Photo suivante')
		expect(html).not.toContain('aria-live')
	})

	test('les flèches changent de photo et la position est annoncée', async () => {
		const zone = await jsdomWindow.monter(<ProfileGallery photos={photos(3)} nom="Inès Morel" />)
		const row = track(zone)
		expect(position(zone)).toBe('Photo 1 sur 3')

		expect(await press(row, 'ArrowRight')).toBe(true)
		expect(position(zone)).toBe('Photo 2 sur 3')
		await press(row, 'ArrowRight')
		expect(position(zone)).toBe('Photo 3 sur 3')
		// The end of the row: nothing further, no loop.
		await press(row, 'ArrowRight')
		expect(position(zone)).toBe('Photo 3 sur 3')
		await press(row, 'ArrowLeft')
		expect(position(zone)).toBe('Photo 2 sur 3')
		await press(row, 'Home')
		expect(position(zone)).toBe('Photo 1 sur 3')
		await press(row, 'End')
		expect(position(zone)).toBe('Photo 3 sur 3')
	})

	test('une autre touche est laissée au navigateur', async () => {
		const zone = await jsdomWindow.monter(<ProfileGallery photos={photos(3)} nom="Inès Morel" />)

		expect(await press(track(zone), 'a')).toBe(false)
		expect(await press(track(zone), 'ArrowDown')).toBe(false)
		expect(position(zone)).toBe('Photo 1 sur 3')
	})

	test('« Photo précédente » et « Photo suivante » font de même, sans jamais sortir de la rangée', async () => {
		const zone = await jsdomWindow.monter(<ProfileGallery photos={photos(3)} nom="Inès Morel" />)
		const next = jsdomWindow.bouton('Photo suivante')
		const previous = jsdomWindow.bouton('Photo précédente')

		expect(previous.getAttribute('aria-disabled')).toBe('true')
		await jsdomWindow.cliquer(previous)
		expect(position(zone)).toBe('Photo 1 sur 3')
		await jsdomWindow.cliquer(next)
		await jsdomWindow.cliquer(next)
		expect(position(zone)).toBe('Photo 3 sur 3')
		expect(next.getAttribute('aria-disabled')).toBe('true')
		await jsdomWindow.cliquer(next)
		expect(position(zone)).toBe('Photo 3 sur 3')
		await jsdomWindow.cliquer(previous)
		expect(position(zone)).toBe('Photo 2 sur 3')
	})

	test('la rangée défile jusqu’à la photo choisie', async () => {
		const zone = await jsdomWindow.monter(<ProfileGallery photos={photos(3)} nom="Inès Morel" />)
		const row = track(zone)
		const arrived: number[] = []
		row.scrollTo = ((options: ScrollToOptions) => {
			arrived.push(Number(options.left))
		}) as typeof row.scrollTo
		;[...row.children].forEach((photo, rang) => {
			Object.defineProperty(photo, 'offsetLeft', { value: rang * 532 })
		})

		await press(row, 'ArrowRight')
		await press(row, 'End')
		await press(row, 'Home')

		expect(arrived).toEqual([532, 1064, 0])
	})

	test('la rangée se laisse atteindre au clavier et se nomme', async () => {
		const zone = await jsdomWindow.monter(<ProfileGallery photos={photos(2)} nom="Inès Morel" />)

		expect(track(zone).getAttribute('aria-label')).toBe('Photos d’Inès Morel')
		expect(zone.querySelectorAll('[aria-roledescription="photo"]')).toHaveLength(2)
		expect(zone.querySelector('[aria-label="1 sur 2"]')).not.toBeNull()
	})
})
