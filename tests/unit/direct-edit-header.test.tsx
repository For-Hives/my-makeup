import { describe, expect, test } from 'bun:test'
import type { PhotoWork } from '@/components/direct-edit/blocks/PhotoBlock'
import { EditBar } from '@/components/direct-edit/EditBar'
import { EditSession } from '@/components/direct-edit/EditSession'
import { type HeaderActions, headerEdit } from '@/components/direct-edit/header-edit'
import { ProfileView } from '@/components/profile/ProfileView'
import type { DashboardProfile } from '@/lib/dashboard/dashboard-profile'
import { MESSAGES_PHOTO } from '@/lib/dashboard/photo'
import type { DashboardPhoto } from '@/lib/dashboard/photos'
import { UNCERTAIN_RESULT_MESSAGE } from '@/lib/dashboard/photos-upload'
import { FAILURE_MESSAGE, MESSAGE_SESSION } from '@/lib/dashboard/result'
import { type PublicProfile, publicProfileOf } from '@/services/public/profiles'
import { openWindow } from '../support/dom-react'
import { pickFiles } from '../support/pick-files'

/**
 * The header of her own page in edit mode (issue 1008): every block is a button named for what it
 * changes, an empty block says what to do, one block is open at a time, and a save is honest: the
 * page is read again only once the server answered, a failure keeps what she typed. The browser work,
 * the network and the server actions are fakes.
 */

const jsdomWindow = openWindow()

const PHOTO: DashboardPhoto = {
	id: 5,
	url: 'https://photos.example.test/media/a.webp',
	largeur: 400,
	hauteur: 400,
	alt: '',
}
const FULL = {
	id: 1,
	firstName: 'Inès',
	lastName: 'Morel',
	artistName: 'Inès Morel Maquillage',
	specialty: 'Maquillage mariage',
	available: true,
	city: { name: 'Annecy', inseeCode: '74010', department: '74' },
	radiusKm: 30,
	homeService: true,
} as unknown as DashboardProfile
const EMPTY = { id: 2, firstName: 'Léa', lastName: 'Vide' } as unknown as DashboardProfile

function publicOf(profile: DashboardProfile, photo: DashboardPhoto | null): PublicProfile {
	return publicProfileOf(
		{ slug: 'ines-morel', status: 'published', publishable: true, ...(profile as object) } as never,
		{ photo: photo ? { url: photo.url, width: 400, height: 400 } : null, galerie: [], coordonnees: null }
	)
}

function bench(
	options: {
		profile?: DashboardProfile
		photo?: DashboardPhoto | null
		saveIdentity?: HeaderActions['saveIdentity']
		saveStatus?: HeaderActions['saveStatus']
		savePhoto?: HeaderActions['savePhoto']
		photoWork?: PhotoWork | undefined
	} = {}
) {
	const log = {
		refreshes: 0,
		identities: [] as unknown[],
		statuses: [] as unknown[],
		photos: [] as unknown[],
		uploads: 0,
		removed: [] as unknown[],
	}
	const profile = options.profile ?? FULL
	const photo = options.photo === undefined ? PHOTO : options.photo
	const actions: HeaderActions = {
		saveIdentity:
			options.saveIdentity ??
			(async input => {
				log.identities.push(input)
				return { ok: true, valeurs: input }
			}),
		saveStatus:
			options.saveStatus ??
			(async input => {
				log.statuses.push(input)
				return { ok: true, valeurs: input }
			}),
		savePhoto:
			options.savePhoto ??
			(async input => {
				log.photos.push(input)
				return { ok: true, valeurs: { photoPrincipale: input.photoPrincipale } }
			}),
		savePlace: async () => ({ ok: false, message: FAILURE_MESSAGE }),
		searchCities: async () => ({ ok: true, communes: [] }),
	}
	const edit = headerEdit({
		profile,
		photos: { photo, galerie: [], principaleManquante: false },
		actions,
		photoWork: {
			upload: async () => {
				log.uploads++
				return { ok: true, id: 9 }
			},
			remove: async id => {
				log.removed.push(id)
			},
			...options.photoWork,
		},
	})
	return {
		journal: log,
		monter: () =>
			jsdomWindow.monter(
				<EditSession refresh={() => void log.refreshes++}>
					<EditBar />
					<ProfileView profil={publicOf(profile, photo)} mesure={false} edit={{ header: edit }} />
				</EditSession>
			),
	}
}

