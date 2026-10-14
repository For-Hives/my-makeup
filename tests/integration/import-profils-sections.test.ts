import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { SQL } from 'bun'
import type { Rapport } from '../../scripts/migration/import/rapport'
import type { Profil } from '../../src/payload-types'
import { importerSurLeBanc } from '../outils/import'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { viderLeStockage } from '../outils/s3'
import { creerLaSourceStrapi, effacerLaSourceStrapi, sourceDuBanc } from '../outils/source-strapi'
import { definitionDeLaSource, type Ligne } from '../outils/source-strapi/donnees'

/**
 * Ticket 060: the import takes the sections of each profile, in their order, with their photos:
 * skills, languages, courses, experiences, offers with their options, networks, main picture and
 * gallery (docs/migration/SCHEMA.md §5.2 and §6; plan 02 §7.3, I40). The price typed is kept as it
 * is; its amount is ticket 062, the contact details ticket 064.
 *
 * The expected rows are read here from the definition of the fake source itself, by its link
 * tables, never by the code of the import. One import for the whole file.
 */

const source = sourceDuBanc()
const { lignes } = definitionDeLaSource(source.medias)

/** The profiles the import takes: profile 29 is set aside by the table of decisions of the bench, the 13 of the spam have no account. */
const PRIS = lignes.makeup_artistes_user_links.map(lien => Number(lien.makeup_artiste_id)).filter(id => id !== 29)

/** The rows of a component table, by identifier. */
const parId = (table: readonly Ligne[]) => new Map(table.map(ligne => [Number(ligne.id), ligne]))

/** The rows a link table gives an entry for one field, in the order of the old site: `order`, then the link. */
function lignesDe(
	liens: readonly Ligne[],
	composants: readonly Ligne[],
	entree: number,
	type: string,
	champ: string
): Ligne[] {
	const rangees = parId(composants)
	return liens
		.filter(l => Number(l.entity_id) === entree && l.component_type === type && l.field === champ)
		.sort((a, b) => Number(a.order) - Number(b.order) || Number(a.id) - Number(b.id))
		.flatMap(l => {
			const ligne = rangees.get(Number(l.component_id))
			return ligne ? [ligne] : []
		})
}

const deProfil = (id: number, table: readonly Ligne[], type: string, champ: string) =>
	lignesDe(lignes.makeup_artistes_components, table, id, type, champ)

/** A day of the old site, as the collection stores it. */
const jour = (date: unknown) => (date === null ? null : `${String(date)}T12:00:00.000Z`)

/** What each list of a profile must hold, row by row, without the identifiers Payload gives. */
function listesAttendues(id: number) {
	return {
		competences: deProfil(id, lignes.components_makeupartists_skills, 'makeupartists.skills', 'skills').map(c => ({
			nom: c.name,
			description: c.description,
		})),
		langues: deProfil(id, lignes.components_makeupartists_languages, 'makeupartists.language', 'language').map(c => ({
			nom: c.name,
		})),
		formations: deProfil(id, lignes.components_makeupartists_courses, 'makeupartists.courses', 'courses').map(c => ({
			diplome: c.diploma,
			ecole: c.school,
			obtenuLe: jour(c.date_graduation),
			description: c.course_description,
		})),
		experiences: deProfil(
			id,
			lignes.components_makeupartists_experiences,
			'makeupartists.experiences',
			'experiences'
		).map(c => ({
			entreprise: c.company,
			poste: c.job_name,
			ville: c.city,
			debut: jour(c.date_start),
			fin: jour(c.date_end),
			description: c.description,
		})),
		prestations: deProfil(
			id,
			lignes.components_makeupartists_service_offers,
			'makeupartists.service-offers',
			'service_offers'
		).map(offre => ({
			nom: offre.name,
			description: offre.description,
			prixTexte: offre.price,
			prixAPartirDe: null,
			options: lignesDe(
				lignes.components_makeupartists_service_offers_components,
				lignes.components_service_offers_options,
				Number(offre.id),
				'service-offers.options',
				'options'
			).map(option => ({
				nom: option.name,
				description: option.description,
				prixTexte: option.price,
				prixAPartirDe: null,
			})),
		})),
	}
}

/** A list read back, without the identifiers of its rows. */
const sansIdentifiants = (valeur: unknown): unknown =>
	Array.isArray(valeur)
		? valeur.map(sansIdentifiants)
		: typeof valeur === 'object' && valeur !== null
			? Object.fromEntries(
					Object.entries(valeur)
						.filter(([cle]) => cle !== 'id')
						.map(([cle, sous]) => [cle, sansIdentifiants(sous)])
				)
			: valeur

