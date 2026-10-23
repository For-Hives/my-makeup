import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { SQL } from 'bun'
import type { Report } from '../../scripts/migration/import/report'
import { ImportRefuse } from '../../scripts/migration/import/target'
import type { Profile } from '../../src/payload-types'
import { BENCH_CUTOVER_DATE } from '../support/bench'
import { importOnBench } from '../support/import'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'
import { emptyStorage } from '../support/s3'
import { benchSource, createSourceStrapi, eraseSourceStrapi } from '../support/source-strapi'
import { sourceDefinition } from '../support/source-strapi/data'

/**
 * Ticket 064: the phone and the email of contact go into the closed group of the profile; a
 * profile that shows one today keeps showing it, with a consent dated from the switch (a parameter
 * of the run) and the source « publié par la maquilleuse » (docs/migration/SCHEMA.md §9, register
 * `coordonnees-consentement`). A profile without either is closed, without a date.
 *
 * The expected values are read here from the definition of the fake source, never by the code of
 * the import. One import for the file.
 */

const source = benchSource()
const { lignes: lines } = sourceDefinition(source.medias)

/** The profiles the import takes: profile 29 is set aside by the table of decisions of the bench. */
const TAKEN = lines.makeup_artistes_user_links.map(lien => Number(lien.makeup_artiste_id)).filter(id => id !== 29)

/** What the old site shows of a profile, from its network row. */
function sourceContactDetails(profil: number) {
	const link = lines.makeup_artistes_components.find(
		l => Number(l.entity_id) === profil && l.component_type === 'makeupartists.network'
	)
	const network = lines.components_makeupartists_networks.find(r => Number(r.id) === Number(link?.component_id))
	return { phone: network?.phone ?? null, email: network?.email ?? null }
}

const SHOW = TAKEN.filter(id => Object.values(sourceContactDetails(id)).some(valeur => valeur !== null))
const WITHOUT = TAKEN.filter(id => !SHOW.includes(id))

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
	await emptyStorage()
	await createSourceStrapi()
	// Without the date of the switch, a source that shows contact details stops the run, dry or real.
	for (const mode of ['dry-run', 'real'] as const)
		await expect(importOnBench(mode, { consentDate: undefined })).rejects.toBeInstanceOf(ImportRefuse)
	expect(await targetProfiles()).toEqual([])
	first = await importOnBench()
}, 60_000)

afterAll(async () => {
	await emptyBase()
	await eraseSourceStrapi()
})

describe('Les coordonnées déjà publiées restent publiques, avec un consentement daté (ticket 064)', () => {
	test('la source a des profils qui en affichent et des profils qui n’en ont pas', () => {
		expect(SHOW).toEqual([21, 23, 24])
		expect(WITHOUT.length).toBeGreaterThan(5)
	})

	test('téléphone ou email à la source : contactPublic vrai, date du paramètre, source « import »', async () => {
		const target = await targetProfiles()

		for (const id of SHOW) {
			const profile = target.find(({ strapiId }) => strapiId === id)
			expect(profile?.contactDetails, String(id)).toMatchObject(sourceContactDetails(id))
			expect(profile?.publicContact, String(id)).toBe(true)
			expect(profile?.consentedAt, String(id)).toBe(BENCH_CUTOVER_DATE)
			expect(profile?.consentSource, String(id)).toBe('import')
		}
		expect(first.gaps['coordonnees-consentement']).toBe(SHOW.length)
	})

	test('sans coordonnée : contactPublic faux, sans date et sans source', async () => {
		const target = await targetProfiles()

		expect(target.map(({ strapiId }) => strapiId)).toEqual(TAKEN)
		for (const id of WITHOUT) {
			const profile = target.find(({ strapiId }) => strapiId === id)
			expect(profile?.publicContact, String(id)).toBe(false)
			expect(profile?.consentedAt ?? null, String(id)).toBeNull()
			expect(profile?.consentSource ?? null, String(id)).toBeNull()
			expect(profile?.contactDetails?.phone ?? null, String(id)).toBeNull()
			expect(profile?.contactDetails?.email ?? null, String(id)).toBeNull()
		}
		expect(first.parity?.profiles).toMatchObject({ different: [], missing: [], refused: [] })
	})

	test('lecture anonyme : jamais de coordonnées, de choix ni de trace du consentement', async () => {
		const secrets = SHOW.flatMap(id => Object.values(sourceContactDetails(id)))
			.filter(v => v !== null)
			.map(String)
		expect(secrets.length).toBeGreaterThan(2)
		const payload = await testPayload()
		const anonymous = await payload.find({ collection: 'profiles', depth: 0, pagination: false, overrideAccess: false })
		// The public does not read `strapiId`: the profile is found by its slug.
		const slug21 = (await targetProfiles()).find(({ strapiId }) => strapiId === 21)?.slug ?? ''
		expect(anonymous.docs.map(({ slug }) => slug)).toContain(slug21)

		const responses = [
			await callRest('GET', '/api/profiles?depth=0&limit=100'),
			...(await Promise.all(anonymous.docs.map(({ id }) => callRest('GET', `/api/profiles/${id}?depth=0`)))),
		]
		const texts = [JSON.stringify(anonymous.docs), ...responses.map(({ texte: text }) => text)]
		for (const response of responses) expect(response.statut).toBe(200)
		for (const text of texts) {
			for (const secret of secrets) expect(text).not.toContain(secret)
			for (const key of ['contactDetails', 'publicContact', 'consentedAt', 'consentSource'])
				expect(text).not.toContain(`"${key}"`)
		}
	})
})

