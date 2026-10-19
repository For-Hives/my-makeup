import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { ImportRefuse } from '../../scripts/migration/import/cible'
import { codeDeSortie, type Rapport } from '../../scripts/migration/import/rapport'
import { DATE_DE_BASCULE_DU_BANC } from '../outils/banc'
import { commandeDImport, FICHIER_DES_DECISIONS_DU_BANC, importerSurLeBanc } from '../outils/import'
import { seConnecter } from '../outils/parcours-herites'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { viderLeStockage } from '../outils/s3'
import {
	COMPTES_DE_FIXTURE,
	creerLaSourceStrapi,
	effacerLaSourceStrapi,
	empreinteDeLaSource,
} from '../outils/source-strapi'

/**
 * Ticket 227: a run of the import does not undo what the v3 wrote. The date of consent a profile
 * already holds is kept by a run with another date of the switch; a target a makeup artist has signed
 * in to is refused before any write, unless the run says `--cible-en-service`, and then the accounts
 * it holds are left as they are (docs/migration/IMPORT.md, « Jusqu'à la bascule seulement »).
 *
 * One import for the file; the tests follow one another on the same target.
 */

const LOCAL = COMPTES_DE_FIXTURE.find(({ provider }) => provider === 'local') ?? COMPTES_DE_FIXTURE[0]
const AUTRE_DATE = '2026-12-01T08:00:00.000Z'

