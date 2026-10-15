import { describe, expect, test } from 'bun:test'
import { EditeurDuPortfolio, type EnvoiDuPortfolio } from '@/components/espace/EditeurDuPortfolio'
import type { ResultatDEnvoiDUnFichier } from '@/lib/espace/envoi-des-photos'
import { MESSAGE_RESULTAT_INCERTAIN } from '@/lib/espace/envoi-des-photos'
import { MESSAGES_PHOTO, type PhotoPreparee } from '@/lib/espace/photo'
import type { PhotoDeLEspace } from '@/lib/espace/photos'
import { MESSAGE_ECHEC } from '@/lib/espace/resultat'
import { choisirDesFichiers } from '../outils/choisir-fichiers'
import { ouvrirFenetre } from '../outils/dom-react'

/**
 * The panel of the portfolio, adding photos (ticket 135; plan 02 E34, E36, U80, rule L6): several
 * files at once, reduced then sent at « Enregistrer » only, ten at most, a refused file set aside
 * without losing the others. The browser work, the network and the server action are fakes.
 */

const fenetre = ouvrirFenetre()

const photoDeLEspace = (id: number): PhotoDeLEspace => ({
	id,
	url: `https://photos.example.test/media/${id}.webp`,
	largeur: 800,
	hauteur: 600,
	alt: '',
})

let compteurDeSource = 0
/** A file as the file dialog gives it: its own name, size and date. */
const source = (nom: string, type = 'image/jpeg') =>
	new File([`contenu ${++compteurDeSource}`], nom, { type, lastModified: 1_000 + compteurDeSource })

function banc(
	options: {
		existantes?: PhotoDeLEspace[]
		refuser?: (f: File) => string | null
		televerser?: (fichier: File) => Promise<ResultatDEnvoiDUnFichier>
		envoyer?: EnvoiDuPortfolio
	} = {}
) {
	const journal = {
		prepares: [] as string[],
		televerses: [] as string[],
		supprimes: [] as unknown[],
		enregistres: [] as unknown[],
	}
	let prochainId = 100
	const preparer = async (f: File): Promise<PhotoPreparee<File>> => {
		journal.prepares.push(f.name)
		const motif = options.refuser?.(f)
		if (motif) return { ok: false, raison: 'type', code: 'type', message: motif }
		return { ok: true, fichier: new File(['petit'], f.name, { type: 'image/webp' }), largeur: 8, hauteur: 6, taille: 5 }
	}
	const televerser =
		options.televerser ??
		(async (fichier: File) => {
			journal.televerses.push(fichier.name)
			return { ok: true as const, id: ++prochainId }
		})
	const envoyer: EnvoiDuPortfolio =
		options.envoyer ??
		(async saisie => {
			journal.enregistres.push(saisie.galerie)
			return { ok: true, valeurs: { galerie: saisie.galerie } }
		})
	return {
		journal,
		monter: async () => {
			await fenetre.monter(
				<EditeurDuPortfolio
					photos={options.existantes ?? []}
					envoyer={envoyer}
					preparer={preparer}
					televerser={televerser}
					supprimer={async id => {
						journal.supprimes.push(id)
					}}
				/>
			)
			await fenetre.cliquer(fenetre.bouton('Modifier mon portfolio'))
		},
	}
}

const dialogue = () => fenetre.w.document.querySelector('[role="dialog"]')
const champ = () => fenetre.champ('Ajouter des photos') as HTMLInputElement
const choisir = (...noms: string[]) =>
	choisirDesFichiers(
		fenetre,
		champ(),
		noms.map(nom => source(nom))
	)
const images = () => [...fenetre.w.document.querySelectorAll<HTMLImageElement>('[role="dialog"] li img')]
const alertes = () => [...fenetre.w.document.querySelectorAll('[role="alert"]')].map(a => a.textContent).join('|')
const prete = () => !(fenetre.bouton('Enregistrer') as HTMLButtonElement).disabled
const enregistrer = async () => {
	await fenetre.attendre(prete)
	await fenetre.cliquer(fenetre.bouton('Enregistrer'))
}

