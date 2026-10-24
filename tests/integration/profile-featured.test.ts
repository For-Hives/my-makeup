import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { DEMO_PROFILES } from '../../src/demo-data/profiles'
import { FEATURED_MAX } from '../../src/lib/profile/featured'
import { featuredCards } from '../../src/services/public/profile-block'
import { readDirectory } from '../../src/services/public/profiles'
import { setBenchDataset } from '../fixtures/bench-dataset'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'
import { emptyStorage } from '../support/s3'

/**
 * Issue 1066: « Mise en avant ». An admin ticks the box; each change leaves one line in the moderation journal
 * (numbers only, no reason); the home page selection holds only ticked profiles that are listed and publishable,
 * six at most.
 */

const resetToZero = () => Promise.all([emptyBase(), emptyStorage()])

beforeAll(async () => {
	await resetToZero()
	await setBenchDataset()
}, 60_000)

afterAll(resetToZero)

const slugOf = (key: string): string => DEMO_PROFILES.find(({ cle }) => cle === key)?.attendu.slug ?? ''

async function profileOf(key: string): Promise<number> {
	const slug = slugOf(key)
	const payload = await testPayload()
	const found = await payload.find({ collection: 'profiles', where: { slug: { equals: slug } }, depth: 0, limit: 1 })
	return found.docs[0]?.id ?? 0
}

const logLines = async (profile: number) =>
	(
		await (
			await testPayload()
		).find({
			collection: 'moderation-events',
			where: { profile: { equals: profile } },
			sort: 'date',
			depth: 0,
			limit: 20,
		})
	).docs

const selection = async () => featuredCards(await readDirectory(await testPayload()), FEATURED_MAX)

describe('La mise en avant d’un profil (issue 1066)', () => {
	test('aucun profil coché : la sélection est vide', async () => {
		expect(await selection()).toEqual([])
	}, 30_000)

	test('cocher puis décocher écrit une ligne chacun, sans motif ni donnée personnelle ; un autre enregistrement n’en écrit pas', async () => {
		const admin = await createAccount('admin')
		const headers = admin.session.enTetes
		const id = await profileOf('reference')

		const ticked = await callRest('PATCH', `/api/profiles/${id}`, { enTetes: headers, corps: { featured: true } })
		expect(ticked.statut).toBe(200)
		const again = await callRest('PATCH', `/api/profiles/${id}`, { enTetes: headers, corps: { featured: true } })
		expect(again.statut).toBe(200)
		await callRest('PATCH', `/api/profiles/${id}`, { enTetes: headers, corps: { specialty: 'Mariage' } })
		expect((await logLines(id)).map(line => line.action)).toEqual(['feature'])
		expect((await selection()).map(card => card.slug)).toEqual([slugOf('reference')])

		const unticked = await callRest('PATCH', `/api/profiles/${id}`, { enTetes: headers, corps: { featured: false } })
		expect(unticked.statut).toBe(200)
		const lines = await logLines(id)
		expect(lines.map(line => line.action)).toEqual(['feature', 'unfeature'])
		expect(lines[0]).toMatchObject({ profile: id, admin: admin.id, action: 'feature' })
		expect(lines[0]?.reason ?? null).toBeNull()
		expect(Object.keys(lines[0] ?? {}).sort()).toEqual(['action', 'admin', 'date', 'id', 'profile', 'reason'].sort())
		expect(await selection()).toEqual([])
	}, 60_000)

	test('un profil masqué ou non publiable n’y figure jamais, même coché', async () => {
		const payload = await testPayload()
		const keys = ['reference', 'masquee', 'actif-non-publiable', 'vide', 'sans-contact-public']
		for (const key of keys) {
			const id = await profileOf(key)
			await payload.update({ collection: 'profiles', id, data: { featured: true }, depth: 0, overrideAccess: true })
		}
		const shown = (await selection()).map(card => card.slug)
		expect(shown).toEqual([slugOf('reference')])
	}, 60_000)
})
