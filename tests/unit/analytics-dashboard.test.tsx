import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { act } from 'react'
import { AccountDeletion } from '@/components/dashboard/AccountDeletion'
import { AvailabilitySwitch } from '@/components/dashboard/AvailabilitySwitch'
import { ViewLink } from '@/components/dashboard/ViewLink'
import { PhotoForm, type PhotoWork } from '@/components/direct-edit/blocks/PhotoBlock'
import { EditSession } from '@/components/direct-edit/EditSession'
import { eventData } from '@/lib/analytics/events'
import type { Track } from '@/lib/analytics/track'
import { holder } from '@/lib/dashboard/analytics'
import { MESSAGES_PHOTO } from '@/lib/dashboard/photo'
import { uploadPhoto } from '@/lib/dashboard/photos-upload'
import { withPublishableTransition } from '@/lib/dashboard/publishable-transition'
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'
import { benchOf } from '../support/direct-edit-bench'
import { openWindow } from '../support/dom-react'
import { pickFiles } from '../support/pick-files'

/**
 * Ticket 147: the events of the space of the makeup artist (plan 04 §3.3, events 13 to 15, 18 and
 * 19; U82). The components send through `porte.suivre`, which a spy takes the place of here: the
 * test sees exactly what would leave.
 */
const jsdomWindow = openWindow()

type Upload = { nom: string; proprietes: unknown }
let uploads: Upload[] = []
const origin = holder.suivre
beforeEach(() => {
	uploads = []
	holder.suivre = ((nom: string, proprietes: unknown = {}) => {
		uploads.push({ nom, proprietes })
		return true
	}) as unknown as Track
})
afterEach(() => {
	holder.suivre = origin
})

describe('U82 : les propriétés restent dans les listes fermées', () => {
	test.each([
		'identite',
		'description',
		'localisation',
		'reseaux',
		'coordonnees',
		'disponibilite',
		'photo',
		'portfolio',
		'offres',
	])('profile_save de la section %s passe', section => {
		expect(eventData('profile_save', { section, ok: true })).toEqual({ section, ok: true })
	})

	test('un texte saisi, une cause inventée ou une propriété en trop fait tomber l’événement', () => {
		expect(eventData('profile_save', { section: 'Léa Fictive', ok: true })).toBeNull()
		expect(eventData('upload_error', { kind: 'photo.jpg' })).toBeNull()
		expect(eventData('profile_publiable', { section: 'identite' })).toBeNull()
		expect(eventData('account_delete', { email: 'lea@example.test' })).toBeNull()
		expect(eventData('profile_publiable', {})).toEqual({})
		expect(eventData('account_delete', {})).toEqual({})
	})
})

