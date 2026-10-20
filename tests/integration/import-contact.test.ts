import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { SQL } from 'bun'
import { ImportRefuse } from '../../scripts/migration/import/target'
import type { Rapport } from '../../scripts/migration/import/report'
import type { Profile } from '../../src/payload-types'
import { DATE_DE_BASCULE_DU_BANC } from '../outils/banc'
import { importerSurLeBanc } from '../outils/import'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'
import { viderLeStockage } from '../outils/s3'
import { creerLaSourceStrapi, effacerLaSourceStrapi, sourceDuBanc } from '../outils/source-strapi'
import { definitionDeLaSource } from '../outils/source-strapi/donnees'

/**
 * Ticket 064: the phone and the email of contact go into the closed group of the profile; a
 * profile that shows one today keeps showing it, with a consent dated from the switch (a parameter
 * of the run) and the source « publié par la maquilleuse » (docs/migration/SCHEMA.md §9, register
 * `coordonnees-consentement`). A profile without either is closed, without a date.
 *
 * The expected values are read here from the definition of the fake source, never by the code of
 * the import. One import for the file.
 */

const source = sourceDuBanc()
const { lignes } = definitionDeLaSource(source.medias)

/** The profiles the import takes: profile 29 is set aside by the table of decisions of the bench. */
const PRIS = lignes.makeup_artistes_user_links.map(lien => Number(lien.makeup_artiste_id)).filter(id => id !== 29)

/** What the old site shows of a profile, from its network row. */
function coordonneesDeLaSource(profil: number) {
	const lien = lignes.makeup_artistes_components.find(
		l => Number(l.entity_id) === profil && l.component_type === 'makeupartists.network'
	)
	const reseau = lignes.components_makeupartists_networks.find(r => Number(r.id) === Number(lien?.component_id))
	return { phone: reseau?.phone ?? null, email: reseau?.email ?? null }
}

const AFFICHENT = PRIS.filter(id => Object.values(coordonneesDeLaSource(id)).some(valeur => valeur !== null))
const SANS = PRIS.filter(id => !AFFICHENT.includes(id))

