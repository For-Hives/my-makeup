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
const { lignes: lines } = sourceDefinition(source.medias)

/** The profiles the import takes: profile 29 is set aside by the table of decisions of the bench, the 13 of the spam have no account. */
const TAKEN = lines.makeup_artistes_user_links.map(lien => Number(lien.makeup_artiste_id)).filter(id => id !== 29)

/**
 * The rows of the fake source that sit outside a bound of the v3 (ticket 226): the import leaves
 * them out of their profile and lists them. Written here by identifier, never computed by the import.
 */
const OUT_OF_BOUNDS = {
	experiences: [4],
	formations: [3],
	prestations: [12],
	options: [4],
} as const

const except = (ids: readonly number[]) => (ligne: Line) => !ids.includes(Number(ligne.id))

/** The rows of a component table, by identifier. */
const byId = (table: readonly Line[]) => new Map(table.map(ligne => [Number(ligne.id), ligne]))

/** The rows a link table gives an entry for one field, in the order of the old site: `order`, then the link. */
function linesOf(
	liens: readonly Line[],
	composants: readonly Line[],
	entree: number,
	type: string,
	champ: string
): Line[] {
	const ranked = byId(composants)
	return liens
		.filter(l => Number(l.entity_id) === entree && l.component_type === type && l.field === champ)
		.sort((a, b) => Number(a.order) - Number(b.order) || Number(a.id) - Number(b.id))
		.flatMap(l => {
			const line = ranked.get(Number(l.component_id))
			return line ? [line] : []
		})
}

const ofProfile = (id: number, table: readonly Line[], type: string, champ: string) =>
	linesOf(lines.makeup_artistes_components, table, id, type, champ)

/** A day of the old site, as the collection stores it. */
const day = (date: unknown) => (date === null ? null : `${String(date)}T12:00:00.000Z`)

