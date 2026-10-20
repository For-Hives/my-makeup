import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { exitCode } from '../../scripts/migration/import/report'
import { ImportRefuse } from '../../scripts/migration/import/target'
import { deleteAccountAndDependents } from '../../src/lib/account/deletion'
import { importerSurLeBanc } from '../outils/import'
import { seConnecter } from '../outils/parcours-herites'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { viderLeStockage } from '../outils/s3'
import { COMPTES_DE_FIXTURE, creerLaSourceStrapi, effacerLaSourceStrapi } from '../outils/source-strapi'

/**
 * Ticket 227: a rerun never brings back an account its owner deleted in the v3, nor its profile with
 * the phone and the email it showed. The deletion leaves its identifier on the old site in
 * `deleted-accounts`, which the journal purge (90 days) does not touch; the import reads it. On a target
 * in service (`--target-in-service`) the profiles the target holds are left as they are, too.
 */

const LOCAL = COMPTES_DE_FIXTURE.find(({ provider }) => provider === 'local') ?? COMPTES_DE_FIXTURE[0]

let profilSupprime: number | null = null

async function comptes() {
	const payload = await payloadDeTest()
	return (
		await payload.find({ collection: 'pros', depth: 0, pagination: false, overrideAccess: true, sort: 'strapiId' })
	).docs
}

async function profils() {
	const payload = await payloadDeTest()
	return (
		await payload.find({ collection: 'profiles', depth: 0, pagination: false, overrideAccess: true, sort: 'strapiId' })
	).docs
}

beforeAll(async () => {
	await viderLaBase()
	await viderLeStockage()
	await creerLaSourceStrapi()
	await importerSurLeBanc()
}, 60_000)

afterAll(async () => {
	await viderLaBase()
	await effacerLaSourceStrapi()
})

describe('Sur une cible en service, un profil déjà repris reste tel que la maquilleuse l’a laissé (ticket 227)', () => {
	test('coordonnées fermées dans la v3 : un passage avec l’option n’y touche pas', async () => {
		const payload = await payloadDeTest()
		const compte = (await comptes()).find(({ strapiId }) => strapiId === LOCAL?.strapiId)
		const ouverts = (await profils()).filter(({ publicContact }) => publicContact === true)
		const profil = ouverts.find(({ pro }) => pro !== compte?.id) ?? ouverts[0]
		if (!profil) throw new Error('Aucun profil de fixture n’affiche ses coordonnées.')
		await payload.update({
			collection: 'profiles',
			id: profil.id,
			data: { publicContact: false },
			overrideAccess: true,
		})
		const avant = await profils()
		expect(avant.find(({ id }) => id === profil.id)?.publicContact).toBe(false)

		const rapport = await importerSurLeBanc('real', { targetInService: true })

		expect(rapport.collections.profiles).toMatchObject({ created: 0, updated: 0, refused: [] })
		expect(exitCode(rapport)).toBe(0)
		const apres = await profils()
		expect(apres).toEqual(avant)
		expect(apres.find(({ id }) => id === profil.id)).toMatchObject({ publicContact: false })
		// Without the option the run, which follows the source, would open them again.
		const sansOption = await importerSurLeBanc('dry-run')
		expect(sansOption.collections.profiles?.updated).toBeGreaterThan(0)
	}, 90_000)
})

describe('Un compte supprimé dans la v3 ne revient pas à un rejeu (ticket 227)', () => {
	test('la suppression laisse l’identifiant de l’ancien site, rien d’autre', async () => {
		const payload = await payloadDeTest()
		const compte = (await comptes()).find(({ strapiId }) => strapiId === LOCAL?.strapiId)
		if (!compte) throw new Error('Le compte local de fixture manque.')
		expect(await seConnecter(LOCAL?.email ?? '', LOCAL?.motDePasse ?? '')).toMatchObject({ ok: true })

		profilSupprime = (await profils()).find(({ pro }) => pro === compte.id)?.strapiId ?? null
		expect(profilSupprime).not.toBeNull()
		const bilan = await deleteAccountAndDependents(payload, compte.id)

		expect(bilan).toMatchObject({ supprime: true, profils: 1 })
		const { docs } = await payload.find({ collection: 'deleted-accounts', overrideAccess: true, depth: 0 })
		expect(docs.map(({ strapiId }) => strapiId)).toEqual([Number(LOCAL?.strapiId)])
		expect(Object.keys(docs[0] ?? {}).sort()).toEqual(['date', 'id', 'strapiId'])
		// A second call finds nothing: no second row.
		await deleteAccountAndDependents(payload, compte.id)
		expect((await payload.count({ collection: 'deleted-accounts', overrideAccess: true })).totalDocs).toBe(1)
	}, 60_000)

	test('journal purgé (90 jours) et date de dernière connexion partie avec le compte : le rejeu est quand même refusé', async () => {
		const payload = await payloadDeTest()
		await payload.delete({ collection: 'auth-events', where: { id: { exists: true } }, overrideAccess: true })
		expect((await payload.count({ collection: 'auth-events', overrideAccess: true })).totalDocs).toBe(0)
		expect((await payload.count({ collection: 'pros', where: { lastSignInAt: { exists: true } } })).totalDocs).toBe(0)
		const avantComptes = await comptes()
		const avantProfils = await profils()

		for (const mode of ['dry-run', 'real'] as const) {
			const refus = await importerSurLeBanc(mode).catch((erreur: unknown) => erreur)
			expect(refus).toBeInstanceOf(ImportRefuse)
			const message = (refus as ImportRefuse).message
			expect(message).toContain('1 compte de l’ancien site supprimé dans la v3')
			expect(message).toContain(String(LOCAL?.strapiId))
			expect(message).not.toMatch(/\$2[aby]\$|@/)
		}

		expect(await comptes()).toEqual(avantComptes)
		expect(await profils()).toEqual(avantProfils)
		expect(avantComptes.some(({ strapiId }) => strapiId === LOCAL?.strapiId)).toBe(false)
	}, 60_000)

	test('avec --target-in-service, ni le compte ni son profil ne sont recréés ; le rapport le dit, le code de sortie est 0', async () => {
		const rapport = await importerSurLeBanc('real', { targetInService: true })

		expect(rapport.collections.pros).toMatchObject({
			created: 0,
			updated: 0,
			refused: [],
			supprimesDansLaV3: [LOCAL?.strapiId],
		})
		expect(rapport.collections.profiles).toMatchObject({ created: 0, updated: 0, refused: [] })
		expect(rapport.parity?.pros).toMatchObject({ different: [], missing: [], extra: [] })
		expect(rapport.parity?.profiles).toMatchObject({ different: [], missing: [], extra: [] })
		expect(exitCode(rapport)).toBe(0)
		expect((await comptes()).some(({ strapiId }) => strapiId === LOCAL?.strapiId)).toBe(false)
		expect((await profils()).some(({ strapiId }) => strapiId === profilSupprime)).toBe(false)
	}, 60_000)
})
