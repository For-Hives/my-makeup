import { describe, expect, test } from 'bun:test'
import { PortfolioEditor, type PortfolioUpload } from '@/components/dashboard/PortfolioEditor'
import { MESSAGES_PHOTO, type PreparedPhoto } from '@/lib/dashboard/photo'
import type { DashboardPhoto } from '@/lib/dashboard/photos'
import type { FileUploadResult } from '@/lib/dashboard/photos-upload'
import { UNCERTAIN_RESULT_MESSAGE } from '@/lib/dashboard/photos-upload'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import type { PhotoUsageView } from '@/lib/photo-limits'
import { openWindow } from '../support/dom-react'
import { pickFiles } from '../support/pick-files'

/**
 * The panel of the portfolio, adding photos (ticket 135; plan 02 E34, E36, U80, rule L6): several
 * files at once, reduced then sent at « Enregistrer » only, ten at most, a refused file set aside
 * without losing the others. The browser work, the network and the server action are fakes.
 */

const jsdomWindow = openWindow()

const dashboardPhoto = (id: number): DashboardPhoto => ({
	id,
	url: `https://photos.example.test/media/${id}.webp`,
	largeur: 800,
	hauteur: 600,
	alt: '',
})

let sourceCounter = 0
/** A file as the file dialog gives it: its own name, size and date. */
const source = (nom: string, type = 'image/jpeg') =>
	new File([`contenu ${++sourceCounter}`], nom, { type, lastModified: 1_000 + sourceCounter })

function bench(
	options: {
		existantes?: DashboardPhoto[]
		usage?: PhotoUsageView
		refuser?: (f: File) => string | null
		televerser?: (fichier: File) => Promise<FileUploadResult>
		envoyer?: PortfolioUpload
	} = {}
) {
	const log = {
		prepares: [] as string[],
		televerses: [] as string[],
		supprimes: [] as unknown[],
		enregistres: [] as unknown[],
	}
	let nextId = 100
	const prepare = async (f: File): Promise<PreparedPhoto<File>> => {
		log.prepares.push(f.name)
		const pattern = options.refuser?.(f)
		if (pattern) return { ok: false, raison: 'type', code: 'type', message: pattern }
		return {
			ok: true,
			fichier: new File([String(f.lastModified)], f.name, { type: 'image/webp' }),
			largeur: 8,
			hauteur: 6,
			taille: 5,
		}
	}
	const upload =
		options.televerser ??
		(async (fichier: File) => {
			log.televerses.push(fichier.name)
			return { ok: true as const, id: ++nextId }
		})
	const send: PortfolioUpload =
		options.envoyer ??
		(async saisie => {
			log.enregistres.push(saisie.galerie)
			return { ok: true, valeurs: { galerie: saisie.galerie } }
		})
	return {
		journal: log,
		monter: async () => {
			await jsdomWindow.monter(
				<PortfolioEditor
					photos={options.existantes ?? []}
					usage={options.usage}
					envoyer={send}
					preparer={prepare}
					televerser={upload}
					supprimer={async id => {
						log.supprimes.push(id)
					}}
				/>
			)
			await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier mon portfolio'))
		},
	}
}

const dialogue = () => jsdomWindow.w.document.querySelector('[role="dialog"]')
const field = () => jsdomWindow.champ('Ajouter des photos') as HTMLInputElement
const pick = (...noms: string[]) =>
	pickFiles(
		jsdomWindow,
		field(),
		noms.map(nom => source(nom))
	)
const images = () => [...jsdomWindow.w.document.querySelectorAll<HTMLImageElement>('[role="dialog"] li img')]
const alerts = () => [...jsdomWindow.w.document.querySelectorAll('[role="alert"]')].map(a => a.textContent).join('|')
const ready = () => !(jsdomWindow.bouton('Enregistrer') as HTMLButtonElement).disabled
const save = async () => {
	await jsdomWindow.attendre(ready)
	await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
}

