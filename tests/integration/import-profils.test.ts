import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SQL } from 'bun'
import { PROFILS_DU_SPAM } from '../../scripts/migration/import/profils'
import { CONTEXTE_IMPORT } from '../../src/lib/contexte-import'
import { attribuerSlugs } from '../../src/lib/slug'
import { CHAMPS_PUBLICS_DU_PROFIL, lireLeProfilPublic } from '../../src/services/public/profils'
import { commandeDImport, DECISIONS_DU_BANC, FICHIER_DES_DECISIONS_DU_BANC, importerSurLeBanc } from '../outils/import'
import { compterLesMails, viderLeCapteur } from '../outils/mailpit'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { creerLaSourceStrapi, effacerLaSourceStrapi, empreinteDeLaSource, sourceDuBanc } from '../outils/source-strapi'
import { definitionDeLaSource } from '../outils/source-strapi/donnees'

/**
 * Tickets 026 and 059: the import takes the identity of the profiles that have an account (link,
 * slug, username of the old site, names, speciality, description, availability, score, badge,
 * dates); the server computes their status; the 13 empty profiles of the spam are set aside, and
 * any other profile without an account stops the import. The public reading gives a published
 * profile by its slug, and nothing private. The page itself is proven once, end to end
 * (tests/e2e/tranche-profil-importe.spec.ts).
 *
 * One import for the whole file: each test reads what it left.
 */

const source = sourceDuBanc()
const { lignes } = definitionDeLaSource(source.medias)

/** As the owner of the bench, the only one who may write into the source. */
async function avecLeProprietaire<T>(travail: (sql: SQL) => Promise<T>): Promise<T> {
	const proprietaire = new SQL({ url: source.administration, max: 1 })
	try {
		return await travail(proprietaire)
	} finally {
		await proprietaire.close()
	}
}