/** The identifiers Payload gave the rows of every list of every profile, options included. */
const identifiantsDesLignes = (profils: Profil[]): string[] =>
	profils.flatMap(profil =>
		[
			...(profil.competences ?? []),
			...(profil.langues ?? []),
			...(profil.formations ?? []),
			...(profil.experiences ?? []),
			...(profil.prestations ?? []).flatMap(offre => [offre, ...(offre.options ?? [])]),
		].map(ligne => `${profil.strapiId}:${ligne.id}`)
	)

async function profilsDeLaCible(): Promise<Profil[]> {
	const payload = await payloadDeTest()
	const { docs } = await payload.find({
		collection: 'profils',
		depth: 0,
		pagination: false,
		overrideAccess: true,
		sort: 'strapiId',
	})
	return docs
}

/** The media of each file adopted, by the identifier of the file. */
async function mediasParFichier(): Promise<Map<number, number>> {
	const payload = await payloadDeTest()
	const { docs } = await payload.find({ collection: 'media', depth: 0, pagination: false, overrideAccess: true })
	return new Map(docs.map(({ id, strapiId }) => [Number(strapiId), id]))
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
	// Before the source: emptying the bucket would take its objects away.
	await viderLeStockage()
	await creerLaSourceStrapi()
	premier = await importerSurLeBanc()
}, 60_000)

afterAll(async () => {
	await viderLaBase()
	await effacerLaSourceStrapi()
})

describe('Les sections de chaque profil sont reprises dans leur ordre (ticket 060)', () => {
	test('même nombre de lignes par section, même ordre, options comprises (I40)', async () => {
		const cible = await profilsDeLaCible()

		expect(cible.map(({ strapiId }) => strapiId)).toEqual(PRIS)
		for (const profil of cible) {
			const attendues = listesAttendues(Number(profil.strapiId))
			expect(
				sansIdentifiants({
					competences: profil.competences,
					langues: profil.langues,
					formations: profil.formations,
					experiences: profil.experiences,
					prestations: profil.prestations,
				}),
				String(profil.strapiId)
			).toEqual(attendues)
		}
		expect(premier.parite?.profils).toMatchObject({ attendus: 13, egaux: 13, differents: [], manquants: [] })
		expect(premier.collections.profils).toMatchObject({ refuses: [], liensSansLigne: [] })
	})

	test('l’ordre est celui de la table de liens, jamais celui des identifiants ; une ligne en double reste en double', async () => {
		const zoe = (await profilsDeLaCible()).find(({ strapiId }) => strapiId === 21)

		// The links of these skills are written backwards: their `order` says 1, 2, 3.
		expect(zoe?.competences?.map(({ nom }) => nom)).toEqual(['Maquillage mariée', 'Coiffure', 'Maquillage mariée'])
		expect(zoe?.prestations?.[0]?.options?.map(({ nom }) => nom)).toEqual([
			'Retouche en journée',
			'Maquillage d’une demoiselle d’honneur',
		])
		expect(zoe?.experiences?.map(({ debut, fin }) => [debut, fin])).toEqual([
			['2019-09-01T12:00:00.000Z', '2022-06-30T12:00:00.000Z'],
			['2022-09-01T12:00:00.000Z', null],
		])
		// A row no link names belongs to no profile: skill 6, language 4, offer 11.
		const cible = await profilsDeLaCible()
		const noms = (liste: (p: Profil) => { nom?: string | null }[] | null | undefined) =>
			cible.flatMap(profil => (liste(profil) ?? []).map(({ nom }) => nom))
		expect(noms(p => p.competences)).not.toContain('Maquillage invitée')
		expect(noms(p => p.langues)).not.toContain('Italien')
		expect(noms(p => p.prestations)).not.toContain('Maquillage soirée')
	})

	test('le texte de prix est la saisie, à l’octet près ; le montant attend le ticket 062', async () => {
		const prixDeLaSource = [
			...lignes.components_makeupartists_service_offers.filter(({ id }) => Number(id) !== 11),
			...lignes.components_service_offers_options,
		].map(({ price }) => price)
		const prixDeLaCible = (await profilsDeLaCible())
			.flatMap(({ prestations }) => prestations ?? [])
			.flatMap(offre => [offre, ...(offre.options ?? [])])

		expect(prixDeLaCible.map(({ prixTexte }) => prixTexte).sort()).toEqual(
			[...prixDeLaSource].sort() as (string | null)[]
		)
		for (const { prixTexte } of prixDeLaCible)
			if (typeof prixTexte === 'string') expect(prixDeLaSource.some(prix => prix === prixTexte)).toBe(true)
		const encode = (texte: unknown) => [...new TextEncoder().encode(String(texte))]
		const kaci = (await profilsDeLaCible()).find(({ strapiId }) => strapiId === 25)
		// A null price stays null, an empty one stays empty (rule 2).
		expect(kaci?.prestations?.map(({ prixTexte }) => prixTexte)).toEqual([null, ''])
		const zoe = (await profilsDeLaCible()).find(({ strapiId }) => strapiId === 21)
		expect(encode(zoe?.prestations?.[0]?.prixTexte)).toEqual(encode('à partir de 120 €'))
		expect(prixDeLaCible.every(({ prixAPartirDe }) => prixAPartirDe === null)).toBe(true)
	})

	test('les réseaux sont les liens de l’ancien site ; téléphone et email attendent le ticket 064', async () => {
		for (const profil of await profilsDeLaCible()) {
			const [reseau] = deProfil(
				Number(profil.strapiId),
				lignes.components_makeupartists_networks,
				'makeupartists.network',
				'network'
			)
			expect(profil.reseaux as unknown, String(profil.strapiId)).toEqual({
				youtube: reseau?.youtube ?? null,
				facebook: reseau?.facebook ?? null,
				instagram: reseau?.instagram ?? null,
				siteWeb: reseau?.website ?? null,
				linkedin: reseau?.linkedin ?? null,
			})
			expect(profil.coordonnees ?? {}, String(profil.strapiId)).toEqual({ telephone: null, email: null })
		}
	})
})

