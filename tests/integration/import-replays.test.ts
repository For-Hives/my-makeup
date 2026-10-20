import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { exitCode, type Report } from '../../scripts/migration/import/report'
import { ImportRefuse } from '../../scripts/migration/import/target'
import { BENCH_CUTOVER_DATE } from '../support/bench'
import { BENCH_DECISION_FILE, importCommand, importOnBench } from '../support/import'
import { connect } from '../support/legacy-journeys'
import { emptyBase, testPayload } from '../support/payload-test'
import { emptyStorage } from '../support/s3'
import { COMPTES_DE_FIXTURE, createSourceStrapi, eraseSourceStrapi, sourceFingerprint } from '../support/source-strapi'

/**
 * Ticket 227: a run of the import does not undo what the v3 wrote. The date of consent a profile
 * already holds is kept by a run with another date of the switch; a target a makeup artist has signed
 * in to is refused before any write, unless the run says `--target-in-service`, and then the accounts
 * it holds are left as they are (docs/migration/IMPORT.md, « Jusqu'à la bascule seulement »).
 *
 * One import for the file; the tests follow one another on the same target.
 */

const LOCAL = COMPTES_DE_FIXTURE.find(({ provider }) => provider === 'local') ?? COMPTES_DE_FIXTURE[0]
const OTHER_DATE = '2026-12-01T08:00:00.000Z'

async function accounts() {
	const payload = await testPayload()
	const { docs } = await payload.find({
		collection: 'pros',
		depth: 0,
		pagination: false,
		overrideAccess: true,
		showHiddenFields: true,
		sort: 'strapiId',
	})
	return docs
}

async function profiles() {
	const payload = await testPayload()
	const { docs } = await payload.find({
		collection: 'profiles',
		depth: 0,
		pagination: false,
		overrideAccess: true,
		sort: 'strapiId',
	})
	return docs
}

const fixtureAccount = async () => {
	const account = (await accounts()).find(({ strapiId }) => strapiId === LOCAL?.strapiId)
	if (!account) throw new Error('Le compte local de fixture manque.')
	return account
}

let first: Report
let sourceBefore: string

beforeAll(async () => {
	await emptyBase()
	// Before the source: emptying the bucket would take its objects away.
	await emptyStorage()
	await createSourceStrapi()
	sourceBefore = (await sourceFingerprint()).empreinte
	first = await importOnBench()
}, 60_000)

afterAll(async () => {
	await emptyBase()
	await eraseSourceStrapi()
})

describe('Un second passage avec une autre date de bascule garde la date de consentement posée (ticket 227)', () => {
	test('les profils qui affichent leurs coordonnées gardent la première date ; le rapport les compte', async () => {
		const before = await profiles()
		const show = before.filter(({ publicContact }) => publicContact === true)
		expect(show.length).toBeGreaterThan(0)
		for (const profile of show) expect(profile.consentedAt).toBe(BENCH_CUTOVER_DATE)

		const second = await importOnBench('real', { consentDate: OTHER_DATE })

		expect(second.collections.profiles).toMatchObject({ created: 0, updated: 0, refused: [] })
		expect(second.collections.profiles?.keptConsents).toEqual(
			show.map(({ strapiId }) => Number(strapiId)).sort((a, b) => a - b)
		)
		// Not an unexplained difference: the parity is complete and the exit code is 0.
		expect(second.parity?.profiles).toMatchObject({ different: [], missing: [], extra: [] })
		expect(exitCode(second)).toBe(0)
		expect(await profiles()).toEqual(before)
		for (const profile of await profiles())
			if (profile.publicContact === true) expect(profile.consentedAt).toBe(BENCH_CUTOVER_DATE)
		// The same date again: nothing to count.
		expect((await importOnBench()).collections.profiles?.keptConsents).toEqual([])
	}, 60_000)
})

