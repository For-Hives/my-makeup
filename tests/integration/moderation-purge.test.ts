import { afterAll, describe, expect, test } from 'bun:test'
import { runDailyTasks } from '@/lib/tasks/daily'
import { moderationPurgeThreshold, purgeModerationEvents } from '@/lib/tasks/moderation-events'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * The 60-month purge of the moderation journal against the real store (issue 1005, decision of
 * 23/10/2026), on a simulated clock. The same lines with a double: tests/unit/purge-moderation-events.test.ts.
 */

afterAll(emptyBase)

const NOW = new Date('2026-10-15T10:00:00.000Z')
const THRESHOLD = moderationPurgeThreshold(NOW)
const at = (offsetMs: number) => new Date(THRESHOLD.getTime() + offsetMs).toISOString()

async function write(date: string, admin?: number) {
	const payload = await testPayload()
	return payload.create({
		collection: 'moderation-events',
		overrideAccess: true,
		data: {
			profile: 4242,
			...(admin === undefined ? {} : { admin }),
			action: 'hide',
			reason: 'Motif fictif de test.',
			date,
		},
	})
}

const ids = async () =>
	(
		await (
			await testPayload()
		).find({ collection: 'moderation-events', depth: 0, limit: 100, pagination: false, overrideAccess: true })
	).docs.map(({ id }) => id)

describe('la purge à 60 mois, sur une horloge simulée', () => {
	test('juste avant 60 mois : supprimé ; juste après et récent : gardés ; une seconde passe ne change rien', async () => {
		const payload = await testPayload()
		const justBefore = await write(at(-1))
		const veryOld = await write('2019-01-01T00:00:00.000Z')
		const justAfter = await write(at(1))
		const recent = await write(NOW.toISOString())

		expect(await runDailyTasks(payload, NOW, [purgeModerationEvents])).toEqual([
			{ nom: 'purge-moderation-events', supprimes: 2 },
		])
		const remaining = await ids()
		expect(remaining).not.toContain(justBefore.id)
		expect(remaining).not.toContain(veryOld.id)
		expect(remaining).toContain(justAfter.id)
		expect(remaining).toContain(recent.id)

		expect(await runDailyTasks(payload, NOW, [purgeModerationEvents])).toEqual([
			{ nom: 'purge-moderation-events', supprimes: 0 },
		])
	}, 30_000)

	test('supprimer le compte d’un admin ne supprime pas ses lignes : le journal garde le numéro', async () => {
		const payload = await testPayload()
		const admin = await createAccount('admin')
		const adminId = Number(admin.id)
		const line = await write(NOW.toISOString(), adminId)

		await payload.delete({ collection: 'admins', id: admin.id, overrideAccess: true })

		const kept = await payload.findByID({
			collection: 'moderation-events',
			id: line.id,
			depth: 0,
			overrideAccess: true,
		})
		expect(kept.admin).toBe(adminId)
	}, 30_000)
})
