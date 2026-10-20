import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { act } from 'react'
import { AccountDeletion } from '@/components/dashboard/AccountDeletion'
import { AvailabilitySwitch } from '@/components/dashboard/AvailabilitySwitch'
import { DescriptionEditor } from '@/components/dashboard/DescriptionEditor'
import { PhotoEditor } from '@/components/dashboard/PhotoEditor'
import { ViewLink } from '@/components/dashboard/ViewLink'
import { eventData } from '@/lib/analytics/events'
import type { Track } from '@/lib/analytics/track'
import { holder } from '@/lib/dashboard/analytics'
import { MESSAGES_PHOTO } from '@/lib/dashboard/photo'
import { uploadPhoto } from '@/lib/dashboard/photos-upload'
import { withPublishableTransition } from '@/lib/dashboard/publishable-transition'
import { FAILURE_MESSAGE, type SaveResult } from '@/lib/dashboard/result'
import { choisirDesFichiers } from '../support/pick-files'
import { ouvrirFenetre } from '../support/dom-react'

/**
 * Ticket 147: the events of the space of the makeup artist (plan 04 §3.3, events 13 to 15, 18 and
 * 19; U82). The components send through `porte.suivre`, which a spy takes the place of here: the
 * test sees exactly what would leave.
 */
const fenetre = ouvrirFenetre()

type Envoi = { nom: string; proprietes: unknown }
let envois: Envoi[] = []
const origine = holder.suivre
beforeEach(() => {
	envois = []
	holder.suivre = ((nom: string, proprietes: unknown = {}) => {
		envois.push({ nom, proprietes })
		return true
	}) as unknown as Track
})
afterEach(() => {
	holder.suivre = origine
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
	const sans = (disponible: boolean) => async () => ({ ok: true as const, valeurs: { disponible } })

	test('la réponse du serveur donne un événement profile_save, et un double clic n’en donne qu’un', async () => {
		let finir: () => void = () => undefined
		await fenetre.monter(
			<AvailabilitySwitch
				disponible={true}
				envoyer={() =>
					new Promise(fin => {
						finir = () => fin({ ok: true, valeurs: { disponible: false } })
					})
				}
			/>
		)
		const interrupteur = fenetre.w.document.querySelector<HTMLElement>('[role="switch"]') as HTMLElement
		await fenetre.cliquer(interrupteur)
		await fenetre.cliquer(interrupteur)
		expect(envois).toEqual([])
		await fenetre.attendre(() => {
			finir()
			return envois.length > 0
		})
		expect(envois).toEqual([{ nom: 'profile_save', proprietes: { section: 'disponibilite', ok: true } }])
	})

	test('un refus du serveur donne ok=false, et jamais profile_publiable', async () => {
		await fenetre.monter(
			<AvailabilitySwitch disponible={true} envoyer={async () => ({ ok: false, message: FAILURE_MESSAGE })} />
		)
		await fenetre.cliquer(fenetre.w.document.querySelector<HTMLElement>('[role="switch"]') as HTMLElement)
		await fenetre.attendre(() => envois.length > 0)
		expect(envois).toEqual([{ nom: 'profile_save', proprietes: { section: 'disponibilite', ok: false } }])
	})

	test('le serveur dit que le profil est devenu publiable : profile_publiable part une fois, sans propriété', async () => {
		await fenetre.monter(
			<AvailabilitySwitch
				disponible={true}
				envoyer={async () => ({ ok: true, valeurs: { disponible: false }, devenuPublicable: true })}
			/>
		)
		await fenetre.cliquer(fenetre.w.document.querySelector<HTMLElement>('[role="switch"]') as HTMLElement)
		await fenetre.attendre(() => envois.length > 1)
		expect(envois).toEqual([
			{ nom: 'profile_save', proprietes: { section: 'disponibilite', ok: true } },
			{ nom: 'profile_publiable', proprietes: {} },
		])
	})

	test('sans l’indication du serveur, une réussite ne donne pas profile_publiable', async () => {
		await fenetre.monter(<AvailabilitySwitch disponible={true} envoyer={sans(false)} />)
		await fenetre.cliquer(fenetre.w.document.querySelector<HTMLElement>('[role="switch"]') as HTMLElement)
		await fenetre.attendre(() => envois.length > 0)
		expect(envois.map(e => e.nom)).toEqual(['profile_save'])
	})
})

