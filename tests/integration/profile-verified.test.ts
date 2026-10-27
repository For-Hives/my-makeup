import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { DEMO_PROFILES } from '../../src/demo-data/profiles'
import { FEATURED_CANDIDATES_MAX } from '../../src/lib/profile/featured'
import { featuredCandidates } from '../../src/services/public/featured'
import { readDirectory } from '../../src/services/public/profiles'
import { setBenchDataset } from '../fixtures/bench-dataset'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'
import { emptyStorage } from '../support/s3'

/**
 * Issue 1066: « Mise en avant » draws among the profiles an admin ticked « Vérifiée ». Each change of the box
 * leaves one line in the moderation journal (numbers only, no reason); the candidates of the home page are the
 * verified profiles that are listed, publishable and reachable; the box stays out of every public read; the lines of
 * the old box (`feature`, `unfeature`) stay readable.
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

const selection = async () => featuredCandidates(await readDirectory(await testPayload()), FEATURED_CANDIDATES_MAX)
/** The slugs of the candidates, sorted: the order of the directory is the ranking's, not what these tests check. */
const slugs = async (): Promise<string[]> => (await selection()).map(card => card.slug).sort()
/** The bench dataset ships one profile already verified, with its badge (the demo profile `verifiee`). */
const alreadyVerified = (): string => slugOf('verifiee')

describe('La vérification d’un profil, réserve de la mise en avant (issue 1066)', () => {
	test('au départ, le seul candidat est le profil que le jeu fictif livre vérifié', async () => {
		expect(await slugs()).toEqual([alreadyVerified()])
	}, 30_000)

	test('cocher puis décocher « Vérifiée » écrit une ligne chacun, sans motif ni donnée personnelle ; un autre enregistrement n’en écrit pas', async () => {
		const admin = await createAccount('admin')
		const headers = admin.session.enTetes
		const id = await profileOf('reference')

		const ticked = await callRest('PATCH', `/api/profiles/${id}`, { enTetes: headers, corps: { verified: true } })
		expect(ticked.statut).toBe(200)
		const again = await callRest('PATCH', `/api/profiles/${id}`, { enTetes: headers, corps: { verified: true } })
		expect(again.statut).toBe(200)
		await callRest('PATCH', `/api/profiles/${id}`, { enTetes: headers, corps: { specialty: 'Mariage' } })
		expect((await logLines(id)).map(line => line.action)).toEqual(['verify'])
		expect(await slugs()).toEqual([alreadyVerified(), slugOf('reference')].sort())

		const unticked = await callRest('PATCH', `/api/profiles/${id}`, { enTetes: headers, corps: { verified: false } })
		expect(unticked.statut).toBe(200)
		const lines = await logLines(id)
		expect(lines.map(line => line.action)).toEqual(['verify', 'unverify'])
		expect(lines[0]).toMatchObject({ profile: id, admin: admin.id, action: 'verify' })
		expect(lines[0]?.reason ?? null).toBeNull()
		expect(Object.keys(lines[0] ?? {}).sort()).toEqual(['action', 'admin', 'date', 'id', 'profile', 'reason'].sort())
		expect(await slugs()).toEqual([alreadyVerified()])
	}, 60_000)

	test('un profil masqué, vide ou non publiable n’y figure jamais, même vérifié ; un profil publiable mais mince, si', async () => {
		const payload = await testPayload()
		const keys = ['reference', 'masquee', 'publiable-non-indexable', 'vide', 'sans-contact-public']
		for (const key of keys) {
			const id = await profileOf(key)
			await payload.update({ collection: 'profiles', id, data: { verified: true }, depth: 0, overrideAccess: true })
		}
		expect(await slugs()).toEqual([alreadyVerified(), slugOf('reference'), slugOf('publiable-non-indexable')].sort())
	}, 60_000)
})

describe('Ce que « Vérifiée » ne montre jamais (issue 1066)', () => {
	test('aucune lecture publique de la collection ne porte « Vérifiée » ni l’ancienne case', async () => {
		const id = await profileOf('verifiee')
		const payload = await testPayload()
		await payload.update({ collection: 'profiles', id, data: { verified: true }, depth: 0, overrideAccess: true })
		const slug = slugOf('verifiee')
		const list = await callRest('GET', `/api/profiles?where[slug][equals]=${slug}&depth=0`)
		expect(list.statut).toBe(200)
		const doc = (list.corps as { docs: Record<string, unknown>[] }).docs[0] ?? {}
		expect(doc.slug).toBe(slug)
		expect('verified' in doc).toBe(false)
		expect('featured' in doc).toBe(false)
		// The home page still finds her: it reads the box apart, with the rules open.
		expect((await selection()).map(card => card.slug)).toContain(slug)
		expect(JSON.stringify(await selection())).not.toContain('verified')
	}, 60_000)

	test('les lignes de l’ancienne case restent dans le journal, lisibles', async () => {
		const id = await profileOf('reference')
		const payload = await testPayload()
		for (const action of ['feature', 'unfeature'] as const)
			await payload.create({
				collection: 'moderation-events',
				data: { profile: id, action, date: new Date().toISOString() },
				depth: 0,
				overrideAccess: true,
			})
		const actions = (await logLines(id)).map(line => line.action)
		expect(actions).toEqual(expect.arrayContaining(['feature', 'unfeature']))
	}, 60_000)
})
