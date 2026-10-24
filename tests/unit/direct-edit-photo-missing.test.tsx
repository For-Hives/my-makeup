import { describe, expect, test } from 'bun:test'
import { PhotoBlock } from '@/components/direct-edit/blocks/PhotoBlock'
import { EditSession } from '@/components/direct-edit/EditSession'
import type { DashboardPhoto } from '@/lib/dashboard/photos'
import { openWindow } from '../support/dom-react'

/**
 * Ticket 275, on her own page (issue 1075): a main photo that is named but whose file the import could not take over
 * is said where the photo goes, not hidden behind the invitation.
 */

const window_ = openWindow()
const PHOTO: DashboardPhoto = {
	id: 5,
	url: 'https://photos.example.test/media/a.webp',
	largeur: 400,
	hauteur: 400,
	alt: '',
}
const SENTENCE = 'Ta photo principale n’a pas pu être reprise, ajoute-la de nouveau.'
const save = (async (input: { photoPrincipale: number | string }) => ({
	ok: true as const,
	valeurs: { photoPrincipale: input.photoPrincipale },
})) as never

const mount = (missing: boolean, photo: DashboardPhoto | null) =>
	window_.monter(
		<EditSession refresh={() => undefined}>
			<PhotoBlock photo={photo} missing={missing} save={save}>
				<span>photo</span>
			</PhotoBlock>
		</EditSession>
	)

describe('ticket 275 : la photo principale que l’import n’a pas pu reprendre est signalée', () => {
	test('photo nommée mais sans fichier : la phrase est sur la page, avant tout clic', async () => {
		await mount(true, null)
		expect(window_.w.document.body.textContent).toContain(SENTENCE)
		expect(window_.w.document.querySelector('[data-testid="photo-principale-manquante"]')).not.toBeNull()
	})

	test('une photo qui s’affiche, ou aucune photo nommée : pas de phrase', async () => {
		await mount(false, PHOTO)
		expect(window_.w.document.body.textContent).not.toContain('pas pu être reprise')
		await window_.demonter()
		await mount(false, null)
		expect(window_.w.document.body.textContent).not.toContain('pas pu être reprise')
	})
})
