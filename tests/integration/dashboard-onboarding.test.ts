import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { NO_PROFILE_CONTEXT } from '@/collections/Profiles'
import { readContactStep } from '@/lib/dashboard/contact-step'
import { ensureProfile } from '@/lib/dashboard/empty-profile'
import { flagshipRows } from '@/lib/dashboard/flagship-offer'
import { profileRows } from '@/lib/dashboard/list'
import { artistProfile, type DashboardUser, profileId } from '@/lib/dashboard/my-profile'
import { onboardingPosition, stepsDone } from '@/lib/dashboard/onboarding'
import { saveContactDetails } from '@/lib/dashboard/save-contact-details'
import { saveList } from '@/lib/dashboard/save-list'
import { saveNetworks } from '@/lib/dashboard/save-networks'
import { saveOnboardingIdentity } from '@/lib/dashboard/save-onboarding'
import { saveMainPicture } from '@/lib/dashboard/save-photo'
import { SERVICE_OFFERS } from '@/lib/dashboard/service-offers'
import { completeness } from '@/lib/profile/completeness'
import { profileFields } from '@/lib/profile/state'
import type { Media } from '@/payload-types'
import { readOfferMedians } from '@/services/public/offer-medians'
import { createAccount, type TestAccount } from '../support/account-factory'
import { ANNECY } from '../support/completeness-cases'
import { emptyBase, testPayload } from '../support/payload-test'
import { fileForForm } from '../support/photos'
import { callRest, formWithFile } from '../support/rest'
import { emptyStorage } from '../support/s3'
import { type Spy, spyStorage } from '../support/s3-spy'

/**
 * The onboarding on the server side (ticket 140; plan 02 E02, I02; issue 1009): an account without a
 * profile gets exactly one, made by the server; the speciality is required; the position is read from the
 * database, so a profile that went through the first three steps is active and published, and the last two
 * add a contact channel and a priced offer without erasing what an import stored.
 */

let spy: Spy
beforeEach(() => {
	spy = spyStorage()
})
afterEach(async () => {
	spy.arreter()
	await Promise.all([emptyBase(), emptyStorage()])
})

async function userOf(payload: Payload, compte: { id: number | string }): Promise<DashboardUser> {
	const doc = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as DashboardUser
}

const accountProfiles = async (compte: { id: number | string }) =>
	(
		await (
			await testPayload()
		).find({ collection: 'profiles', depth: 0, pagination: false, where: { pro: { equals: compte.id } } })
	).docs

async function sendPhoto(compte: TestAccount<'maquilleuse'>): Promise<Media> {
	const {
		statut: status,
		corps,
		texte: text,
	} = await callRest('POST', '/api/media?depth=0', {
		enTetes: compte.session.enTetes,
		formulaire: formWithFile(fileForForm(), { alt: 'Photo principale' }),
	})
	if (status !== 201) throw new Error(`Envoi refusé : ${status} ${text}`)
	return (corps as { doc: Media }).doc
}

describe('un compte importé sans profil : le profil vide est créé côté serveur', () => {
	test('un compte sans profil en reçoit un, une seule fois, et le slug vient de son nom', async () => {
		const account = await createAccount('maquilleuse-sans-profil')
		const payload = await testPayload()
		const user = await userOf(payload, account)
		expect(await accountProfiles(account)).toHaveLength(0)
		expect(await artistProfile(payload, user)).toBeNull()

		const id = await ensureProfile(payload, user)

		const profiles = await accountProfiles(account)
		expect(profiles).toHaveLength(1)
		expect(profiles[0]?.id).toBe(id ?? undefined)
		expect(profiles[0]?.slug).toBeTruthy()
		expect(profiles[0]?.status).toBe('draft')
		// She reads her own empty profile now, and the onboarding starts at the first step.
		expect(onboardingPosition(await artistProfile(payload, user))).toBe(1)
	})

	test('deux appels au même moment ne font qu’un profil', async () => {
		const account = await createAccount('maquilleuse-sans-profil')
		const payload = await testPayload()
		const user = await userOf(payload, account)

		const [a, b] = await Promise.all([ensureProfile(payload, user), ensureProfile(payload, user)])

		expect(a).not.toBeNull()
		expect(a).toBe(b)
		expect(await accountProfiles(account)).toHaveLength(1)
	})

	test('un compte qui a son profil n’en reçoit pas un second', async () => {
		const account = await createAccount('maquilleuse')
		const payload = await testPayload()
		const before = (await accountProfiles(account))[0]?.id
		expect(await ensureProfile(payload, await userOf(payload, account))).toBe(before ?? null)
		expect(await accountProfiles(account)).toHaveLength(1)
	})

	test('un compte de l’administration n’en reçoit pas', async () => {
		const admin = await createAccount('admin')
		const payload = await testPayload()
		const doc = await payload.findByID({ collection: 'admins', id: admin.id, depth: 0, overrideAccess: true })
		const user = { ...doc, collection: 'admins' } as unknown as DashboardUser
		expect(await ensureProfile(payload, user)).toBeNull()
		expect(await profileId(payload, user)).toBeNull()
	})
})

