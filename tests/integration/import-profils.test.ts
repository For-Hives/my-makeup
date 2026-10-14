import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { attribuerSlugs } from '../../src/lib/slug'
import { CHAMPS_PUBLICS_DU_PROFIL, lireLeProfilPublic } from '../../src/services/public/profils'
import { commandeDImport, importerSurLeBanc } from '../outils/import'
import { compterLesMails, viderLeCapteur } from '../outils/mailpit'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { creerLaSourceStrapi, effacerLaSourceStrapi, empreinteDeLaSource, sourceDuBanc } from '../outils/source-strapi'
import { definitionDeLaSource } from '../outils/source-strapi/donnees'

/**
 * Ticket 026, the first slice: the import takes the identity of the profiles that have an account
 * (link, slug, names, speciality, description) and publishes those that are not entirely empty;
 * the public reading gives a published profile by its slug, and nothing private. The page itself
 * is proven once, end to end (tests/e2e/tranche-profil-importe.spec.ts).
 *
 * One import for the whole file: each test reads what it left.
 */

const { lignes } = definitionDeLaSource(sourceDuBanc().medias)

/** The profiles of the source, with the account they are linked to. */
const LIENS = new Map(
	lignes.makeup_artistes_user_links.map(lien => [Number(lien.makeup_artiste_id), Number(lien.user_id)])
)

/** The accounts the table of decisions of the bench sets aside: profile 29 belongs to account 11. */
const COMPTES_ECARTES = [10, 11, 12]

/** The profiles the slice takes: linked to an account it takes. */
const PRIS = lignes.makeup_artistes.filter(profil => {
	const compte = LIENS.get(Number(profil.id))
	return compte !== undefined && !COMPTES_ECARTES.includes(compte)
})

/** The slugs of the old site, computed on every profile of the source. */
const SLUGS = new Map(
	attribuerSlugs(
		lignes.makeup_artistes.map(({ id, username, created_at }) => ({
			id: Number(id),
			username: String(username),
			createdAt: `${String(created_at).replace(' ', 'T')}Z`,
		}))
	).map(({ id, slug }) => [Number(id), slug])
)

let empreinteAvant = ''
let premier: Awaited<ReturnType<typeof importerSurLeBanc>>

beforeAll(async () => {
	await viderLaBase()
	await viderLeCapteur()
	await creerLaSourceStrapi()
	empreinteAvant = (await empreinteDeLaSource()).empreinte
	premier = await importerSurLeBanc()
})

afterAll(async () => {
	await viderLaBase()
	await effacerLaSourceStrapi()
})

async function profilsDeLaCible() {
	const payload = await payloadDeTest()
	const { docs } = await payload.find({
		collection: 'profils',
		depth: 1,
		pagination: false,
		overrideAccess: true,
		sort: 'strapiId',
	})
	return docs
}

describe('Après l’import de la source factice', () => {
	test('chaque profil qui a un compte repris est repris, relié à ce compte, un pour un (I41)', async () => {
		const cible = await profilsDeLaCible()

		expect(cible.map(({ strapiId }) => strapiId)).toEqual(PRIS.map(({ id }) => Number(id)))
		for (const profil of cible) {
			const compte = typeof profil.pro === 'object' ? profil.pro : null
			expect(compte?.strapiId, String(profil.strapiId)).toBe(LIENS.get(Number(profil.strapiId)) ?? -1)
		}
		expect(new Set(cible.map(({ pro }) => (typeof pro === 'object' ? pro.id : pro))).size).toBe(cible.length)
		// Profile 29, whose account the table sets aside, is set aside by its own decision; the 13
		// profiles of the spam have no account at all (ticket 059).
		expect(premier.collections.profils).toMatchObject({
			source: 27,
			crees: 13,
			refuses: [],
			ecartes: [29],
			sansCompte: [67, 74, 76, 77, 78, 79, 87, 88, 94, 95, 96, 104, 108],
		})
		expect(premier.decisionsSansObjet).toBe(0)
		expect(await compterLesMails()).toBe(0)
	})

	test('le slug est celui de la règle portée de l’ancien site ; les noms, la spécialité et la description tels quels', async () => {
		for (const profil of await profilsDeLaCible()) {
			const ligne = PRIS.find(({ id }) => Number(id) === profil.strapiId)
			expect(profil, String(profil.strapiId)).toMatchObject({
				slug: SLUGS.get(Number(profil.strapiId)),
				prenom: ligne?.first_name ?? null,
				nom: ligne?.last_name ?? null,
				nomArtiste: ligne?.company_artist_name ?? null,
				specialite: ligne?.speciality ?? null,
				description: ligne?.description ?? null,
			})
		}
		expect((await profilsDeLaCible()).find(({ strapiId }) => strapiId === 21)?.slug).toBe('zoe-lefevre')
	})

	test('règle provisoire : le profil entièrement vide est un brouillon, les autres sont publiés', async () => {
		const statuts = Object.fromEntries((await profilsDeLaCible()).map(({ strapiId, statut }) => [strapiId, statut]))

		expect(statuts[27]).toBe('brouillon')
		expect(Object.entries(statuts).filter(([, statut]) => statut === 'publie')).toHaveLength(12)
		expect(premier.ecarts).toMatchObject({ 'profils-vides-brouillon': 1, 'slug-stocke': 12 })
		expect(premier.parite?.profils).toMatchObject({ attendus: 13, egaux: 13, statuts: { publie: 12, brouillon: 1 } })
	})

	test('second passage : 0 création, 0 mise à jour, et la source n’a pas bougé', async () => {
		const cible = await profilsDeLaCible()

		const second = await importerSurLeBanc()

		for (const collection of ['pros', 'profils', 'talents'] as const)
			expect(second.collections[collection], collection).toMatchObject({ crees: 0, modifies: 0, refuses: [] })
		expect(await profilsDeLaCible()).toEqual(cible)
		expect((await empreinteDeLaSource()).empreinte).toBe(empreinteAvant)
	})
})

