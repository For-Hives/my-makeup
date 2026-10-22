import { afterEach, describe, expect, test } from 'bun:test'
import { act, useState } from 'react'
import { CollapsibleCards } from '@/components/dashboard/CollapsibleCards'
import { MainPhotoThumbnail } from '@/components/dashboard/MainPhotoThumbnail'
import { openWindow } from '../support/dom-react'

/** The folded group « Pour aller plus loin » (ticket 307; audit UX n° 11). Made-up values only. */

const jsdomWindow = openWindow()

// A click on a link of the page keeps its fragment in the window: the next test starts without one.
afterEach(() => jsdomWindow.w.history.replaceState(null, '', '/'))

function Page() {
	// A button that changes what the group holds: the page rendered again after a save.
	const [extra, setExtra] = useState('')
	return (
		<>
			<button type="button" onClick={() => setExtra(' et anglais')}>
				Relire
			</button>
			<a href="#carte-langues">Ajoute au moins une langue.</a>
			<a href="#carte-photo">Ajoute ta photo principale.</a>
			<h2 id="carte-photo">Photo principale</h2>
			<CollapsibleCards id="groupe-plus-loin" titre="Pour aller plus loin">
				<h2 id="carte-langues">Langues</h2>
				<p>{`Français${extra}`}</p>
			</CollapsibleCards>
		</>
	)
}

describe('le groupe replié', () => {
	test('replié au départ, avec un résumé que le clavier atteint', async () => {
		const zone = await jsdomWindow.monter(<Page />)
		const group = zone.querySelector('details')
		expect(group?.open).toBe(false)
		const summary = group?.querySelector('summary')
		expect(summary?.textContent).toContain('Pour aller plus loin')
		// A native summary is a button for the keyboard: Enter and Space open it.
		expect(summary?.tagName).toBe('SUMMARY')
	})

	test('un lien vers une carte du groupe l’ouvre avant d’y aller', async () => {
		const zone = await jsdomWindow.monter(<Page />)
		const group = zone.querySelector('details')
		await jsdomWindow.cliquer(jsdomWindow.w.document.querySelector('a[href="#carte-langues"]') as Element)
		expect(group?.open).toBe(true)
	})

	test('un lien vers une carte hors du groupe le laisse replié', async () => {
		const zone = await jsdomWindow.monter(<Page />)
		await jsdomWindow.cliquer(jsdomWindow.w.document.querySelector('a[href="#carte-photo"]') as Element)
		expect(zone.querySelector('details')?.open).toBe(false)
	})

	test('une adresse qui change d’elle-même (retour arrière, adresse tapée) l’ouvre aussi', async () => {
		const zone = await jsdomWindow.monter(<Page />)
		jsdomWindow.w.location.hash = '#carte-langues'
		await act(async () => {
			jsdomWindow.w.dispatchEvent(new jsdomWindow.w.HashChangeEvent('hashchange'))
		})
		expect(zone.querySelector('details')?.open).toBe(true)
	})

	test('ouvert, il le reste quand la page est relue après un enregistrement', async () => {
		const zone = await jsdomWindow.monter(<Page />)
		const group = zone.querySelector('details') as HTMLDetailsElement
		await jsdomWindow.cliquer(group.querySelector('summary') as Element)
		expect(group.open).toBe(true)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Relire'))
		// The text inside changed, the element is the same one, and it is still open.
		expect(zone.textContent).toContain('et anglais')
		expect(zone.querySelector('details')).toBe(group)
		expect(group.open).toBe(true)
	})
})

describe('la vignette de la photo principale', () => {
	test('elle montre la photo, avec son texte alternatif, au lieu de « Photo ajoutée »', async () => {
		const zone = await jsdomWindow.monter(
			<MainPhotoThumbnail photo={{ id: 1, url: '/media/photo.jpg', largeur: 800, hauteur: 600, alt: '' }} />
		)
		const image = zone.querySelector('img')
		expect(image?.getAttribute('src')).toBe('/media/photo.jpg')
		expect(image?.getAttribute('alt')).toBe('Ta photo principale')
		expect(zone.textContent).not.toContain('Photo ajoutée')
	})
})