describe('l’enregistrement d’une section', () => {
	const without = (disponible: boolean) => async () => ({ ok: true as const, valeurs: { disponible } })

	test('la réponse du serveur donne un événement profile_save, et un double clic n’en donne qu’un', async () => {
		let finish: () => void = () => undefined
		await jsdomWindow.monter(
			<AvailabilitySwitch
				disponible={true}
				envoyer={() =>
					new Promise(fin => {
						finish = () => fin({ ok: true, valeurs: { disponible: false } })
					})
				}
			/>
		)
		const toggle = jsdomWindow.w.document.querySelector<HTMLElement>('[role="switch"]') as HTMLElement
		await jsdomWindow.cliquer(toggle)
		await jsdomWindow.cliquer(toggle)
		expect(uploads).toEqual([])
		await jsdomWindow.attendre(() => {
			finish()
			return uploads.length > 0
		})
		expect(uploads).toEqual([{ nom: 'profile_save', proprietes: { section: 'disponibilite', ok: true } }])
	})

	test('un refus du serveur donne ok=false, et jamais profile_publiable', async () => {
		await jsdomWindow.monter(
			<AvailabilitySwitch disponible={true} envoyer={async () => ({ ok: false, message: FAILURE_MESSAGE })} />
		)
		await jsdomWindow.cliquer(jsdomWindow.w.document.querySelector<HTMLElement>('[role="switch"]') as HTMLElement)
		await jsdomWindow.attendre(() => uploads.length > 0)
		expect(uploads).toEqual([{ nom: 'profile_save', proprietes: { section: 'disponibilite', ok: false } }])
	})

	test('le serveur dit que le profil est devenu publiable : profile_publiable part une fois, sans propriété', async () => {
		await jsdomWindow.monter(
			<AvailabilitySwitch
				disponible={true}
				envoyer={async () => ({ ok: true, valeurs: { disponible: false }, devenuPublicable: true })}
			/>
		)
		await jsdomWindow.cliquer(jsdomWindow.w.document.querySelector<HTMLElement>('[role="switch"]') as HTMLElement)
		await jsdomWindow.attendre(() => uploads.length > 1)
		expect(uploads).toEqual([
			{ nom: 'profile_save', proprietes: { section: 'disponibilite', ok: true } },
			{ nom: 'profile_publiable', proprietes: {} },
		])
	})

	test('sans l’indication du serveur, une réussite ne donne pas profile_publiable', async () => {
		await jsdomWindow.monter(<AvailabilitySwitch disponible={true} envoyer={without(false)} />)
		await jsdomWindow.cliquer(jsdomWindow.w.document.querySelector<HTMLElement>('[role="switch"]') as HTMLElement)
		await jsdomWindow.attendre(() => uploads.length > 0)
		expect(uploads.map(e => e.nom)).toEqual(['profile_save'])
	})
})

describe('Entrée maintenue pendant un enregistrement : un seul événement', () => {
	test('le bloc de la présentation envoie une requête et un profile_save, quelle que soit la répétition', async () => {
		let requests = 0
		let finish: () => void = () => undefined
		await benchOf(jsdomWindow, {
			actions: {
				saveAbout: input => {
					requests += 1
					return new Promise(fin => {
						finish = () => fin({ ok: true, valeurs: input })
					})
				},
			},
		}).mount()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier ma présentation'))
		const field = jsdomWindow.champ(/Ce qui te distingue/) as HTMLTextAreaElement
		await jsdomWindow.saisir(field, 'Maquilleuse mariée, je me déplace partout.')
		const button = jsdomWindow.bouton('Enregistrer')
		await jsdomWindow.cliquer(button)
		// The key is still down: its repeats reach the block while the save is under way.
		for (let i = 0; i < 4; i += 1) {
			await act(async () => {
				button.dispatchEvent(
					new jsdomWindow.w.KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true })
				)
			})
		}
		expect(requests).toBe(1)
		expect(uploads).toEqual([])
		await jsdomWindow.attendre(() => {
			finish()
			return uploads.length > 0
		})
		expect(uploads).toEqual([{ nom: 'profile_save', proprietes: { section: 'description', ok: true } }])
	})
})

describe('le passage à publiable est dit par le serveur, une seule fois', () => {
	function bench(etats: boolean[], resultat: SaveResult<{ a: string }>) {
		const readings: boolean[] = [...etats]
		const payload = {
			find: async () => ({ docs: [{ id: 7 }] }),
			findByID: async () => ({ publishable: readings.shift() }),
		} as unknown as Payload
		return withPublishableTransition(payload, { collection: 'pros', id: 1 } as never, async () => resultat)
	}
	const good = { ok: true, valeurs: { a: 'x' } } as const

	test('non publiable puis publiable : l’indication est posée', async () => {
		expect(await bench([false, true], good)).toEqual({ ok: true, valeurs: { a: 'x' }, devenuPublicable: true })
	})
	test('déjà publiable : rien, même s’il le reste', async () => {
		expect(await bench([true, true], good)).toEqual(good)
	})
	test('le chemin inverse (publiable puis non) : rien', async () => {
		expect(await bench([true, false], good)).toEqual(good)
	})
	test('toujours non publiable : rien', async () => {
		expect(await bench([false, false], good)).toEqual(good)
	})
	test('un enregistrement refusé : rien, et la relecture n’a pas lieu', async () => {
		const refusal = { ok: false, message: FAILURE_MESSAGE } as const
		expect(await bench([false, true], refusal)).toEqual(refusal)
	})
	test('un état illisible : rien', async () => {
		const payload = {
			find: async () => ({ docs: [{ id: 7 }] }),
			findByID: async () => {
				throw new Error('base indisponible')
			},
		} as unknown as Payload
		expect(await withPublishableTransition(payload, { collection: 'pros', id: 1 } as never, async () => good)).toEqual(
			good
		)
	})
})

