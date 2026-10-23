import { describe, expect, test } from 'bun:test'
import { act } from 'react'
import { MESSAGES_PHOTO } from '@/lib/dashboard/photo'
import type { DashboardPhoto } from '@/lib/dashboard/photos'
import { FAILURE_MESSAGE, MESSAGE_SESSION } from '@/lib/dashboard/result'
import { benchOf, EMPTY } from '../support/direct-edit-bench'
import { openWindow } from '../support/dom-react'
import { pickFiles } from '../support/pick-files'

/**
 * « Portfolio » on her own page in edit mode (issue 1018): the order is changed with buttons (a mouse, a
 * finger and a keyboard all press them) and saved, the main photo is chosen in the gallery, the
 * alternative text is asked with a help and never blocks, and the limits of the uploads are said before
 * the send. The browser work, the network and the server actions are fakes.
 */

const window_ = openWindow()
const doc = () => window_.w.document
const alerts = () => [...doc().querySelectorAll('[role="alert"]')].map(alert => alert.textContent).join('|')
const status = () => doc().querySelector('[data-testid="edit-status"]')?.textContent
const announced = () => doc().querySelector('[data-testid="gallery-announcement"]')?.textContent
const photo = (id: number, alt = ''): DashboardPhoto => ({
	id,
	url: `https://photos.example.test/media/${id}.webp`,
	largeur: 400,
	hauteur: 500,
	alt,
})
const GALLERY = [photo(11, 'Mariée en lumière du jour'), photo(12), photo(13)]
const PREPARED = new File(['petit'], 'photo.webp', { type: 'image/webp' })
const ready = async () => ({ ok: true as const, fichier: PREPARED, largeur: 400, hauteur: 400, taille: 5 })
const press = (button: Element, detail: 0 | 1) =>
	act(async () => {
		if (detail === 1) button.dispatchEvent(new window_.w.MouseEvent('pointerdown', { bubbles: true }))
		button.dispatchEvent(new window_.w.MouseEvent('click', { bubbles: true, detail }))
	})
const field = () => doc().querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement
const open = async (options: Parameters<typeof benchOf>[1] = {}) => {
	const bench = benchOf(window_, { gallery: GALLERY, ...options })
	await bench.mount()
	await window_.cliquer(window_.bouton('Modifier mon portfolio'))
	return bench
}

describe('le bloc', () => {
	test('est un bouton nommé pour ce qu’il change ; vide, il dit quoi faire', async () => {
		await benchOf(window_, { gallery: GALLERY }).mount()
		expect(window_.bouton('Modifier mon portfolio').getAttribute('aria-expanded')).toBe('false')
		await window_.demonter()
		await benchOf(window_, { profile: EMPTY }).mount()
		expect(doc().body.textContent).toContain('Ajoute des photos de tes réalisations.')
	})

	test('le grand bouton « Ajouter des photos » ouvre le choix d’images (appareil photo compris)', async () => {
		await open()
		expect(doc().querySelector('label[for="direct-gallery-files"]')?.textContent).toBe('Ajouter des photos')
		expect(field().multiple).toBe(true)
		expect(field().accept).toContain('image/')
	})
})

describe('l’ordre', () => {
	test('« Reculer » et « Avancer » changent l’ordre, qui est enregistré tel quel', async () => {
		const bench = await open()
		await window_.cliquer(window_.bouton('Reculer la photo 1'))
		expect(announced()).toBe('Photo déplacée en position 2 sur 3.')
		await window_.cliquer(window_.bouton('Avancer la photo 3'))
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => bench.calls.savePortfolio?.length || null)
		expect(bench.calls.savePortfolio).toEqual([{ galerie: [12, 13, 11] }])
	})

	test('au clavier : Entrée sur « Reculer » déplace la photo et le focus la suit', async () => {
		await open()
		const later = window_.bouton('Reculer la photo 1')
		later.focus()
		await press(later, 0)
		expect(doc().activeElement?.getAttribute('aria-label')).toBe('Reculer la photo 2')
	})

	test('la première photo ne peut pas avancer, la dernière ne peut pas reculer', async () => {
		await open()
		expect((window_.bouton('Avancer la photo 1') as HTMLButtonElement).disabled).toBe(true)
		expect((window_.bouton('Reculer la photo 3') as HTMLButtonElement).disabled).toBe(true)
	})

	test('sans changement, Enregistrer reste éteint', async () => {
		await open()
		expect((window_.bouton('Enregistrer') as HTMLButtonElement).disabled).toBe(true)
	})
})

