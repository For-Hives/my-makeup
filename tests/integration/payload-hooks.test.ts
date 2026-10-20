import { afterEach, describe, expect, test } from 'bun:test'
import { NO_PROFILE_CONTEXT } from '@/collections/Profiles'
import { creerCompte, motDePasseAleatoire } from '../outils/fabrique-comptes'
import { viderLeCapteur } from '../outils/mailpit'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'

/**
 * What the server does by itself when an account or a profile is written (plan 02 §7.3,
 * payload-hooks): I18 and I19 for ticket 020.
 */

/** Creates the account of a makeup artist with this name, as the server will at the sign-up. */
async function creerMaquilleuse(nom: string | undefined, contexte?: typeof NO_PROFILE_CONTEXT) {
	const payload = await payloadDeTest()
	return payload.create({
		collection: 'pros',
		data: {
			email: `hook-${crypto.randomUUID()}@example.test`,
			password: motDePasseAleatoire(),
			name: nom,
			_verified: true,
		},
		context: contexte,
		disableVerificationEmail: true,
	})
}

/** The profiles of an account. */
async function profilsDe(compte: number) {
	const payload = await payloadDeTest()
	return (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte } } })).docs
}

afterEach(async () => {
	await Promise.all([viderLaBase(), viderLeCapteur()])
})

describe('Un compte créé reçoit son profil vide, avec un slug unique (I18)', () => {
	test('le profil est relié au compte, vide, avec le slug calculé du nom', async () => {
		const compte = await creerMaquilleuse('Zoé Lefèvre')

		const [profil, ...autres] = await profilsDe(compte.id)
		expect(autres).toEqual([])
		expect(profil).toMatchObject({
			pro: compte.id,
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
		const premiere = await creerMaquilleuse('Zoé Lefèvre')
		const deuxieme = await creerMaquilleuse('ZOE LEFEVRE')
		const troisieme = await creerMaquilleuse('zoé  lefèvre')

		const slugs = await Promise.all(
			[premiere, deuxieme, troisieme].map(async ({ id }) => (await profilsDe(id))[0]?.slug)
		)
		expect(slugs).toEqual(['zoe-lefevre', 'zoe-lefevre-2', 'zoe-lefevre-3'])
	})

	test('un nom qui ne donne aucun slug donne maquilleuse-<identifiant du profil>, jamais un slug vide', async () => {
		const emojis = await creerMaquilleuse('💄💋')
		const sansNom = await creerMaquilleuse(undefined)

		for (const compte of [emojis, sansNom]) {
			const [profil] = await profilsDe(compte.id)
			expect(profil?.slug).toBe(`maquilleuse-${profil?.id}`)
		}
	})

	test('un compte créé par un admin, par REST, reçoit aussi son profil, et la réponse le dit vide', async () => {
		const admin = await creerCompte('admin')

		const { statut, corps } = await appelerRest('POST', '/api/pros', {
			enTetes: admin.session.enTetes,
			corps: { email: `rest-${crypto.randomUUID()}@example.test`, password: motDePasseAleatoire(), name: 'Inès Morel' },
		})

		expect(statut).toBe(201)
		const id = (corps as { doc: { id: number } }).doc.id
		expect((await profilsDe(id)).map(({ slug }) => slug)).toEqual(['ines-morel'])
	})

	test('la création porte CONTEXTE_SANS_PROFIL : le compte reste sans profil', async () => {
		const compte = await creerMaquilleuse('Sans Profil', NO_PROFILE_CONTEXT)

		expect(await profilsDe(compte.id)).toEqual([])
	})

	test('un compte n’a qu’un profil : un second profil pour le même compte est refusé', async () => {
		const compte = await creerMaquilleuse('Une Seule')
		const payload = await payloadDeTest()

		await expect(
			payload.create({ collection: 'profiles', data: { pro: compte.id, slug: 'une-seule-bis' } })
		).rejects.toThrow()
		expect((await profilsDe(compte.id)).length).toBe(1)
	})

	test('un slug donné par le serveur lui-même, comme à l’import, est gardé tel quel', async () => {
		const compte = await creerMaquilleuse('Nouveau Nom', NO_PROFILE_CONTEXT)
		const payload = await payloadDeTest()

		const profil = await payload.create({
			collection: 'profiles',
			data: { pro: compte.id, slug: 'ancien-slug', legacyUsername: 'Ancien Slug', strapiId: 12 },
		})

		expect(profil).toMatchObject({ slug: 'ancien-slug', legacyUsername: 'Ancien Slug', strapiId: 12 })
	})
})

describe('Le slug ne change plus (I19)', () => {
	test('changer le nom du compte, le prénom ou le nom du profil laisse le slug identique', async () => {
		const a = await creerCompte('maquilleuse')
		const [profil] = await profilsDe(Number(a.id))
		const slug = profil?.slug ?? ''
		expect(slug).toMatch(/^maquilleuse-[0-9a-f]{8}$/)

		const surLeCompte = await appelerRest('PATCH', `/api/pros/${a.id}`, {
			enTetes: a.session.enTetes,
			corps: { nom: 'Camille Bernard' },
		})
		const surLeProfil = await appelerRest('PATCH', `/api/profiles/${profil?.id}`, {
			enTetes: a.session.enTetes,
			corps: { firstName: 'Camille', lastName: 'Bernard', artistName: 'Camille B.', slug: 'camille-bernard' },
		})

		expect([surLeCompte.statut, surLeProfil.statut]).toEqual([200, 200])
		const [apres] = await profilsDe(Number(a.id))
		expect(apres).toMatchObject({ slug, firstName: 'Camille', lastName: 'Bernard', artistName: 'Camille B.' })
	})
})

describe('Un compte qui a encore un profil n’est pas supprimé tout seul', () => {
	test('la suppression native refuse (409) ; la route de l’admin emporte le profil avec le compte (ticket 167)', async () => {
		const [admin, a, b] = await Promise.all([
			creerCompte('admin'),
			creerCompte('maquilleuse'),
			creerCompte('maquilleuse'),
		])
		const payload = await payloadDeTest()

		await expect(payload.delete({ collection: 'pros', id: a.id, overrideAccess: true })).rejects.toMatchObject({
			status: 409,
			message: expect.stringContaining('Ce compte a encore un profil'),
		})
		expect((await payload.count({ collection: 'pros', where: { id: { equals: a.id } } })).totalDocs).toBe(1)

		expect((await appelerRest('DELETE', `/api/pros/${a.id}`, { enTetes: admin.session.enTetes })).statut).toBe(200)
		expect((await payload.count({ collection: 'pros', where: { id: { equals: a.id } } })).totalDocs).toBe(0)
		expect((await profilsDe(Number(a.id))).length).toBe(0)

		// A profile deleted first leaves an account without a profile, which goes as well.
		const [profil] = await profilsDe(Number(b.id))
		expect(
			(await appelerRest('DELETE', `/api/profiles/${profil?.id}`, { enTetes: admin.session.enTetes })).statut
		).toBe(200)
		expect((await appelerRest('DELETE', `/api/pros/${b.id}`, { enTetes: admin.session.enTetes })).statut).toBe(200)
		expect((await payload.count({ collection: 'pros', where: { id: { equals: b.id } } })).totalDocs).toBe(0)
	})
})