describe('Entrée maintenue pendant un enregistrement : un seul événement', () => {
	test('le panneau de la description envoie une requête et un profile_save, quelle que soit la répétition', async () => {
		let requetes = 0
		let finir: () => void = () => undefined
		await fenetre.monter(
			<DescriptionEditor
				valeurs={{ description: 'Maquilleuse mariée.' }}
				envoyer={valeurs => {
					requetes += 1
					return new Promise(fin => {
						finir = () => fin({ ok: true, valeurs })
					})
				}}
			/>
		)
		await fenetre.cliquer(fenetre.bouton('Modifier ma description'))
		const champ = fenetre.champ('Ta description') as HTMLTextAreaElement
		await fenetre.saisir(champ, 'Maquilleuse mariée, je me déplace partout.')
		const bouton = fenetre.bouton('Enregistrer')
		await fenetre.cliquer(bouton)
		// The key is still down: its repeats reach the panel while the save is under way.
		for (let i = 0; i < 4; i += 1) {
			await act(async () => {
				bouton.dispatchEvent(
					new fenetre.w.KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true })
				)
			})
		}
		expect(requetes).toBe(1)
		expect(envois).toEqual([])
		await fenetre.attendre(() => {
			finir()
			return envois.length > 0
		})
		expect(envois).toEqual([{ nom: 'profile_save', proprietes: { section: 'description', ok: true } }])
	})
})

describe('le passage à publiable est dit par le serveur, une seule fois', () => {
	function banc(etats: boolean[], resultat: SaveResult<{ a: string }>) {
		const lectures: boolean[] = [...etats]
		const payload = {
			find: async () => ({ docs: [{ id: 7 }] }),
			findByID: async () => ({ publishable: lectures.shift() }),
		} as unknown as Payload
		return withPublishableTransition(payload, { collection: 'pros', id: 1 } as never, async () => resultat)
	}
	const bon = { ok: true, valeurs: { a: 'x' } } as const

	test('non publiable puis publiable : l’indication est posée', async () => {
		expect(await banc([false, true], bon)).toEqual({ ok: true, valeurs: { a: 'x' }, devenuPublicable: true })
	})
	test('déjà publiable : rien, même s’il le reste', async () => {
		expect(await banc([true, true], bon)).toEqual(bon)
	})
	test('le chemin inverse (publiable puis non) : rien', async () => {
		expect(await banc([true, false], bon)).toEqual(bon)
	})
	test('toujours non publiable : rien', async () => {
		expect(await banc([false, false], bon)).toEqual(bon)
	})
	test('un enregistrement refusé : rien, et la relecture n’a pas lieu', async () => {
		const refus = { ok: false, message: FAILURE_MESSAGE } as const
		expect(await banc([false, true], refus)).toEqual(refus)
	})
	test('un état illisible : rien', async () => {
		const payload = {
			find: async () => ({ docs: [{ id: 7 }] }),
			findByID: async () => {
				throw new Error('base indisponible')
			},
		} as unknown as Payload
		expect(await withPublishableTransition(payload, { collection: 'pros', id: 1 } as never, async () => bon)).toEqual(
			bon
		)
	})
})

describe('une photo refusée : la vraie cause', () => {
	const fichier = new File(['x'], 'photo.webp', { type: 'image/webp' })
	const reponse =
		(status: number, corps = '') =>
		async () =>
			new Response(corps, { status })

	test.each([
		[413, '', 'size'],
		[400, 'La photo dépasse 10 Mo : choisis-en une plus légère.', 'size'],
		[400, 'autre chose', 'type'],
		[415, '', 'type'],
		[500, '', 'server'],
		[200, '', 'server'],
	])('l’envoi répond %p : %s', async (status, corps, cause) => {
		const envoi = await uploadPhoto(fichier, '', reponse(status, corps))
		expect(envoi).toMatchObject({ ok: false, cause })
	})

	test('le réseau tombe : server ; une session finie n’est pas un refus de la photo', async () => {
		const tombe = await uploadPhoto(fichier, '', async () => {
			throw new Error('Failed to fetch')
		})
		expect(tombe).toMatchObject({ ok: false, cause: 'server' })
		const session = await uploadPhoto(fichier, '', reponse(401))
		expect(session).toMatchObject({ ok: false, session: 'expiree' })
		expect('cause' in session).toBe(false)
	})

	const ACTUELLE = { id: 5, url: 'https://photos.example.test/a.webp', largeur: 800, hauteur: 600, alt: '' }
	const REDUITE = new File(['petit'], 'photo.webp', { type: 'image/webp' })
	async function monter(options: {
		preparer?: Parameters<typeof PhotoEditor>[0]['preparer']
		televerser?: Parameters<typeof PhotoEditor>[0]['televerser']
	}) {
		await fenetre.monter(
			<PhotoEditor
				photo={ACTUELLE}
				envoyer={async saisie => ({ ok: true, valeurs: { photoPrincipale: saisie.photoPrincipale } })}
				preparer={
					options.preparer ??
					(async () => ({ ok: true as const, fichier: REDUITE, largeur: 800, hauteur: 600, taille: 5 }))
				}
				televerser={options.televerser ?? (async () => ({ ok: true as const, id: 9 }))}
				supprimer={async () => undefined}
			/>
		)
		await fenetre.cliquer(fenetre.bouton('Modifier ma photo principale'))
		await choisirDesFichiers(fenetre, fenetre.champ(/photo/i) as HTMLInputElement, [
			new File(['gros'], 'grosse.jpg', { type: 'image/jpeg' }),
		])
	}

	test('refusée avant l’envoi (trop lourde) : upload_error size, rien d’autre', async () => {
		await monter({
			preparer: async () => ({ ok: false, raison: 'taille', code: 'taille', message: MESSAGES_PHOTO.taille }),
		})
		await fenetre.attendre(() => envois.length > 0)
		expect(envois).toEqual([{ nom: 'upload_error', proprietes: { kind: 'size' } }])
	})

	test('refusée avant l’envoi (mauvais type) : upload_error type', async () => {
		await monter({ preparer: async () => ({ ok: false, raison: 'type', code: 'heic', message: MESSAGES_PHOTO.heic }) })
		await fenetre.attendre(() => envois.length > 0)
		expect(envois).toEqual([{ nom: 'upload_error', proprietes: { kind: 'type' } }])
	})

	test('refusée par le serveur : la cause du serveur, et aucun profile_save (rien n’a été enregistré)', async () => {
		await monter({ televerser: async () => ({ ok: false, message: MESSAGES_PHOTO['refus-type'], cause: 'type' }) })
		await fenetre.attendre(() => !(fenetre.bouton('Enregistrer') as HTMLButtonElement).disabled)
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => envois.length > 0)
		expect(envois).toEqual([{ nom: 'upload_error', proprietes: { kind: 'type' } }])
	})

	test('une session finie pendant l’envoi n’est pas un refus de la photo', async () => {
		await monter({ televerser: async () => ({ ok: false, message: 'Session finie', session: 'expiree' }) })
		await fenetre.attendre(() => !(fenetre.bouton('Enregistrer') as HTMLButtonElement).disabled)
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => fenetre.w.document.body.textContent?.includes('Session finie') ?? false)
		expect(envois).toEqual([])
	})

	test('une photo enregistrée : un profile_save photo, aucun upload_error', async () => {
		await monter({})
		await fenetre.attendre(() => !(fenetre.bouton('Enregistrer') as HTMLButtonElement).disabled)
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => envois.length > 0)
		expect(envois).toEqual([{ nom: 'profile_save', proprietes: { section: 'photo', ok: true } }])
	})
})