describe('une photo refusée : la vraie cause', () => {
	const file = new File(['x'], 'photo.webp', { type: 'image/webp' })
	const response =
		(status: number, corps = '') =>
		async () =>
			new Response(corps, { status })

	test.each([
		[413, '', 'size'],
		[400, 'La photo est trop lourde : choisis-en une plus légère.', 'size'],
		[400, 'autre chose', 'type'],
		[415, '', 'type'],
		[500, '', 'server'],
		[200, '', 'server'],
	])('l’envoi répond %p : %s', async (status, corps, cause) => {
		const upload = await uploadPhoto(file, '', response(status, corps))
		expect(upload).toMatchObject({ ok: false, cause })
	})

	test('le réseau tombe : server ; une session finie n’est pas un refus de la photo', async () => {
		const fallen = await uploadPhoto(file, '', async () => {
			throw new Error('Failed to fetch')
		})
		expect(fallen).toMatchObject({ ok: false, cause: 'server' })
		const session = await uploadPhoto(file, '', response(401))
		expect(session).toMatchObject({ ok: false, session: 'expiree' })
		expect('cause' in session).toBe(false)
	})

	const CURRENT = { id: 5, url: 'https://photos.example.test/a.webp', largeur: 800, hauteur: 600, alt: '' }
	const REDUCED = new File(['petit'], 'photo.webp', { type: 'image/webp' })
	async function mount(options: PhotoWork) {
		await jsdomWindow.monter(
			<EditSession refresh={() => undefined}>
				<PhotoForm
					photo={CURRENT}
					save={async saisie => ({ ok: true, valeurs: { photoPrincipale: saisie.photoPrincipale } })}
					prepare={
						options.prepare ??
						(async () => ({ ok: true as const, fichier: REDUCED, largeur: 800, hauteur: 600, taille: 5 }))
					}
					upload={options.upload ?? (async () => ({ ok: true as const, id: 9 }))}
					remove={async () => undefined}
				/>
			</EditSession>
		)
		await pickFiles(jsdomWindow, jsdomWindow.champ(/photo/i) as HTMLInputElement, [
			new File(['gros'], 'grosse.jpg', { type: 'image/jpeg' }),
		])
	}

	test('refusée avant l’envoi (trop lourde) : upload_error size, rien d’autre', async () => {
		await mount({
			prepare: async () => ({ ok: false, raison: 'taille', code: 'taille', message: MESSAGES_PHOTO.taille }),
		})
		await jsdomWindow.attendre(() => uploads.length > 0)
		expect(uploads).toEqual([{ nom: 'upload_error', proprietes: { kind: 'size' } }])
	})

	test('refusée avant l’envoi (mauvais type) : upload_error type', async () => {
		await mount({ prepare: async () => ({ ok: false, raison: 'type', code: 'heic', message: MESSAGES_PHOTO.heic }) })
		await jsdomWindow.attendre(() => uploads.length > 0)
		expect(uploads).toEqual([{ nom: 'upload_error', proprietes: { kind: 'type' } }])
	})

	test('refusée par le serveur : la cause du serveur, et aucun profile_save (rien n’a été enregistré)', async () => {
		await mount({ upload: async () => ({ ok: false, message: MESSAGES_PHOTO['refus-type'], cause: 'type' }) })
		await jsdomWindow.attendre(() => !(jsdomWindow.bouton('Enregistrer') as HTMLButtonElement).disabled)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => uploads.length > 0)
		expect(uploads).toEqual([{ nom: 'upload_error', proprietes: { kind: 'type' } }])
	})

	test('une session finie pendant l’envoi n’est pas un refus de la photo', async () => {
		await mount({ upload: async () => ({ ok: false, message: 'Session finie', session: 'expiree' }) })
		await jsdomWindow.attendre(() => !(jsdomWindow.bouton('Enregistrer') as HTMLButtonElement).disabled)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => jsdomWindow.w.document.body.textContent?.includes('Session finie') ?? false)
		expect(uploads).toEqual([])
	})

	test('une photo enregistrée : un profile_save photo, aucun upload_error', async () => {
		await mount({})
		await jsdomWindow.attendre(() => !(jsdomWindow.bouton('Enregistrer') as HTMLButtonElement).disabled)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => uploads.length > 0)
		expect(uploads).toEqual([{ nom: 'profile_save', proprietes: { section: 'photo', ok: true } }])
	})
})

