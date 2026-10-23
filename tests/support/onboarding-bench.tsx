import type { OnboardingActions, OnboardingProfile } from '@/components/dashboard/onboarding/Onboarding'
import { Onboarding } from '@/components/dashboard/onboarding/Onboarding'
import type { Track } from '@/lib/analytics/track'
import type { LocationValues } from '@/lib/dashboard/location'
import { type OnboardingStep, STEPS } from '@/lib/dashboard/onboarding'
import type { DomWindow } from './dom-react'

/**
 * The onboarding with fakes for the server actions, the browser work, the refresh and the navigation
 * (issue 1009): the test sees exactly what would leave, and decides what the server answers. Made-up
 * values only.
 */

export const EMPTY_ZONE: LocationValues = {
	kind: 'city',
	codeInsee: '',
	libelle: '',
	countries: [],
	town: '',
	rayonKm: null,
	aDomicile: false,
}
export const ZONE_MADE: LocationValues = { ...EMPTY_ZONE, codeInsee: '59350', libelle: 'Lille (59)' }
export const REDUCED = new File(['petit'], 'photo.webp', { type: 'image/webp' })

export const EMPTY_PROFILE: OnboardingProfile = {
	identity: { prenom: '', nom: '', nomArtiste: '', specialtyBullets: '', specialtyOther: '' },
	askNames: true,
	location: EMPTY_ZONE,
	zoneReview: null,
	photo: null,
	networks: { instagram: '', facebook: '', youtube: '', linkedin: '', siteWeb: '' },
	contact: { telephone: '', email: '', contactPublic: false },
	offers: [],
	medians: { Mariée: null, Soirée: null, Essai: null },
}

export const NOTHING_DONE: Record<OnboardingStep, boolean> = { 1: false, 2: false, 3: false, 4: false, 5: false }

/** `done` for a profile that holds the steps up to `until` (inclusive). */
export const doneUntil = (until: number): Record<OnboardingStep, boolean> =>
	Object.fromEntries(STEPS.map(step => [step, step <= until])) as Record<OnboardingStep, boolean>

export interface Options {
	position?: OnboardingStep
	done?: Record<OnboardingStep, boolean>
	profile?: Partial<OnboardingProfile>
	actions?: Partial<OnboardingActions>
	suivre?: Track
}

export function onboardingBench(window: DomWindow, options: Options = {}) {
	const log = {
		identity: [] as unknown[],
		place: [] as unknown[],
		photo: [] as unknown[],
		networks: [] as unknown[],
		contacts: [] as unknown[],
		services: [] as unknown[],
		uploads: 0,
		removed: [] as unknown[],
		navigations: [] as string[],
		refreshes: 0,
	}
	const actions: OnboardingActions = {
		saveIdentity: async values => {
			log.identity.push(values)
			return { ok: true, valeurs: values }
		},
		savePlace: async input => {
			log.place.push(input)
			return { ok: true, valeurs: { ...ZONE_MADE, rayonKm: input.rayonKm, aDomicile: input.aDomicile } }
		},
		searchCities: async () => ({
			ok: true,
			communes: [{ codeInsee: '59350', libelle: 'Lille (59)', nom: 'Lille' }],
		}),
		savePhoto: async input => {
			log.photo.push(input)
			return { ok: true, valeurs: { photoPrincipale: input.photoPrincipale } }
		},
		saveNetworks: async values => {
			log.networks.push(values)
			return { ok: true, valeurs: values }
		},
		saveContacts: async values => {
			log.contacts.push(values)
			return { ok: true, valeurs: { ...values, consentiLe: values.contactPublic ? '2026-10-23T10:00:00.000Z' : null } }
		},
		saveServices: async list => {
			log.services.push(list)
			return {
				ok: true,
				valeurs: { lignes: list.lignes.map((row, rank) => ({ id: row.id ?? `n${rank}`, valeurs: row.valeurs })) },
			}
		},
		...options.actions,
	}
	return {
		journal: log,
		monter: () =>
			window.monter(
				<Onboarding
					position={options.position ?? 1}
					done={options.done ?? NOTHING_DONE}
					profile={{ ...EMPTY_PROFILE, ...options.profile }}
					actions={actions}
					photoWork={{
						prepare: async () => ({ ok: true, fichier: REDUCED, largeur: 800, hauteur: 600, taille: 5 }),
						upload: async () => {
							log.uploads++
							return { ok: true, id: 9 }
						},
						remove: async id => {
							log.removed.push(id)
						},
					}}
					refresh={() => {
						log.refreshes++
					}}
					navigate={url => {
						log.navigations.push(url)
					}}
					{...(options.suivre === undefined ? {} : { suivre: options.suivre })}
				/>
			),
	}
}