describe('Un second passage (ticket 064)', () => {
	test('0 mise à jour, et le consentement reste celui du premier passage', async () => {
		const before = await targetProfiles()

		const second = await importOnBench()

		expect(second.collections.profiles).toMatchObject({ created: 0, updated: 0, unchanged: TAKEN.length, refused: [] })
		expect(await targetProfiles()).toEqual(before)
	})
})

describe('Une source qui change après le premier passage (ticket 064)', () => {
	const NETWORK_21 = lines.makeup_artistes_components.find(
		l => Number(l.entity_id) === 21 && l.component_type === 'makeupartists.network'
	)?.component_id

	afterAll(() =>
		withOwner(sql =>
			sql.unsafe(
				`UPDATE components_makeupartists_networks SET phone = '${String(sourceContactDetails(21).phone)}' WHERE id = ${Number(NETWORK_21)}`
			)
		)
	)

	test('un téléphone modifié est mis à jour, le consentement posé n’est ni effacé ni redaté', async () => {
		await withOwner(sql =>
			sql.unsafe(
				`UPDATE components_makeupartists_networks SET phone = '06 39 98 99 99' WHERE id = ${Number(NETWORK_21)}`
			)
		)

		const report = await importOnBench()

		expect(report.collections.profiles).toMatchObject({ created: 0, updated: 1, refused: [] })
		const zoe = (await targetProfiles()).find(({ strapiId }) => strapiId === 21)
		expect(zoe?.contactDetails?.phone).toBe('06 39 98 99 99')
		expect(zoe).toMatchObject({
			publicContact: true,
			consentedAt: BENCH_CUTOVER_DATE,
			consentSource: 'import',
		})
	})

	test('un téléphone qui n’est que des espaces n’affiche rien : le profil se referme, sans date', async () => {
		// Profile 23 shows a phone only.
		const NETWORK_23 = lines.makeup_artistes_components.find(
			l => Number(l.entity_id) === 23 && l.component_type === 'makeupartists.network'
		)?.component_id
		await withOwner(sql =>
			sql.unsafe(`UPDATE components_makeupartists_networks SET phone = '   ' WHERE id = ${Number(NETWORK_23)}`)
		)

		const report = await importOnBench()

		expect(report.collections.profiles).toMatchObject({ created: 0, updated: 1, refused: [] })
		const hugo = (await targetProfiles()).find(({ strapiId }) => strapiId === 23)
		expect(hugo?.publicContact).toBe(false)
		expect(hugo?.consentedAt ?? null).toBeNull()
		expect(hugo?.consentSource ?? null).toBeNull()
		expect(hugo?.contactDetails?.phone ?? null).toBeNull()
	})
})

describe('Une coordonnée que le serveur refuserait ne fait pas perdre le profil (ticket 064)', () => {
	/** The network row of a profile of the fake source. */
	const networkOf = (profil: number) =>
		Number(
			lines.makeup_artistes_components.find(
				l => Number(l.entity_id) === profil && l.component_type === 'makeupartists.network'
			)?.component_id
		)

	const write = (profil: number, colonne: 'phone' | 'email', valeur: string) =>
		withOwner(sql =>
			sql.unsafe(
				`UPDATE components_makeupartists_networks SET ${colonne} = '${valeur}' WHERE id = ${networkOf(profil)}`
			)
		)

	const targetProfile = async (strapiId: number) => (await targetProfiles()).find(p => p.strapiId === strapiId)

	test('les mots undefined et null, quelle que soit la casse, ne sont pas des coordonnées (comme à l’ancien site)', async () => {
		await write(22, 'phone', 'undefined')
		await write(22, 'email', ' NULL ')

		const report = await importOnBench()

		expect(report.collections.profiles?.refused).toEqual([])
		const profile = await targetProfile(22)
		expect(profile?.contactDetails?.phone ?? null).toBeNull()
		expect(profile?.contactDetails?.email ?? null).toBeNull()
		expect(profile?.publicContact).toBe(false)
		expect(profile?.consentedAt ?? null).toBeNull()
		expect(profile?.consentSource ?? null).toBeNull()
	})

	test('un email avec des espaces autour est repris sans eux, et le profil s’ouvre', async () => {
		await write(30, 'email', '  emma@example.test ')

		const report = await importOnBench()

		expect(report.collections.profiles?.refused).toEqual([])
		const profile = await targetProfile(30)
		expect(profile?.contactDetails?.email).toBe('emma@example.test')
		expect(profile).toMatchObject({
			publicContact: true,
			consentedAt: BENCH_CUTOVER_DATE,
			consentSource: 'import',
		})
	})

	test('un email qui est un texte libre est laissé de côté et signalé, sans perdre le profil ni ses sections', async () => {
		await write(33, 'email', 'Insta: @hugo')
		await write(33, 'phone', '01 23 45 67 89 01 23 45 67 89 01')

		const report = await importOnBench()

		expect(report.collections.profiles?.refused).toEqual([])
		expect(report.parity?.profiles).toMatchObject({ different: [], missing: [], refused: [] })
		expect(report.collections.profiles?.contactDetailsToReview).toEqual([
			{ profile: 33, field: 'telephone' },
			{ profile: 33, field: 'email' },
		])
		// Never the value, in the report.
		expect(JSON.stringify(report)).not.toContain('Insta')
		const profile = await targetProfile(33)
		expect(profile).toBeDefined()
		expect(profile?.contactDetails?.email ?? null).toBeNull()
		expect(profile?.contactDetails?.phone ?? null).toBeNull()
		expect(profile?.publicContact).toBe(false)
	})

	test('le décompte du registre ne compte que les profils écrits, et vaut le nombre de profils ouverts', async () => {
		const report = await importOnBench()

		const open = (await targetProfiles()).filter(({ publicContact }) => publicContact).length
		expect(report.gaps['coordonnees-consentement']).toBe(open)
	})
})