const doc = () => jsdomWindow.w.document
const alerts = () => [...doc().querySelectorAll('[role="alert"]')].map(alert => alert.textContent).join('|')
const status = () => doc().querySelector('[data-testid="edit-status"]')?.textContent
const editor = () => doc().querySelector('[data-direct-edit-editor]')

describe('chaque bloc de l’en-tête est un bouton nommé pour ce qu’il change', () => {
	test('la photo, le nom et la spécialité, la zone et la disponibilité', async () => {
		await bench().monter()
		for (const name of [
			'Modifier ma photo principale',
			'Modifier mon nom et ma spécialité',
			'Modifier ma zone',
			'Modifier ma disponibilité',
		])
			expect(jsdomWindow.bouton(name).getAttribute('aria-expanded')).toBe('false')
		// The visitor's content is still there: the h1 is her name.
		expect(doc().querySelector('h1')?.textContent).toBe('Inès Morel')
	})

	test('un bloc vide dit quoi faire, à la place de son contenu', async () => {
		await bench({ profile: EMPTY, photo: null }).monter()
		const text = doc().body.textContent ?? ''
		expect(text).toContain('Ajoute ta photo')
		expect(text).toContain('Ajoute ta spécialité.')
		expect(text).toContain('Dis où tu travailles.')
		expect(doc().querySelectorAll('[data-direct-edit-empty]').length).toBe(3)
	})
})