describe('Un profil dont la table de décision écarte le compte (SCHEMA.md §11)', () => {
	test('sans décision pour ce profil, la commande s’arrête avant toute écriture et le nomme par identifiant', async () => {
		const cible = await profilsDeLaCible()
		const dossier = mkdtempSync(path.join(tmpdir(), 'decisions-import-'))
		try {
			// The accounts that share one email are decided, profile 29 of account 11 is not.
			const fichier = path.join(dossier, 'decisions.json')
			writeFileSync(fichier, JSON.stringify({ emailsPartages: [{ comptes: [9, 10, 11, 12], retenu: 9 }] }))

			const { code, sortie } = await commandeDImport(['--reel', '--decisions', fichier])

			expect(code, sortie).toBe(3)
			expect(sortie).toContain('Import arrêté avant toute écriture')
			expect(sortie).toContain('Profils, par identifiant : 29.')
			expect(await profilsDeLaCible()).toEqual(cible)
		} finally {
			rmSync(dossier, { recursive: true, force: true })
		}
	}, 60_000)
})

describe('La lecture publique d’un profil repris', () => {
	test('par son slug, le profil publié donne son nom, sa spécialité et sa description, rien d’autre', async () => {
		const payload = await payloadDeTest()

		const profil = await lireLeProfilPublic(payload, 'zoe-lefevre')

		expect(profil).toEqual({
			slug: 'zoe-lefevre',
			nom: 'Zoé Lefèvre',
			specialite: 'Mariage',
			description: String(PRIS.find(({ id }) => id === 21)?.description),
		})
		// Profile 21 publishes a phone and an email on the old site: neither leaves this reading.
		const texte = JSON.stringify(profil)
		expect(texte).not.toContain('06 39 98')
		expect(texte).not.toContain('@example.test')
	})

	test('un brouillon, un slug inconnu, une ancienne forme du nom ne donnent rien', async () => {
		const payload = await payloadDeTest()

		for (const slug of ['manon-petit', 'audit-inexistant-zz9', 'Zoe-Lefevre', 'zoé lefèvre', ''])
			expect(await lireLeProfilPublic(payload, slug), slug).toBeNull()
	})

	test('les champs lus sont choisis un par un, et ce sont les seuls que le public lit', async () => {
		const payload = await payloadDeTest()

		expect(Object.keys(CHAMPS_PUBLICS_DU_PROFIL).sort()).toEqual([
			'description',
			'nom',
			'nomArtiste',
			'prenom',
			'slug',
			'specialite',
		])
		const { docs } = await payload.find({
			collection: 'profils',
			where: { slug: { equals: 'zoe-lefevre' } },
			select: CHAMPS_PUBLICS_DU_PROFIL,
			depth: 0,
			overrideAccess: false,
		})
		expect(Object.keys(docs[0] ?? {}).sort()).toEqual([
			'description',
			'id',
			'nom',
			'nomArtiste',
			'prenom',
			'slug',
			'specialite',
		])
	})
})
