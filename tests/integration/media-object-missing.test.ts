import { afterEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfileView } from '@/components/profile/ProfileView'
import { readDashboardPhotos } from '@/lib/dashboard/photos'
import { listProfiles, readProfilePreview, readPublicProfile } from '@/services/public/profiles'
import { createAccount } from '../support/account-factory'
import { ANNECY } from '../support/completeness-cases'
import { emptyBase, testPayload } from '../support/payload-test'
import { emptyStorage } from '../support/s3'

setDefaultTimeout(30_000)

/**
 * A photo adopted without its object (ticket 275): the import marks the media (`objectMissing`), and
 * the pages leave it out, with no request to the storage, instead of drawing a broken image. The
 * profile keeps naming it, so that nothing is lost.
 */

afterEach(async () => {
	await Promise.all([emptyBase(), emptyStorage()])
})

/** A makeup artist whose main photo is a media created as the import creates it, marked without object. */
async function artistWithLostPhoto() {
	const account = await createAccount('maquilleuse')
	const payload = await testPayload()
	const [profile] = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } }))
		.docs
	if (!profile) throw new Error('pas de profil')
	const media = await payload.create({
		collection: 'media',
		data: {
			alt: 'Texte alternatif fictif',
			filename: 'photo_sans_objet.png',
			prefix: '26',
			mimeType: 'image/png',
			owner: Number(account.id),
			objectMissing: true,
		},
		context: { skipCloudStorage: true },
		overrideAccess: true,
	})
	await payload.update({
		collection: 'profiles',
		id: profile.id,
		data: {
			firstName: 'Léa',
			lastName: 'Fictive',
			specialty: 'Mariée',
			city: ANNECY,
			mainPicture: media.id,
		},
		overrideAccess: true,
	})
	return { payload, profile: await payload.findByID({ collection: 'profiles', id: profile.id, depth: 0 }), media }
}

describe('le média marqué sans objet', () => {
	test('la valeur par défaut est « présent » ; le champ est lu, jamais écrit par une requête', async () => {
		const payload = await testPayload()
		const media = await payload.create({
			collection: 'media',
			data: { filename: 'photo_presente.png', prefix: '1', mimeType: 'image/png' },
			context: { skipCloudStorage: true },
			overrideAccess: true,
		})
		expect(media.objectMissing).toBe(false)
	})

	test('la page publique montre le repli du site, sans image cassée ni texte alternatif seul', async () => {
		const { payload, profile } = await artistWithLostPhoto()
		expect(profile.status).toBe('published')

		const published = await readPublicProfile(payload, profile.slug ?? '')
		const preview = await readProfilePreview(payload, profile.id)

		for (const view of [published, preview?.profil ?? null]) {
			if (!view) throw new Error('profil non lu')
			expect(view.photo).toBeNull()
			const html = renderToStaticMarkup(createElement(ProfileView, { profil: view }))
			expect(html).not.toContain('photo_sans_objet')
			expect(html).not.toContain('Photo de')
			expect(html).toContain('pp_makeup')
		}
		// The cards of the list read the photo the same way.
		const cards = await listProfiles(payload)
		expect(cards.cartes.map(card => card.photo)).toEqual([null])
	})

	test('son espace la signale : la photo n’est pas rendue, la phrase se montre, la galerie reste intacte', async () => {
		const { payload, profile } = await artistWithLostPhoto()

		const photos = await readDashboardPhotos(payload, profile)

		expect(photos.photo).toBeNull()
		expect(photos.principaleManquante).toBe(true)
		expect(photos.galerie).toEqual([])
	})

	test('la règle du profil publiable ne bouge pas : la photo nommée compte, même sans objet', async () => {
		const { profile } = await artistWithLostPhoto()

		expect(profile.mainPicture).not.toBeNull()
		expect(profile.completeness).toBeGreaterThan(0)
	})
})
