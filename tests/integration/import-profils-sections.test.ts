import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { SQL } from 'bun'
import type { Report } from '../../scripts/migration/import/report'
import { minimumPrice, parsePrice } from '../../src/lib/price'
import type { Profile } from '../../src/payload-types'
import { importOnBench } from '../support/import'
import { emptyBase, testPayload } from '../support/payload-test'
import { emptyStorage } from '../support/s3'
import { benchSource, createSourceStrapi, eraseSourceStrapi } from '../support/source-strapi'
import { type Line, sourceDefinition } from '../support/source-strapi/data'

/**
 * Ticket 060: the import takes the sections of each profile, in their order, with their photos:
 * skills, languages, courses, experiences, offers with their options, networks, main picture and
 * gallery (docs/migration/SCHEMA.md §5.2 and §6; plan 02 §7.3, I40). The price typed is kept as it
 * is; its amount is ticket 062. The contact details are ticket 064 (import-contact.test.ts).
 *
 * The expected rows are read here from the definition of the fake source itself, by its link
 * tables, never by the code of the import. One import for the whole file.
 */

const source = benchSource()
const { lignes } = sourceDefinition(source.medias)

/** The profiles the import takes: profile 29 is set aside by the table of decisions of the bench, the 13 of the spam have no account. */
const PRIS = lignes.makeup_artistes_user_links.map(lien => Number(lien.makeup_artiste_id)).filter(id => id !== 29)

/**
 * The rows of the fake source that sit outside a bound of the v3 (ticket 226): the import leaves
 * them out of their profile and lists them. Written here by identifier, never computed by the import.
 */
const HORS_BORNES = {
	experiences: [4],
	formations: [3],
	prestations: [12],
	options: [4],
} as const

const sauf = (ids: readonly number[]) => (ligne: Line) => !ids.includes(Number(ligne.id))

/** The rows of a component table, by identifier. */
const parId = (table: readonly Line[]) => new Map(table.map(ligne => [Number(ligne.id), ligne]))

/** The rows a link table gives an entry for one field, in the order of the old site: `order`, then the link. */
function lignesDe(
	liens: readonly Line[],
	composants: readonly Line[],
	entree: number,
	type: string,
	champ: string
): Line[] {
	const rangees = parId(composants)
	return liens
		.filter(l => Number(l.entity_id) === entree && l.component_type === type && l.field === champ)
		.sort((a, b) => Number(a.order) - Number(b.order) || Number(a.id) - Number(b.id))
		.flatMap(l => {
			const ligne = rangees.get(Number(l.component_id))
			return ligne ? [ligne] : []
		})
}

const deProfil = (id: number, table: readonly Line[], type: string, champ: string) =>
	lignesDe(lignes.makeup_artistes_components, table, id, type, champ)

/** A day of the old site, as the collection stores it. */
const jour = (date: unknown) => (date === null ? null : `${String(date)}T12:00:00.000Z`)