describe('E34 : plusieurs photos choisies d’un coup, dans l’ordre d’ajout', () => {
	test('trois photos après les deux existantes : cinq lignes, l’alt par défaut dit le rang, « À enregistrer » sur les nouvelles', async () => {
		const b = bench({ existantes: [dashboardPhoto(1), dashboardPhoto(2)] })
		await b.monter()
		await pick('a.jpg', 'b.jpg', 'c.jpg')
		await jsdomWindow.attendre(() => images().length === 5)

		expect(images().map(i => i.alt)).toEqual([
			'Photo 1 sur 5 de ton portfolio',
			'Photo 2 sur 5 de ton portfolio',
			'Photo 3 sur 5 de ton portfolio',
			'Photo 4 sur 5 de ton portfolio',
			'Photo 5 sur 5 de ton portfolio',
		])
		expect(jsdomWindow.w.document.body.textContent?.match(/À enregistrer/g)).toHaveLength(3)
		expect(jsdomWindow.w.document.body.textContent).toContain('5 / 10')
		expect(b.journal.televerses).toEqual([])
	})

	test('« Enregistrer » envoie les nouvelles dans l’ordre, puis nomme toute la liste dans l’ordre ; le panneau se ferme et l’annonce', async () => {
		const b = bench({ existantes: [dashboardPhoto(1), dashboardPhoto(2)] })
		await b.monter()
		await pick('a.jpg', 'b.jpg', 'c.jpg')
		await save()
		await jsdomWindow.attendre(() => dialogue() === null)

		expect(b.journal.televerses).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
		expect(b.journal.enregistres).toEqual([[1, 2, 101, 102, 103]])
		expect(jsdomWindow.w.document.body.textContent).toContain('Ton portfolio est enregistré.')
	})
})

describe('U80 : dix photos au plus', () => {
	test('la 11e est refusée avec son message, les dix autres sont gardées', async () => {
		const b = bench({ existantes: Array.from({ length: 8 }, (_, i) => dashboardPhoto(i + 1)) })
		await b.monter()
		await pick('a.jpg', 'b.jpg', 'c.jpg')
		await jsdomWindow.attendre(() => images().length === 10)

		expect(alerts()).toContain(`c.jpg : ${MESSAGES_PHOTO['limite-galerie']}`)
		expect(b.journal.prepares).toEqual(['a.jpg', 'b.jpg'])
	})
})

describe('E36 : un fichier refusé est écarté sans perdre les autres', () => {
	test('un PDF parmi trois photos : deux lignes, le refus est dit avec le nom du fichier', async () => {
		const b = bench({ refuser: f => (f.name.endsWith('.pdf') ? MESSAGES_PHOTO.type : null) })
		await b.monter()
		await pick('a.jpg', 'cv.pdf', 'c.jpg')
		await jsdomWindow.attendre(() => images().length === 2)

		expect(alerts()).toContain(`cv.pdf : ${MESSAGES_PHOTO.type}`)
		await save()
		await jsdomWindow.attendre(() => dialogue() === null)
		expect(b.journal.televerses).toEqual(['a.jpg', 'c.jpg'])
	})
})

describe('L6 : le même fichier choisi deux fois est refusé, et le refus est dit (L2 et L3 : sans objet, une photo n’a ni champ de saisie ni formulaire de modification)', () => {
	test('la seconde fois, une seule ligne et le message près du champ', async () => {
		const b = bench()
		await b.monter()
		const file = source('a.jpg')
		await pickFiles(jsdomWindow, field(), [file])
		await jsdomWindow.attendre(() => images().length === 1)
		await pickFiles(jsdomWindow, field(), [file])
		await jsdomWindow.attendre(() => alerts().includes(MESSAGES_PHOTO.doublon))

		expect(images()).toHaveLength(1)
	})

	test('L1 : deux photos de même nom et de même aspect restent deux lignes, chacune avec sa propre clé', async () => {
		const b = bench()
		await b.monter()
		await pick('a.jpg', 'a.jpg')
		await jsdomWindow.attendre(() => images().length === 2)
		expect(alerts()).not.toContain(MESSAGES_PHOTO.doublon)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => dialogue() === null)
		expect(b.journal.televerses).toEqual(['a.jpg', 'a.jpg'])
		expect(b.journal.enregistres).toEqual([[101, 102]])
	})
})

