import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { deleteAccountAndDependents } from '@/lib/account/deletion'
import type { BusinessRegistry, RegistryAnswer } from '@/lib/activity/registry'
import { badgedProfiles, readCheck } from '@/lib/activity/store'
import type { DashboardUser } from '@/lib/dashboard/my-profile'
import { createActivityCheckTask } from '@/lib/tasks/activity-check'
import { runDailyTasks } from '@/lib/tasks/daily'
import { SIRET_ACTIVE, SIRET_CEASED, SIRET_UNKNOWN } from '../fixtures/business-registry'
import { createAccount, type TestAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * Issue 1004: the daily activity check against the real store of the bench. The registry is a stub that answers
 * from a table and counts its calls: nothing here reaches the real one. Made-up numbers only.
 */

afterEach(emptyBase)

const HOUR = 3_600_000
const DAY = 24 * HOUR
type Artist = TestAccount<'maquilleuse'>

/** A registry that answers from a table and remembers what it was asked. */
function stubRegistry(answers: Record<string, RegistryAnswer>, before?: (siret: string) => Promise<void>) {
	const asked: string[] = []
	const registry: BusinessRegistry = {
		lookup: async siret => {
			asked.push(siret)
			await before?.(siret)
			return answers[siret] ?? { kind: 'not-found' }
		},
	}
	return { registry, asked }
}

const taskWith = (registry: BusinessRegistry, extra: { cap?: number; enabled?: boolean } = {}) =>
	createActivityCheckTask({ enabled: () => extra.enabled ?? true, registry: () => registry, cap: extra.cap ?? 100 })

async function artist(payload: Payload, siret?: string) {
	const account: Artist = await createAccount('maquilleuse')
	const doc = await payload.findByID({ collection: 'pros', id: account.id, depth: 0, overrideAccess: true })
	const user = { ...doc, collection: 'pros' } as DashboardUser
	const { docs } = await payload.find({
		collection: 'profiles',
		depth: 0,
		overrideAccess: true,
		where: { pro: { equals: account.id } },
	})
	const profile = docs[0]
	if (!profile) throw new Error('pas de profil')
	if (siret) await setSiret(payload, user, profile.id, siret)
	return { account, user, id: profile.id }
}

/** She writes it herself: the rules are active. */
const setSiret = (payload: Payload, user: DashboardUser, id: number, siret: string | null) =>
	payload.update({ collection: 'profiles', id, data: { siret }, depth: 0, overrideAccess: false, user })

const profileRow = (payload: Payload, id: number) =>
	payload.findByID({ collection: 'profiles', id, depth: 0, overrideAccess: true })

describe('1004 : le SIRET donné ou changé remet le contrôle à zéro', () => {
	test('un SIRET donné crée une ligne « à contrôler » ; vidé, la ligne part', async () => {
		const payload = await testPayload()
		const { user, id } = await artist(payload, SIRET_ACTIVE)
		expect(await readCheck(payload, id)).toMatchObject({ outcome: 'pending', checkedAt: null, attemptedAt: null })
		await setSiret(payload, user, id, null)
		expect(await readCheck(payload, id)).toBeNull()
	})

	test('un profil sans SIRET n’a aucune ligne et n’est jamais interrogé', async () => {
		const payload = await testPayload()
		const { id } = await artist(payload)
		const { registry, asked } = stubRegistry({})
		await runDailyTasks(payload, new Date(), [taskWith(registry)])
		expect(await readCheck(payload, id)).toBeNull()
		expect(asked).toEqual([])
	})

	test('enregistrer le même SIRET ne remet rien à zéro', async () => {
		const payload = await testPayload()
		const { user, id } = await artist(payload, SIRET_ACTIVE)
		const { registry } = stubRegistry({ [SIRET_ACTIVE]: { kind: 'active' } })
		await runDailyTasks(payload, new Date(), [taskWith(registry)])
		await setSiret(payload, user, id, SIRET_ACTIVE)
		expect(await readCheck(payload, id)).toMatchObject({ outcome: 'active' })
	})

	test('changer de SIRET retire le badge aussitôt et recommence le contrôle', async () => {
		const payload = await testPayload()
		const { user, id } = await artist(payload, SIRET_ACTIVE)
		const { registry } = stubRegistry({ [SIRET_ACTIVE]: { kind: 'active' } })
		await runDailyTasks(payload, new Date(), [taskWith(registry)])
		expect((await badgedProfiles(payload, [id])).has(id)).toBe(true)
		await setSiret(payload, user, id, SIRET_CEASED)
		expect((await badgedProfiles(payload, [id])).has(id)).toBe(false)
		expect(await readCheck(payload, id)).toMatchObject({ outcome: 'pending', checkedAt: null })
	})
})

describe('1004 : la tâche quotidienne', () => {
	test('désactivée (hors du site), elle n’interroge personne', async () => {
		const payload = await testPayload()
		await artist(payload, SIRET_ACTIVE)
		const { registry, asked } = stubRegistry({})
		const result = await runDailyTasks(payload, new Date(), [taskWith(registry, { enabled: false })])
		expect(result).toEqual([{ nom: 'controle-activite', supprimes: 0 }])
		expect(asked).toEqual([])
	})

	test('établissement actif : le badge est donné, avec la date du contrôle', async () => {
		const payload = await testPayload()
		const { id } = await artist(payload, SIRET_ACTIVE)
		const { registry, asked } = stubRegistry({ [SIRET_ACTIVE]: { kind: 'active' } })
		const now = new Date()
		const result = await runDailyTasks(payload, now, [taskWith(registry)])
		expect(result).toEqual([{ nom: 'controle-activite', supprimes: 1 }])
		expect(asked).toEqual([SIRET_ACTIVE])
		const row = await readCheck(payload, id)
		expect(row).toMatchObject({ outcome: 'active' })
		expect(row?.checkedAt && new Date(row.checkedAt).getTime()).toBe(now.getTime())
		expect((await badgedProfiles(payload, [id])).has(id)).toBe(true)
	})

	test('introuvable ou cessé : pas de badge, et plus aucun appel tant que le SIRET ne change pas', async () => {
		const payload = await testPayload()
		const unknown = await artist(payload, SIRET_UNKNOWN)
		const ceased = await artist(payload, SIRET_CEASED)
		const { registry, asked } = stubRegistry({ [SIRET_CEASED]: { kind: 'ceased' } })
		const now = Date.now()
		await runDailyTasks(payload, new Date(now), [taskWith(registry)])
		expect(await readCheck(payload, unknown.id)).toMatchObject({ outcome: 'not-found' })
		expect(await readCheck(payload, ceased.id)).toMatchObject({ outcome: 'ceased' })
		expect(asked).toHaveLength(2)
		await runDailyTasks(payload, new Date(now + 10 * DAY), [taskWith(registry)])
		expect(asked).toHaveLength(2)
	})

	test('un badge se recontrôle chaque jour, pas deux fois dans la même journée', async () => {
		const payload = await testPayload()
		await artist(payload, SIRET_ACTIVE)
		const { registry, asked } = stubRegistry({ [SIRET_ACTIVE]: { kind: 'active' } })
		const now = Date.now()
		await runDailyTasks(payload, new Date(now), [taskWith(registry)])
		await runDailyTasks(payload, new Date(now + 2 * HOUR), [taskWith(registry)])
		expect(asked).toHaveLength(1)
		await runDailyTasks(payload, new Date(now + DAY + HOUR), [taskWith(registry)])
		expect(asked).toHaveLength(2)
	})

	test('l’entreprise cesse : le badge disparaît', async () => {
		const payload = await testPayload()
		const { id } = await artist(payload, SIRET_ACTIVE)
		const answers: Record<string, RegistryAnswer> = { [SIRET_ACTIVE]: { kind: 'active' } }
		const { registry } = stubRegistry(answers)
		const now = Date.now()
		await runDailyTasks(payload, new Date(now), [taskWith(registry)])
		answers[SIRET_ACTIVE] = { kind: 'ceased' }
		await runDailyTasks(payload, new Date(now + DAY + HOUR), [taskWith(registry)])
		expect(await readCheck(payload, id)).toMatchObject({ outcome: 'ceased' })
		expect((await badgedProfiles(payload, [id])).size).toBe(0)
	})

	test.each([
		['indisponible', { kind: 'unavailable' }],
		['illisible', { kind: 'unreadable' }],
	] as const)('réponse %s : aucun badge retiré ni donné, un nouvel essai plus tard', async (_name, answer) => {
		const payload = await testPayload()
		const badged = await artist(payload, SIRET_ACTIVE)
		const now = Date.now()
		await runDailyTasks(payload, new Date(now), [
			taskWith(stubRegistry({ [SIRET_ACTIVE]: { kind: 'active' } }).registry),
		])
		const fresh = await artist(payload, SIRET_CEASED)
		const failing = stubRegistry({ [SIRET_ACTIVE]: answer, [SIRET_CEASED]: answer })
		await runDailyTasks(payload, new Date(now + DAY + HOUR), [taskWith(failing.registry)])
		// The badge stays, the new profile stays « to check », the attempt is dated.
		expect(await readCheck(payload, badged.id)).toMatchObject({ outcome: 'active' })
		expect(await readCheck(payload, fresh.id)).toMatchObject({ outcome: 'pending', checkedAt: null })
		expect((await readCheck(payload, fresh.id))?.attemptedAt).not.toBeNull()
		// Not asked again the same hour, asked again later.
		const again = stubRegistry({ [SIRET_CEASED]: { kind: 'ceased' } })
		await runDailyTasks(payload, new Date(now + DAY + 2 * HOUR), [taskWith(again.registry)])
		expect(again.asked).toEqual([])
		await runDailyTasks(payload, new Date(now + 2 * DAY), [taskWith(again.registry)])
		expect(await readCheck(payload, fresh.id)).toMatchObject({ outcome: 'ceased' })
	})

	test('un 429 arrête la journée : les profils suivants ne sont pas interrogés', async () => {
		const payload = await testPayload()
		await artist(payload, SIRET_ACTIVE)
		await artist(payload, SIRET_CEASED)
		const { registry, asked } = stubRegistry({
			[SIRET_ACTIVE]: { kind: 'rate-limited' },
			[SIRET_CEASED]: { kind: 'rate-limited' },
		})
		await runDailyTasks(payload, new Date(), [taskWith(registry)])
		expect(asked).toHaveLength(1)
	})

	test('le plafond du jour : pas plus de profils que le plafond', async () => {
		const payload = await testPayload()
		await artist(payload, SIRET_ACTIVE)
		await artist(payload, SIRET_CEASED)
		await artist(payload, SIRET_UNKNOWN)
		const { registry, asked } = stubRegistry({})
		await runDailyTasks(payload, new Date(), [taskWith(registry, { cap: 2 })])
		expect(asked).toHaveLength(2)
		await runDailyTasks(payload, new Date(), [taskWith(registry, { cap: 2 })])
		expect(asked).toHaveLength(3)
	})

	test('le SIRET change pendant l’appel : la réponse du vieux numéro n’est pas écrite', async () => {
		const payload = await testPayload()
		const { user, id } = await artist(payload, SIRET_ACTIVE)
		const { registry } = stubRegistry({ [SIRET_ACTIVE]: { kind: 'active' } }, async () => {
			await setSiret(payload, user, id, SIRET_CEASED)
		})
		await runDailyTasks(payload, new Date(), [taskWith(registry)])
		expect(await readCheck(payload, id)).toMatchObject({ outcome: 'pending' })
		expect((await badgedProfiles(payload, [id])).size).toBe(0)
	})

	test('le profil n’est pas touché : sa date de modification reste, donc aucun gain au classement', async () => {
		const payload = await testPayload()
		const { id } = await artist(payload, SIRET_ACTIVE)
		const before = (await profileRow(payload, id)).updatedAt
		const { registry } = stubRegistry({ [SIRET_ACTIVE]: { kind: 'active' } })
		await runDailyTasks(payload, new Date(Date.now() + 5 * DAY), [taskWith(registry)])
		expect((await profileRow(payload, id)).updatedAt).toBe(before)
	})
})

describe('1004 : l’effacement', () => {
	test('la suppression du compte emporte la ligne', async () => {
		const payload = await testPayload()
		const { account, id } = await artist(payload, SIRET_ACTIVE)
		await deleteAccountAndDependents(payload, account.id)
		expect(await readCheck(payload, id)).toBeNull()
		expect((await payload.find({ collection: 'activity-checks', depth: 0, overrideAccess: true })).totalDocs).toBe(0)
	})

	test('une ligne orpheline est reprise par la tâche', async () => {
		const payload = await testPayload()
		await payload.create({ collection: 'activity-checks', data: { outcome: 'active' }, overrideAccess: true })
		const { registry } = stubRegistry({})
		await runDailyTasks(payload, new Date(), [taskWith(registry)])
		expect((await payload.find({ collection: 'activity-checks', depth: 0, overrideAccess: true })).totalDocs).toBe(0)
	})
})