describe('E02 : les cinq étapes, lues sur le profil enregistré', () => {
	test('identité, zone, photo, contact, prestation : à chaque étape la position avance ; actif après la troisième', async () => {
		const account = await createAccount('maquilleuse')
		const payload = await testPayload()
		const user = await userOf(payload, account)
		const id = (await accountProfiles(account))[0]?.id as number

		// Step 1 refuses a missing speciality, and stores nothing.
		const without = await saveOnboardingIdentity(payload, user, {
			prenom: 'Léa',
			nom: 'Fictive',
			nomArtiste: '',
			specialtyBullets: '',
			specialtyOther: ' ',
		})
		expect(without.ok).toBe(false)
		expect(without.ok ? '' : without.champs?.specialtyBullets).toBe('Indique ta spécialité.')
		expect((await accountProfiles(account))[0]?.firstName ?? null).toBeNull()

		const identity = await saveOnboardingIdentity(payload, user, {
			prenom: 'Léa',
			nom: 'Fictive',
			nomArtiste: '',
			specialtyBullets: '',
			specialtyOther: 'Mariée',
		})
		expect(identity.ok).toBe(true)
		expect(onboardingPosition(await artistProfile(payload, user))).toBe(2)

		// The zone is saved by the save of her space; here it is written as it would be.
		await payload.update({ collection: 'profiles', id, data: { city: ANNECY } })
		expect(onboardingPosition(await artistProfile(payload, user))).toBe(3)
		expect((await accountProfiles(account))[0]?.active).toBe(false)

		const media = await sendPhoto(account)
		const photo = await saveMainPicture(payload, user, { photoPrincipale: media.id })
		expect(photo.ok).toBe(true)
		// Active and published after the third step: she is in the search, whatever comes next.
		expect(onboardingPosition(await artistProfile(payload, user))).toBe(4)
		const active = (await accountProfiles(account))[0]
		expect(active?.active).toBe(true)
		expect(active?.status).toBe('published')

		// Step 4: Instagram, read and saved as the step does.
		const contact = readContactStep(
			{ instagram: '@studio.fictif', telephone: '', email: '', contactPublic: false },
			{
				networks: { instagram: '', facebook: '', youtube: '', linkedin: '', siteWeb: '' },
				contact: { telephone: '', email: '', contactPublic: false },
			}
		)
		if (contact.ok !== true || contact.networks === null) throw new Error('lecture inattendue')
		expect((await saveNetworks(payload, user, contact.networks)).ok).toBe(true)
		expect(onboardingPosition(await artistProfile(payload, user))).toBe(5)

		// Step 5: one priced offer.
		const rows = flagshipRows([], { name: 'Maquillage de la mariée', price: '150' })
		expect((await saveList(payload, user, { lignes: rows }, SERVICE_OFFERS)).ok).toBe(true)
		const done = await artistProfile(payload, user)
		expect(onboardingPosition(done)).toBe('terminee')
		expect((await accountProfiles(account))[0]?.serviceOffers?.[0]?.priceFrom).toBe(150)

		// The rule of a profile: with the contact, the page is publishable without the presentation (decision of
		// 27/10/2026); the presentation of 100 characters and a priced offer make it indexable.
		expect(completeness(profileFields(done)).publiable).toBe(true)
		expect(completeness(profileFields(done)).indexable).toBe(false)
		await payload.update({ collection: 'profiles', id, data: { description: 'Une présentation. '.repeat(14) } })
		expect(completeness(profileFields(await artistProfile(payload, user))).indexable).toBe(true)
	})

	test('un téléphone caché ne fait pas l’étape 4 ; montré, si', async () => {
		const account = await createAccount('maquilleuse')
		const payload = await testPayload()
		const user = await userOf(payload, account)
		const hidden = await saveContactDetails(payload, user, { telephone: '0612345678', email: '', contactPublic: false })
		expect(hidden.ok).toBe(true)
		expect(stepsDone(await artistProfile(payload, user))[4]).toBe(false)
		const shown = await saveContactDetails(payload, user, { telephone: '0612345678', email: '', contactPublic: true })
		expect(shown.ok).toBe(true)
		expect(stepsDone(await artistProfile(payload, user))[4]).toBe(true)
	})

	test('un profil importé garde ses réseaux et ses prestations quand il passe les étapes 4 et 5', async () => {
		const account = await createAccount('maquilleuse')
		const payload = await testPayload()
		const user = await userOf(payload, account)
		const id = (await accountProfiles(account))[0]?.id as number
		await payload.update({
			collection: 'profiles',
			id,
			data: {
				networks: { facebook: 'https://www.facebook.com/studio.fictif' },
				serviceOffers: [{ name: 'Cours d’auto-maquillage', description: 'Deux heures' }],
			},
		})
		const profile = await artistProfile(payload, user)
		const stored = {
			networks: {
				instagram: '',
				facebook: 'https://www.facebook.com/studio.fictif',
				youtube: '',
				linkedin: '',
				siteWeb: '',
			},
			contact: { telephone: '', email: '', contactPublic: false },
		}

		const contact = readContactStep(
			{ instagram: '@studio.fictif', telephone: '', email: '', contactPublic: false },
			stored
		)
		if (contact.ok !== true || contact.networks === null) throw new Error('lecture inattendue')
		expect((await saveNetworks(payload, user, contact.networks)).ok).toBe(true)
		const rows = flagshipRows(profileRows(SERVICE_OFFERS, profile as NonNullable<typeof profile>), {
			name: 'Maquillage de soirée',
			price: '90',
		})
		expect((await saveList(payload, user, { lignes: rows }, SERVICE_OFFERS)).ok).toBe(true)

		const after = (await accountProfiles(account))[0]
		expect(after?.networks?.facebook).toBe('https://www.facebook.com/studio.fictif')
		expect(after?.networks?.instagram).toBe('https://www.instagram.com/studio.fictif')
		expect(after?.serviceOffers?.map(offer => offer.name)).toEqual(['Cours d’auto-maquillage', 'Maquillage de soirée'])
		expect(after?.serviceOffers?.[0]?.description).toBe('Deux heures')
		expect(after?.serviceOffers?.[1]?.priceFrom).toBe(90)
	})

	test('un champ réservé dans l’identité refuse toute la demande (U32)', async () => {
		const account = await createAccount('maquilleuse')
		const payload = await testPayload()
		const user = await userOf(payload, account)
		const refusal = await saveOnboardingIdentity(payload, user, {
			prenom: 'Léa',
			nom: 'Fictive',
			nomArtiste: '',
			specialtyBullets: '',
			specialtyOther: 'Mariée',
			status: 'published',
			origine: 'ia',
		})
		expect(refusal.ok).toBe(false)
		expect((await accountProfiles(account))[0]?.firstName ?? null).toBeNull()
	})
})