describe('Un import contre une v3 en service est refusé avant toute écriture (ticket 227)', () => {
	test('avant toute connexion, un second passage écrit 0 document et n’est pas refusé', async () => {
		const second = await importOnBench()

		expect(second.collections.pros).toMatchObject({ created: 0, updated: 0, refused: [] })
		expect(first.collections.pros?.created).toBeGreaterThan(0)
	})

	test('une connexion réussie dans la v3 efface le hash, et le passage suivant est refusé, à blanc comme en réel', async () => {
		expect((await fixtureAccount()).legacyBcrypt).toBeTruthy()
		expect(await connect(LOCAL?.email ?? '', LOCAL?.motDePasse ?? '')).toMatchObject({ ok: true })
		expect((await fixtureAccount()).legacyBcrypt ?? null).toBeNull()
		const payload = await testPayload()
		expect(
			(
				await payload.count({
					collection: 'auth-events',
					where: { code: { in: ['ok', 'heritee'] } },
					overrideAccess: true,
				})
			).totalDocs
		).toBeGreaterThan(0)
		const beforeAccounts = await accounts()
		const beforeProfiles = await profiles()

		for (const mode of ['dry-run', 'real'] as const) {
			const refusal = await importOnBench(mode).catch((erreur: unknown) => erreur)
			expect(refusal).toBeInstanceOf(ImportRefuse)
			const message = (refusal as ImportRefuse).message
			expect(message).toContain('déjà utilisée par la v3')
			expect(message).toContain('Rien n’est écrit')
			expect(message).toContain('--target-in-service')
			expect(message).not.toMatch(/\$2[aby]\$|@/)
		}

		// Nothing moved: not an account, not a profile, not the source.
		expect(await accounts()).toEqual(beforeAccounts)
		expect(await profiles()).toEqual(beforeProfiles)
		expect((await sourceFingerprint()).empreinte).toBe(sourceBefore)
		// The command itself says it and exits with 1.
		const command = await importCommand(['--real', '--decisions', BENCH_DECISION_FILE])
		expect(command.code).toBe(1)
		expect(command.sortie).toContain('--target-in-service')
	}, 90_000)

	test('avec --target-in-service, il passe sans réécrire le hash effacé ni l’email changé dans la v3', async () => {
		const payload = await testPayload()
		const account = await fixtureAccount()
		// Written below Payload's hooks, as a change of email made in the v3 would be stored.
		await payload.db.updateOne({
			collection: 'pros',
			id: account.id,
			data: { email: 'nouvelle.adresse.fictive@example.test' },
		})
		const before = await fixtureAccount()
		expect(before.legacyBcrypt ?? null).toBeNull()
		expect(before.email).toBe('nouvelle.adresse.fictive@example.test')

		const report = await importOnBench('real', { targetInService: true })

		expect(report.collections.pros).toMatchObject({ created: 0, updated: 0, refused: [] })
		expect(exitCode(report)).toBe(0)
		const after = await fixtureAccount()
		expect(after.legacyBcrypt ?? null).toBeNull()
		expect(after.email).toBe('nouvelle.adresse.fictive@example.test')
		// A profile of the source is still compared and kept equal.
		expect(report.collections.profiles).toMatchObject({ created: 0, updated: 0, refused: [] })
		expect(report.parity?.pros).toMatchObject({ different: [], missing: [], extra: [] })
		const command = await importCommand(['--real', '--target-in-service', '--decisions', BENCH_DECISION_FILE])
		expect(command.code).toBe(0)
	}, 90_000)

	test('un hash hérité déjà effacé suffit à refuser, même sans trace au journal', async () => {
		const payload = await testPayload()
		await payload.delete({ collection: 'auth-events', where: { id: { exists: true } }, overrideAccess: true })
		expect((await payload.count({ collection: 'auth-events', overrideAccess: true })).totalDocs).toBe(0)

		const refusal = await importOnBench('dry-run').catch((erreur: unknown) => erreur)

		expect(refusal).toBeInstanceOf(ImportRefuse)
		expect((refusal as ImportRefuse).message).toContain('dont le hash hérité a déjà été effacé')
		expect((refusal as ImportRefuse).message).toContain(String(LOCAL?.strapiId))
	})
	test('la date de dernière connexion survit au journal (purgé à 90 jours) : seule, elle suffit à refuser', async () => {
		const payload = await testPayload()
		const account = await fixtureAccount()
		// The legacy hash is back and the journal is empty: only the date of last sign-in is left.
		await payload.db.updateOne({ collection: 'pros', id: account.id, data: { legacyBcrypt: 'hash-herite-fictif' } })
		expect((await payload.count({ collection: 'auth-events', overrideAccess: true })).totalDocs).toBe(0)
		expect((await fixtureAccount()).lastSignInAt).toBeTruthy()

		const refusal = await importOnBench('dry-run').catch((erreur: unknown) => erreur)

		expect(refusal).toBeInstanceOf(ImportRefuse)
		const message = (refusal as ImportRefuse).message
		expect(message).toContain('1 compte avec une date de dernière connexion')
		expect(message).not.toContain('journal d’authentification')
		expect(message).not.toContain('hash hérité')
	})
})
