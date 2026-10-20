import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { LANGUAGES, listBullets, SKILLS } from '@/lib/dashboard/bullets'
import { artistProfile, type DashboardUser } from '@/lib/dashboard/my-profile'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { saveLanguages, saveSkills } from '@/lib/dashboard/save-bullets'
import { createAccount, type TestAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * The languages and the skills saved from her space (tickets 127 and 128; plan 02 E30, E31, I02):
 * the order and the identifiers of the chips are stored, two chips of the same name are two rows,
 * a made-up identifier is not kept, a name beyond 70 characters is refused and writes nothing, and
 * the description of a skill, which the chips do not show, survives a save. Made-up values only.
 */

afterEach(emptyBase)

type Artist = TestAccount<'maquilleuse'>

async function userOf(payload: Payload, compte: Artist): Promise<DashboardUser> {
	const doc = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as DashboardUser
}

async function storedProfile(payload: Payload, compte: { id: number | string }) {
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

async function artist() {
	const account = await createAccount('maquilleuse')
	const payload = await testPayload()
	return { compte: account, payload, utilisateur: await userOf(payload, account) }
}

const bullets = (resultat: { ok: boolean; valeurs?: { puces: readonly { id: string; nom: string }[] } }) =>
	resultat.valeurs?.puces ?? []

describe('127 : les langues', () => {
	test('la liste et son ordre sont stockés, chaque puce a son identifiant, et c’est ce que la base rend', async () => {
		const { payload, utilisateur: user, compte: account } = await artist()

		const result = await saveLanguages(payload, user, {
			puces: [{ nom: ' Français ' }, { nom: 'Anglais' }, { nom: 'Espagnol' }],
		})

		expect(result.ok).toBe(true)
		expect(bullets(result).map(({ nom }) => nom)).toEqual(['Français', 'Anglais', 'Espagnol'])
		expect(new Set(bullets(result).map(({ id }) => id)).size).toBe(3)
		const stored = (await storedProfile(payload, account)).languages ?? []
		expect(stored.map(({ name }) => name)).toEqual(['Français', 'Anglais', 'Espagnol'])
		expect(stored.map(({ id }) => id)).toEqual(bullets(result).map(({ id }) => id))
	})

	test('L1 : deux puces de même nom déjà stockées : retirer l’une laisse l’autre, et son identifiant ne change pas', async () => {
		const { payload, utilisateur: user, compte: account } = await artist()
		const profile = await storedProfile(payload, account)
		await payload.update({
			collection: 'profiles',
			id: profile.id,
			data: { languages: [{ name: 'Anglais' }, { name: 'Anglais' }, { name: 'Russe' }] },
		})
		const before = (await storedProfile(payload, account)).languages ?? []
		expect(new Set(before.map(({ id }) => id)).size).toBe(3)

		const result = await saveLanguages(payload, user, {
			puces: before.filter((_, rang) => rang !== 0).map(({ id, name }) => ({ id, nom: name })),
		})

		expect(result.ok).toBe(true)
		expect(bullets(result)).toEqual([
			{ id: before[1]?.id as string, nom: 'Anglais' },
			{ id: before[2]?.id as string, nom: 'Russe' },
		])
	})

	test('une liste enregistrée avec ses doublons d’avant reste enregistrable, sans les perdre', async () => {
		const { payload, utilisateur: user, compte: account } = await artist()
		const profile = await storedProfile(payload, account)
		await payload.update({
			collection: 'profiles',
			id: profile.id,
			data: { languages: [{ name: 'Anglais' }, { name: 'anglais' }] },
		})
		const before = (await storedProfile(payload, account)).languages ?? []

		const result = await saveLanguages(payload, user, {
			puces: [...before.map(({ id, name }) => ({ id, nom: name })), { nom: 'Russe' }],
		})

		expect(result.ok).toBe(true)
		expect(bullets(result).map(({ nom }) => nom)).toEqual(['Anglais', 'anglais', 'Russe'])
	})

	test('un identifiant inventé, ou pris dans le profil d’une autre, n’est pas gardé : la puce est neuve', async () => {
		const { payload, utilisateur: user } = await artist()
		const other = await artist()
		const otherProfile = await storedProfile(payload, other.compte)
		await payload.update({ collection: 'profiles', id: otherProfile.id, data: { languages: [{ name: 'Basque' }] } })
		const otherId = ((await storedProfile(payload, other.compte)).languages ?? [])[0]?.id as string

		const result = await saveLanguages(payload, user, {
			puces: [
				{ id: otherId, nom: 'Anglais' },
				{ id: 'inventé', nom: 'Russe' },
			],
		})

		expect(result.ok).toBe(true)
		expect(bullets(result).map(({ id }) => id)).not.toContain(otherId)
		expect(bullets(result).map(({ id }) => id)).not.toContain('inventé')
		expect(((await storedProfile(payload, other.compte)).languages ?? []).map(({ name }) => name)).toEqual(['Basque'])
	})

	test('E30 : un nom de 71 caractères est refusé en français, et rien n’est écrit', async () => {
		const { payload, utilisateur: user, compte: account } = await artist()
		await saveLanguages(payload, user, { puces: [{ nom: 'Anglais' }] })

		const result = await saveLanguages(payload, user, {
			puces: [{ nom: 'Anglais' }, { nom: 'x'.repeat(71) }],
		})

		expect(result).toEqual({ ok: false, message: LANGUAGES.tropLong })
		expect(((await storedProfile(payload, account)).languages ?? []).map(({ name }) => name)).toEqual(['Anglais'])
		const limit = await saveLanguages(payload, user, { puces: [{ nom: 'é'.repeat(70) }] })
		expect(limit.ok).toBe(true)
	})

	test('un nom vide est refusé, et une puce neuve qui double une autre aussi', async () => {
		const { payload, utilisateur: user } = await artist()
		expect(await saveLanguages(payload, user, { puces: [{ nom: '  ' }] })).toEqual({
			ok: false,
			message: LANGUAGES.requis,
		})
		expect(await saveLanguages(payload, user, { puces: [{ nom: 'Anglais' }, { nom: ' anglais' }] })).toEqual({
			ok: false,
			message: LANGUAGES.doublon,
		})
	})

	test('une demande qui porte autre chose que des puces est refusée en entier', async () => {
		const { payload, utilisateur: user, compte: account } = await artist()
		for (const input of [
			{ puces: [], pro: 1 },
			{ puces: [{ nom: 'a', description: 'b' }] },
			{ id: 1, puces: [] },
			null,
		]) {
			expect(await saveLanguages(payload, user, input)).toEqual({ ok: false, message: LANGUAGES.invalide })
		}
		expect((await storedProfile(payload, account)).languages ?? []).toEqual([])
	})

	test('I02 : elle n’écrit que dans son profil, trouvé par son compte', async () => {
		const { payload, utilisateur: user } = await artist()
		const other = await artist()
		await saveLanguages(payload, user, { puces: [{ nom: 'Anglais' }] })
		expect((await storedProfile(payload, other.compte)).languages ?? []).toEqual([])
	})

	test('un compte sans profil ne crée rien : message du site', async () => {
		const payload = await testPayload()
		const withoutProfile = await createAccount('maquilleuse-sans-profil')
		const doc = await payload.findByID({ collection: 'pros', id: withoutProfile.id, depth: 0, overrideAccess: true })
		const user = { ...doc, collection: 'pros' } as DashboardUser

		expect(await saveLanguages(payload, user, { puces: [{ nom: 'Anglais' }] })).toEqual({
			ok: false,
			message: FAILURE_MESSAGE,
		})
		const { totalDocs } = await payload.count({ collection: 'profiles', overrideAccess: true })
		expect(totalDocs).toBe(0)
	})

	test('E31 : l’échec de la base donne le message du site, et la liste d’avant reste', async () => {
		const { payload, utilisateur: user, compte: account } = await artist()
		await saveLanguages(payload, user, { puces: [{ nom: 'Anglais' }] })
		const broken = Object.create(payload, {
			update: {
				value: async () => {
					throw new Error('connexion perdue')
				},
			},
		}) as Payload

		expect(await saveLanguages(broken, user, { puces: [{ nom: 'Russe' }] })).toEqual({
			ok: false,
			message: FAILURE_MESSAGE,
		})
		expect(((await storedProfile(payload, account)).languages ?? []).map(({ name }) => name)).toEqual(['Anglais'])
	})

	test('la page de son espace lit ce qui a été stocké, dans l’ordre', async () => {
		const { payload, utilisateur: user } = await artist()
		await saveLanguages(payload, user, { puces: [{ nom: 'Russe' }, { nom: 'Anglais' }] })
		const profile = await artistProfile(payload, user)
		expect(listBullets(profile?.languages).map(({ nom }) => nom)).toEqual(['Russe', 'Anglais'])
	})
})

describe('128 : les compétences', () => {
	test('la liste et son ordre sont stockés', async () => {
		const { payload, utilisateur: user, compte: account } = await artist()

		const result = await saveSkills(payload, user, {
			puces: [{ nom: 'Teint' }, { nom: 'Yeux' }],
		})

		expect(result.ok).toBe(true)
		const stored = (await storedProfile(payload, account)).skills ?? []
		expect(stored.map(({ name }) => name)).toEqual(['Teint', 'Yeux'])
		expect(stored.map(({ id }) => id)).toEqual(bullets(result).map(({ id }) => id))
	})

	test('la description d’une compétence, que les puces ne montrent pas, survit à l’enregistrement', async () => {
		const { payload, utilisateur: user, compte: account } = await artist()
		const profile = await storedProfile(payload, account)
		await payload.update({
			collection: 'profiles',
			id: profile.id,
			data: { skills: [{ name: 'Teint', description: 'Peaux mates et matures.' }, { name: 'Yeux' }] },
		})
		const before = (await storedProfile(payload, account)).skills ?? []

		await saveSkills(payload, user, {
			puces: [...before.map(({ id, name }) => ({ id, nom: name })), { nom: 'Ongles' }],
		})

		const after = (await storedProfile(payload, account)).skills ?? []
		expect(after.map(({ name, description }) => [name, description ?? null])).toEqual([
			['Teint', 'Peaux mates et matures.'],
			['Yeux', null],
			['Ongles', null],
		])
	})

	test('E30 : un nom de 71 caractères est refusé, et la langue du même nom ne gêne pas', async () => {
		const { payload, utilisateur: user, compte: account } = await artist()
		await saveLanguages(payload, user, { puces: [{ nom: 'Teint' }] })

		expect(await saveSkills(payload, user, { puces: [{ nom: 'x'.repeat(71) }] })).toEqual({
			ok: false,
			message: SKILLS.tropLong,
		})
		expect((await saveSkills(payload, user, { puces: [{ nom: 'Teint' }] })).ok).toBe(true)
		expect((await storedProfile(payload, account)).languages?.map(({ name }) => name)).toEqual(['Teint'])
	})

	test('une puce neuve qui double une autre est refusée avec le message des compétences', async () => {
		const { payload, utilisateur: user } = await artist()
		expect(await saveSkills(payload, user, { puces: [{ nom: 'Teint' }, { nom: 'TEINT' }] })).toEqual({
			ok: false,
			message: SKILLS.doublon,
		})
	})

	test('E31 : l’échec de la base donne le message du site', async () => {
		const { payload, utilisateur: user } = await artist()
		const broken = Object.create(payload, {
			update: {
				value: async () => {
					throw new Error('connexion perdue')
				},
			},
		}) as Payload
		expect(await saveSkills(broken, user, { puces: [{ nom: 'Teint' }] })).toEqual({
			ok: false,
			message: FAILURE_MESSAGE,
		})
	})
})
