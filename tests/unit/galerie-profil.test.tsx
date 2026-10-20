import { describe, expect, test } from 'bun:test'
import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { type GalleryPhoto, ProfileGallery } from '@/components/profile/ProfileGallery'
import { ouvrirFenetre } from '../outils/dom-react'

/**
 * The portfolio of a public profile (ticket 103): its photos, their alternative text, and the keyboard.
 * The scrolling itself (a swipe, the snapping) needs a real browser: tests/e2e/profil-public.spec.ts, E44.
 */

const photos = (nombre: number): GalleryPhoto[] =>
	Array.from({ length: nombre }, (_, rang) => ({
		url: `https://photos.example.test/media/photo-${rang + 1}.webp`,
		width: 400,
		height: 300,
	}))

const fenetre = ouvrirFenetre()

/** The row of photos: the one element that takes the focus. */
const piste = (zone: Element): HTMLElement => {
	const trouvee = zone.querySelector<HTMLElement>('[tabindex="0"]')
	if (!trouvee) throw new Error('la rangée de photos manque')
	return trouvee
}

async function appuyer(cible: Element, key: string): Promise<boolean> {
	let evenement: Event | undefined
	await act(async () => {
		evenement = new fenetre.w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
		cible.dispatchEvent(evenement)
	})
	return evenement?.defaultPrevented ?? false
}

const position = (zone: Element): string => zone.querySelector('[aria-live="polite"]')?.textContent ?? ''

describe('E44 : la galerie au clavier', () => {
	test('chaque photo a son texte alternatif « Réalisation de <nom> (n/N) », demandée depuis son adresse d’origine', () => {
		const html = renderToStaticMarkup(<ProfileGallery photos={photos(6)} nom="Inès Morel" />)

		for (let n = 1; n <= 6; n++) expect(html).toContain(`alt="Réalisation de Inès Morel (${n}/6)"`)
		expect(html.match(/<img /g)).toHaveLength(6)
		// The optimizer is asked for the original address, whatever width it picks.
		expect(html).toContain(`url=${encodeURIComponent('https://photos.example.test/media/photo-1.webp')}`)
		expect(html).toContain('Photo 1 sur 6')
		expect(html).toContain('aria-roledescription="carrousel"')
	})

	test('une seule photo : pas de boutons ni de position à annoncer', () => {
		const html = renderToStaticMarkup(<ProfileGallery photos={photos(1)} nom="Inès Morel" />)

		expect(html).toContain('alt="Réalisation de Inès Morel (1/1)"')
		expect(html).not.toContain('Photo suivante')
		expect(html).not.toContain('aria-live')
	})

	test('les flèches changent de photo et la position est annoncée', async () => {
		const zone = await fenetre.monter(<ProfileGallery photos={photos(3)} nom="Inès Morel" />)
		const rangee = piste(zone)
		expect(position(zone)).toBe('Photo 1 sur 3')

		expect(await appuyer(rangee, 'ArrowRight')).toBe(true)
		expect(position(zone)).toBe('Photo 2 sur 3')
		await appuyer(rangee, 'ArrowRight')
		expect(position(zone)).toBe('Photo 3 sur 3')
		// The end of the row: nothing further, no loop.
		await appuyer(rangee, 'ArrowRight')
		expect(position(zone)).toBe('Photo 3 sur 3')
		await appuyer(rangee, 'ArrowLeft')
		expect(position(zone)).toBe('Photo 2 sur 3')
		await appuyer(rangee, 'Home')
		expect(position(zone)).toBe('Photo 1 sur 3')
		await appuyer(rangee, 'End')
		expect(position(zone)).toBe('Photo 3 sur 3')
	})

	test('une autre touche est laissée au navigateur', async () => {
		const zone = await fenetre.monter(<ProfileGallery photos={photos(3)} nom="Inès Morel" />)

		expect(await appuyer(piste(zone), 'a')).toBe(false)
		expect(await appuyer(piste(zone), 'ArrowDown')).toBe(false)
		expect(position(zone)).toBe('Photo 1 sur 3')
	})

	test('« Photo précédente » et « Photo suivante » font de même, sans jamais sortir de la rangée', async () => {
		const zone = await fenetre.monter(<ProfileGallery photos={photos(3)} nom="Inès Morel" />)
		const suivante = fenetre.bouton('Photo suivante')
		const precedente = fenetre.bouton('Photo précédente')

		expect(precedente.getAttribute('aria-disabled')).toBe('true')
		await fenetre.cliquer(precedente)
		expect(position(zone)).toBe('Photo 1 sur 3')
		await fenetre.cliquer(suivante)
		await fenetre.cliquer(suivante)
		expect(position(zone)).toBe('Photo 3 sur 3')
		expect(suivante.getAttribute('aria-disabled')).toBe('true')
		await fenetre.cliquer(suivante)
		expect(position(zone)).toBe('Photo 3 sur 3')
		await fenetre.cliquer(precedente)
		expect(position(zone)).toBe('Photo 2 sur 3')
	})

	test('la rangée défile jusqu’à la photo choisie', async () => {
		const zone = await fenetre.monter(<ProfileGallery photos={photos(3)} nom="Inès Morel" />)
		const rangee = piste(zone)
		const arrivees: number[] = []
		rangee.scrollTo = ((options: ScrollToOptions) => {
			arrivees.push(Number(options.left))
		}) as typeof rangee.scrollTo
		;[...rangee.children].forEach((photo, rang) => {
			Object.defineProperty(photo, 'offsetLeft', { value: rang * 532 })
		})

		await appuyer(rangee, 'ArrowRight')
		await appuyer(rangee, 'End')
		await appuyer(rangee, 'Home')

		expect(arrivees).toEqual([532, 1064, 0])
	})

	test('la rangée se laisse atteindre au clavier et se nomme', async () => {
		const zone = await fenetre.monter(<ProfileGallery photos={photos(2)} nom="Inès Morel" />)

		expect(piste(zone).getAttribute('aria-label')).toBe('Photos de Inès Morel')
		expect(zone.querySelectorAll('[aria-roledescription="photo"]')).toHaveLength(2)
		expect(zone.querySelector('[aria-label="1 sur 2"]')).not.toBeNull()
	})
})