describe('E34 : plusieurs photos choisies d’un coup, dans l’ordre d’ajout', () => {
	test('trois photos après les deux existantes : cinq lignes, l’alt par défaut dit le rang, « À enregistrer » sur les nouvelles', async () => {
		const b = banc({ existantes: [photoDeLEspace(1), photoDeLEspace(2)] })
		await b.monter()
		await choisir('a.jpg', 'b.jpg', 'c.jpg')
		await fenetre.attendre(() => images().length === 5)

		expect(images().map(i => i.alt)).toEqual([
			'Photo 1 sur 5 de ton portfolio',
			'Photo 2 sur 5 de ton portfolio',
			'Photo 3 sur 5 de ton portfolio',
			'Photo 4 sur 5 de ton portfolio',
			'Photo 5 sur 5 de ton portfolio',
		])
		expect(fenetre.w.document.body.textContent?.match(/À enregistrer/g)).toHaveLength(3)
		expect(fenetre.w.document.body.textContent).toContain('5 / 10')
		expect(b.journal.televerses).toEqual([])
	})

	test('« Enregistrer » envoie les nouvelles dans l’ordre, puis nomme toute la liste dans l’ordre ; le panneau se ferme et l’annonce', async () => {
		const b = banc({ existantes: [photoDeLEspace(1), photoDeLEspace(2)] })
		await b.monter()
		await choisir('a.jpg', 'b.jpg', 'c.jpg')
		await enregistrer()
		await fenetre.attendre(() => dialogue() === null)

		expect(b.journal.televerses).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
		expect(b.journal.enregistres).toEqual([[1, 2, 101, 102, 103]])
		expect(fenetre.w.document.body.textContent).toContain('Ton portfolio est enregistré.')
	})
})

describe('U80 : dix photos au plus', () => {
	test('la 11e est refusée avec son message, les dix autres sont gardées', async () => {
		const b = banc({ existantes: Array.from({ length: 8 }, (_, i) => photoDeLEspace(i + 1)) })
		await b.monter()
		await choisir('a.jpg', 'b.jpg', 'c.jpg')
		await fenetre.attendre(() => images().length === 10)

		expect(alertes()).toContain(`c.jpg : ${MESSAGES_PHOTO['limite-galerie']}`)
		expect(b.journal.prepares).toEqual(['a.jpg', 'b.jpg'])
	})
})

describe('E36 : un fichier refusé est écarté sans perdre les autres', () => {
	test('un PDF parmi trois photos : deux lignes, le refus est dit avec le nom du fichier', async () => {
		const b = banc({ refuser: f => (f.name.endsWith('.pdf') ? MESSAGES_PHOTO.type : null) })
		await b.monter()
		await choisir('a.jpg', 'cv.pdf', 'c.jpg')
		await fenetre.attendre(() => images().length === 2)

		expect(alertes()).toContain(`cv.pdf : ${MESSAGES_PHOTO.type}`)
		await enregistrer()
		await fenetre.attendre(() => dialogue() === null)
		expect(b.journal.televerses).toEqual(['a.jpg', 'c.jpg'])
	})
})

describe('L6 : le même fichier choisi deux fois est refusé, et le refus est dit (L2 et L3 : sans objet, une photo n’a ni champ de saisie ni formulaire de modification)', () => {
	test('la seconde fois, une seule ligne et le message près du champ', async () => {
		const b = banc()
		await b.monter()
		const fichier = source('a.jpg')
		await choisirDesFichiers(fenetre, champ(), [fichier])
		await fenetre.attendre(() => images().length === 1)
		await choisirDesFichiers(fenetre, champ(), [fichier])
		await fenetre.attendre(() => alertes().includes(MESSAGES_PHOTO.doublon))

		expect(images()).toHaveLength(1)
	})

	test('L1 : deux photos de même nom et de même aspect restent deux lignes, chacune avec sa propre clé', async () => {
		const b = banc()
		await b.monter()
		await choisir('a.jpg', 'a.jpg')
		await fenetre.attendre(() => images().length === 2)
		expect(alertes()).not.toContain(MESSAGES_PHOTO.doublon)
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => dialogue() === null)
		expect(b.journal.televerses).toEqual(['a.jpg', 'a.jpg'])
		expect(b.journal.enregistres).toEqual([[101, 102]])
	})
})

