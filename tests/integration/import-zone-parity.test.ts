import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Decisions } from '../../scripts/migration/import/decisions'
import { importer } from '../../scripts/migration/import/importer'
import type { Query, Source } from '../../scripts/migration/import/source'
import { openSourceBun } from '../../scripts/migration/import/source-bun'
import { INDEXABLE_FILTER } from '../../src/lib/profile/visibility'
import { BENCH_CUTOVER_DATE } from '../support/bench'
import { BENCH_DECISIONS, benchReference } from '../support/import'
import { emptyBase, testPayload } from '../support/payload-test'
import { benchSource, createSourceStrapi, eraseSourceStrapi } from '../support/source-strapi'

/**
 * Ticket 267: after an import, the profiles the old site published are published in the v3, and
 * what is left is written. Three fictional profiles stand for the three real ones of the ticket
 * 257 (plans/PLAN-ZONES.md §2.6), each with the shape of its case and everything else complete:
 *
 * - 21 reads a postal code two communes share (the shape of the source profile 36): its zone
 *   stays empty, it is to review and not publishable, nothing is guessed;
 * - 23 reads a town and one foreign country (« Bruxelles-Belgique », the source profile 48);
 * - 22 reads two countries (« France & Italie », the source profile 82), and gets a description of
 *   the length the rule asks for: on the bench it is the only thing it lacks to be publishable.
 *
 * The fake bench has two publishable profiles (21 and 23) and one that lacks a description (22).
 * Before the ticket 261 the three texts were no commune: none of the three was publishable.
 */

const LONG_DESCRIPTION = 'Maquilleuse indépendante, fictive, pour les besoins d’un test. '.repeat(6).trim()

const CITIES: Readonly<Record<number, string>> = {
	21: '74990',
	22: 'France & Italie',
	23: 'Villeneuve-Fictive, Belgique',
}

/** Rows of the profiles query read otherwise than the source holds them; the source is not written. */
function withRows(source: Source, rows: Readonly<Record<number, Readonly<Record<string, unknown>>>>): Source {
	return {
		fermer: () => source.fermer(),
		lire: travail =>
			source.lire(requete => {
				const altered: Query = async (text, parameters) =>
					(await requete(text, parameters)).map(row => {
						const { id } = row as { id?: unknown }
						return typeof id === 'number' && 'city' in row && id in rows ? { ...row, ...rows[id] } : row
					}) as never
				return travail(altered)
			}),
	}
}

async function importParity(decisions: Decisions = BENCH_DECISIONS) {
	const payload = await testPayload()
	const source = withRows(openSourceBun(benchSource().lecture), {
		21: { city: CITIES[21] },
		22: { city: CITIES[22], description: LONG_DESCRIPTION },
		23: { city: CITIES[23] },
	})
	try {
		return await importer({
			payload,
			source,
			mode: 'real',
			target: 'local',
			decisions,
			reference: benchReference(),
			media: { base: benchSource().medias },
			consentDate: BENCH_CUTOVER_DATE,
		})
	} finally {
		await source.fermer()
	}
}

async function profiles() {
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

/** The strapiId of every profile the sitemap lists: the filter it reads, on the whole collection. */
async function listedInSitemap() {
	const payload = await testPayload()
	const { docs } = await payload.find({
		collection: 'profiles',
		depth: 0,
		pagination: false,
		overrideAccess: true,
		where: { and: [INDEXABLE_FILTER, { status: { not_equals: 'hidden' } }] },
		sort: 'strapiId',
	})
	return docs.map(({ strapiId }) => strapiId)
}

const pick = async (strapiId: number) => (await profiles()).find(profile => profile.strapiId === strapiId)

describe('Ticket 267 : trois profils de la forme de 36, 48 et 82, publiables ou à revoir, puis stables', () => {
	let first: Awaited<ReturnType<typeof importParity>>

	beforeAll(async () => {
		await emptyBase()
		await createSourceStrapi()
		first = await importParity()
		// The first run of the file starts Payload on the bench: longer than the default 5 s.
	}, 90_000)

	afterAll(async () => {
		await emptyBase()
		await eraseSourceStrapi()
	})

	test('le pays avec une ville et les deux pays rendent leur profil publiable, et ils entrent au sitemap', async () => {
		for (const id of [22, 23]) {
			expect(await pick(id), String(id)).toMatchObject({ active: true, publishable: true, status: 'published' })
		}
		expect(await pick(23)).toMatchObject({ zoneKind: 'countries', countries: ['BE'], town: 'Villeneuve-Fictive' })
		expect(await pick(22)).toMatchObject({ zoneKind: 'countries', countries: ['FR', 'IT'], town: null })
		expect(await listedInSitemap()).toEqual([22, 23])
	})

	test('le code postal partagé reste à revoir : zone vide, ni active ni publiable, hors du sitemap, communes en candidates', async () => {
		const profile = await pick(21)

		expect(profile).toMatchObject({ zoneKind: 'city', active: false, publishable: false })
		expect(profile?.city?.inseeCode ?? null).toBeNull()
		expect(profile?.zoneReview).toMatchObject({ reason: 'sharedPostalCode', postalCode: '74990' })
		expect(profile?.zoneReview?.candidates).toHaveLength(2)
		expect(await listedInSitemap()).not.toContain(21)
		expect(first.collections.profiles?.zones?.toReviewByReason['code-postal-partage']).toEqual([21])
		expect(first.collections.profiles?.zones?.countries).toEqual([22, 23])
	})

	test('le second passage ne change aucun profil', async () => {
		const before = await profiles()

		const second = await importParity()

		expect(second.collections.profiles).toMatchObject({ created: 0, updated: 0, refused: [] })
		expect(await profiles()).toEqual(before)
	})

	test('une ligne de décision pour le code postal partagé le rend publiable, et le sitemap le liste', async () => {
		const decisions: Decisions = { ...BENCH_DECISIONS, cities: [{ profile: 21, inseeCode: '74990' }] }

		const report = await importParity(decisions)

		expect(report.collections.profiles).toMatchObject({ created: 0, updated: 1, refused: [] })
		expect(await pick(21)).toMatchObject({ active: true, publishable: true })
		expect(await listedInSitemap()).toEqual([21, 22, 23])
		const again = await importParity(decisions)
		expect(again.collections.profiles).toMatchObject({ created: 0, updated: 0 })
	})
})