describe('un seul bloc ouvert à la fois, avec la question quand il y a des modifications', () => {
	test('ouvrir le nom ouvre son éditeur sous l’en-tête et estompe les autres', async () => {
		await bench().monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier mon nom et ma spécialité'))
		expect(editor()?.textContent).toContain('Nom et spécialité · je modifie')
		expect(doc().querySelector('[data-direct-edit="photo"]')?.className).toContain('opacity-50')
		expect(status()).toBe('Modification en cours')
	})

	test('Annuler referme sans question quand rien n’a changé', async () => {
		await bench().monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier mon nom et ma spécialité'))
		await jsdomWindow.cliquer(jsdomWindow.bouton('Annuler'))
		expect(editor()).toBeNull()
	})

	test('avec une modification, ouvrir un autre bloc demande : Continuer garde la saisie, Abandonner la jette', async () => {
		await bench().monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier mon nom et ma spécialité'))
		await jsdomWindow.saisir(jsdomWindow.champ('Autre (précise)'), 'Maquillage soirée')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier ma disponibilité'))
		expect(alerts()).toContain('modifications non enregistrées')

		await jsdomWindow.cliquer(jsdomWindow.bouton('Continuer à modifier'))
		expect((jsdomWindow.champ('Autre (précise)') as HTMLInputElement).value).toBe('Maquillage soirée')

		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier ma disponibilité'))
		await jsdomWindow.cliquer(jsdomWindow.bouton('Abandonner mes modifications'))
		expect(editor()?.textContent).toContain('Disponibilité · je modifie')
	})

	test('Échap referme un éditeur propre, et le focus revient sur le bloc', async () => {
		await bench().monter()
		const block = jsdomWindow.bouton('Modifier mon nom et ma spécialité')
		await jsdomWindow.cliquer(block)
		const field = jsdomWindow.champ('Autre (précise)')
		await jsdomWindow.w.document.defaultView?.dispatchEvent(new jsdomWindow.w.Event('noop'))
		field.dispatchEvent(new jsdomWindow.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
		await jsdomWindow.attendre(() => editor() === null || null)
		await jsdomWindow.attendre(() => doc().activeElement === block || null)
	})
})

describe('un enregistrement honnête', () => {
	test('la spécialité part avec les quatre champs, la page est relue après la réponse, pas avant', async () => {
		let release: () => void = () => undefined
		const b = bench({
			saveIdentity: input =>
				new Promise(resolve => {
					release = () => resolve({ ok: true, valeurs: input })
				}),
		})
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier mon nom et ma spécialité'))
		await jsdomWindow.saisir(jsdomWindow.champ('Autre (précise)'), 'Maquillage soirée')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))

		expect(status()).toBe('Enregistrement…')
		expect(b.journal.refreshes).toBe(0)
		release()
		await jsdomWindow.attendre(() => status() === 'Enregistré à l’instant' || null)
		expect(b.journal.refreshes).toBe(1)
		expect(editor()).toBeNull()
	})

	test('les quatre champs de l’identité sont envoyés, ceux qu’elle n’a pas touchés avec leur valeur enregistrée', async () => {
		const b = bench()
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier mon nom et ma spécialité'))
		await jsdomWindow.saisir(jsdomWindow.champ('Autre (précise)'), 'Maquillage soirée')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => b.journal.identities.length || null)
		expect(b.journal.identities).toEqual([
			{
				prenom: 'Inès',
				nom: 'Morel',
				nomArtiste: 'Inès Morel Maquillage',
				specialtyBullets: '',
				specialtyOther: 'Maquillage soirée',
			},
		])
	})

	test('un champ refusé par le navigateur est dit sous le champ, rien n’est envoyé', async () => {
		const b = bench()
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier mon nom et ma spécialité'))
		await jsdomWindow.saisir(jsdomWindow.champ('Prénom'), 'I')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => (doc().body.textContent ?? '').includes('au moins 2 caractères') || null)
		expect(b.journal.identities).toEqual([])
		expect(editor()).not.toBeNull()
	})

	test('un échec garde l’éditeur ouvert, la saisie, et le dit en français', async () => {
		const b = bench({ saveIdentity: async () => ({ ok: false, message: FAILURE_MESSAGE }) })
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier mon nom et ma spécialité'))
		await jsdomWindow.saisir(jsdomWindow.champ('Autre (précise)'), 'Maquillage soirée')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => alerts().includes(FAILURE_MESSAGE) || null)
		expect((jsdomWindow.champ('Autre (précise)') as HTMLInputElement).value).toBe('Maquillage soirée')
		expect(b.journal.refreshes).toBe(0)
		expect(status()).toBe('Pas enregistré : ta modification est toujours là')
	})

	test('un réseau coupé (l’appel lève) est un échec en français, pas un blocage', async () => {
		const b = bench({
			saveIdentity: async () => {
				throw new Error('network')
			},
		})
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier mon nom et ma spécialité'))
		await jsdomWindow.saisir(jsdomWindow.champ('Autre (précise)'), 'Maquillage soirée')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => alerts().includes(FAILURE_MESSAGE) || null)
		expect((jsdomWindow.bouton('Enregistrer') as HTMLButtonElement).disabled).toBe(false)
	})

	test('une session expirée n’efface rien et propose de se reconnecter dans un autre onglet', async () => {
		const b = bench({ saveIdentity: async () => ({ ok: false, message: MESSAGE_SESSION, session: 'expiree' }) })
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier mon nom et ma spécialité'))
		await jsdomWindow.saisir(jsdomWindow.champ('Autre (précise)'), 'Maquillage soirée')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => alerts().includes(MESSAGE_SESSION) || null)
		const link = doc().querySelector<HTMLAnchorElement>('[role="alert"] a')
		expect(link?.getAttribute('href')).toContain('/auth/signin?callbackUrl=')
		expect(decodeURIComponent(link?.getAttribute('href') ?? '')).toContain('/auth/apercu-profil?mode=edition')
		expect(link?.getAttribute('target')).toBe('_blank')
		expect((jsdomWindow.champ('Autre (précise)') as HTMLInputElement).value).toBe('Maquillage soirée')
	})

	test('deux clics sur Enregistrer envoient une seule demande', async () => {
		let calls = 0
		let release: () => void = () => undefined
		const b = bench({
			saveStatus: input => {
				calls++
				return new Promise(resolve => {
					release = () => resolve({ ok: true, valeurs: input })
				})
			},
		})
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier ma disponibilité'))
		await jsdomWindow.cliquer(jsdomWindow.champ(/^Je suis indisponible/))
		const save = jsdomWindow.bouton('Enregistrer')
		await jsdomWindow.cliquer(save)
		await jsdomWindow.cliquer(save)
		expect(calls).toBe(1)
		release()
		await jsdomWindow.attendre(() => b.journal.refreshes || null)
	})

	test('le statut envoie le choix', async () => {
		const b = bench()
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier ma disponibilité'))
		await jsdomWindow.cliquer(jsdomWindow.champ(/^Je suis indisponible/))
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => b.journal.statuses.length || null)
		expect(b.journal.statuses).toEqual([{ disponible: false }])
	})
})