/** What each list of a profile must hold, row by row, without the identifiers Payload gives. */
function listesAttendues(id: number) {
	return {
		skills: deProfil(id, lignes.components_makeupartists_skills, 'makeupartists.skills', 'skills').map(c => ({
			name: c.name,
			description: c.description,
		})),
		languages: deProfil(id, lignes.components_makeupartists_languages, 'makeupartists.language', 'language').map(c => ({
			name: c.name,
		})),
		courses: deProfil(id, lignes.components_makeupartists_courses, 'makeupartists.courses', 'courses')
			.filter(sauf(HORS_BORNES.formations))
			.map(c => ({
				diploma: c.diploma,
				school: c.school,
				graduatedAt: jour(c.date_graduation),
				description: c.course_description,
			})),
		experiences: deProfil(id, lignes.components_makeupartists_experiences, 'makeupartists.experiences', 'experiences')
			.filter(sauf(HORS_BORNES.experiences))
			.map(c => ({
				company: c.company,
				jobTitle: c.job_name,
				city: c.city,
				startDate: jour(c.date_start),
				endDate: jour(c.date_end),
				description: c.description,
			})),
		serviceOffers: deProfil(
			id,
			lignes.components_makeupartists_service_offers,
			'makeupartists.service-offers',
			'service_offers'
		)
			.filter(sauf(HORS_BORNES.prestations))
			.map(offre => ({
				name: offre.name,
				description: offre.description,
				priceText: offre.price,
				priceFrom: parsePrice(offre.price).priceFrom,
				options: lignesDe(
					lignes.components_makeupartists_service_offers_components,
					lignes.components_service_offers_options,
					Number(offre.id),
					'service-offers.options',
					'options'
				)
					.filter(sauf(HORS_BORNES.options))
					.map(option => ({
						name: option.name,
						description: option.description,
						priceText: option.price,
						priceFrom: parsePrice(option.price).priceFrom,
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
const identifiantsDesLignes = (profils: Profile[]): string[] =>
	profils.flatMap(profil =>
		[
			...(profil.skills ?? []),
			...(profil.languages ?? []),
			...(profil.courses ?? []),
			...(profil.experiences ?? []),
			...(profil.serviceOffers ?? []).flatMap(offre => [offre, ...(offre.options ?? [])]),
		].map(ligne => `${profil.strapiId}:${ligne.id}`)
	)

async function profilsDeLaCible(): Promise<Profile[]> {
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

/** The media of each file adopted, by the identifier of the file. */
async function mediasParFichier(): Promise<Map<number, number>> {
	const payload = await testPayload()
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

let premier: Report

beforeAll(async () => {
	await emptyBase()
	// Before the source: emptying the bucket would take its objects away.
	await emptyStorage()
	await createSourceStrapi()
	premier = await importOnBench()
}, 60_000)

afterAll(async () => {
	await emptyBase()
	await eraseSourceStrapi()
})

describe('Les sections de chaque profil sont reprises dans leur ordre (ticket 060)', () => {
	test('même nombre de lignes par section, même ordre, options comprises (I40)', async () => {
		const cible = await profilsDeLaCible()

		expect(cible.map(({ strapiId }) => strapiId)).toEqual(PRIS)
		for (const profil of cible) {
			const attendues = listesAttendues(Number(profil.strapiId))
			expect(
				sansIdentifiants({
					skills: profil.skills,
					languages: profil.languages,
					courses: profil.courses,
					experiences: profil.experiences,
					serviceOffers: profil.serviceOffers,
				}),
				String(profil.strapiId)
			).toEqual(attendues)
		}
		expect(premier.parity?.profiles).toMatchObject({ expected: 13, equal: 13, different: [], missing: [] })
		expect(premier.collections.profiles).toMatchObject({ refused: [], linksWithoutRow: [] })
	})

	test('l’ordre est celui de la table de liens, jamais celui des identifiants ; une ligne en double reste en double', async () => {
		const zoe = (await profilsDeLaCible()).find(({ strapiId }) => strapiId === 21)

		// The links of these skills are written backwards: their `order` says 1, 2, 3.
		expect(zoe?.skills?.map(({ name }) => name)).toEqual(['Maquillage mariée', 'Coiffure', 'Maquillage mariée'])
		expect(zoe?.serviceOffers?.[0]?.options?.map(({ name }) => name)).toEqual([
			'Retouche en journée',
			'Maquillage d’une demoiselle d’honneur',
		])
		expect(zoe?.experiences?.map(({ startDate, endDate }) => [startDate, endDate])).toEqual([
			['2019-09-01T12:00:00.000Z', '2022-06-30T12:00:00.000Z'],
			['2022-09-01T12:00:00.000Z', null],
		])
		// A row no link names belongs to no profile: skill 6, language 4, offer 11.
		const cible = await profilsDeLaCible()
		const noms = (liste: (p: Profile) => { name?: string | null }[] | null | undefined) =>
			cible.flatMap(profil => (liste(profil) ?? []).map(({ name }) => name))
		expect(noms(p => p.skills)).not.toContain('Maquillage invitée')
		expect(noms(p => p.languages)).not.toContain('Italien')
		expect(noms(p => p.serviceOffers)).not.toContain('Maquillage soirée')
	})

	test('le texte de prix est la saisie, à l’octet près ; le montant est lu par la règle unique (062)', async () => {
		const prixDeLaSource = [
			...lignes.components_makeupartists_service_offers.filter(sauf([11, ...HORS_BORNES.prestations])),
			...lignes.components_service_offers_options.filter(sauf(HORS_BORNES.options)),
		].map(({ price }) => price)
		const prixDeLaCible = (await profilsDeLaCible())
			.flatMap(({ serviceOffers }) => serviceOffers ?? [])
			.flatMap(offre => [offre, ...(offre.options ?? [])])

		expect(prixDeLaCible.map(({ priceText }) => priceText).sort()).toEqual(
			[...prixDeLaSource].sort() as (string | null)[]
		)
		for (const { priceText } of prixDeLaCible)
			if (typeof priceText === 'string') expect(prixDeLaSource.some(prix => prix === priceText)).toBe(true)
		const encode = (texte: unknown) => [...new TextEncoder().encode(String(texte))]
		const kaci = (await profilsDeLaCible()).find(({ strapiId }) => strapiId === 25)
		// A null price stays null, an empty one stays empty (rule 2).
		expect(kaci?.serviceOffers?.map(({ priceText }) => priceText)).toEqual([null, ''])
		const zoe = (await profilsDeLaCible()).find(({ strapiId }) => strapiId === 21)
		expect(encode(zoe?.serviceOffers?.[0]?.priceText)).toEqual(encode('à partir de 120 €'))
		// 062: the amount is there when the text reads, empty otherwise (the text stays either way).
		for (const { priceText, priceFrom } of prixDeLaCible)
			expect(priceFrom ?? null, String(priceText)).toBe(parsePrice(priceText).priceFrom)
		expect(zoe?.serviceOffers?.map(({ priceFrom }) => priceFrom)).toEqual([120, 80, null])
		expect(zoe?.serviceOffers?.[0]?.options?.map(({ priceFrom }) => priceFrom)).toEqual([15, null])
		// A free text keeps its text and has no amount; digits the rule does not read stay readable.
		const libres = prixDeLaCible.filter(({ priceFrom }) => priceFrom === null)
		expect(libres.map(({ priceText }) => priceText)).toContain('Sur devis')
		expect(libres.map(({ priceText }) => priceText)).toContain('2 h : 150 €')
	})

	test('aucun profil ne perd son offre chiffrée, et le rapport le dit en nombres (062)', async () => {
		const cible = await profilsDeLaCible()
		for (const profil of cible) {
			const offres = listesAttendues(Number(profil.strapiId)).serviceOffers
			const chiffreeALaSource = offres.some(({ priceFrom }) => priceFrom !== null)
			expect(minimumPrice(profil.serviceOffers) !== null, String(profil.strapiId)).toBe(chiffreeALaSource)
		}
		const { prices: prix } = premier.collections.profiles ?? {}
		const lignesDePrix = cible.flatMap(({ serviceOffers }) =>
			(serviceOffers ?? []).flatMap(o => [o, ...(o.options ?? [])])
		)
		expect(prix).toMatchObject({
			prices: lignesDePrix.length,
			withAmount: lignesDePrix.filter(({ priceFrom }) => priceFrom !== null).length,
			lostPricedOffers: [],
		})
		// Profile 23 (60 is read) is no écart; 22 (an option at 0,50 € / km, under 5 €) and 24 (« 2 h : 150 € ») are listed.
		expect(prix?.unreadDigits).toEqual([22, 24])
		expect(premier.gaps['prix-numerique']).toBe(
			cible.filter(({ serviceOffers }) =>
				(serviceOffers ?? []).some(o => [o, ...(o.options ?? [])].some(({ priceFrom }) => priceFrom !== null))
			).length
		)
		expect(JSON.stringify(premier)).not.toContain('Sur devis')
	})

	test('les réseaux sont les liens de l’ancien site ; téléphone et email sont au ticket 064', async () => {
		for (const profil of await profilsDeLaCible()) {
			const [reseau] = deProfil(
				Number(profil.strapiId),
				lignes.components_makeupartists_networks,
				'makeupartists.network',
				'network'
			)
			expect(profil.networks as unknown, String(profil.strapiId)).toEqual({
				youtube: reseau?.youtube ?? null,
				facebook: reseau?.facebook ?? null,
				instagram: reseau?.instagram ?? null,
				website: reseau?.website ?? null,
				linkedin: reseau?.linkedin ?? null,
			})
		}
	})
})

describe('Une ligne hors d’une borne de la v3 et un rayon au-dessus de 200 km (ticket 226)', () => {
	test('le profil 33 est repris sans ses quatre lignes hors bornes, qui sont listées par rang, jamais par texte', async () => {
		const hugo = (await profilsDeLaCible()).find(({ strapiId }) => strapiId === 33)

		expect(hugo?.experiences ?? []).toEqual([])
		expect(hugo?.courses ?? []).toEqual([])
		// The offer 12 is out (its description), the offer 10 stays, and loses its option (its name).
		expect(hugo?.serviceOffers?.map(({ name, options }) => [name, options?.length ?? 0])).toEqual([
			['Cours particulier', 0],
		])
		expect(hugo?.status).toBe('published')
		expect(premier.collections.profiles).toMatchObject({ refused: [] })
		expect(premier.collections.profiles?.skippedRows).toEqual([
			{ profile: 33, liste: 'formations', rang: 1 },
			{ profile: 33, liste: 'experiences', rang: 1 },
			{ profile: 33, liste: 'prestations', rang: 2 },
			{ profile: 33, liste: 'options', rang: 1, prestation: 1 },
		])
		const texte = JSON.stringify(premier)
		expect(texte).not.toContain('Maison Fictive')
		expect(texte).not.toContain('Option au nom trop long')
		expect(texte).not.toContain('Une phrase de remplissage')
	})

	test('le rayon de 0 à 200 km est repris ; au-dessus, le champ reste vide et le profil est listé avec la valeur', async () => {
		const cible = await profilsDeLaCible()
		const rayon = (id: number) => cible.find(({ strapiId }) => strapiId === id)?.radiusKm ?? null

		expect([21, 22, 23, 24].map(rayon)).toEqual([30, 50, 20, null])
		// 26 holds 400 km at the source: its zone stays empty, it is taken, and listed with the value.
		expect(rayon(26)).toBeNull()
		expect(cible.some(({ strapiId }) => strapiId === 26)).toBe(true)
		expect(premier.collections.profiles?.radiiToReview).toEqual([{ profile: 26, radiusKm: 400 }])
		expect(premier.gaps['rayon-200-km']).toBe(1)
		// Parity: the radius is a compared field, and explained.
		expect(premier.parity?.profiles).toMatchObject({ different: [], missing: [], extra: [] })
	})

	test('un second passage ne crée ni ne modifie rien', async () => {
		const second = await importOnBench()

		expect(second.collections.profiles).toMatchObject({ created: 0, updated: 0, refused: [] })
		expect(second.collections.profiles?.skippedRows).toHaveLength(4)
	})
})

describe('Les photos de chaque profil (ticket 060)', () => {
	test('la photo principale et la galerie, dans l’ordre, sont les médias adoptés de ses fichiers', async () => {
		const medias = await mediasParFichier()
		const parProfil = Object.fromEntries(
			(await profilsDeLaCible()).map(({ strapiId, mainPicture, gallery }) => [
				strapiId,
				{ principale: mainPicture ?? null, gallery: gallery ?? [] },
			])
		)

		// The links of the gallery of 21 are written out of order: `order` says 102, 103, 104.
		expect(parProfil[21]).toEqual({
			principale: medias.get(101) ?? -1,
			gallery: [medias.get(102), medias.get(103), medias.get(104)],
		})
		expect(parProfil[22]).toEqual({ principale: medias.get(105) ?? -1, gallery: [medias.get(106)] })
		// The object of 107 is missing from the storage: adopted all the same, a « 404 connu ».
		expect(parProfil[23]).toEqual({ principale: medias.get(107) ?? -1, gallery: [] })
		expect(parProfil[25]).toEqual({ principale: null, gallery: [medias.get(109)] })
	})

	test('une photo dont le média n’est pas adopté est signalée, pas inventée', async () => {
		const camille = (await profilsDeLaCible()).find(({ strapiId }) => strapiId === 24)

		// 108 is a PDF: not adopted, so the gallery of 24 is empty in the v3.
		expect(camille?.gallery ?? []).toEqual([])
		expect(premier.collections.profiles?.photosNotCarriedOver).toEqual([{ entry: 24, file: 108 }])
		expect(premier.collections.profiles?.statusesDifferingFromSource).toEqual([])
	})
})

describe('Un second passage (ticket 060)', () => {
	test('0 mise à jour, et chaque ligne de liste garde son identifiant', async () => {
		const avant = await profilsDeLaCible()
		const identifiants = identifiantsDesLignes(avant)

		const second = await importOnBench()

		expect(second.collections.profiles).toMatchObject({ created: 0, updated: 0, unchanged: 13, refused: [] })
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

		const rapport = await importOnBench()

		expect(rapport.collections.profiles).toMatchObject({ created: 0, updated: 0, linksWithoutRow: [22] })
		expect(await profilsDeLaCible()).toEqual(avant)
	})
})
