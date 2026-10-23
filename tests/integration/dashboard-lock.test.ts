import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { checkAdminDoesNotHoldProfile, DEFAULT_LOCK_DURATION_S, LOCKED_PROFILE_MESSAGE } from '@/lib/dashboard/lock'
import type { DashboardUser } from '@/lib/dashboard/my-profile'
import { saveContactDetails } from '@/lib/dashboard/save-contact-details'
import { saveIdentity } from '@/lib/dashboard/save-identity'
import { saveNetworks } from '@/lib/dashboard/save-networks'
import { createAccount, type TestAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * The edit lock of the administration protects the profile from the writes of her space (ticket 224): while
 * an admin has the profile open, the makeup artist is told in French to try again, and nothing is overwritten;
 * once the lock is released, or past its duration, the write goes through.
 */

afterEach(emptyBase)

type Artist = TestAccount<'maquilleuse'>

async function userOf(payload: Payload, compte: Artist): Promise<DashboardUser> {
	const doc = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as DashboardUser
}

async function storedProfile(payload: Payload, compte: Artist) {
	const { docs } = await payload.find({
		collection: 'profiles',
		depth: 0,
		overrideAccess: true,
		where: { pro: { equals: compte.id } },
	})
	const profile = docs[0]
	if (!profile) throw new Error('pas de profil')
	return profile
}

/** What the administration writes when an admin opens the profile. */
async function openInAdministration(payload: Payload, profil: number, admin: number | string) {
	return payload.create({
		collection: 'payload-locked-documents',
		overrideAccess: true,
		data: { document: { relationTo: 'profiles', value: profil }, user: { relationTo: 'admins', value: Number(admin) } },
	})
}

const IDENTITY = {
	prenom: 'Léa',
	nom: 'Fictive',
	nomArtiste: 'Studio Fictif',
	specialtyBullets: '',
	specialtyOther: 'Maquillage mariée',
}

describe('un admin tient le profil : l’espace ne l’écrase pas', () => {
	test('l’enregistrement est refusé en français, rien n’est écrit ; verrou levé, il passe', async () => {
		const payload = await testPayload()
		const account = await createAccount('maquilleuse')
		const admin = await createAccount('admin')
		const user = await userOf(payload, account)
		const profile = await storedProfile(payload, account)
		const lock = await openInAdministration(payload, profile.id, admin.id)

		const refuse = await saveIdentity(payload, user, IDENTITY)

		expect(refuse).toEqual({ ok: false, message: LOCKED_PROFILE_MESSAGE })
		expect(LOCKED_PROFILE_MESSAGE).toBe(
			'Ton profil est en cours de modification par l’équipe, réessaie dans quelques minutes.'
		)
		expect((await storedProfile(payload, account)).lastName).not.toBe('Fictive')

		await payload.delete({ collection: 'payload-locked-documents', id: lock.id, overrideAccess: true })
		const password = await saveIdentity(payload, user, IDENTITY)

		expect(password.ok).toBe(true)
		expect((await storedProfile(payload, account)).lastName).toBe('Fictive')
	})

	test('les autres enregistrements de l’espace passent par la même porte', async () => {
		const payload = await testPayload()
		const account = await createAccount('maquilleuse')
		const admin = await createAccount('admin')
		const user = await userOf(payload, account)
		await openInAdministration(payload, (await storedProfile(payload, account)).id, admin.id)

		const networks = await saveNetworks(payload, user, {
			instagram: '@fictive',
			facebook: '',
			youtube: '',
			linkedin: '',
			siteWeb: '',
		})
		const contactDetails = await saveContactDetails(payload, user, {
			telephone: '06 39 98 12 34',
			email: 'contact-fictif@example.test',
			contactPublic: false,
		})

		expect(networks).toEqual({ ok: false, message: LOCKED_PROFILE_MESSAGE })
		expect(contactDetails).toEqual({ ok: false, message: LOCKED_PROFILE_MESSAGE })
		expect((await storedProfile(payload, account)).networks?.instagram ?? null).toBeNull()
	})

	test('un verrou plus vieux que sa durée n’en est plus un ; le profil d’une autre n’est pas tenu', async () => {
		const payload = await testPayload()
		const account = await createAccount('maquilleuse')
		const other = await createAccount('maquilleuse')
		const admin = await createAccount('admin')
		const profile = await storedProfile(payload, account)
		await openInAdministration(payload, profile.id, admin.id)
		const later = new Date(Date.now() + (DEFAULT_LOCK_DURATION_S + 60) * 1000)

		await expect(checkAdminDoesNotHoldProfile(payload, profile.id)).rejects.toThrow()
		await expect(checkAdminDoesNotHoldProfile(payload, profile.id, later)).resolves.toBeUndefined()
		await expect(
			checkAdminDoesNotHoldProfile(payload, (await storedProfile(payload, other)).id)
		).resolves.toBeUndefined()
	})
})