describe('E34 : fermer sans valider n’envoie rien', () => {
	test('abandonner après avoir choisi : aucun envoi, aucun enregistrement, la liste d’avant au rechargement du panneau', async () => {
		const b = banc({ existantes: [photoDeLEspace(1)] })
		await b.monter()
		await choisir('a.jpg', 'b.jpg')
		await fenetre.attendre(() => images().length === 3)
		await fenetre.cliquer(fenetre.bouton('Fermer'))
		await fenetre.cliquer(fenetre.bouton('Abandonner mes modifications'))

		expect(dialogue()).toBeNull()
		expect(b.journal.televerses).toEqual([])
		expect(b.journal.enregistres).toEqual([])
		await fenetre.cliquer(fenetre.bouton('Modifier mon portfolio'))
		expect(images()).toHaveLength(1)
	})

	test('sans photo choisie, « Enregistrer » est éteint et fermer ne demande rien', async () => {
		await banc().monter()
		expect((fenetre.bouton('Enregistrer') as HTMLButtonElement).disabled).toBe(true)
		await fenetre.cliquer(fenetre.bouton('Fermer'))
		expect(dialogue()).toBeNull()
	})
})

describe('un échec laisse le portfolio comme il était', () => {
	test('coupure pendant l’envoi de la 2e : la 1re est reprise, rien n’est nommé, le panneau garde les choix', async () => {
		let n = 0
		const b = banc({
			televerser: async () =>
				++n === 2 ? { ok: false, message: MESSAGES_PHOTO['envoi-impossible'] } : { ok: true, id: 101 },
		})
		await b.monter()
		await choisir('a.jpg', 'b.jpg')
		await enregistrer()
		await fenetre.attendre(() => alertes().includes(MESSAGES_PHOTO['envoi-impossible']))

		expect(b.journal.enregistres).toEqual([])
		expect(b.journal.supprimes).toEqual([101])
		expect(images()).toHaveLength(2)
	})

	test('« non » du serveur : fichiers envoyés repris ; réponse perdue : rien n’est repris', async () => {
		const non = banc({ envoyer: async () => ({ ok: false, message: MESSAGE_ECHEC }) })
		await non.monter()
		await choisir('a.jpg')
		await enregistrer()
		await fenetre.attendre(() => alertes().includes(MESSAGE_ECHEC))
		expect(non.journal.supprimes).toEqual([101])
		await fenetre.demonter()

		const perdu = banc({
			envoyer: async () => {
				throw new Error('Failed to fetch')
			},
		})
		await perdu.monter()
		await choisir('a.jpg')
		await enregistrer()
		await fenetre.attendre(() => alertes().includes(MESSAGE_RESULTAT_INCERTAIN))
		expect(perdu.journal.supprimes).toEqual([])
	})

	test('après une réponse perdue, un nouvel essai renomme sans renvoyer le fichier déjà envoyé', async () => {
		let essai = 0
		const b = banc({
			envoyer: async saisie => {
				if (++essai === 1) throw new Error('Failed to fetch')
				return { ok: true, valeurs: { galerie: saisie.galerie } }
			},
		})
		await b.monter()
		await choisir('a.jpg')
		await enregistrer()
		await fenetre.attendre(() => alertes().includes(MESSAGE_RESULTAT_INCERTAIN))
		await enregistrer()
		await fenetre.attendre(() => dialogue() === null)
		expect(b.journal.televerses).toEqual(['a.jpg'])
	})
})

describe('L7 : Entrée maintenue n’agit qu’une fois', () => {
	test('les répétitions d’Entrée sur « Enregistrer » et sur « Modifier » sont ignorées', async () => {
		const b = banc()
		await b.monter()
		await choisir('a.jpg')
		await fenetre.attendre(prete)
		const repetition = () =>
			new fenetre.w.KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true })
		const sur = fenetre.bouton('Enregistrer')
		const evenement = repetition()
		sur.dispatchEvent(evenement)
		expect(evenement.defaultPrevented).toBe(true)
		expect(b.journal.televerses).toEqual([])
	})
})
