import { describe, expect, test } from 'bun:test'
import { PhotoEditor, type PhotoUpload } from '@/components/dashboard/PhotoEditor'
import { MESSAGES_PHOTO, type PreparedPhoto } from '@/lib/dashboard/photo'
import type { DashboardPhoto } from '@/lib/dashboard/photos'
import type { FileUploadResult } from '@/lib/dashboard/photos-upload'
import { UNCERTAIN_RESULT_MESSAGE } from '@/lib/dashboard/photos-upload'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { openWindow } from '../support/dom-react'
import { pickFiles } from '../support/pick-files'

/**
 * The panel of the main photo (ticket 134; plan 02 E36, U03, I24): a file is checked and reduced
 * before anything is sent, nothing leaves before « Enregistrer », a failure keeps the former photo
 * and says so. The browser work, the network and the server action are fakes.
 */

const jsdomWindow = openWindow()
const CURRENT: DashboardPhoto = {
	id: 5,
	url: 'https://photos.example.test/media/a.webp',
	largeur: 800,
	hauteur: 600,
	alt: '',
}
const REDUCED = new File(['petit'], 'photo.webp', { type: 'image/webp' })

function bench(
	options: {
		preparer?: (f: File) => Promise<PreparedPhoto<File>>
		televerser?: () => Promise<FileUploadResult>
		envoyer?: PhotoUpload
	} = {}
) {
	const log = { prepares: 0, televerses: 0, supprimes: [] as unknown[], enregistres: [] as unknown[] }
	const prepare =
		options.preparer ??
		(async () => {
			log.prepares++
			return { ok: true as const, fichier: REDUCED, largeur: 800, hauteur: 600, taille: 5 }
		})
	const upload =
		options.televerser ??
		(async () => {
			log.televerses++
			return { ok: true as const, id: 9 }
		})
	const send: PhotoUpload =
		options.envoyer ??
		(async saisie => {
			log.enregistres.push(saisie)
			return { ok: true, valeurs: { photoPrincipale: saisie.photoPrincipale } }
		})
	return {
		journal: log,
		monter: async () => {
			await jsdomWindow.monter(
				<PhotoEditor
					photo={CURRENT}
					envoyer={send}
					preparer={prepare}
					televerser={upload}
					supprimer={async id => {
						log.supprimes.push(id)
					}}
				/>
			)
			await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier ma photo principale'))
		},
	}
}

const dialogue = () => jsdomWindow.w.document.querySelector('[role="dialog"]')
const file = () => jsdomWindow.champ(/photo/i) as HTMLInputElement
const pick = (f: File) => pickFiles(jsdomWindow, file(), [f])
const alerts = () => [...jsdomWindow.w.document.querySelectorAll('[role="alert"]')].map(a => a.textContent).join('|')

describe('E36 : un fichier refusé est dit avant l’envoi', () => {
	test('la raison s’affiche sous le champ, rien n’est envoyé, « Enregistrer » reste éteint', async () => {
		const b = bench({
			preparer: async () => ({ ok: false, raison: 'type', code: 'type', message: MESSAGES_PHOTO.type }),
		})
		await b.monter()
		await pick(new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }))
		await jsdomWindow.attendre(() => alerts().includes(MESSAGES_PHOTO.type))
		expect(b.journal.televerses).toBe(0)
		expect((jsdomWindow.bouton('Enregistrer') as HTMLButtonElement).disabled).toBe(true)
	})
})

describe('rien n’est envoyé avant « Enregistrer »', () => {
	test('choisir puis fermer en abandonnant : aucun envoi, aucun enregistrement', async () => {
		const b = bench()
		await b.monter()
		await pick(new File(['gros'], 'grosse.jpg', { type: 'image/jpeg' }))
		await jsdomWindow.attendre(
			() => jsdomWindow.w.document.querySelector('img[alt="Aperçu de la photo choisie"]') ?? null
		)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Fermer'))
		await jsdomWindow.cliquer(jsdomWindow.bouton('Abandonner mes modifications'))
		expect(dialogue()).toBeNull()
		expect(b.journal.televerses).toBe(0)
		expect(b.journal.enregistres).toEqual([])
	})
})

describe('enregistrer : le fichier réduit part, puis il est nommé', () => {
	test('le panneau se ferme, la réussite est annoncée hors du panneau', async () => {
		const b = bench()
		await b.monter()
		await pick(new File(['gros'], 'grosse.jpg', { type: 'image/jpeg' }))
		await jsdomWindow.attendre(() => !(jsdomWindow.bouton('Enregistrer') as HTMLButtonElement).disabled)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => dialogue() === null)
		expect(b.journal.televerses).toBe(1)
		expect(b.journal.enregistres).toEqual([{ photoPrincipale: 9 }])
		expect(jsdomWindow.w.document.body.textContent).toContain('Ta photo principale est enregistrée.')
	})

	test('le serveur dit « non » : message en français, fichier envoyé supprimé, panneau ouvert avec le choix', async () => {
		const b = bench({ envoyer: async () => ({ ok: false, message: FAILURE_MESSAGE }) })
		await b.monter()
		await pick(new File(['gros'], 'grosse.jpg', { type: 'image/jpeg' }))
		await jsdomWindow.attendre(() => !(jsdomWindow.bouton('Enregistrer') as HTMLButtonElement).disabled)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => alerts().includes(FAILURE_MESSAGE))
		expect(b.journal.supprimes).toEqual([9])
		expect(dialogue()).not.toBeNull()
		expect(jsdomWindow.w.document.body.textContent).not.toContain('est enregistrée')
	})

	test('la réponse se perd : message d’incertitude, rien n’est supprimé', async () => {
		const b = bench({
			envoyer: async () => {
				throw new Error('Failed to fetch')
			},
		})
		await b.monter()
		await pick(new File(['gros'], 'grosse.jpg', { type: 'image/jpeg' }))
		await jsdomWindow.attendre(() => !(jsdomWindow.bouton('Enregistrer') as HTMLButtonElement).disabled)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => alerts().includes(UNCERTAIN_RESULT_MESSAGE))
		expect(b.journal.supprimes).toEqual([])
	})

	test('coupure pendant l’envoi du fichier : message, rien d’enregistré (la photo en place reste)', async () => {
		const b = bench({ televerser: async () => ({ ok: false, message: MESSAGES_PHOTO['envoi-impossible'] }) })
		await b.monter()
		await pick(new File(['gros'], 'grosse.jpg', { type: 'image/jpeg' }))
		await jsdomWindow.attendre(() => !(jsdomWindow.bouton('Enregistrer') as HTMLButtonElement).disabled)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => alerts().includes(MESSAGES_PHOTO['envoi-impossible']))
		expect(b.journal.enregistres).toEqual([])
	})

	test('double clic pendant l’envoi : un seul envoi', async () => {
		let openDoor: () => void = () => {}
		const door = new Promise<void>(resolve => {
			openDoor = resolve
		})
		const b = bench({
			televerser: async () => {
				await door
				return { ok: true, id: 9 }
			},
		})
		await b.monter()
		await pick(new File(['gros'], 'grosse.jpg', { type: 'image/jpeg' }))
		await jsdomWindow.attendre(() => !(jsdomWindow.bouton('Enregistrer') as HTMLButtonElement).disabled)
		const button = jsdomWindow.bouton('Enregistrer')
		await jsdomWindow.cliquer(button)
		await jsdomWindow.cliquer(button)
		openDoor()
		await jsdomWindow.attendre(() => dialogue() === null)
		expect(b.journal.enregistres).toHaveLength(1)
	})
})