describe('la photo principale : mêmes règles que l’espace', () => {
	const PREPARED = new File(['petit'], 'photo.webp', { type: 'image/webp' })
	const ready = async () => ({ ok: true as const, fichier: PREPARED, largeur: 400, hauteur: 400, taille: 5 })
	const field = () => doc().querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement
	const pick = (file: File) => pickFiles(jsdomWindow, field(), [file])

	test('un fichier refusé est dit avant tout envoi, et Enregistrer reste éteint', async () => {
		const b = bench({
			photoWork: {
				prepare: async () => ({ ok: false, raison: 'type', code: 'type', message: MESSAGES_PHOTO.type }),
			},
		})
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier ma photo principale'))
		await pick(new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }))
		await jsdomWindow.attendre(() => alerts().includes(MESSAGES_PHOTO.type) || null)
		expect(b.journal.uploads).toBe(0)
		expect((jsdomWindow.bouton('Enregistrer') as HTMLButtonElement).disabled).toBe(true)
	})

	test('rien n’est envoyé avant « Enregistrer » : choisir puis abandonner ne laisse rien', async () => {
		const b = bench({ photoWork: { prepare: ready } })
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier ma photo principale'))
		await pick(new File(['gros'], 'grosse.jpg', { type: 'image/jpeg' }))
		await jsdomWindow.attendre(() => doc().querySelector('img[alt="Aperçu de la photo choisie"]') ?? null)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Annuler'))
		await jsdomWindow.cliquer(jsdomWindow.bouton('Abandonner mes modifications'))
		expect(editor()).toBeNull()
		expect(b.journal.uploads).toBe(0)
		expect(b.journal.photos).toEqual([])
	})

	test('enregistrer : le fichier réduit part, puis il est nommé, puis la page est relue', async () => {
		const b = bench({ photoWork: { prepare: ready } })
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier ma photo principale'))
		await pick(new File(['gros'], 'grosse.jpg', { type: 'image/jpeg' }))
		await jsdomWindow.attendre(() => doc().querySelector('img[alt="Aperçu de la photo choisie"]') ?? null)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => b.journal.refreshes || null)
		expect(b.journal.uploads).toBe(1)
		expect(b.journal.photos).toEqual([{ photoPrincipale: 9 }])
		expect(b.journal.removed).toEqual([])
	})

	test('un refus du serveur après l’envoi supprime le fichier envoyé et garde le choix', async () => {
		const b = bench({
			photoWork: { prepare: ready },
			savePhoto: async () => ({ ok: false, message: FAILURE_MESSAGE }),
		})
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier ma photo principale'))
		await pick(new File(['gros'], 'grosse.jpg', { type: 'image/jpeg' }))
		await jsdomWindow.attendre(() => doc().querySelector('img[alt="Aperçu de la photo choisie"]') ?? null)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => alerts().includes(FAILURE_MESSAGE) || null)
		expect(b.journal.removed).toEqual([9])
		expect(doc().querySelector('img[alt="Aperçu de la photo choisie"]')).not.toBeNull()
		expect(b.journal.refreshes).toBe(0)
	})

	test('une session expirée à l’enregistrement garde le fichier envoyé et la photo choisie', async () => {
		const b = bench({
			photoWork: { prepare: ready },
			savePhoto: async () => ({ ok: false, message: MESSAGE_SESSION, session: 'expiree' }),
		})
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier ma photo principale'))
		await pick(new File(['gros'], 'grosse.jpg', { type: 'image/jpeg' }))
		await jsdomWindow.attendre(() => doc().querySelector('img[alt="Aperçu de la photo choisie"]') ?? null)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => alerts().includes(MESSAGE_SESSION) || null)
		expect(alerts()).toContain('ta photo est toujours là')
		expect(b.journal.removed).toEqual([])
	})
})