/** What each list of a profile must hold, row by row, without the identifiers Payload gives. */
function expectedLists(id: number) {
	return {
		skills: ofProfile(id, lines.components_makeupartists_skills, 'makeupartists.skills', 'skills').map(c => ({
			name: c.name,
			description: c.description,
		})),
		languages: ofProfile(id, lines.components_makeupartists_languages, 'makeupartists.language', 'language').map(c => ({
			name: c.name,
		})),
		courses: ofProfile(id, lines.components_makeupartists_courses, 'makeupartists.courses', 'courses')
			.filter(except(OUT_OF_BOUNDS.formations))
			.map(c => ({
				diploma: c.diploma,
				school: c.school,
				graduatedAt: day(c.date_graduation),
				description: c.course_description,
			})),
		experiences: ofProfile(id, lines.components_makeupartists_experiences, 'makeupartists.experiences', 'experiences')
			.filter(except(OUT_OF_BOUNDS.experiences))
			.map(c => ({
				company: c.company,
				jobTitle: c.job_name,
				city: c.city,
				startDate: day(c.date_start),
				endDate: day(c.date_end),
				description: c.description,
			})),
		serviceOffers: ofProfile(
			id,
			lines.components_makeupartists_service_offers,
			'makeupartists.service-offers',
			'service_offers'
		)
			.filter(except(OUT_OF_BOUNDS.prestations))
			.map(offre => ({
				name: offre.name,
				description: offre.description,
				priceText: offre.price,
				priceFrom: parsePrice(offre.price).priceFrom,
				options: linesOf(
					lines.components_makeupartists_service_offers_components,
					lines.components_service_offers_options,
					Number(offre.id),
					'service-offers.options',
					'options'
				)
					.filter(except(OUT_OF_BOUNDS.options))
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
const withoutIdentifiers = (valeur: unknown): unknown =>
	Array.isArray(valeur)
		? valeur.map(withoutIdentifiers)
		: typeof valeur === 'object' && valeur !== null
			? Object.fromEntries(
					Object.entries(valeur)
						.filter(([cle]) => cle !== 'id')
						.map(([cle, sous]) => [cle, withoutIdentifiers(sous)])
				)
			: valeur

/** The identifiers Payload gave the rows of every list of every profile, options included. */
const linesIdentifiers = (profils: Profile[]): string[] =>
	profils.flatMap(profil =>
		[
			...(profil.skills ?? []),
			...(profil.languages ?? []),
			...(profil.courses ?? []),
			...(profil.experiences ?? []),
			...(profil.serviceOffers ?? []).flatMap(offre => [offre, ...(offre.options ?? [])]),
		].map(ligne => `${profil.strapiId}:${ligne.id}`)
	)

async function targetProfiles(): Promise<Profile[]> {
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
async function mediaByFile(): Promise<Map<number, number>> {
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'media', depth: 0, pagination: false, overrideAccess: true })
	return new Map(docs.map(({ id, strapiId }) => [Number(strapiId), id]))
}

/** As the owner of the bench, the only one who may write into the source. */
async function withOwner<T>(travail: (sql: SQL) => Promise<T>): Promise<T> {
	const owner = new SQL({ url: source.administration, max: 1 })
	try {
		return await travail(owner)
	} finally {
		await owner.close()
	}
}

let first: Report

beforeAll(async () => {
	await emptyBase()
	// Before the source: emptying the bucket would take its objects away.
	await emptyStorage()
	await createSourceStrapi()
	first = await importOnBench()
}, 60_000)

afterAll(async () => {
	await emptyBase()
	await eraseSourceStrapi()
})

describe('Les sections de chaque profil sont reprises dans leur ordre (ticket 060)', () => {
	test('même nombre de lignes par section, même ordre, options comprises (I40)', async () => {
		const target = await targetProfiles()

		expect(target.map(({ strapiId }) => strapiId)).toEqual(TAKEN)
		for (const profile of target) {
			const expected = expectedLists(Number(profile.strapiId))
			expect(
				withoutIdentifiers({
					skills: profile.skills,
					languages: profile.languages,
					courses: profile.courses,
					experiences: profile.experiences,
					serviceOffers: profile.serviceOffers,
				}),
				String(profile.strapiId)
			).toEqual(expected)
		}
		expect(first.parity?.profiles).toMatchObject({ expected: 13, equal: 13, different: [], missing: [] })
		expect(first.collections.profiles).toMatchObject({ refused: [], linksWithoutRow: [] })
	})

	test('l’ordre est celui de la table de liens, jamais celui des identifiants ; une ligne en double reste en double', async () => {
		const zoe = (await targetProfiles()).find(({ strapiId }) => strapiId === 21)

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
		const target = await targetProfiles()
		const names = (liste: (p: Profile) => { name?: string | null }[] | null | undefined) =>
			target.flatMap(profil => (liste(profil) ?? []).map(({ name }) => name))
		expect(names(p => p.skills)).not.toContain('Maquillage invitée')
		expect(names(p => p.languages)).not.toContain('Italien')
		expect(names(p => p.serviceOffers)).not.toContain('Maquillage soirée')
	})

	test('le texte de prix est la saisie, à l’octet près ; le montant est lu par la règle unique (062)', async () => {
		const sourcePrice = [
			...lines.components_makeupartists_service_offers.filter(except([11, ...OUT_OF_BOUNDS.prestations])),
			...lines.components_service_offers_options.filter(except(OUT_OF_BOUNDS.options)),
		].map(({ price }) => price)
		const targetPrice = (await targetProfiles())
			.flatMap(({ serviceOffers }) => serviceOffers ?? [])
			.flatMap(offre => [offre, ...(offre.options ?? [])])

		expect(targetPrice.map(({ priceText }) => priceText).sort()).toEqual([...sourcePrice].sort() as (string | null)[])
		for (const { priceText } of targetPrice)
			if (typeof priceText === 'string') expect(sourcePrice.some(prix => prix === priceText)).toBe(true)
		const encode = (texte: unknown) => [...new TextEncoder().encode(String(texte))]
		const kaci = (await targetProfiles()).find(({ strapiId }) => strapiId === 25)
		// A null price stays null, an empty one stays empty (rule 2).
		expect(kaci?.serviceOffers?.map(({ priceText }) => priceText)).toEqual([null, ''])
		const zoe = (await targetProfiles()).find(({ strapiId }) => strapiId === 21)
		expect(encode(zoe?.serviceOffers?.[0]?.priceText)).toEqual(encode('à partir de 120 €'))
		// 062: the amount is there when the text reads, empty otherwise (the text stays either way).
		for (const { priceText, priceFrom } of targetPrice)
			expect(priceFrom ?? null, String(priceText)).toBe(parsePrice(priceText).priceFrom)
		expect(zoe?.serviceOffers?.map(({ priceFrom }) => priceFrom)).toEqual([120, 80, null])
		expect(zoe?.serviceOffers?.[0]?.options?.map(({ priceFrom }) => priceFrom)).toEqual([15, null])
		// A free text keeps its text and has no amount; digits the rule does not read stay readable.
		const free = targetPrice.filter(({ priceFrom }) => priceFrom === null)
		expect(free.map(({ priceText }) => priceText)).toContain('Sur devis')
		expect(free.map(({ priceText }) => priceText)).toContain('2 h : 150 €')
	})

	test('aucun profil ne perd son offre chiffrée, et le rapport le dit en nombres (062)', async () => {
		const target = await targetProfiles()
		for (const profile of target) {
			const offers = expectedLists(Number(profile.strapiId)).serviceOffers
			const numberedAtSource = offers.some(({ priceFrom }) => priceFrom !== null)
			expect(minimumPrice(profile.serviceOffers) !== null, String(profile.strapiId)).toBe(numberedAtSource)
		}
		const { prices: priceValue } = first.collections.profiles ?? {}
		const priceLines = target.flatMap(({ serviceOffers }) =>
			(serviceOffers ?? []).flatMap(o => [o, ...(o.options ?? [])])
		)
		expect(priceValue).toMatchObject({
			prices: priceLines.length,
			withAmount: priceLines.filter(({ priceFrom }) => priceFrom !== null).length,
			lostPricedOffers: [],
		})
		// Profile 23 (60 is read) is no écart; 22 (an option at 0,50 € / km, under 5 €) and 24 (« 2 h : 150 € ») are listed.
		expect(priceValue?.unreadDigits).toEqual([22, 24])
		expect(first.gaps['prix-numerique']).toBe(
			target.filter(({ serviceOffers }) =>
				(serviceOffers ?? []).some(o => [o, ...(o.options ?? [])].some(({ priceFrom }) => priceFrom !== null))
			).length
		)
		expect(JSON.stringify(first)).not.toContain('Sur devis')
	})

	test('les réseaux sont les liens de l’ancien site ; téléphone et email sont au ticket 064', async () => {
		for (const profile of await targetProfiles()) {
			const [network] = ofProfile(
				Number(profile.strapiId),
				lines.components_makeupartists_networks,
				'makeupartists.network',
				'network'
			)
			expect(profile.networks as unknown, String(profile.strapiId)).toEqual({
				youtube: network?.youtube ?? null,
				facebook: network?.facebook ?? null,
				instagram: network?.instagram ?? null,
				website: network?.website ?? null,
				linkedin: network?.linkedin ?? null,
			})
		}
	})
})

describe('Une ligne hors d’une borne de la v3 et un rayon au-dessus de 200 km (ticket 226)', () => {
	test('le profil 33 est repris sans ses quatre lignes hors bornes, qui sont listées par rang, jamais par texte', async () => {
		const hugo = (await targetProfiles()).find(({ strapiId }) => strapiId === 33)

		expect(hugo?.experiences ?? []).toEqual([])
		expect(hugo?.courses ?? []).toEqual([])
		// The offer 12 is out (its description), the offer 10 stays, and loses its option (its name).
		expect(hugo?.serviceOffers?.map(({ name, options }) => [name, options?.length ?? 0])).toEqual([
			['Cours particulier', 0],
		])
		expect(hugo?.status).toBe('published')
		expect(first.collections.profiles).toMatchObject({ refused: [] })
		expect(first.collections.profiles?.skippedRows).toEqual([
			{ profile: 33, liste: 'formations', rang: 1 },
			{ profile: 33, liste: 'experiences', rang: 1 },
			{ profile: 33, liste: 'prestations', rang: 2 },
			{ profile: 33, liste: 'options', rang: 1, prestation: 1 },
		])
		const text = JSON.stringify(first)
		expect(text).not.toContain('Maison Fictive')
		expect(text).not.toContain('Option au nom trop long')
		expect(text).not.toContain('Une phrase de remplissage')
	})

	test('le rayon de 0 à 200 km est repris ; au-dessus, le champ reste vide et le profil est listé avec la valeur', async () => {
		const target = await targetProfiles()
		const radius = (id: number) => target.find(({ strapiId }) => strapiId === id)?.radiusKm ?? null

		expect([21, 22, 23, 24].map(radius)).toEqual([30, 50, 20, null])
		// 26 holds 400 km at the source: its zone stays empty, it is taken, and listed with the value.
		expect(radius(26)).toBeNull()
		expect(target.some(({ strapiId }) => strapiId === 26)).toBe(true)
		expect(first.collections.profiles?.radiiToReview).toEqual([{ profile: 26, radiusKm: 400 }])
		expect(first.gaps['rayon-200-km']).toBe(1)
		// Parity: the radius is a compared field, and explained.
		expect(first.parity?.profiles).toMatchObject({ different: [], missing: [], extra: [] })
	})

	test('un second passage ne crée ni ne modifie rien', async () => {
		const second = await importOnBench()

		expect(second.collections.profiles).toMatchObject({ created: 0, updated: 0, refused: [] })
		expect(second.collections.profiles?.skippedRows).toHaveLength(4)
	})
})

describe('Les photos de chaque profil (ticket 060)', () => {
	test('la photo principale et la galerie, dans l’ordre, sont les médias adoptés de ses fichiers', async () => {
		const media = await mediaByFile()
		const byProfile = Object.fromEntries(
			(await targetProfiles()).map(({ strapiId, mainPicture, gallery }) => [
				strapiId,
				{ principale: mainPicture ?? null, gallery: gallery ?? [] },
			])
		)

		// The links of the gallery of 21 are written out of order: `order` says 102, 103, 104.
		expect(byProfile[21]).toEqual({
			principale: media.get(101) ?? -1,
			gallery: [media.get(102), media.get(103), media.get(104)],
		})
		expect(byProfile[22]).toEqual({ principale: media.get(105) ?? -1, gallery: [media.get(106)] })
		// The object of 107 is missing from the storage: adopted all the same, a « 404 connu ».
		expect(byProfile[23]).toEqual({ principale: media.get(107) ?? -1, gallery: [] })
		expect(byProfile[25]).toEqual({ principale: null, gallery: [media.get(109)] })
	})

	test('une photo dont le média n’est pas adopté est signalée, pas inventée', async () => {
		const camille = (await targetProfiles()).find(({ strapiId }) => strapiId === 24)

		// 108 is a PDF: not adopted, so the gallery of 24 is empty in the v3.
		expect(camille?.gallery ?? []).toEqual([])
		expect(first.collections.profiles?.photosNotCarriedOver).toEqual([{ entry: 24, file: 108 }])
		expect(first.collections.profiles?.statusesDifferingFromSource).toEqual([])
	})
})

describe('Un second passage (ticket 060)', () => {
	test('0 mise à jour, et chaque ligne de liste garde son identifiant', async () => {
		const before = await targetProfiles()
		const identifiers = linesIdentifiers(before)

		const second = await importOnBench()

		expect(second.collections.profiles).toMatchObject({ created: 0, updated: 0, unchanged: 13, refused: [] })
		expect(linesIdentifiers(await targetProfiles())).toEqual(identifiers)
		expect(identifiers.length).toBeGreaterThan(10)
		expect(await targetProfiles()).toEqual(before)
	})
})

describe('Un lien de liste qui ne nomme aucune ligne (SCHEMA.md §7)', () => {
	const LINK = 900

	beforeAll(() =>
		withOwner(sql =>
			sql.unsafe(
				`INSERT INTO makeup_artistes_components (id, entity_id, component_id, component_type, field, "order")
				VALUES (${LINK}, 22, 999, 'makeupartists.skills', 'skills', 2)`
			)
		)
	)

	afterAll(() => withOwner(sql => sql.unsafe(`DELETE FROM makeup_artistes_components WHERE id = ${LINK}`)))

	test('il est signalé par son profil, et rien n’est inventé à sa place', async () => {
		const before = await targetProfiles()

		const report = await importOnBench()

		expect(report.collections.profiles).toMatchObject({ created: 0, updated: 0, linksWithoutRow: [22] })
		expect(await targetProfiles()).toEqual(before)
	})
})
