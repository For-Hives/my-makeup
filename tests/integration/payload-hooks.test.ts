import { afterEach, describe, expect, test } from 'bun:test'
import { NO_PROFILE_CONTEXT } from '@/collections/Profiles'
import { createAccount, randomPassword } from '../support/account-factory'
import { emptySink } from '../support/mailpit'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

/**
 * What the server does by itself when an account or a profile is written (plan 02 §7.3,
 * payload-hooks): I18 and I19 for ticket 020.
 */

/** Creates the account of a makeup artist with this name, as the server will at the sign-up. */
async function createArtist(nom: string | undefined, contexte?: typeof NO_PROFILE_CONTEXT) {
	const payload = await testPayload()
	return payload.create({
		collection: 'pros',
		data: {
			email: `hook-${crypto.randomUUID()}@example.test`,
			password: randomPassword(),
			name: nom,
			_verified: true,
		},
		context: contexte,
		disableVerificationEmail: true,
	})
}

/** The profiles of an account. */
async function profilesOf(compte: number) {
	const payload = await testPayload()
	return (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte } } })).docs
}

afterEach(async () => {
	await Promise.all([emptyBase(), emptySink()])
})

describe('Un compte créé reçoit son profil vide, avec un slug unique (I18)', () => {
	test('le profil est relié au compte, vide, avec le slug calculé du nom', async () => {
		const account = await createArtist('Zoé Lefèvre')

		const [profile, ...others] = await profilesOf(account.id)
		expect(others).toEqual([])
		expect(profile).toMatchObject({
			pro: account.id,
			slug: 'zoe-lefevre',
			firstName: null,
			lastName: null,
			artistName: null,
			specialty: null,
			description: null,
			available: true,
			legacyUsername: null,
			strapiId: null,
		})
	})

	test('les doublons reçoivent -2, puis -3, dans l’ordre de création', async () => {
		const first = await createArtist('Zoé Lefèvre')
		const second = await createArtist('ZOE LEFEVRE')
		const third = await createArtist('zoé  lefèvre')

		const slugs = await Promise.all([first, second, third].map(async ({ id }) => (await profilesOf(id))[0]?.slug))
		expect(slugs).toEqual(['zoe-lefevre', 'zoe-lefevre-2', 'zoe-lefevre-3'])
	})

	test('un nom qui ne donne aucun slug donne maquilleuse-<identifiant du profil>, jamais un slug vide', async () => {
		const emojis = await createArtist('💄💋')
		const withoutName = await createArtist(undefined)

		for (const account of [emojis, withoutName]) {
			const [profile] = await profilesOf(account.id)
			expect(profile?.slug).toBe(`maquilleuse-${profile?.id}`)
		}
	})

	test('un compte créé par un admin, par REST, reçoit aussi son profil, et la réponse le dit vide', async () => {
		const admin = await createAccount('admin')

		const { statut: status, corps } = await callRest('POST', '/api/pros', {
			enTetes: admin.session.enTetes,
			corps: { email: `rest-${crypto.randomUUID()}@example.test`, password: randomPassword(), name: 'Inès Morel' },
		})

		expect(status).toBe(201)
		const id = (corps as { doc: { id: number } }).doc.id
		expect((await profilesOf(id)).map(({ slug }) => slug)).toEqual(['ines-morel'])
	})

	test('la création porte CONTEXTE_SANS_PROFIL : le compte reste sans profil', async () => {
		const account = await createArtist('Sans Profil', NO_PROFILE_CONTEXT)

		expect(await profilesOf(account.id)).toEqual([])
	})

	test('un compte n’a qu’un profil : un second profil pour le même compte est refusé', async () => {
		const account = await createArtist('Une Seule')
		const payload = await testPayload()

		await expect(
			payload.create({ collection: 'profiles', data: { pro: account.id, slug: 'une-seule-bis' } })
		).rejects.toThrow()
		expect((await profilesOf(account.id)).length).toBe(1)
	})

	test('un slug donné par le serveur lui-même, comme à l’import, est gardé tel quel', async () => {
		const account = await createArtist('Nouveau Nom', NO_PROFILE_CONTEXT)
		const payload = await testPayload()

		const profile = await payload.create({
			collection: 'profiles',
			data: { pro: account.id, slug: 'ancien-slug', legacyUsername: 'Ancien Slug', strapiId: 12 },
		})

		expect(profile).toMatchObject({ slug: 'ancien-slug', legacyUsername: 'Ancien Slug', strapiId: 12 })
	})
})

describe('Le slug ne change plus (I19)', () => {
	test('changer le nom du compte, le prénom ou le nom du profil laisse le slug identique', async () => {
		const a = await createAccount('maquilleuse')
		const [profile] = await profilesOf(Number(a.id))
		const slug = profile?.slug ?? ''
		expect(slug).toMatch(/^maquilleuse-[0-9a-f]{8}$/)

		const onAccount = await callRest('PATCH', `/api/pros/${a.id}`, {
			enTetes: a.session.enTetes,
			corps: { nom: 'Camille Bernard' },
		})
		const onProfile = await callRest('PATCH', `/api/profiles/${profile?.id}`, {
			enTetes: a.session.enTetes,
			corps: { firstName: 'Camille', lastName: 'Bernard', artistName: 'Camille B.', slug: 'camille-bernard' },
		})

		expect([onAccount.statut, onProfile.statut]).toEqual([200, 200])
		const [after] = await profilesOf(Number(a.id))
		expect(after).toMatchObject({ slug, firstName: 'Camille', lastName: 'Bernard', artistName: 'Camille B.' })
	})
})

describe('Un compte qui a encore un profil n’est pas supprimé tout seul', () => {
	test('la suppression native refuse (409) ; la route de l’admin emporte le profil avec le compte (ticket 167)', async () => {
		const [admin, a, b] = await Promise.all([
			createAccount('admin'),
			createAccount('maquilleuse'),
			createAccount('maquilleuse'),
		])
		const payload = await testPayload()

		await expect(payload.delete({ collection: 'pros', id: a.id, overrideAccess: true })).rejects.toMatchObject({
			status: 409,
			message: expect.stringContaining('Ce compte a encore un profil'),
		})
		expect((await payload.count({ collection: 'pros', where: { id: { equals: a.id } } })).totalDocs).toBe(1)

		expect((await callRest('DELETE', `/api/pros/${a.id}`, { enTetes: admin.session.enTetes })).statut).toBe(200)
		expect((await payload.count({ collection: 'pros', where: { id: { equals: a.id } } })).totalDocs).toBe(0)
		expect((await profilesOf(Number(a.id))).length).toBe(0)

		// A profile deleted first leaves an account without a profile, which goes as well.
		const [profile] = await profilesOf(Number(b.id))
		expect((await callRest('DELETE', `/api/profiles/${profile?.id}`, { enTetes: admin.session.enTetes })).statut).toBe(
			200
		)
		expect((await callRest('DELETE', `/api/pros/${b.id}`, { enTetes: admin.session.enTetes })).statut).toBe(200)
		expect((await payload.count({ collection: 'pros', where: { id: { equals: b.id } } })).totalDocs).toBe(0)
	})
})
