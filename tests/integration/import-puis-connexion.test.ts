import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { oublierLesDocuments } from '@/lib/auth/google/oidc'
import { importerSurLeBanc } from '../outils/import'
import { viderLeCapteur } from '../outils/mailpit'
import { CHOIX, choisirUnMotDePasse, connecterParGoogle, demanderLeLien, seConnecter } from '../outils/parcours-herites'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { viderLeStockage } from '../outils/s3'
import {
	COMPTES_DE_FIXTURE,
	creerLaSourceStrapi,
	effacerLaSourceStrapi,
	empreinteDeLaSource,
} from '../outils/source-strapi'

/**
 * Ticket 095 (plan 01 §2.4 M2-M3; plan 02 I43): the rehearsal of what the makeup artists will live.
 * The fake Strapi source of the bench is imported, then three fictional accounts sign in, each by
 * its own way: the usual password (the old hash is replaced), Google (the fake provider), and the
 * forgotten password (an old Facebook account). The source is the same at the end.
 *
 * It runs the whole import and several password checks, and it is part of the whole suite (ticket 225): it
 * empties the database and the mail catcher before and after, like the other import tests, and creates and
 * erases the source it needs. Alone: `bun run test:integration tests/integration/import-puis-connexion.test.ts`.
 */

function failure(): never {
	throw new Error('Le compte local de fixture manque.')
}

/** Account 1 (local, with a hash and a known password), 4 (Google, no password), 5 (Facebook, no password). */
const LOCAL = COMPTES_DE_FIXTURE.find(({ provider }) => provider === 'local') ?? failure()
const GOOGLE = { strapiId: 4, email: 'camille.bernard@example.test' }
const FACEBOOK = { strapiId: 5, email: 'sarah.k@example.test' }

/** The accounts of the target that still hold a hash of the old site, by `strapiId`: read in the database, no value kept. */
async function comptesAvecUnHashHerite(): Promise<number[]> {
	const payload = await payloadDeTest()
	const lignes = await payload.db.find<{ id: number; strapiId?: number | null; legacyBcrypt?: string | null }>({
		collection: 'pros',
		pagination: false,
		where: {},
	})
	return lignes.docs
		.filter(({ legacyBcrypt }) => typeof legacyBcrypt === 'string' && legacyBcrypt !== '')
		.map(({ strapiId }) => Number(strapiId))
		.sort((a, b) => a - b)
}

async function compteParStrapiId(strapiId: number) {
	const payload = await payloadDeTest()
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

async function profilsDe(id: number | string) {
	const payload = await payloadDeTest()
	return (
		await payload.find({ collection: 'profils', depth: 0, overrideAccess: true, where: { pro: { equals: id } } })
	).docs.map(({ id: profil, slug }) => ({ id: profil, slug }))
}

describe('095 : après l’import, trois comptes de fixture se connectent par leur parcours', () => {
	beforeAll(async () => {
		oublierLesDocuments()
		await Promise.all([viderLaBase(), viderLeCapteur()])
		// Before the source: emptying the bucket would take its objects away.
		await viderLeStockage()
		await creerLaSourceStrapi()
	})
	afterAll(async () => {
		await Promise.all([viderLaBase(), viderLeCapteur()])
		await effacerLaSourceStrapi()
	})

	test('les trois parcours, le compte des hash hérités baisse de 1 exactement, la source est inchangée (I43)', async () => {
		const source = (await empreinteDeLaSource()).empreinte
		await importerSurLeBanc()
		const avant = await comptesAvecUnHashHerite()
		expect(avant).toContain(LOCAL.strapiId)
		expect(avant).not.toContain(GOOGLE.strapiId)
		expect(avant).not.toContain(FACEBOOK.strapiId)
		const profilGoogle = await profilsDe((await compteParStrapiId(GOOGLE.strapiId)).id)
		const profilFacebook = await profilsDe((await compteParStrapiId(FACEBOOK.strapiId)).id)
		expect(profilGoogle).toHaveLength(1)
		expect(profilFacebook).toHaveLength(1)

		// 1. The usual password of the old site: it opens the account, and the hash is replaced.
		expect(await seConnecter(LOCAL.email, LOCAL.motDePasse)).toMatchObject({ ok: true })
		expect(await comptesAvecUnHashHerite()).toEqual(avant.filter(strapiId => strapiId !== LOCAL.strapiId))
		// The second sign-in is Payload's own, and the old hash does not come back.
		expect(await seConnecter(LOCAL.email, LOCAL.motDePasse)).toMatchObject({ ok: true })

		// 2. Google, by the fake provider: the same account, no second one, the same profile.
		const parGoogle = await connecterParGoogle(GOOGLE.email)
		expect(parGoogle).toMatchObject({ ok: true, nouveau: false })
		expect(await profilsDe((await compteParStrapiId(GOOGLE.strapiId)).id)).toEqual(profilGoogle)

		// 3. Facebook is gone: she is turned away, then the forgotten password gives her one.
		expect(await seConnecter(FACEBOOK.email, CHOIX)).toEqual({ ok: false, code: 'identifiants-invalides' })
		expect(await choisirUnMotDePasse(await demanderLeLien(FACEBOOK.email))).toEqual({ ok: true })
		expect(await seConnecter(FACEBOOK.email, CHOIX)).toMatchObject({ ok: true })
		expect(await profilsDe((await compteParStrapiId(FACEBOOK.strapiId)).id)).toEqual(profilFacebook)

		// The three paths together took exactly one old hash away.
		const apres = await comptesAvecUnHashHerite()
		expect(apres).toHaveLength(avant.length - 1)
		const payload = await payloadDeTest()
		expect((await payload.count({ collection: 'pros' })).totalDocs).toBe(14)
		// I43: the source is the one the import found.
		expect((await empreinteDeLaSource()).empreinte).toBe(source)
	}, 90_000)
})
