import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { MOST_VIEWED_MIN_VIEWS } from '@/lib/search/preset'
import { parisDayBefore } from '@/lib/weekly-stats'
import { readMostViewedSlugs } from '@/services/public/most-viewed'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * The reading of the most viewed profiles for the preset of the search page, against the real store: the sum over the
 * 30 days of Paris, the floor, the published profiles only, and only slugs come out. The rules without a database:
 * tests/unit/search-preset.test.ts.
 */

afterEach(emptyBase)

async function artist(payload: Payload, status: 'published' | 'hidden', name: string) {
	const account = await createAccount('maquilleuse')
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
	const profile = docs[0]
	if (!profile) throw new Error('pas de profil')
	await payload.update({
		collection: 'profiles',
		id: profile.id,
		data: { firstName: name, lastName: 'Fictive', specialty: 'Mariage', chosenStatus: status },
	})
	const { docs: after } = await payload.find({
		collection: 'profiles',
		depth: 0,
		where: { id: { equals: profile.id } },
	})
	return after[0] as NonNullable<(typeof after)[number]>
}

async function views(payload: Payload, profileId: number, day: string, count: number) {
	await payload.db.pool.query(
		'INSERT INTO profile_views (profile_id, day, count, updated_at, created_at) VALUES ($1, $2, $3, now(), now())',
		[profileId, day, count]
	)
}

describe('les plus consultées : la lecture du compteur', () => {
	test('somme sur 30 jours de Paris, plancher, profils publiés seulement, des adresses et rien d’autre', async () => {
		const payload = await testPayload()
		const now = new Date()
		// Days of the calendar, as the window counts them: a step of 24 hours shifts a day across a change of hour.
		const day = (back: number) => parisDayBefore(now, back)
		const popular = await artist(payload, 'published', 'Populaire')
		const regular = await artist(payload, 'published', 'Reguliere')
		const faint = await artist(payload, 'published', 'Discrete')
		const old = await artist(payload, 'published', 'Ancienne')
		const hidden = await artist(payload, 'hidden', 'Masquee')
		await views(payload, popular.id, day(0), 40)
		await views(payload, popular.id, day(29), 20)
		await views(payload, regular.id, day(5), MOST_VIEWED_MIN_VIEWS)
		await views(payload, faint.id, day(3), MOST_VIEWED_MIN_VIEWS - 1)
		await views(payload, old.id, day(30), 500)
		await views(payload, hidden.id, day(1), 900)

		const slugs = await readMostViewedSlugs(payload, now)
		expect(slugs).toEqual([popular.slug, regular.slug])
		for (const slug of slugs) expect(typeof slug).toBe('string')
	})

	test('sans aucune visite : une liste vide, que la page lit comme « pas de palmarès »', async () => {
		expect(await readMostViewedSlugs(await testPayload())).toEqual([])
	})
})
