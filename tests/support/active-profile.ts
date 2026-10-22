import { testPayload } from './payload-test'
import { fileForPayload } from './photos'

/**
 * Gives the profile of an account the three steps of the onboarding: identity, commune and a main
 * photo, so that the profile is active (ticket 296). A sign-in with no precise page then leads to her
 * space, not to the onboarding that an empty profile is offered. Made-up values only.
 */
export async function activateProfile(accountId: number | string): Promise<void> {
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: accountId } } })
	const [sheet] = docs
	if (!sheet) throw new Error('pas de profil')
	const media = await payload.create({
		collection: 'media',
		data: { owner: Number(accountId), alt: 'Photo principale' },
		file: fileForPayload(),
	})
	await payload.update({
		collection: 'profiles',
		id: sheet.id,
		data: {
			firstName: 'Léa',
			lastName: 'Fictive',
			specialty: 'Mariée',
			city: { name: 'Lille', inseeCode: '59350' },
			mainPicture: media.id,
		},
	})
}