async function profilsDeLaCible(): Promise<Profile[]> {
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

/** As the owner of the bench, the only one who may write into the source. */
async function avecLeProprietaire<T>(travail: (sql: SQL) => Promise<T>): Promise<T> {
	const proprietaire = new SQL({ url: source.administration, max: 1 })
	try {
		return await travail(proprietaire)
	} finally {
		await proprietaire.close()
	}
}

let premier: Rapport

beforeAll(async () => {
	await viderLaBase()
	await viderLeStockage()
	await creerLaSourceStrapi()
	// Without the date of the switch, a source that shows contact details stops the run, dry or real.
	for (const mode of ['a-blanc', 'reel'] as const)
		await expect(importerSurLeBanc(mode, { consentiLe: undefined })).rejects.toBeInstanceOf(ImportRefuse)
	expect(await profilsDeLaCible()).toEqual([])
	premier = await importerSurLeBanc()
}, 60_000)

afterAll(async () => {
	await viderLaBase()
	await effacerLaSourceStrapi()
})

describe('Les coordonnées déjà publiées restent publiques, avec un consentement daté (ticket 064)', () => {
	test('la source a des profils qui en affichent et des profils qui n’en ont pas', () => {
		expect(AFFICHENT).toEqual([21, 23, 24])
		expect(SANS.length).toBeGreaterThan(5)
	})

	test('téléphone ou email à la source : contactPublic vrai, date du paramètre, source « import »', async () => {
		const cible = await profilsDeLaCible()

		for (const id of AFFICHENT) {
			const profil = cible.find(({ strapiId }) => strapiId === id)
			expect(profil?.contactDetails, String(id)).toMatchObject(coordonneesDeLaSource(id))
			expect(profil?.publicContact, String(id)).toBe(true)
			expect(profil?.consentedAt, String(id)).toBe(DATE_DE_BASCULE_DU_BANC)
			expect(profil?.consentSource, String(id)).toBe('import')
		}
		expect(premier.ecarts['coordonnees-consentement']).toBe(AFFICHENT.length)
	})

	test('sans coordonnée : contactPublic faux, sans date et sans source', async () => {
		const cible = await profilsDeLaCible()

		expect(cible.map(({ strapiId }) => strapiId)).toEqual(PRIS)
		for (const id of SANS) {
			const profil = cible.find(({ strapiId }) => strapiId === id)
			expect(profil?.publicContact, String(id)).toBe(false)
			expect(profil?.consentedAt ?? null, String(id)).toBeNull()
			expect(profil?.consentSource ?? null, String(id)).toBeNull()
			expect(profil?.contactDetails?.phone ?? null, String(id)).toBeNull()
			expect(profil?.contactDetails?.email ?? null, String(id)).toBeNull()
		}
		expect(premier.parite?.profiles).toMatchObject({ differents: [], manquants: [], refuses: [] })
	})

	test('lecture anonyme : jamais de coordonnées, de choix ni de trace du consentement', async () => {
		const secrets = AFFICHENT.flatMap(id => Object.values(coordonneesDeLaSource(id)))
			.filter(v => v !== null)
			.map(String)
		expect(secrets.length).toBeGreaterThan(2)
		const payload = await payloadDeTest()
		const anonyme = await payload.find({ collection: 'profiles', depth: 0, pagination: false, overrideAccess: false })
		// The public does not read `strapiId`: the profile is found by its slug.
		const slug21 = (await profilsDeLaCible()).find(({ strapiId }) => strapiId === 21)?.slug ?? ''
		expect(anonyme.docs.map(({ slug }) => slug)).toContain(slug21)

		const reponses = [
			await appelerRest('GET', '/api/profiles?depth=0&limit=100'),
			...(await Promise.all(anonyme.docs.map(({ id }) => appelerRest('GET', `/api/profiles/${id}?depth=0`)))),
		]
		const textes = [JSON.stringify(anonyme.docs), ...reponses.map(({ texte }) => texte)]
		for (const reponse of reponses) expect(reponse.statut).toBe(200)
		for (const texte of textes) {
			for (const secret of secrets) expect(texte).not.toContain(secret)
			for (const cle of ['contactDetails', 'publicContact', 'consentedAt', 'consentSource'])
				expect(texte).not.toContain(`"${cle}"`)
		}
	})
})

describe('Un second passage (ticket 064)', () => {
	test('0 mise à jour, et le consentement reste celui du premier passage', async () => {
		const avant = await profilsDeLaCible()

		const second = await importerSurLeBanc()

		expect(second.collections.profiles).toMatchObject({ crees: 0, modifies: 0, inchanges: PRIS.length, refuses: [] })
		expect(await profilsDeLaCible()).toEqual(avant)
	})
})

describe('Une source qui change après le premier passage (ticket 064)', () => {
	const RESEAU_21 = lignes.makeup_artistes_components.find(
		l => Number(l.entity_id) === 21 && l.component_type === 'makeupartists.network'
	)?.component_id

	afterAll(() =>
		avecLeProprietaire(sql =>
			sql.unsafe(
				`UPDATE components_makeupartists_networks SET phone = '${String(coordonneesDeLaSource(21).phone)}' WHERE id = ${Number(RESEAU_21)}`
			)
		)
	)

	test('un téléphone modifié est mis à jour, le consentement posé n’est ni effacé ni redaté', async () => {
		await avecLeProprietaire(sql =>
			sql.unsafe(
				`UPDATE components_makeupartists_networks SET phone = '06 39 98 99 99' WHERE id = ${Number(RESEAU_21)}`
			)
		)

		const rapport = await importerSurLeBanc()

		expect(rapport.collections.profiles).toMatchObject({ crees: 0, modifies: 1, refuses: [] })
		const zoe = (await profilsDeLaCible()).find(({ strapiId }) => strapiId === 21)
		expect(zoe?.contactDetails?.phone).toBe('06 39 98 99 99')
		expect(zoe).toMatchObject({
			publicContact: true,
			consentedAt: DATE_DE_BASCULE_DU_BANC,
			consentSource: 'import',
		})
	})

	test('un téléphone qui n’est que des espaces n’affiche rien : le profil se referme, sans date', async () => {
		// Profile 23 shows a phone only.
		const RESEAU_23 = lignes.makeup_artistes_components.find(
			l => Number(l.entity_id) === 23 && l.component_type === 'makeupartists.network'
		)?.component_id
		await avecLeProprietaire(sql =>
			sql.unsafe(`UPDATE components_makeupartists_networks SET phone = '   ' WHERE id = ${Number(RESEAU_23)}`)
		)

		const rapport = await importerSurLeBanc()

		expect(rapport.collections.profiles).toMatchObject({ crees: 0, modifies: 1, refuses: [] })
		const hugo = (await profilsDeLaCible()).find(({ strapiId }) => strapiId === 23)
		expect(hugo?.publicContact).toBe(false)
		expect(hugo?.consentedAt ?? null).toBeNull()
		expect(hugo?.consentSource ?? null).toBeNull()
		expect(hugo?.contactDetails?.phone ?? null).toBeNull()
	})
})

describe('Une coordonnée que le serveur refuserait ne fait pas perdre le profil (ticket 064)', () => {
	/** The network row of a profile of the fake source. */
	const reseauDe = (profil: number) =>
		Number(
			lignes.makeup_artistes_components.find(
				l => Number(l.entity_id) === profil && l.component_type === 'makeupartists.network'
			)?.component_id
		)

	const ecrire = (profil: number, colonne: 'phone' | 'email', valeur: string) =>
		avecLeProprietaire(sql =>
			sql.unsafe(`UPDATE components_makeupartists_networks SET ${colonne} = '${valeur}' WHERE id = ${reseauDe(profil)}`)
		)

	const profilCible = async (strapiId: number) => (await profilsDeLaCible()).find(p => p.strapiId === strapiId)

	test('les mots undefined et null, quelle que soit la casse, ne sont pas des coordonnées (comme à l’ancien site)', async () => {
		await ecrire(22, 'phone', 'undefined')
		await ecrire(22, 'email', ' NULL ')

		const rapport = await importerSurLeBanc()

		expect(rapport.collections.profiles?.refuses).toEqual([])
		const profil = await profilCible(22)
		expect(profil?.contactDetails?.phone ?? null).toBeNull()
		expect(profil?.contactDetails?.email ?? null).toBeNull()
		expect(profil?.publicContact).toBe(false)
		expect(profil?.consentedAt ?? null).toBeNull()
		expect(profil?.consentSource ?? null).toBeNull()
	})

	test('un email avec des espaces autour est repris sans eux, et le profil s’ouvre', async () => {
		await ecrire(30, 'email', '  emma@example.test ')

		const rapport = await importerSurLeBanc()

		expect(rapport.collections.profiles?.refuses).toEqual([])
		const profil = await profilCible(30)
		expect(profil?.contactDetails?.email).toBe('emma@example.test')
		expect(profil).toMatchObject({
			publicContact: true,
			consentedAt: DATE_DE_BASCULE_DU_BANC,
			consentSource: 'import',
		})
	})

	test('un email qui est un texte libre est laissé de côté et signalé, sans perdre le profil ni ses sections', async () => {
		await ecrire(33, 'email', 'Insta: @hugo')
		await ecrire(33, 'phone', '01 23 45 67 89 01 23 45 67 89 01')

		const rapport = await importerSurLeBanc()

		expect(rapport.collections.profiles?.refuses).toEqual([])
		expect(rapport.parite?.profiles).toMatchObject({ differents: [], manquants: [], refuses: [] })
		expect(rapport.collections.profiles?.coordonneesARevoir).toEqual([
			{ profil: 33, champ: 'telephone' },
			{ profil: 33, champ: 'email' },
		])
		// Never the value, in the report.
		expect(JSON.stringify(rapport)).not.toContain('Insta')
		const profil = await profilCible(33)
		expect(profil).toBeDefined()
		expect(profil?.contactDetails?.email ?? null).toBeNull()
		expect(profil?.contactDetails?.phone ?? null).toBeNull()
		expect(profil?.publicContact).toBe(false)
	})

	test('le décompte du registre ne compte que les profils écrits, et vaut le nombre de profils ouverts', async () => {
		const rapport = await importerSurLeBanc()

		const ouverts = (await profilsDeLaCible()).filter(({ publicContact }) => publicContact).length
		expect(rapport.ecarts['coordonnees-consentement']).toBe(ouverts)
	})
})