describe('la photo principale', () => {
	test('se choisit dans la galerie : la galerie est enregistrée, puis la photo principale', async () => {
		const bench = await open()
		await window_.cliquer(window_.bouton('Choisir la photo 2 comme photo principale'))
		expect(window_.bouton('Choisir la photo 2 comme photo principale').getAttribute('aria-pressed')).toBe('true')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => bench.calls.saveMainPicture?.length || null)
		expect(bench.calls.saveMainPicture).toEqual([{ photoPrincipale: 12 }])
		expect(bench.refreshes).toBe(1)
	})

	test('si la photo principale échoue, l’éditeur reste ouvert et le dit', async () => {
		const bench = await open({ actions: { saveMainPicture: async () => ({ ok: false, message: FAILURE_MESSAGE }) } })
		await window_.cliquer(window_.bouton('Choisir la photo 2 comme photo principale'))
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => alerts().includes('ta photo principale n’a pas changé') || null)
		expect(bench.refreshes).toBe(0)
	})
})

describe('le texte alternatif', () => {
	test('est demandé avec une aide et n’est jamais obligatoire', async () => {
		const bench = await open()
		expect(doc().body.textContent).toContain('Dis ce qu’on voit, pour celles qui ne voient pas l’image. Facultatif.')
		// The photo without text is saved as it is.
		await window_.cliquer(window_.bouton('Reculer la photo 1'))
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => bench.calls.savePortfolio?.length || null)
	})

	test('un texte changé est enregistré pour la photo, après la galerie', async () => {
		const changes: [unknown, string][] = []
		const bench = await open({
			galleryWork: {
				changeAlt: async (id, alt) => {
					changes.push([id, alt])
					return true
				},
			},
		})
		await window_.saisir(window_.champ('Description de la photo 2'), 'Mariée de profil, teint lumineux')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => changes.length || null)
		expect(changes).toEqual([[12, 'Mariée de profil, teint lumineux']])
		expect(bench.calls.savePortfolio).toEqual([{ galerie: [11, 12, 13] }])
	})

	test('un texte qui ne s’enregistre pas ne fait pas échouer l’enregistrement', async () => {
		const bench = await open({ galleryWork: { changeAlt: async () => false } })
		await window_.saisir(window_.champ('Description de la photo 2'), 'Un texte')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => status() === 'Enregistré à l’instant' || null)
		expect(bench.refreshes).toBe(1)
	})
})