describe('Les photos de chaque profil (ticket 060)', () => {
	test('la photo principale et la galerie, dans l’ordre, sont les médias adoptés de ses fichiers', async () => {
		const medias = await mediasParFichier()
		const parProfil = Object.fromEntries(
			(await profilsDeLaCible()).map(({ strapiId, photoPrincipale, galerie }) => [
				strapiId,
				{ principale: photoPrincipale ?? null, galerie: galerie ?? [] },
			])
		)

		// The links of the gallery of 21 are written out of order: `order` says 102, 103, 104.
		expect(parProfil[21]).toEqual({
			principale: medias.get(101) ?? -1,
			galerie: [medias.get(102), medias.get(103), medias.get(104)],
		})
		expect(parProfil[22]).toEqual({ principale: medias.get(105) ?? -1, galerie: [medias.get(106)] })
		// The object of 107 is missing from the storage: adopted all the same, a « 404 connu ».
		expect(parProfil[23]).toEqual({ principale: medias.get(107) ?? -1, galerie: [] })
		expect(parProfil[25]).toEqual({ principale: null, galerie: [medias.get(109)] })
	})

	test('une photo dont le média n’est pas adopté est signalée, pas inventée', async () => {
		const camille = (await profilsDeLaCible()).find(({ strapiId }) => strapiId === 24)

		// 108 is a PDF: not adopted, so the gallery of 24 is empty in the v3.
		expect(camille?.galerie ?? []).toEqual([])
		expect(premier.collections.profils?.photosNonReprises).toEqual([{ entree: 24, fichier: 108 }])
		expect(premier.collections.profils?.statutsDifferentsDeLaSource).toEqual([])
	})
})

describe('Un second passage (ticket 060)', () => {
	test('0 mise à jour, et chaque ligne de liste garde son identifiant', async () => {
		const avant = await profilsDeLaCible()
		const identifiants = identifiantsDesLignes(avant)

		const second = await importerSurLeBanc()

		expect(second.collections.profils).toMatchObject({ crees: 0, modifies: 0, inchanges: 13, refuses: [] })
		expect(identifiantsDesLignes(await profilsDeLaCible())).toEqual(identifiants)
		expect(identifiants.length).toBeGreaterThan(10)
		expect(await profilsDeLaCible()).toEqual(avant)
	})
})

describe('Un lien de liste qui ne nomme aucune ligne (SCHEMA.md §7)', () => {
	const LIEN = 900

	beforeAll(() =>
		avecLeProprietaire(sql =>
			sql.unsafe(
				`INSERT INTO makeup_artistes_components (id, entity_id, component_id, component_type, field, "order")
				VALUES (${LIEN}, 22, 999, 'makeupartists.skills', 'skills', 2)`
			)
		)
	)

	afterAll(() => avecLeProprietaire(sql => sql.unsafe(`DELETE FROM makeup_artistes_components WHERE id = ${LIEN}`)))

	test('il est signalé par son profil, et rien n’est inventé à sa place', async () => {
		const avant = await profilsDeLaCible()

		const rapport = await importerSurLeBanc()

		expect(rapport.collections.profils).toMatchObject({ crees: 0, modifies: 0, liensSansLigne: [22] })
		expect(await profilsDeLaCible()).toEqual(avant)
	})
})