describe('E34 : fermer sans valider n’envoie rien', () => {
	test('abandonner après avoir choisi : aucun envoi, aucun enregistrement, la liste d’avant au rechargement du panneau', async () => {
		const b = bench({ existantes: [dashboardPhoto(1)] })
		await b.monter()
		await pick('a.jpg', 'b.jpg')
		await jsdomWindow.attendre(() => images().length === 3)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Fermer'))
		await jsdomWindow.cliquer(jsdomWindow.bouton('Abandonner mes modifications'))

		expect(dialogue()).toBeNull()
		expect(b.journal.televerses).toEqual([])
		expect(b.journal.enregistres).toEqual([])
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier mon portfolio'))
		expect(images()).toHaveLength(1)
	})

	test('sans photo choisie, « Enregistrer » est éteint et fermer ne demande rien', async () => {
		await bench().monter()
		expect((jsdomWindow.bouton('Enregistrer') as HTMLButtonElement).disabled).toBe(true)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Fermer'))
		expect(dialogue()).toBeNull()
	})
})

describe('un échec laisse le portfolio comme il était', () => {
	test('coupure pendant l’envoi de la 2e : la 1re est reprise, rien n’est nommé, le panneau garde les choix', async () => {
		let n = 0
		const b = bench({
			televerser: async () =>
				++n === 2 ? { ok: false, message: MESSAGES_PHOTO['envoi-impossible'] } : { ok: true, id: 101 },
		})
		await b.monter()
		await pick('a.jpg', 'b.jpg')
		await save()
		await jsdomWindow.attendre(() => alerts().includes(MESSAGES_PHOTO['envoi-impossible']))

		expect(b.journal.enregistres).toEqual([])
		expect(b.journal.supprimes).toEqual([101])
		expect(images()).toHaveLength(2)
	})

	test('« non » du serveur : fichiers envoyés repris ; réponse perdue : rien n’est repris', async () => {
		const non = bench({ envoyer: async () => ({ ok: false, message: FAILURE_MESSAGE }) })
		await non.monter()
		await pick('a.jpg')
		await save()
		await jsdomWindow.attendre(() => alerts().includes(FAILURE_MESSAGE))
		expect(non.journal.supprimes).toEqual([101])
		await jsdomWindow.demonter()

		const lost = bench({
			envoyer: async () => {
				throw new Error('Failed to fetch')
			},
		})
		await lost.monter()
		await pick('a.jpg')
		await save()
		await jsdomWindow.attendre(() => alerts().includes(UNCERTAIN_RESULT_MESSAGE))
		expect(lost.journal.supprimes).toEqual([])
	})

	test('après une réponse perdue, un nouvel essai renomme sans renvoyer le fichier déjà envoyé', async () => {
		let attempt = 0
		const b = bench({
			envoyer: async saisie => {
				if (++attempt === 1) throw new Error('Failed to fetch')
				return { ok: true, valeurs: { galerie: saisie.galerie } }
			},
		})
		await b.monter()
		await pick('a.jpg')
		await save()
		await jsdomWindow.attendre(() => alerts().includes(UNCERTAIN_RESULT_MESSAGE))
		await save()
		await jsdomWindow.attendre(() => dialogue() === null)
		expect(b.journal.televerses).toEqual(['a.jpg'])
	})
})

describe('L7 : Entrée maintenue n’agit qu’une fois', () => {
	test('les répétitions d’Entrée sur « Enregistrer » et sur « Modifier » sont ignorées', async () => {
		const b = bench()
		await b.monter()
		await pick('a.jpg')
		await jsdomWindow.attendre(ready)
		const repeats = () =>
			new jsdomWindow.w.KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true })
		const onValue = jsdomWindow.bouton('Enregistrer')
		const event = repeats()
		onValue.dispatchEvent(event)
		expect(event.defaultPrevented).toBe(true)
		expect(b.journal.televerses).toEqual([])
	})
})

