import type { GalleryWork } from '@/components/direct-edit/blocks/GalleryBlock'
import { bodyEdit } from '@/components/direct-edit/body-edit'
import { EditBar } from '@/components/direct-edit/EditBar'
import { EditSession } from '@/components/direct-edit/EditSession'
import { headerEdit } from '@/components/direct-edit/header-edit'
import { ProfileView } from '@/components/profile/ProfileView'
import type { ActivityView } from '@/lib/dashboard/activity'
import type { DashboardProfile } from '@/lib/dashboard/cards'
import type { DashboardPhoto } from '@/lib/dashboard/photos'
import { type PublicProfile, publicProfileOf } from '@/services/public/profiles'
import type { DomWindow } from './dom-react'

/**
 * Her own page in edit mode, mounted in a jsdom window with fake server actions (issues 1016 to 1021).
 * Every action records what it was asked and answers « ok » unless the test gives its own; `calls`
 * holds the calls by action name, and `refreshes` counts how many times the page was read again.
 */

export type Action = (input: never) => Promise<unknown>

/** A made-up profile with a bit of everything, to read and to edit. */
export const FULL = {
	id: 1,
	firstName: 'Inès',
	lastName: 'Morel',
	artistName: 'Inès Morel Maquillage',
	specialty: 'Maquillage mariage',
	available: true,
	city: { name: 'Annecy', inseeCode: '74010', department: '74' },
	radiusKm: 30,
	homeService: true,
	description: 'Je maquille depuis huit ans, surtout des mariées. '.repeat(5).trim(),
	skills: [
		{ id: 's1', name: 'Mariée' },
		{ id: 's2', name: 'Teint lumineux' },
	],
	languages: [{ id: 'l1', name: 'Français' }],
	courses: [{ id: 'c1', diploma: 'CAP esthétique', school: 'École Fictive', graduatedAt: '2016-06-30T00:00:00.000Z' }],
	serviceOffers: [
		{
			id: 'o1',
			name: 'Maquillage de la mariée',
			priceText: 'à partir de 150',
			priceFrom: 150,
			options: [{ id: 'p1', name: 'Essai', priceText: '60', priceFrom: 60 }],
		},
	],
	networks: { instagram: 'https://www.instagram.com/ines.fictive' },
	contactDetails: { phone: '06 12 34 56 78', email: 'ines@example.test' },
	publicContact: true,
	consentedAt: '2026-10-01T10:00:00.000Z',
} as unknown as DashboardProfile

/** A profile with nothing but a name: every block is empty. */
export const EMPTY = { id: 2, firstName: 'Léa', lastName: 'Vide' } as unknown as DashboardProfile

export function benchOf(
	window: DomWindow,
	options: {
		profile?: DashboardProfile
		photo?: DashboardPhoto | null
		gallery?: DashboardPhoto[]
		actions?: Record<string, Action>
		galleryWork?: GalleryWork
		/** Where the check of her SIRET stands: without it, the page has no SIRET card. */
		activity?: ActivityView
	} = {}
) {
	const profile = options.profile ?? FULL
	const photo = options.photo ?? null
	const gallery = options.gallery ?? []
	const calls: Record<string, unknown[]> = {}
	let refreshes = 0
	const fake =
		(name: string, own?: Action): Action =>
		async input => {
			calls[name] = [...(calls[name] ?? []), input]
			return own ? own(input) : { ok: true, valeurs: input }
		}
	const own = options.actions ?? {}
	const names = [
		'saveAbout',
		'saveSkills',
		'saveLanguages',
		'saveCourses',
		'saveServices',
		'savePortfolio',
		'saveContacts',
		'saveNetworks',
		'saveSiret',
		'saveMainPicture',
		'savePlace',
	]
	const actions = {
		...Object.fromEntries(names.map(name => [name, fake(name, own[name])])),
		searchCities: (async () => ({ ok: true, communes: [] })) as Action,
	} as never
	const header = headerEdit({
		profile,
		photos: { photo, galerie: gallery, principaleManquante: false },
		actions: {
			savePhoto: fake('savePhoto', own.savePhoto),
			saveIdentity: fake('saveIdentity', own.saveIdentity),
			savePlace: fake('savePlace', own.savePlace),
			saveStatus: fake('saveStatus', own.saveStatus),
			searchCities: (async () => ({ ok: true, communes: [] })) as never,
		} as never,
	})
	const publicProfile: PublicProfile = publicProfileOf(
		{ slug: 'ines-morel', status: 'published', publishable: true, ...(profile as object) } as never,
		{
			photo: null,
			galerie: gallery.map(item => ({ url: item.url, width: item.largeur ?? 400, height: item.hauteur ?? 400 })),
			coordonnees: profile.publicContact
				? { telephone: profile.contactDetails?.phone ?? null, email: profile.contactDetails?.email ?? null }
				: null,
		}
	)
	return {
		calls,
		get refreshes() {
			return refreshes
		},
		mount: () =>
			window.monter(
				<EditSession refresh={() => void refreshes++}>
					<EditBar />
					<ProfileView
						profil={publicProfile}
						mesure={false}
						edit={{
							header,
							body: bodyEdit({
								profile,
								photos: { photo, galerie: gallery, principaleManquante: false },
								actions,
								...(options.activity ? { activity: options.activity } : {}),
								...(options.galleryWork ? { galleryWork: options.galleryWork } : {}),
							}),
						}}
					/>
				</EditSession>
			),
	}
}