const enIso = (horodatage: unknown): string => `${String(horodatage).replace(' ', 'T')}Z`

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
	// Emptying the base and creating the source take longer than the default 5 s on a loaded machine.
}, 60_000)

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
		// An account without a profile at the source stays without one: account 8 (I41).
		const { docs: comptes } = await (await payloadDeTest()).find({
			collection: 'pros',
			depth: 0,
			pagination: false,
			overrideAccess: true,
		})
		const relies = new Set(cible.map(({ pro }) => (typeof pro === 'object' ? pro.id : pro)))
		expect(comptes.filter(({ id }) => !relies.has(id)).map(({ strapiId }) => strapiId)).toEqual([8])
		// Profile 29, whose account the table sets aside, is set aside by its own decision; the 13
		// profiles of the spam have no account at all, and are set aside by the import itself.
		expect(premier.collections.profils).toMatchObject({
			source: 27,
			crees: 13,
			refuses: [],
			ecartes: [29],
			spam: [...PROFILS_DU_SPAM],
		})
		expect(premier.decisionsSansObjet).toBe(0)
		expect(await compterLesMails()).toBe(0)
	})

	test('profils de la source = profils repris + profils écartés ; les 13 du spam sont absents de la cible (I39)', async () => {
		const cible = await profilsDeLaCible()
		const bilan = premier.collections.profils

		expect(lignes.makeup_artistes).toHaveLength(27)
		expect((bilan?.ecartes?.length ?? 0) + (bilan?.spam?.length ?? 0) + cible.length).toBe(bilan?.source ?? -1)
		for (const id of PROFILS_DU_SPAM)
			expect(
				cible.some(({ strapiId }) => strapiId === id),
				String(id)
			).toBe(false)
		expect(premier.ecarts['profils-spam-non-repris']).toBe(13)
		expect(premier.parite?.profils).toMatchObject({
			attendus: 13,
			egaux: 13,
			differents: [],
			manquants: [],
			enTrop: [],
		})
	})

	test('le slug est celui de la règle portée de l’ancien site ; l’ancien nom d’utilisateur, les noms, la spécialité et la description tels quels', async () => {
		for (const profil of await profilsDeLaCible()) {
			const ligne = PRIS.find(({ id }) => Number(id) === profil.strapiId)
			expect(profil, String(profil.strapiId)).toMatchObject({
				slug: SLUGS.get(Number(profil.strapiId)),
				legacyUsername: ligne?.username ?? null,
				prenom: ligne?.first_name ?? null,
				nom: ligne?.last_name ?? null,
				nomArtiste: ligne?.company_artist_name ?? null,
				specialite: ligne?.speciality ?? null,
				description: ligne?.description ?? null,
			})
		}
		const zoe = (await profilsDeLaCible()).find(({ strapiId }) => strapiId === 21)
		expect([zoe?.slug, zoe?.legacyUsername]).toEqual(['zoe-lefevre', 'Zoé Lefèvre'])
	})

	test('le score, le badge et les dates tels quels ; une disponibilité nulle devient « disponible »', async () => {
		for (const profil of await profilsDeLaCible()) {
			const ligne = PRIS.find(({ id }) => Number(id) === profil.strapiId)
			expect(profil, String(profil.strapiId)).toMatchObject({
				score: ligne?.score ?? null,
				superMaquilleuse: ligne?.pro ?? null,
				disponible: ligne?.available ?? true,
				createdAt: enIso(ligne?.created_at),
				updatedAt: enIso(ligne?.updated_at),
			})
		}
		const parId = new Map((await profilsDeLaCible()).map(profil => [profil.strapiId, profil]))
		expect([parId.get(21)?.score, parId.get(25)?.score, parId.get(25)?.superMaquilleuse]).toEqual([12.5, 3, true])
		expect([parId.get(22)?.disponible, parId.get(24)?.disponible, parId.get(34)?.disponible]).toEqual([
			true,
			false,
			false,
		])
		// 2023-05-12 for its creation, 2026-09-28 for its last change, never the day of the import.
		expect(parId.get(21)?.updatedAt).toBe('2026-09-28T10:11:12.131Z')
		const nuls = PRIS.filter(({ available }) => available === null).length
		expect(premier.ecarts['disponibilite-par-defaut']).toBe(nuls)
	})

	test('le statut est calculé par le serveur : le profil entièrement vide en brouillon, les autres publiés, le choix laissé à la règle', async () => {
		const cible = await profilsDeLaCible()
		const statuts = Object.fromEntries(cible.map(({ strapiId, statut }) => [strapiId, statut]))

		expect(statuts[27]).toBe('brouillon')
		expect(cible.every(({ statutChoisi }) => statutChoisi === 'automatique')).toBe(true)
		// 32 has a city and nothing else: published by its commune (ticket 063), as at the source.
		expect(statuts[32]).toBe('publie')
		expect(premier.collections.profils?.statutsDifferentsDeLaSource).toEqual([])
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

describe('Un choix du statut fixé par un passage précédent', () => {
	test('l’import de la première tranche écrivait le statut : le choix revient à la règle, une seule fois', async () => {
		const payload = await payloadDeTest()
		const [zoe] = (await profilsDeLaCible()).filter(({ strapiId }) => strapiId === 21)
		// What the first slice left: a status written by server code becomes the admin's choice.
		await payload.update({
			collection: 'profils',
			id: zoe?.id ?? 0,
			data: { statut: 'brouillon' },
			overrideAccess: true,
			context: CONTEXTE_IMPORT,
		})
		expect((await profilsDeLaCible()).find(({ strapiId }) => strapiId === 21)).toMatchObject({
			statut: 'brouillon',
			statutChoisi: 'brouillon',
		})

		const apres = await importerSurLeBanc()
		const troisieme = await importerSurLeBanc()

		expect(apres.collections.profils).toMatchObject({ crees: 0, modifies: 1 })
		expect((await profilsDeLaCible()).find(({ strapiId }) => strapiId === 21)).toMatchObject({
			statut: 'publie',
			statutChoisi: 'automatique',
			updatedAt: '2026-09-28T10:11:12.131Z',
		})
		expect(troisieme.collections.profils).toMatchObject({ crees: 0, modifies: 0 })
	})
})

describe('Un profil sans compte, hors des 13 profils du spam (SCHEMA.md §4.1)', () => {
	const ORPHELIN = 200

	beforeAll(() =>
		avecLeProprietaire(sql =>
			sql.unsafe(
				`INSERT INTO makeup_artistes (id, username, available, pro, created_at, updated_at)
				VALUES (${ORPHELIN}, 'ProfilSansCompte', NULL, false, '2026-10-01 08:00:00', '2026-10-01 08:00:00')`
			)
		)
	)

	afterAll(() => avecLeProprietaire(sql => sql.unsafe(`DELETE FROM makeup_artistes WHERE id = ${ORPHELIN}`)))

	test('sans décision, la commande s’arrête avant toute écriture et le nomme par identifiant', async () => {
		const cible = await profilsDeLaCible()

		const { code, sortie } = await commandeDImport(['--reel', '--decisions', FICHIER_DES_DECISIONS_DU_BANC])

		expect(code, sortie).toBe(3)
		expect(sortie).toContain('Import arrêté avant toute écriture')
		expect(sortie).toContain(
			`Des profils n’ont aucun compte dans la source et ne sont pas parmi les 13 profils du spam (SCHEMA.md §4.1). Profils, par identifiant : ${ORPHELIN}.`
		)
		expect(await profilsDeLaCible()).toEqual(cible)
	}, 60_000)

	test('avec sa décision, il est écarté et compté, et rien d’autre ne change', async () => {
		const rapport = await importerSurLeBanc('reel', {
			decisions: { ...DECISIONS_DU_BANC, profilsEcartes: [...DECISIONS_DU_BANC.profilsEcartes, ORPHELIN] },
		})

		expect(rapport.arret).toBeNull()
		expect(rapport.collections.profils).toMatchObject({ source: 28, crees: 0, modifies: 0, ecartes: [29, ORPHELIN] })
		expect((await profilsDeLaCible()).some(({ strapiId }) => strapiId === ORPHELIN)).toBe(false)
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

		expect(profil).toMatchObject({
			slug: 'zoe-lefevre',
			nom: 'Zoé Lefèvre',
			specialite: 'Mariage',
			description: String(PRIS.find(({ id }) => id === 21)?.description),
		})
		// Profile 21 has a phone and an email on the old site: they leave this reading only when she
		// published them (ticket 071), and then they are exactly what the old site holds.
		const cible = (await profilsDeLaCible()).find(({ strapiId }) => strapiId === 21)
		const stocke = await payload.findByID({ collection: 'profils', id: cible?.id ?? 0, depth: 0 })
		if (stocke.contactPublic === true) {
			expect(profil?.coordonnees).toEqual({
				telephone: stocke.coordonnees?.telephone ?? null,
				email: stocke.coordonnees?.email ?? null,
			})
		} else {
			expect(profil?.coordonnees).toBeNull()
			const texte = JSON.stringify(profil)
			expect(texte).not.toContain('06 39 98')
			expect(texte).not.toContain('@example.test')
		}
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
