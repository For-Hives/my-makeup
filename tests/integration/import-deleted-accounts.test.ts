import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { exitCode } from '../../scripts/migration/import/report'
import { ImportRefuse } from '../../scripts/migration/import/target'
import { deleteAccountAndDependents } from '../../src/lib/account/deletion'
import { importOnBench } from '../support/import'
import { connect } from '../support/legacy-journeys'
import { emptyBase, testPayload } from '../support/payload-test'
import { emptyStorage } from '../support/s3'
import { COMPTES_DE_FIXTURE, createSourceStrapi, eraseSourceStrapi } from '../support/source-strapi'

/**
 * Ticket 227: a rerun never brings back an account its owner deleted in the v3, nor its profile with
 * the phone and the email it showed. The deletion leaves its identifier on the old site in
 * `deleted-accounts`, which the journal purge (90 days) does not touch; the import reads it. On a target
 * in service (`--target-in-service`) the profiles the target holds are left as they are, too.
 */

const LOCAL = COMPTES_DE_FIXTURE.find(({ provider }) => provider === 'local') ?? COMPTES_DE_FIXTURE[0]

let deletedProfile: number | null = null

async function accounts() {
	const payload = await testPayload()
	return (
		await payload.find({ collection: 'pros', depth: 0, pagination: false, overrideAccess: true, sort: 'strapiId' })
	).docs
}

async function profiles() {
	const payload = await testPayload()
	return (
		await payload.find({ collection: 'profiles', depth: 0, pagination: false, overrideAccess: true, sort: 'strapiId' })
	).docs
}

beforeAll(async () => {
	await emptyBase()
	await emptyStorage()
	await createSourceStrapi()
	await importOnBench()
}, 60_000)

afterAll(async () => {
	await emptyBase()
	await eraseSourceStrapi()
})

describe('Sur une cible en service, un profil déjà repris reste tel que la maquilleuse l’a laissé (ticket 227)', () => {
	test('coordonnées fermées dans la v3 : un passage avec l’option n’y touche pas', async () => {
		const payload = await testPayload()
		const account = (await accounts()).find(({ strapiId }) => strapiId === LOCAL?.strapiId)
		const open = (await profiles()).filter(({ publicContact }) => publicContact === true)
		const profile = open.find(({ pro }) => pro !== account?.id) ?? open[0]
		if (!profile) throw new Error('Aucun profil de fixture n’affiche ses coordonnées.')
		await payload.update({
			collection: 'profiles',
			id: profile.id,
			data: { publicContact: false },
			overrideAccess: true,
		})
		const before = await profiles()
		expect(before.find(({ id }) => id === profile.id)?.publicContact).toBe(false)

		const report = await importOnBench('real', { targetInService: true })

		expect(report.collections.profiles).toMatchObject({ created: 0, updated: 0, refused: [] })
		expect(exitCode(report)).toBe(0)
		const after = await profiles()
		expect(after).toEqual(before)
		expect(after.find(({ id }) => id === profile.id)).toMatchObject({ publicContact: false })
		// Without the option the run, which follows the source, would open them again.
		const withoutOption = await importOnBench('dry-run')
		expect(withoutOption.collections.profiles?.updated).toBeGreaterThan(0)
	}, 90_000)
})

describe('Un compte supprimé dans la v3 ne revient pas à un rejeu (ticket 227)', () => {
	test('la suppression laisse l’identifiant de l’ancien site, rien d’autre', async () => {
		const payload = await testPayload()
		const account = (await accounts()).find(({ strapiId }) => strapiId === LOCAL?.strapiId)
		if (!account) throw new Error('Le compte local de fixture manque.')
		expect(await connect(LOCAL?.email ?? '', LOCAL?.motDePasse ?? '')).toMatchObject({ ok: true })

		deletedProfile = (await profiles()).find(({ pro }) => pro === account.id)?.strapiId ?? null
		expect(deletedProfile).not.toBeNull()
		const summary = await deleteAccountAndDependents(payload, account.id)

		expect(summary).toMatchObject({ supprime: true, profils: 1 })
		const { docs } = await payload.find({ collection: 'deleted-accounts', overrideAccess: true, depth: 0 })
		expect(docs.map(({ strapiId }) => strapiId)).toEqual([Number(LOCAL?.strapiId)])
		expect(Object.keys(docs[0] ?? {}).sort()).toEqual(['date', 'id', 'strapiId'])
		// A second call finds nothing: no second row.
		await deleteAccountAndDependents(payload, account.id)
		expect((await payload.count({ collection: 'deleted-accounts', overrideAccess: true })).totalDocs).toBe(1)
	}, 60_000)

	test('journal purgé (90 jours) et date de dernière connexion partie avec le compte : le rejeu est quand même refusé', async () => {
		const payload = await testPayload()
		await payload.delete({ collection: 'auth-events', where: { id: { exists: true } }, overrideAccess: true })
		expect((await payload.count({ collection: 'auth-events', overrideAccess: true })).totalDocs).toBe(0)
		expect((await payload.count({ collection: 'pros', where: { lastSignInAt: { exists: true } } })).totalDocs).toBe(0)
		const beforeAccounts = await accounts()
		const beforeProfiles = await profiles()

		for (const mode of ['dry-run', 'real'] as const) {
			const refusal = await importOnBench(mode).catch((erreur: unknown) => erreur)
			expect(refusal).toBeInstanceOf(ImportRefuse)
			const message = (refusal as ImportRefuse).message
			expect(message).toContain('1 compte de l’ancien site supprimé dans la v3')
			expect(message).toContain(String(LOCAL?.strapiId))
			expect(message).not.toMatch(/\$2[aby]\$|@/)
		}

		expect(await accounts()).toEqual(beforeAccounts)
		expect(await profiles()).toEqual(beforeProfiles)
		expect(beforeAccounts.some(({ strapiId }) => strapiId === LOCAL?.strapiId)).toBe(false)
	}, 60_000)

	test('avec --target-in-service, ni le compte ni son profil ne sont recréés ; le rapport le dit, le code de sortie est 0', async () => {
		const report = await importOnBench('real', { targetInService: true })

		expect(report.collections.pros).toMatchObject({
			created: 0,
			updated: 0,
			refused: [],
			deletedInV3: [LOCAL?.strapiId],
		})
		expect(report.collections.profiles).toMatchObject({ created: 0, updated: 0, refused: [] })
		expect(report.parity?.pros).toMatchObject({ different: [], missing: [], extra: [] })
		expect(report.parity?.profiles).toMatchObject({ different: [], missing: [], extra: [] })
		expect(exitCode(report)).toBe(0)
		expect((await accounts()).some(({ strapiId }) => strapiId === LOCAL?.strapiId)).toBe(false)
		expect((await profiles()).some(({ strapiId }) => strapiId === deletedProfile)).toBe(false)
	}, 60_000)
})