describe('les photos ajoutées et les limites', () => {
	test('rien n’est envoyé avant « Enregistrer » ; un fichier ajouté part avec son texte, après les autres', async () => {
		const uploads: string[] = []
		const bench = await open({
			galleryWork: {
				prepare: ready,
				upload: async (_file, alt) => {
					uploads.push(alt)
					return { ok: true, id: 99 }
				},
			},
		})
		await pickFiles(window_, field(), [new File(['x'], 'a.webp', { type: 'image/webp' })])
		await window_.attendre(() => doc().body.textContent?.includes('À enregistrer') || null)
		expect(uploads).toEqual([])
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => bench.calls.savePortfolio?.length || null)
		expect(uploads).toEqual(['Photo du portfolio'])
		expect(bench.calls.savePortfolio).toEqual([{ galerie: [11, 12, 13, 99] }])
	})

	test('aucun fichier en double : le même fichier choisi deux fois est refusé et dit', async () => {
		await open({ galleryWork: { prepare: ready } })
		const file = new File(['x'], 'a.webp', { type: 'image/webp', lastModified: 5 })
		await pickFiles(window_, field(), [file])
		await pickFiles(window_, field(), [file])
		await window_.attendre(() => alerts().includes(MESSAGES_PHOTO.doublon) || null)
		expect(doc().querySelectorAll('[data-photo]')).toHaveLength(4)
	})

	test('un fichier refusé par le navigateur est dit avant tout envoi', async () => {
		const bench = await open({
			galleryWork: { prepare: async () => ({ ok: false, raison: 'type', code: 'type', message: MESSAGES_PHOTO.type }) },
		})
		await pickFiles(window_, field(), [new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' })])
		await window_.attendre(() => alerts().includes(MESSAGES_PHOTO.type) || null)
		expect(bench.calls.savePortfolio).toBeUndefined()
	})

	test('la limite de dix photos est dite avant l’envoi', async () => {
		const many = Array.from({ length: 10 }, (_, rank) => photo(rank + 1))
		await open({ gallery: many, galleryWork: { prepare: ready } })
		await pickFiles(window_, field(), [new File(['x'], 'a.webp', { type: 'image/webp' })])
		await window_.attendre(() => alerts().includes(MESSAGES_PHOTO['limite-galerie']) || null)
	})

	test('une photo envoyée dans un enregistrement qui échoue est retirée à nouveau', async () => {
		const removed: unknown[] = []
		await open({
			actions: { savePortfolio: async () => ({ ok: false, message: FAILURE_MESSAGE }) },
			galleryWork: {
				prepare: ready,
				upload: async () => ({ ok: true, id: 99 }),
				remove: async id => {
					removed.push(id)
				},
			},
		})
		await pickFiles(window_, field(), [new File(['x'], 'a.webp', { type: 'image/webp' })])
		await window_.attendre(() => doc().querySelectorAll('[data-photo]').length === 4 || null)
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => alerts().includes(FAILURE_MESSAGE) || null)
		expect(removed).toEqual([99])
	})

	test('la session expirée garde les photos et propose de se reconnecter', async () => {
		await open({
			actions: { savePortfolio: async () => ({ ok: false, message: MESSAGE_SESSION, session: 'expiree' }) },
		})
		await window_.cliquer(window_.bouton('Reculer la photo 1'))
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => alerts().includes(MESSAGE_SESSION) || null)
		expect(doc().querySelectorAll('[data-photo]')).toHaveLength(3)
	})
})

describe('retirer une photo : les règles des listes', () => {
	test('L4 : après un retrait au clavier, le focus reste dans l’éditeur, sur la photo qui prend la place', async () => {
		await open()
		const remove = window_.bouton('Retirer la photo 1')
		remove.focus()
		await press(remove, 0)
		expect(doc().activeElement?.getAttribute('aria-label')).toBe('Retirer la photo 1')
		expect(doc().querySelectorAll('[data-photo]')).toHaveLength(2)
	})

	test('L4 : au toucher, la liste vide envoie le focus au titre, jamais à un champ', async () => {
		await open({ gallery: [photo(11)] })
		await press(window_.bouton('Retirer la photo 1'), 1)
		expect(doc().activeElement?.tagName).toBe('H3')
	})

	test('L5 : le retrait est annoncé', async () => {
		await open()
		expect(announced()).toBe('')
		await window_.cliquer(window_.bouton('Retirer la photo 2'))
		expect(announced()).toContain('Photo 2 sur 3 de ton portfolio est retirée')
	})

	test('L7 : Entrée maintenue ne retire qu’une photo', async () => {
		await open()
		const held = new window_.w.KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true })
		window_.bouton('Retirer la photo 1').dispatchEvent(held)
		expect(held.defaultPrevented).toBe(true)
	})

	test('retirer la photo principale de la galerie ne la garde pas comme choisie', async () => {
		const bench = await open()
		await window_.cliquer(window_.bouton('Choisir la photo 1 comme photo principale'))
		await window_.cliquer(window_.bouton('Retirer la photo 1'))
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => bench.calls.savePortfolio?.length || null)
		expect(bench.calls.saveMainPicture).toBeUndefined()
	})
})