describe('le repère de prix : la médiane des prestations listées, jamais un profil', () => {
	async function listedWithOffer(
		payload: Payload,
		rank: number,
		name: string,
		priceFrom: number,
		status = 'published'
	) {
		const pro = await payload.create({
			collection: 'pros',
			data: {
				email: `repere-${rank}@example.test`,
				password: `Banc-${rank}-${crypto.randomUUID()}`,
				name: `Repère ${rank}`,
				_verified: true,
			},
			context: NO_PROFILE_CONTEXT,
			disableVerificationEmail: true,
		})
		await payload.create({
			collection: 'profiles',
			data: {
				pro: pro.id,
				slug: `repere-${rank}`,
				firstName: 'Repère',
				lastName: String(rank),
				serviceOffers: [{ name, priceText: String(priceFrom), priceFrom }],
				...(status === 'published' ? {} : { chosenStatus: status as 'hidden' }),
			},
		})
	}

	test('cinq prestations « mariée » : une médiane ; trois « soirée » : aucune ; un profil masqué ne compte pas', async () => {
		const payload = await testPayload()
		const bride = [100, 120, 140, 160, 200]
		for (const [rank, amount] of bride.entries())
			await listedWithOffer(payload, rank, 'Maquillage de la mariée', amount)
		for (const [rank, amount] of [50, 60, 70].entries())
			await listedWithOffer(payload, 10 + rank, 'Maquillage de soirée', amount)
		await listedWithOffer(payload, 20, 'Maquillage de la mariée', 5000, 'hidden')

		expect(await readOfferMedians(payload)).toEqual({ Mariée: 140, Soirée: null, Essai: null })
	})
})