describe('la suppression du compte', () => {
	async function supprimer(envoyer: () => Promise<{ ok: true } | { ok: false; message: string }>) {
		await fenetre.monter(<AccountDeletion mode="mot-de-passe" envoyer={envoyer as never} aller={() => undefined} />)
		await fenetre.cliquer(fenetre.bouton('Supprimer mon compte'))
		await fenetre.saisir(fenetre.champ('Retape ton mot de passe pour confirmer'), 'mon secret fictif')
		await fenetre.cliquer(fenetre.bouton('Supprimer définitivement mon compte'))
	}

	test('réussie : account_delete part une fois, sans rien de saisi', async () => {
		await supprimer(async () => ({ ok: true }))
		expect(envois).toEqual([{ nom: 'account_delete', proprietes: {} }])
		expect(JSON.stringify(envois)).not.toContain('secret')
	})

	test('refusée : rien ne part', async () => {
		await supprimer(async () => ({ ok: false, message: 'Mot de passe incorrect.' }))
		expect(envois).toEqual([])
	})

	test('perdue : rien ne part', async () => {
		await supprimer(async () => {
			throw new Error('Failed to fetch')
		})
		expect(envois).toEqual([])
	})
})

describe('le changement de vue', () => {
	async function monter(vue: 'publique' | 'edition') {
		await fenetre.monter(
			<ViewLink vue={vue} href="/auth/apercu-profil">
				Voir
			</ViewLink>
		)
		const lien = fenetre.w.document.querySelector('a') as HTMLAnchorElement
		// The page does not really leave: the test only counts.
		lien.addEventListener('click', evenement => evenement.preventDefault())
		return lien
	}
	const clic = (lien: HTMLElement) => fenetre.cliquer(lien)
	// A click made with a modifier key, which `cliquer` does not do.
	const clicAvecCtrl = (lien: HTMLElement) =>
		act(async () => {
			lien.dispatchEvent(
				new fenetre.w.MouseEvent('click', { bubbles: true, button: 0, cancelable: true, ctrlKey: true })
			)
		})

	test('le chargement ne compte rien', async () => {
		await monter('publique')
		expect(envois).toEqual([])
	})

	test('un clic compte une fois, et un double clic aussi', async () => {
		const lien = await monter('publique')
		await clic(lien)
		await clic(lien)
		expect(envois).toEqual([{ nom: 'profile_visibility', proprietes: { public: true } }])
	})

	test('le retour vers l’espace dit public=false', async () => {
		const lien = await monter('edition')
		await clic(lien)
		expect(envois).toEqual([{ nom: 'profile_visibility', proprietes: { public: false } }])
	})

	test('un clic avec une touche modificatrice ne change pas la vue de cet onglet : rien', async () => {
		const lien = await monter('publique')
		await clicAvecCtrl(lien)
		expect(envois).toEqual([])
	})
})