describe('la suppression du compte', () => {
	async function remove(envoyer: () => Promise<{ ok: true } | { ok: false; message: string }>) {
		await jsdomWindow.monter(<AccountDeletion mode="mot-de-passe" envoyer={envoyer as never} aller={() => undefined} />)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Supprimer mon compte'))
		await jsdomWindow.saisir(jsdomWindow.champ('Retape ton mot de passe pour confirmer'), 'mon secret fictif')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Supprimer définitivement mon compte'))
	}

	test('réussie : account_delete part une fois, sans rien de saisi', async () => {
		await remove(async () => ({ ok: true }))
		expect(uploads).toEqual([{ nom: 'account_delete', proprietes: {} }])
		expect(JSON.stringify(uploads)).not.toContain('secret')
	})

	test('refusée : rien ne part', async () => {
		await remove(async () => ({ ok: false, message: 'Mot de passe incorrect.' }))
		expect(uploads).toEqual([])
	})

	test('perdue : rien ne part', async () => {
		await remove(async () => {
			throw new Error('Failed to fetch')
		})
		expect(uploads).toEqual([])
	})
})

describe('le changement de vue', () => {
	async function mount(vue: 'publique' | 'edition') {
		await jsdomWindow.monter(
			<ViewLink vue={vue} href="/auth/apercu-profil">
				Voir
			</ViewLink>
		)
		const link = jsdomWindow.w.document.querySelector('a') as HTMLAnchorElement
		// The page does not really leave: the test only counts.
		link.addEventListener('click', evenement => evenement.preventDefault())
		return link
	}
	const click = (lien: HTMLElement) => jsdomWindow.cliquer(lien)
	// A click made with a modifier key, which `cliquer` does not do.
	const clickWithCtrl = (lien: HTMLElement) =>
		act(async () => {
			lien.dispatchEvent(
				new jsdomWindow.w.MouseEvent('click', { bubbles: true, button: 0, cancelable: true, ctrlKey: true })
			)
		})

	test('le chargement ne compte rien', async () => {
		await mount('publique')
		expect(uploads).toEqual([])
	})

	test('un clic compte une fois, et un double clic aussi', async () => {
		const link = await mount('publique')
		await click(link)
		await click(link)
		expect(uploads).toEqual([{ nom: 'profile_visibility', proprietes: { public: true } }])
	})

	test('le retour vers l’espace dit public=false', async () => {
		const link = await mount('edition')
		await click(link)
		expect(uploads).toEqual([{ nom: 'profile_visibility', proprietes: { public: false } }])
	})

	test('un clic avec une touche modificatrice ne change pas la vue de cet onglet : rien', async () => {
		const link = await mount('publique')
		await clickWithCtrl(link)
		expect(uploads).toEqual([])
	})
})
