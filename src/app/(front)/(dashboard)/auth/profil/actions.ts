'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import type { AvailabilityValues } from '@/lib/dashboard/availability'
import type { BulletsValues } from '@/lib/dashboard/bullets'
import type { SavedContactDetails } from '@/lib/dashboard/contact-details'
import type { DescriptionValues } from '@/lib/dashboard/description'
import type { IdentityValues } from '@/lib/dashboard/identity'
import type { PhotoValues } from '@/lib/dashboard/main-picture'
import type { NetworksValues } from '@/lib/dashboard/networks'
import type { PortfolioValues } from '@/lib/dashboard/portfolio'
import { withPublishableTransition } from '@/lib/dashboard/publishable-transition'
import { requestUser } from '@/lib/dashboard/request'
import { FAILURE_MESSAGE, MESSAGE_SESSION, type SaveResult } from '@/lib/dashboard/result'
import { saveAvailability } from '@/lib/dashboard/save-availability'
import { saveLanguages, saveSkills } from '@/lib/dashboard/save-bullets'
import { saveContactDetails } from '@/lib/dashboard/save-contact-details'
import { saveDescription } from '@/lib/dashboard/save-description'
import { saveIdentity } from '@/lib/dashboard/save-identity'
import { saveNetworks } from '@/lib/dashboard/save-networks'
import { saveMainPicture } from '@/lib/dashboard/save-photo'
import { savePortfolio } from '@/lib/dashboard/save-portfolio'

/**
 * Saves the identity of the signed-in makeup artist (ticket 119). An action is a public endpoint:
 * the session is read again here, the origin is checked against the origins Payload trusts, and the
 * profile written is the one of her account, never one named by the request.
 *
 * It gives back the values the database stored, or a message in French; it never redirects, so the
 * form keeps what was typed (ticket 121 adds the way back after a new sign-in).
 */
export async function saveMyIdentity(saisie: unknown): Promise<SaveResult<IdentityValues>> {
	const context = await requestUser()
	if (context === null) return { ok: false, message: MESSAGE_SESSION, session: 'expiree' }
	const { payload, utilisateur: user } = context
	const origin = (await headers()).get('origin')
	if (origin !== null && !payload.config.csrf.includes(origin)) return { ok: false, message: FAILURE_MESSAGE }

	const result = await withPublishableTransition(payload, user, () => saveIdentity(payload, user, saisie))
	if (result.ok) revalidatePath('/auth/profil')
	return result
}

/**
 * Saves the description of the signed-in makeup artist (ticket 122), under the same guards as her
 * identity: session read again, origin checked, profile found by her account.
 */
export async function saveMyDescription(saisie: unknown): Promise<SaveResult<DescriptionValues>> {
	const context = await requestUser()
	if (context === null) return { ok: false, message: MESSAGE_SESSION, session: 'expiree' }
	const { payload, utilisateur: user } = context
	const origin = (await headers()).get('origin')
	if (origin !== null && !payload.config.csrf.includes(origin)) return { ok: false, message: FAILURE_MESSAGE }

	const result = await withPublishableTransition(payload, user, () => saveDescription(payload, user, saisie))
	if (result.ok) revalidatePath('/auth/profil')
	return result
}

/**
 * Saves the availability of the signed-in makeup artist (ticket 124), on the same terms as her
 * identity. The public list and the search read it under the tags of `profils`: the write refreshes
 * them through the hooks of the collection.
 */
export async function saveMyAvailability(saisie: unknown): Promise<SaveResult<AvailabilityValues>> {
	const context = await requestUser()
	if (context === null) return { ok: false, message: MESSAGE_SESSION, session: 'expiree' }
	const { payload, utilisateur: user } = context
	const origin = (await headers()).get('origin')
	if (origin !== null && !payload.config.csrf.includes(origin)) return { ok: false, message: FAILURE_MESSAGE }

	const result = await withPublishableTransition(payload, user, () => saveAvailability(payload, user, saisie))
	if (result.ok) revalidatePath('/auth/profil')
	return result
}

/**
 * Saves the networks and the website of the signed-in makeup artist (ticket 125): same guards as
 * the identity, the session read again, the origin checked, the profile found by her account.
 */
