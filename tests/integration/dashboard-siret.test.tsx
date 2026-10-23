import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfileView } from '@/components/profile/ProfileView'
import { readCheck } from '@/lib/activity/store'
import { artistProfile, type DashboardUser } from '@/lib/dashboard/my-profile'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { saveSiret } from '@/lib/dashboard/save-siret'
import { DASHBOARD_SIRET_MESSAGES } from '@/lib/dashboard/siret'
import { createActivityCheckTask } from '@/lib/tasks/activity-check'
import { runDailyTasks } from '@/lib/tasks/daily'
import { listProfiles, readPublicProfile } from '@/services/public/profiles'
import { SIRET_ACTIVE, SIRET_CEASED } from '../fixtures/business-registry'
import { createAccount, type TestAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * Issue 1004: the SIRET saved from her space, the badge it gives on the public read, and the places it never
 * reaches. The registry is a stub; made-up numbers only.
 */

afterEach(emptyBase)

type Artist = TestAccount<'maquilleuse'>

async function userOf(payload: Payload, compte: Artist): Promise<DashboardUser> {
	const doc = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as DashboardUser
}

async function artist() {
	const account: Artist = await createAccount('maquilleuse')
	const payload = await testPayload()
	const user = await userOf(payload, account)
	const { docs } = await payload.find({
		collection: 'profiles',
		depth: 0,
		overrideAccess: true,
		where: { pro: { equals: account.id } },
	})
	const profile = docs[0]
	if (!profile) throw new Error('pas de profil')
	// Listed on the public pages: a specialty is enough for the cards of this test.
	await payload.update({
		collection: 'profiles',
		id: profile.id,
		data: { specialty: 'Mariage', description: 'Maquillage de mariée. '.repeat(10) },
	})
	return { payload, user, id: profile.id, slug: profile.slug }
}

const stored = async (payload: Payload, id: number) =>
	(await payload.findByID({ collection: 'profiles', id, depth: 0, overrideAccess: true })).siret

const withBadge = (answer: 'active' | 'ceased') =>
	createActivityCheckTask({
		enabled: () => true,
		registry: () => ({ lookup: async () => ({ kind: answer }) }),
		cap: 10,
	})

describe('1004 : enregistrer son SIRET depuis l’espace', () => {
	test('avec des espaces : les 14 chiffres sont gardés, le contrôle est « à faire »', async () => {
		const { payload, user, id } = await artist()
		const result = await saveSiret(payload, user, { siret: ' 000 000 001 00016 ' })
		expect(result).toEqual({ ok: true, valeurs: { siret: SIRET_ACTIVE } })
		expect(await stored(payload, id)).toBe(SIRET_ACTIVE)
		expect(await readCheck(payload, id)).toMatchObject({ outcome: 'pending' })
	})

	test('vide : le SIRET et sa ligne de contrôle partent', async () => {
		const { payload, user, id } = await artist()
		await saveSiret(payload, user, { siret: SIRET_ACTIVE })
		expect(await saveSiret(payload, user, { siret: '' })).toEqual({ ok: true, valeurs: { siret: '' } })
		expect(await stored(payload, id)).toBeNull()
		expect(await readCheck(payload, id)).toBeNull()
	})

	test('une faute de clé est refusée sous le champ, rien n’est écrit', async () => {
		const { payload, user, id } = await artist()
		const result = await saveSiret(payload, user, { siret: '00000000100017' })
		expect(result).toMatchObject({ ok: false, champs: { siret: DASHBOARD_SIRET_MESSAGES.key } })
		expect(await stored(payload, id)).toBeNull()
	})

	test('une clé de plus dans la requête refuse tout, sans nommer le numéro', async () => {
		const { payload, user, id } = await artist()
		const result = await saveSiret(payload, user, { siret: SIRET_ACTIVE, verified: true })
		expect(result).toEqual({ ok: false, message: FAILURE_MESSAGE })
		expect(await stored(payload, id)).toBeNull()
	})

	test('seul son profil est écrit : celui d’une autre garde son SIRET', async () => {
		const first = await artist()
		const second = await artist()
		await saveSiret(second.payload, second.user, { siret: SIRET_CEASED })
		await saveSiret(first.payload, first.user, { siret: SIRET_ACTIVE })
		expect(await stored(first.payload, second.id)).toBe(SIRET_CEASED)
	})

	test('elle relit son SIRET, la page publique ne le porte pas', async () => {
		const { payload, user, id, slug } = await artist()
		await saveSiret(payload, user, { siret: SIRET_ACTIVE })
		expect((await artistProfile(payload, user))?.siret).toBe(SIRET_ACTIVE)
		const profile = await readPublicProfile(payload, slug)
		expect(JSON.stringify(profile)).not.toContain(SIRET_ACTIVE)
		expect(renderToStaticMarkup(<ProfileView profil={profile as never} />)).not.toContain(SIRET_ACTIVE)
		expect(JSON.stringify(await listProfiles(payload))).not.toContain(SIRET_ACTIVE)
		expect(id).toBeGreaterThan(0)
	})
})

describe('1004 : le badge sur la lecture publique', () => {
	test('sans contrôle, ou en attente : aucune clé « activityVerified », ni sur la carte ni sur la fiche', async () => {
		const { payload, user, slug } = await artist()
		await saveSiret(payload, user, { siret: SIRET_ACTIVE })
		const page = await listProfiles(payload)
		expect(page.cartes.every(card => !('activityVerified' in card))).toBe(true)
		expect(await readPublicProfile(payload, slug)).not.toHaveProperty('activityVerified')
	})

	test('activité en cours : la carte porte « true » et la fiche la date du contrôle ; cessée : plus rien', async () => {
		const { payload, user, slug } = await artist()
		await saveSiret(payload, user, { siret: SIRET_ACTIVE })
		const now = new Date()
		await runDailyTasks(payload, now, [withBadge('active')])
		const card = (await listProfiles(payload)).cartes.find(item => item.slug === slug)
		expect(card?.activityVerified).toBe(true)
		const profile = await readPublicProfile(payload, slug)
		expect(profile?.activityVerified).toEqual({ checkedAt: now.toISOString() })
		const html = renderToStaticMarkup(<ProfileView profil={profile as never} />)
		expect(html).toContain('Activité vérifiée')
		expect(html).not.toContain(SIRET_ACTIVE)

		await runDailyTasks(payload, new Date(now.getTime() + 25 * 3_600_000), [withBadge('ceased')])
		expect((await listProfiles(payload)).cartes.find(item => item.slug === slug)).not.toHaveProperty('activityVerified')
		expect(await readPublicProfile(payload, slug)).not.toHaveProperty('activityVerified')
	})

	test('le profil sans SIRET n’est ni retiré de la liste ni changé : mêmes clés que celui qui a le badge, moins le badge', async () => {
		const badged = await artist()
		const plain = await artist()
		await saveSiret(badged.payload, badged.user, { siret: SIRET_ACTIVE })
		await runDailyTasks(badged.payload, new Date(), [withBadge('active')])
		const cards = (await listProfiles(plain.payload)).cartes
		const keys = (slug: string) => Object.keys(cards.find(card => card.slug === slug) ?? {}).sort()
		expect(keys(plain.slug)).toEqual(keys(badged.slug).filter(key => key !== 'activityVerified'))
		expect(cards).toHaveLength(2)
	})
})

describe('1004 : le numéro ne sort pas dans les journaux', () => {
	test('un refus et un enregistrement ne l’écrivent pas dans le journal de Payload', async () => {
		const { payload, user } = await artist()
		const lines: string[] = []
		const original = payload.logger.error.bind(payload.logger)
		const originalInfo = payload.logger.info.bind(payload.logger)
		;(payload.logger as { error: unknown }).error = (...args: unknown[]) => {
			lines.push(JSON.stringify(args))
			return original(...(args as [never]))
		}
		;(payload.logger as { info: unknown }).info = (...args: unknown[]) => {
			lines.push(JSON.stringify(args))
			return originalInfo(...(args as [never]))
		}
		await saveSiret(payload, user, { siret: '00000000100017' })
		await saveSiret(payload, user, { siret: SIRET_ACTIVE })
		await runDailyTasks(payload, new Date(), [withBadge('active')])
		expect(lines.join('\n')).not.toContain(SIRET_ACTIVE)
		expect(lines.join('\n')).not.toContain('00000000100017')
		;(payload.logger as { error: unknown }).error = original
		;(payload.logger as { info: unknown }).info = originalInfo
	})
})
