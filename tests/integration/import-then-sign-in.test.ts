import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { clearDocuments } from '@/lib/auth/google/oidc'
import { importOnBench } from '../support/import'
import { CHOICE, connect, connectByGoogle, pickPassword, requestLink } from '../support/legacy-journeys'
import { emptySink } from '../support/mailpit'
import { emptyBase, testPayload } from '../support/payload-test'
import { emptyStorage } from '../support/s3'
import { COMPTES_DE_FIXTURE, createSourceStrapi, eraseSourceStrapi, sourceFingerprint } from '../support/source-strapi'

/**
 * Ticket 095 (plan 01 §2.4 M2-M3; plan 02 I43): the rehearsal of what the makeup artists will live.
 * The fake Strapi source of the bench is imported, then three fictional accounts sign in, each by
 * its own way: the usual password (the old hash is replaced), Google (the fake provider), and the
 * forgotten password (an old Facebook account). The source is the same at the end.
 *
 * It runs the whole import and several password checks, and it is part of the whole suite (ticket 225): it
 * empties the database and the mail catcher before and after, like the other import tests, and creates and
 * erases the source it needs. Alone: `bun run test:integration tests/integration/import-then-sign-in.test.ts`.
 */

function failure(): never {
	throw new Error('Le compte local de fixture manque.')
}

/** Account 1 (local, with a hash and a known password), 4 (Google, no password), 5 (Facebook, no password). */
const LOCAL = COMPTES_DE_FIXTURE.find(({ provider }) => provider === 'local') ?? failure()
const GOOGLE = { strapiId: 4, email: 'camille.bernard@example.test' }
const FACEBOOK = { strapiId: 5, email: 'sarah.k@example.test' }

/** The accounts of the target that still hold a hash of the old site, by `strapiId`: read in the database, no value kept. */
async function accountsWithLegacyHash(): Promise<number[]> {
	const payload = await testPayload()
	const lines = await payload.db.find<{ id: number; strapiId?: number | null; legacyBcrypt?: string | null }>({
		collection: 'pros',
		pagination: false,
		where: {},
	})
	return lines.docs
		.filter(({ legacyBcrypt }) => typeof legacyBcrypt === 'string' && legacyBcrypt !== '')
		.map(({ strapiId }) => Number(strapiId))
		.sort((a, b) => a - b)
}

async function accountByStrapiId(strapiId: number) {
	const payload = await testPayload()
	const { docs } = await payload.find({
		collection: 'pros',
		depth: 0,
		limit: 2,
		overrideAccess: true,
		where: { strapiId: { equals: strapiId } },
	})
	if (docs.length !== 1) throw new Error(`Le compte ${strapiId} devrait être là une seule fois.`)
	return docs[0] as NonNullable<(typeof docs)[number]>
}

async function profilesOf(id: number | string) {
	const payload = await testPayload()
	return (
		await payload.find({ collection: 'profiles', depth: 0, overrideAccess: true, where: { pro: { equals: id } } })
	).docs.map(({ id: profil, slug }) => ({ id: profil, slug }))
}

describe('095 : après l’import, trois comptes de fixture se connectent par leur parcours', () => {
	beforeAll(async () => {
		clearDocuments()
		await Promise.all([emptyBase(), emptySink()])
		// Before the source: emptying the bucket would take its objects away.
		await emptyStorage()
		await createSourceStrapi()
	})
	afterAll(async () => {
		await Promise.all([emptyBase(), emptySink()])
		await eraseSourceStrapi()
	})

	test('les trois parcours, le compte des hash hérités baisse de 1 exactement, la source est inchangée (I43)', async () => {
		const source = (await sourceFingerprint()).empreinte
		await importOnBench()
		const before = await accountsWithLegacyHash()
		expect(before).toContain(LOCAL.strapiId)
		expect(before).not.toContain(GOOGLE.strapiId)
		expect(before).not.toContain(FACEBOOK.strapiId)
		const profileGoogle = await profilesOf((await accountByStrapiId(GOOGLE.strapiId)).id)
		const profileFacebook = await profilesOf((await accountByStrapiId(FACEBOOK.strapiId)).id)
		expect(profileGoogle).toHaveLength(1)
		expect(profileFacebook).toHaveLength(1)

		// 1. The usual password of the old site: it opens the account, and the hash is replaced.
		expect(await connect(LOCAL.email, LOCAL.motDePasse)).toMatchObject({ ok: true })
		expect(await accountsWithLegacyHash()).toEqual(before.filter(strapiId => strapiId !== LOCAL.strapiId))
		// The second sign-in is Payload's own, and the old hash does not come back.
		expect(await connect(LOCAL.email, LOCAL.motDePasse)).toMatchObject({ ok: true })

		// 2. Google, by the fake provider: the same account, no second one, the same profile.
		const byGoogle = await connectByGoogle(GOOGLE.email)
		expect(byGoogle).toMatchObject({ ok: true, nouveau: false })
		expect(await profilesOf((await accountByStrapiId(GOOGLE.strapiId)).id)).toEqual(profileGoogle)

		// 3. Facebook is gone: she is turned away, then the forgotten password gives her one.
		expect(await connect(FACEBOOK.email, CHOICE)).toEqual({ ok: false, code: 'identifiants-invalides' })
		expect(await pickPassword(await requestLink(FACEBOOK.email))).toEqual({ ok: true })
		expect(await connect(FACEBOOK.email, CHOICE)).toMatchObject({ ok: true })
		expect(await profilesOf((await accountByStrapiId(FACEBOOK.strapiId)).id)).toEqual(profileFacebook)

		// The three paths together took exactly one old hash away.
		const after = await accountsWithLegacyHash()
		expect(after).toHaveLength(before.length - 1)
		const payload = await testPayload()
		expect((await payload.count({ collection: 'pros' })).totalDocs).toBe(14)
		// I43: the source is the one the import found.
		expect((await sourceFingerprint()).empreinte).toBe(source)
	}, 90_000)
})