export async function saveMyNetworks(saisie: unknown): Promise<SaveResult<NetworksValues>> {
	const context = await requestUser()
	if (context === null) return { ok: false, message: MESSAGE_SESSION, session: 'expiree' }
	const { payload, utilisateur: user } = context
	const origin = (await headers()).get('origin')
	if (origin !== null && !payload.config.csrf.includes(origin)) return { ok: false, message: FAILURE_MESSAGE }

	const result = await withPublishableTransition(payload, user, () => saveNetworks(payload, user, saisie))
	if (result.ok) revalidatePath('/auth/profil')
	return result
}

/**
 * Saves the contact details of the signed-in makeup artist and her choice to show them (ticket
 * 126): same guards as the identity. The server dates her choice; the request cannot.
 */
export async function saveMyContactDetails(saisie: unknown): Promise<SaveResult<SavedContactDetails>> {
	const context = await requestUser()
	if (context === null) return { ok: false, message: MESSAGE_SESSION, session: 'expiree' }
	const { payload, utilisateur: user } = context
	const origin = (await headers()).get('origin')
	if (origin !== null && !payload.config.csrf.includes(origin)) return { ok: false, message: FAILURE_MESSAGE }

	const result = await withPublishableTransition(payload, user, () => saveContactDetails(payload, user, saisie))
	if (result.ok) revalidatePath('/auth/profil')
	return result
}

/**
 * Saves the languages of the signed-in makeup artist (ticket 127): same guards as the identity, the
 * session read again, the origin checked, the profile found by her account.
 */
export async function saveMyLanguages(saisie: unknown): Promise<SaveResult<BulletsValues>> {
	const context = await requestUser()
	if (context === null) return { ok: false, message: MESSAGE_SESSION, session: 'expiree' }
	const { payload, utilisateur: user } = context
	const origin = (await headers()).get('origin')
	if (origin !== null && !payload.config.csrf.includes(origin)) return { ok: false, message: FAILURE_MESSAGE }

	const result = await withPublishableTransition(payload, user, () => saveLanguages(payload, user, saisie))
	if (result.ok) revalidatePath('/auth/profil')
	return result
}

/** Saves the skills of the signed-in makeup artist (ticket 128), on the same terms as her languages. */
export async function saveMySkills(saisie: unknown): Promise<SaveResult<BulletsValues>> {
	const context = await requestUser()
	if (context === null) return { ok: false, message: MESSAGE_SESSION, session: 'expiree' }
	const { payload, utilisateur: user } = context
	const origin = (await headers()).get('origin')
	if (origin !== null && !payload.config.csrf.includes(origin)) return { ok: false, message: FAILURE_MESSAGE }

	const result = await withPublishableTransition(payload, user, () => saveSkills(payload, user, saisie))
	if (result.ok) revalidatePath('/auth/profil')
	return result
}

/**
 * Names the main photo of the signed-in makeup artist (ticket 134), on the same terms as her
 * identity. The file was sent beforehand to the media route of Payload; this action only names it.
 * The public profile reads the photo under the tags of `profils`: the write refreshes them through
 * the hooks of the collection.
 */
export async function saveMyMainPicture(saisie: unknown): Promise<SaveResult<PhotoValues>> {
	const context = await requestUser()
	if (context === null) return { ok: false, message: MESSAGE_SESSION, session: 'expiree' }
	const { payload, utilisateur: user } = context
	const origin = (await headers()).get('origin')
	if (origin !== null && !payload.config.csrf.includes(origin)) return { ok: false, message: FAILURE_MESSAGE }

	const result = await withPublishableTransition(payload, user, () => saveMainPicture(payload, user, saisie))
	if (result.ok) revalidatePath('/auth/profil')
	return result
}

/**
 * Names the photos of the portfolio of the signed-in makeup artist, in order (tickets 135 and 136),
 * on the same terms as her identity. The files were sent beforehand to the media route of Payload.
 */
export async function saveMyPortfolio(saisie: unknown): Promise<SaveResult<PortfolioValues>> {
	const context = await requestUser()
	if (context === null) return { ok: false, message: MESSAGE_SESSION, session: 'expiree' }
	const { payload, utilisateur: user } = context
	const origin = (await headers()).get('origin')
	if (origin !== null && !payload.config.csrf.includes(origin)) return { ok: false, message: FAILURE_MESSAGE }

	const result = await withPublishableTransition(payload, user, () => savePortfolio(payload, user, saisie))
	if (result.ok) revalidatePath('/auth/profil')
	return result
}
