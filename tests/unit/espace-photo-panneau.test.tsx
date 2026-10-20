import { describe, expect, test } from 'bun:test'
import { PhotoEditor, type PhotoUpload } from '@/components/dashboard/PhotoEditor'
import { MESSAGES_PHOTO, type PreparedPhoto } from '@/lib/dashboard/photo'
import type { DashboardPhoto } from '@/lib/dashboard/photos'
import type { FileUploadResult } from '@/lib/dashboard/photos-upload'
import { UNCERTAIN_RESULT_MESSAGE } from '@/lib/dashboard/photos-upload'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { choisirDesFichiers } from '../outils/choisir-fichiers'
import { ouvrirFenetre } from '../outils/dom-react'

/**
 * The panel of the main photo (ticket 134; plan 02 E36, U03, I24): a file is checked and reduced
 * before anything is sent, nothing leaves before « Enregistrer », a failure keeps the former photo
 * and says so. The browser work, the network and the server action are fakes.
 */

const fenetre = ouvrirFenetre()
const ACTUELLE: DashboardPhoto = {
	id: 5,
	url: 'https://photos.example.test/media/a.webp',
	largeur: 800,
	hauteur: 600,
	alt: '',
}
const REDUITE = new File(['petit'], 'photo.webp', { type: 'image/webp' })

function banc(
	options: {
		preparer?: (f: File) => Promise<PreparedPhoto<File>>
		televerser?: () => Promise<FileUploadResult>
		envoyer?: PhotoUpload
	} = {}
) {
	const journal = { prepares: 0, televerses: 0, supprimes: [] as unknown[], enregistres: [] as unknown[] }
	const preparer =
		options.preparer ??
		(async () => {
			journal.prepares++
			return { ok: true as const, fichier: REDUITE, largeur: 800, hauteur: 600, taille: 5 }
		})
	const televerser =
		options.televerser ??
		(async () => {
			journal.televerses++
			return { ok: true as const, id: 9 }
		})
	const envoyer: PhotoUpload =
		options.envoyer ??
		(async saisie => {
			journal.enregistres.push(saisie)
			return { ok: true, valeurs: { photoPrincipale: saisie.photoPrincipale } }
		})
	return {
		journal,
		monter: async () => {
			await fenetre.monter(
				<PhotoEditor
					photo={ACTUELLE}
					envoyer={envoyer}
					preparer={preparer}
					televerser={televerser}
					supprimer={async id => {
						journal.supprimes.push(id)
					}}
				/>
			)
			await fenetre.cliquer(fenetre.bouton('Modifier ma photo principale'))
		},
	}
}

const dialogue = () => fenetre.w.document.querySelector('[role="dialog"]')
const fichier = () => fenetre.champ(/photo/i) as HTMLInputElement
const choisir = (f: File) => choisirDesFichiers(fenetre, fichier(), [f])
const alertes = () => [...fenetre.w.document.querySelectorAll('[role="alert"]')].map(a => a.textContent).join('|')

describe('E36 : un fichier refusé est dit avant l’envoi', () => {
	test('la raison s’affiche sous le champ, rien n’est envoyé, « Enregistrer » reste éteint', async () => {
		const b = banc({
			preparer: async () => ({ ok: false, raison: 'type', code: 'type', message: MESSAGES_PHOTO.type }),
		})
		await b.monter()
		await choisir(new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }))
		await fenetre.attendre(() => alertes().includes(MESSAGES_PHOTO.type))
		expect(b.journal.televerses).toBe(0)
		expect((fenetre.bouton('Enregistrer') as HTMLButtonElement).disabled).toBe(true)
	})
})