async function comptes() {
	const payload = await payloadDeTest()
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

async function profils() {
	const payload = await payloadDeTest()
	const { docs } = await payload.find({
		collection: 'profiles',
		depth: 0,
		pagination: false,
		overrideAccess: true,
		sort: 'strapiId',
	})
	return docs
}

const compteDeFixture = async () => {
	const compte = (await comptes()).find(({ strapiId }) => strapiId === LOCAL?.strapiId)
	if (!compte) throw new Error('Le compte local de fixture manque.')
	return compte
}

let premier: Rapport
let sourceAvant: string

beforeAll(async () => {
	await viderLaBase()
	// Before the source: emptying the bucket would take its objects away.
	await viderLeStockage()
	await creerLaSourceStrapi()
	sourceAvant = (await empreinteDeLaSource()).empreinte
	premier = await importerSurLeBanc()
}, 60_000)

afterAll(async () => {
	await viderLaBase()
	await effacerLaSourceStrapi()
})

describe('Un second passage avec une autre date de bascule garde la date de consentement posée (ticket 227)', () => {
	test('les profils qui affichent leurs coordonnées gardent la première date ; le rapport les compte', async () => {
		const avant = await profils()
		const affichent = avant.filter(({ publicContact }) => publicContact === true)
		expect(affichent.length).toBeGreaterThan(0)
		for (const profil of affichent) expect(profil.consentedAt).toBe(DATE_DE_BASCULE_DU_BANC)

		const second = await importerSurLeBanc('reel', { consentiLe: AUTRE_DATE })

		expect(second.collections.profiles).toMatchObject({ crees: 0, modifies: 0, refuses: [] })
		expect(second.collections.profiles?.consentementsGardes).toEqual(
			affichent.map(({ strapiId }) => Number(strapiId)).sort((a, b) => a - b)
		)
		// Not an unexplained difference: the parity is complete and the exit code is 0.
		expect(second.parite?.profiles).toMatchObject({ differents: [], manquants: [], enTrop: [] })
		expect(codeDeSortie(second)).toBe(0)
		expect(await profils()).toEqual(avant)
		for (const profil of await profils())
			if (profil.publicContact === true) expect(profil.consentedAt).toBe(DATE_DE_BASCULE_DU_BANC)
		// The same date again: nothing to count.
		expect((await importerSurLeBanc()).collections.profiles?.consentementsGardes).toEqual([])
	}, 60_000)
})

describe('Un import contre une v3 en service est refusé avant toute écriture (ticket 227)', () => {
	test('avant toute connexion, un second passage écrit 0 document et n’est pas refusé', async () => {
		const second = await importerSurLeBanc()

		expect(second.collections.pros).toMatchObject({ crees: 0, modifies: 0, refuses: [] })
		expect(premier.collections.pros?.crees).toBeGreaterThan(0)
	})

	test('une connexion réussie dans la v3 efface le hash, et le passage suivant est refusé, à blanc comme en réel', async () => {
		expect((await compteDeFixture()).legacyBcrypt).toBeTruthy()
		expect(await seConnecter(LOCAL?.email ?? '', LOCAL?.motDePasse ?? '')).toMatchObject({ ok: true })
		expect((await compteDeFixture()).legacyBcrypt ?? null).toBeNull()
		const payload = await payloadDeTest()
		expect(
			(
				await payload.count({
					collection: 'auth-events',
					where: { code: { in: ['ok', 'heritee'] } },
					overrideAccess: true,
				})
			).totalDocs
		).toBeGreaterThan(0)
		const avantComptes = await comptes()
		const avantProfils = await profils()

		for (const mode of ['a-blanc', 'reel'] as const) {
			const refus = await importerSurLeBanc(mode).catch((erreur: unknown) => erreur)
			expect(refus).toBeInstanceOf(ImportRefuse)
			const message = (refus as ImportRefuse).message
			expect(message).toContain('déjà utilisée par la v3')
			expect(message).toContain('Rien n’est écrit')
			expect(message).toContain('--cible-en-service')
			expect(message).not.toMatch(/\$2[aby]\$|@/)
		}

		// Nothing moved: not an account, not a profile, not the source.
		expect(await comptes()).toEqual(avantComptes)
		expect(await profils()).toEqual(avantProfils)
		expect((await empreinteDeLaSource()).empreinte).toBe(sourceAvant)
		// The command itself says it and exits with 1.
		const commande = await commandeDImport(['--reel', '--decisions', FICHIER_DES_DECISIONS_DU_BANC])
		expect(commande.code).toBe(1)
		expect(commande.sortie).toContain('--cible-en-service')
	}, 90_000)

	test('avec --cible-en-service, il passe sans réécrire le hash effacé ni l’email changé dans la v3', async () => {
		const payload = await payloadDeTest()
		const compte = await compteDeFixture()
		// Written below Payload's hooks, as a change of email made in the v3 would be stored.
		await payload.db.updateOne({
			collection: 'pros',
			id: compte.id,
			data: { email: 'nouvelle.adresse.fictive@example.test' },
		})
		const avant = await compteDeFixture()
		expect(avant.legacyBcrypt ?? null).toBeNull()
		expect(avant.email).toBe('nouvelle.adresse.fictive@example.test')

		const rapport = await importerSurLeBanc('reel', { cibleEnService: true })

		expect(rapport.collections.pros).toMatchObject({ crees: 0, modifies: 0, refuses: [] })
		expect(codeDeSortie(rapport)).toBe(0)
		const apres = await compteDeFixture()
		expect(apres.legacyBcrypt ?? null).toBeNull()
		expect(apres.email).toBe('nouvelle.adresse.fictive@example.test')
		// A profile of the source is still compared and kept equal.
		expect(rapport.collections.profiles).toMatchObject({ crees: 0, modifies: 0, refuses: [] })
		expect(rapport.parite?.pros).toMatchObject({ differents: [], manquants: [], enTrop: [] })
		const commande = await commandeDImport([
			'--reel',
			'--cible-en-service',
			'--decisions',
			FICHIER_DES_DECISIONS_DU_BANC,
		])
		expect(commande.code).toBe(0)
	}, 90_000)

	test('un hash hérité déjà effacé suffit à refuser, même sans trace au journal', async () => {
		const payload = await payloadDeTest()
		await payload.delete({ collection: 'auth-events', where: { id: { exists: true } }, overrideAccess: true })
		expect((await payload.count({ collection: 'auth-events', overrideAccess: true })).totalDocs).toBe(0)

		const refus = await importerSurLeBanc('a-blanc').catch((erreur: unknown) => erreur)

		expect(refus).toBeInstanceOf(ImportRefuse)
		expect((refus as ImportRefuse).message).toContain('dont le hash hérité a déjà été effacé')
		expect((refus as ImportRefuse).message).toContain(String(LOCAL?.strapiId))
	})
	test('la date de dernière connexion survit au journal (purgé à 90 jours) : seule, elle suffit à refuser', async () => {
		const payload = await payloadDeTest()
		const compte = await compteDeFixture()
		// The legacy hash is back and the journal is empty: only the date of last sign-in is left.
		await payload.db.updateOne({ collection: 'pros', id: compte.id, data: { legacyBcrypt: 'hash-herite-fictif' } })
		expect((await payload.count({ collection: 'auth-events', overrideAccess: true })).totalDocs).toBe(0)
		expect((await compteDeFixture()).lastSignInAt).toBeTruthy()

		const refus = await importerSurLeBanc('a-blanc').catch((erreur: unknown) => erreur)

		expect(refus).toBeInstanceOf(ImportRefuse)
		const message = (refus as ImportRefuse).message
		expect(message).toContain('1 compte avec une date de dernière connexion')
		expect(message).not.toContain('journal d’authentification')
		expect(message).not.toContain('hash hérité')
	})
})