/** The panel with three photos she already has, and a gesture of the keyboard or of the pointer. */
const remove = (rang: number) => jsdomWindow.cliquer(jsdomWindow.bouton(`Retirer la photo ${rang}`))
/** A removal by the keyboard: no mouse button goes down. */
const removeKeyboard = async (rang: number) => {
	const button = jsdomWindow.bouton(`Retirer la photo ${rang}`)
	button.focus()
	const { act } = await import('react')
	await act(async () => {
		button.dispatchEvent(new jsdomWindow.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
		button.click()
	})
}
const active = () => jsdomWindow.w.document.activeElement
const announcement = () => jsdomWindow.w.document.querySelector('[data-testid="annonce-retrait"]')?.textContent ?? ''
const THREE = [dashboardPhoto(1), dashboardPhoto(2), dashboardPhoto(3)]

describe('E35 : retirer une photo, la validation la retire de la liste', () => {
	test('retirer la 2e puis enregistrer : la liste envoyée n’a plus que les deux autres, aucun fichier n’est envoyé', async () => {
		const b = bench({ existantes: THREE })
		await b.monter()
		await remove(2)
		expect(images()).toHaveLength(2)
		await save()
		await jsdomWindow.attendre(() => dialogue() === null)

		expect(b.journal.enregistres).toEqual([[1, 3]])
		expect(b.journal.televerses).toEqual([])
		expect(b.journal.supprimes).toEqual([])
		expect(jsdomWindow.w.document.body.textContent).toContain('Ton portfolio est enregistré.')
	})

	test('tout retirer puis enregistrer : la liste vide est envoyée', async () => {
		const b = bench({ existantes: [dashboardPhoto(1)] })
		await b.monter()
		await remove(1)
		await save()
		await jsdomWindow.attendre(() => dialogue() === null)
		expect(b.journal.enregistres).toEqual([[]])
	})

	test('« Enregistrer » est éteint tant que rien n’a changé, et se rallume au premier retrait', async () => {
		await bench({ existantes: THREE }).monter()
		expect(ready()).toBe(false)
		await remove(1)
		expect(ready()).toBe(true)
	})

	test('retirer puis fermer sans valider : rien n’est enregistré, la photo est toujours là à la réouverture', async () => {
		const b = bench({ existantes: THREE })
		await b.monter()
		await remove(1)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Fermer'))
		await jsdomWindow.cliquer(jsdomWindow.bouton('Abandonner mes modifications'))

		expect(dialogue()).toBeNull()
		expect(b.journal.enregistres).toEqual([])
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier mon portfolio'))
		expect(images()).toHaveLength(3)
	})

	test('un échec du serveur garde la photo retirée dans le panneau et dit l’échec ; rien n’est supprimé par le navigateur', async () => {
		const b = bench({ existantes: THREE, envoyer: async () => ({ ok: false, message: FAILURE_MESSAGE }) })
		await b.monter()
		await remove(2)
		await save()
		await jsdomWindow.attendre(() => alerts().includes(FAILURE_MESSAGE))
		expect(images()).toHaveLength(2)
		expect(b.journal.supprimes).toEqual([])
	})
})

describe('L1 : un identifiant par ligne', () => {
	test('deux photos choisies de même nom : retirer la première laisse la seconde intacte', async () => {
		const uploaded: string[] = []
		const b = bench({
			televerser: async fichier => {
				uploaded.push(await fichier.text())
				return { ok: true, id: 100 + uploaded.length }
			},
		})
		await b.monter()
		const [firstOne, second] = [source('a.jpg'), source('a.jpg')]
		await pickFiles(jsdomWindow, field(), [firstOne, second])
		await jsdomWindow.attendre(() => images().length === 2)
		await remove(1)

		expect(images()).toHaveLength(1)
		await save()
		await jsdomWindow.attendre(() => dialogue() === null)
		expect(uploaded).toEqual([String(second.lastModified)])
	})
})

describe('L4 : après un retrait, le focus reste dans le panneau', () => {
	test('la ligne du milieu : le focus va sur la ligne qui prend sa place', async () => {
		await bench({ existantes: THREE }).monter()
		await removeKeyboard(2)
		expect(active()?.getAttribute('aria-label')).toBe('Retirer la photo 2')
		expect(dialogue()?.contains(active())).toBe(true)
	})

	test('la dernière ligne : le focus va sur la ligne du dessus', async () => {
		await bench({ existantes: THREE }).monter()
		await removeKeyboard(3)
		expect(active()?.getAttribute('aria-label')).toBe('Retirer la photo 2')
	})

	test('la seule ligne : au clavier le focus va sur le champ d’ajout, au clic sur le titre, jamais sur un champ', async () => {
		await bench({ existantes: [dashboardPhoto(1)] }).monter()
		await removeKeyboard(1)
		expect(active()).toBe(field())
		await jsdomWindow.demonter()

		await bench({ existantes: [dashboardPhoto(1)] }).monter()
		await remove(1)
		expect(active()?.tagName).toBe('H3')
		expect(dialogue()?.contains(active())).toBe(true)
	})
})

describe('L5 : chaque retrait est annoncé', () => {
	test('la zone existe et est vide à l’ouverture ; elle nomme la photo retirée', async () => {
		await bench({ existantes: THREE }).monter()
		const zone = jsdomWindow.w.document.querySelector('[data-testid="annonce-retrait"]')
		expect(zone?.getAttribute('role')).toBe('status')
		expect(announcement()).toBe('')
		await remove(2)
		expect(announcement()).toContain('Photo 2 sur 3 de ton portfolio est retirée')
	})

	test('deux retraits de même nom sont annoncés deux fois : le texte change entre les deux', async () => {
		const b = bench({ existantes: THREE })
		await b.monter()
		await remove(2)
		const firstOne = announcement()
		await pick('a.jpg')
		await jsdomWindow.attendre(() => images().length === 3)
		await remove(2)
		const second = announcement()

		expect(firstOne).toContain('Photo 2 sur 3 de ton portfolio est retirée')
		expect(second).toContain('Photo 2 sur 3 de ton portfolio est retirée')
		expect(second).not.toBe(firstOne)
	})
})

describe('L7 : Entrée maintenue retire une seule photo', () => {
	test('les répétitions d’Entrée sur « Retirer » sont ignorées ; un appui retire une photo', async () => {
		await bench({ existantes: THREE }).monter()
		const button = jsdomWindow.bouton('Retirer la photo 1')
		const repeats = new jsdomWindow.w.KeyboardEvent('keydown', {
			key: 'Enter',
			repeat: true,
			bubbles: true,
			cancelable: true,
		})
		button.dispatchEvent(repeats)
		expect(repeats.defaultPrevented).toBe(true)
		expect(images()).toHaveLength(3)

		await removeKeyboard(1)
		const suite = new jsdomWindow.w.KeyboardEvent('keydown', {
			key: 'Enter',
			repeat: true,
			bubbles: true,
			cancelable: true,
		})
		active()?.dispatchEvent(suite)
		expect(suite.defaultPrevented).toBe(true)
		expect(images()).toHaveLength(2)
	})
})

describe('ticket 309 : le volume utilisé et les photos restantes, dits avant l’envoi', () => {
	const MIB = 1024 * 1024
	const usage = (count: number, bytes = 12.3 * MIB): PhotoUsageView => ({
		count,
		bytes,
		countMax: 45,
		bytesMax: 60 * MIB,
	})
	const sentence = () => jsdomWindow.w.document.querySelector('[data-testid="photo-usage"]')?.textContent

	test('la carte dit le volume pris et combien de photos il reste', async () => {
		const b = bench({ usage: usage(14) })
		await b.monter()
		expect(sentence()).toBe('Tes photos prennent 12,3 Mo sur 60 Mo. Il te reste 31 photos.')
	})

	test('à la limite du profil : le message dit quoi faire ; une photo choisie est refusée sans être préparée ni envoyée', async () => {
		const b = bench({ usage: usage(44), existantes: [dashboardPhoto(1)] })
		await b.monter()
		await pick('a.jpg', 'b.jpg')
		await jsdomWindow.attendre(() => alerts().includes('b.jpg'))

		// One photo left: the first fits, the second is refused before the browser works on it.
		expect(alerts()).toContain(`b.jpg : ${MESSAGES_PHOTO['limite-profil']}`)
		expect(alerts()).not.toContain('a.jpg :')
		expect(b.journal.prepares).toEqual(['a.jpg'])
		expect(b.journal.televerses).toEqual([])
	})

	test('au-dessus de la limite : la phrase l’annonce, aucune photo n’est ajoutée', async () => {
		const b = bench({ usage: usage(50, 70 * MIB) })
		await b.monter()
		expect(sentence()).toContain('Tu as atteint la limite')
		await pick('a.jpg')
		await jsdomWindow.attendre(() => alerts().includes('a.jpg'))
		expect(b.journal.prepares).toEqual([])
	})
})