describe('rien n’est envoyé avant « Enregistrer »', () => {
	test('choisir puis fermer en abandonnant : aucun envoi, aucun enregistrement', async () => {
		const b = banc()
		await b.monter()
		await choisir(new File(['gros'], 'grosse.jpg', { type: 'image/jpeg' }))
		await fenetre.attendre(() => fenetre.w.document.querySelector('img[alt="Aperçu de la photo choisie"]') ?? null)
		await fenetre.cliquer(fenetre.bouton('Fermer'))
		await fenetre.cliquer(fenetre.bouton('Abandonner mes modifications'))
		expect(dialogue()).toBeNull()
		expect(b.journal.televerses).toBe(0)
		expect(b.journal.enregistres).toEqual([])
	})
})

describe('enregistrer : le fichier réduit part, puis il est nommé', () => {
	test('le panneau se ferme, la réussite est annoncée hors du panneau', async () => {
		const b = banc()
		await b.monter()
		await choisir(new File(['gros'], 'grosse.jpg', { type: 'image/jpeg' }))
		await fenetre.attendre(() => !(fenetre.bouton('Enregistrer') as HTMLButtonElement).disabled)
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => dialogue() === null)
		expect(b.journal.televerses).toBe(1)
		expect(b.journal.enregistres).toEqual([{ photoPrincipale: 9 }])
		expect(fenetre.w.document.body.textContent).toContain('Ta photo principale est enregistrée.')
	})

	test('le serveur dit « non » : message en français, fichier envoyé supprimé, panneau ouvert avec le choix', async () => {
		const b = banc({ envoyer: async () => ({ ok: false, message: FAILURE_MESSAGE }) })
		await b.monter()
		await choisir(new File(['gros'], 'grosse.jpg', { type: 'image/jpeg' }))
		await fenetre.attendre(() => !(fenetre.bouton('Enregistrer') as HTMLButtonElement).disabled)
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => alertes().includes(FAILURE_MESSAGE))
		expect(b.journal.supprimes).toEqual([9])
		expect(dialogue()).not.toBeNull()
		expect(fenetre.w.document.body.textContent).not.toContain('est enregistrée')
	})

	test('la réponse se perd : message d’incertitude, rien n’est supprimé', async () => {
		const b = banc({
			envoyer: async () => {
				throw new Error('Failed to fetch')
			},
		})
		await b.monter()
		await choisir(new File(['gros'], 'grosse.jpg', { type: 'image/jpeg' }))
		await fenetre.attendre(() => !(fenetre.bouton('Enregistrer') as HTMLButtonElement).disabled)
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => alertes().includes(UNCERTAIN_RESULT_MESSAGE))
		expect(b.journal.supprimes).toEqual([])
	})

	test('coupure pendant l’envoi du fichier : message, rien d’enregistré (la photo en place reste)', async () => {
		const b = banc({ televerser: async () => ({ ok: false, message: MESSAGES_PHOTO['envoi-impossible'] }) })
		await b.monter()
		await choisir(new File(['gros'], 'grosse.jpg', { type: 'image/jpeg' }))
		await fenetre.attendre(() => !(fenetre.bouton('Enregistrer') as HTMLButtonElement).disabled)
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => alertes().includes(MESSAGES_PHOTO['envoi-impossible']))
		expect(b.journal.enregistres).toEqual([])
	})

	test('double clic pendant l’envoi : un seul envoi', async () => {
		let ouvrirLaPorte: () => void = () => {}
		const porte = new Promise<void>(resolve => {
			ouvrirLaPorte = resolve
		})
		const b = banc({
			televerser: async () => {
				await porte
				return { ok: true, id: 9 }
			},
		})
		await b.monter()
		await choisir(new File(['gros'], 'grosse.jpg', { type: 'image/jpeg' }))
		await fenetre.attendre(() => !(fenetre.bouton('Enregistrer') as HTMLButtonElement).disabled)
		const bouton = fenetre.bouton('Enregistrer')
		await fenetre.cliquer(bouton)
		await fenetre.cliquer(bouton)
		ouvrirLaPorte()
		await fenetre.attendre(() => dialogue() === null)
		expect(b.journal.enregistres).toHaveLength(1)
	})
})