describe('la photo principale : les échecs de l’envoi (ticket 134, E31 et E32, issue 1074)', () => {
	const PREPARED = new File(['petit'], 'photo.webp', { type: 'image/webp' })
	const ready = async () => ({ ok: true as const, fichier: PREPARED, largeur: 400, hauteur: 400, taille: 5 })
	const field = () => doc().querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement
	const pick = (file: File) => pickFiles(jsdomWindow, field(), [file])

	test('la réponse se perd : message d’incertitude, rien n’est supprimé', async () => {
		const b = bench({
			photoWork: { prepare: ready },
			savePhoto: async () => {
				throw new Error('Failed to fetch')
			},
		})
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier ma photo principale'))
		await pick(new File(['gros'], 'grosse.jpg', { type: 'image/jpeg' }))
		await jsdomWindow.attendre(() => doc().querySelector('img[alt="Aperçu de la photo choisie"]') ?? null)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => alerts().includes(UNCERTAIN_RESULT_MESSAGE) || null)
		expect(b.journal.removed).toEqual([])
	})

	test('coupure pendant l’envoi du fichier : message, rien d’enregistré, la photo en place reste', async () => {
		const b = bench({
			photoWork: {
				prepare: ready,
				upload: async () => ({ ok: false, message: MESSAGES_PHOTO['envoi-impossible'] }),
			},
		})
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier ma photo principale'))
		await pick(new File(['gros'], 'grosse.jpg', { type: 'image/jpeg' }))
		await jsdomWindow.attendre(() => doc().querySelector('img[alt="Aperçu de la photo choisie"]') ?? null)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => alerts().includes(MESSAGES_PHOTO['envoi-impossible']) || null)
		expect(b.journal.photos).toEqual([])
		expect(editor()).not.toBeNull()
	})

	test('double clic pendant l’envoi : un seul envoi', async () => {
		let openDoor: () => void = () => undefined
		const door = new Promise<void>(resolve => {
			openDoor = resolve
		})
		const b = bench({
			photoWork: {
				prepare: ready,
				upload: async () => {
					await door
					return { ok: true, id: 9 }
				},
			},
		})
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier ma photo principale'))
		await pick(new File(['gros'], 'grosse.jpg', { type: 'image/jpeg' }))
		await jsdomWindow.attendre(() => doc().querySelector('img[alt="Aperçu de la photo choisie"]') ?? null)
		const button = jsdomWindow.bouton('Enregistrer')
		await jsdomWindow.cliquer(button)
		await jsdomWindow.cliquer(button)
		openDoor()
		await jsdomWindow.attendre(() => b.journal.refreshes || null)
		expect(b.journal.photos).toHaveLength(1)
	})
})
