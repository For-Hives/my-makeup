import { describe, expect, test } from 'bun:test'
import { PhotoPickerButton } from '@/components/dashboard/PhotoPickerButton'
import { PortfolioEditor } from '@/components/dashboard/PortfolioEditor'
import { ACCEPT } from '@/lib/dashboard/photo'
import { openWindow } from '../support/dom-react'

/** The big button « Ajouter des photos » (ticket 306; audit UX n° 23): the native field behind its label. */

const jsdomWindow = openWindow()

describe('le grand bouton de choix des photos', () => {
	test('le champ natif reste dans la page et au clavier, derrière son libellé qui lui donne son nom', async () => {
		const zone = await jsdomWindow.monter(
			<>
				<PhotoPickerButton
					id="essai"
					libelle="Ajouter des photos"
					accept={ACCEPT}
					multiple
					disabled={false}
					aideId="essai-aide"
					onChange={() => undefined}
				/>
				<p id="essai-aide">Aide</p>
			</>
		)
		const input = zone.querySelector('input')
		// Hidden to the eye only: never `display: none` nor `hidden`, which would leave the tab order.
		expect(input?.className).toContain('sr-only')
		expect(input?.hasAttribute('hidden')).toBe(false)
		expect(input?.getAttribute('type')).toBe('file')
		expect(input?.multiple).toBe(true)
		expect(input?.getAttribute('accept')).toBe(ACCEPT)
		// No `capture`: it would force the camera and drop the photo library.
		expect(input?.hasAttribute('capture')).toBe(false)
		expect(input?.getAttribute('aria-describedby')).toBe('essai-aide')
		const label = zone.querySelector('label')
		expect(label?.getAttribute('for')).toBe('essai')
		expect(label?.textContent).toBe('Ajouter des photos')
		expect(label?.className).toContain('min-h-14')
		expect(jsdomWindow.champ('Ajouter des photos')).toBe(input as HTMLInputElement)
	})

	test('pendant une préparation, le champ est fermé', async () => {
		const zone = await jsdomWindow.monter(
			<PhotoPickerButton
				id="essai"
				libelle="Choisir une photo"
				accept={ACCEPT}
				disabled
				aideId="x"
				onChange={() => undefined}
			/>
		)
		expect(zone.querySelector('input')?.disabled).toBe(true)
	})
})

describe('le portfolio garde sa règle : rien n’est envoyé avant « Enregistrer »', () => {
	test('le panneau ouvert montre le grand bouton et la phrase qui le dit', async () => {
		await jsdomWindow.monter(<PortfolioEditor photos={[]} envoyer={async () => ({ ok: false, message: 'x' })} />)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier mon portfolio'))
		expect(jsdomWindow.champ('Ajouter des photos').className).toContain('sr-only')
		expect(jsdomWindow.w.document.getElementById('portfolio-aide')?.textContent).toContain(
			'rien n’est envoyé avant « Enregistrer »'
		)
	})
})
