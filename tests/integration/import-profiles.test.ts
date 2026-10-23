import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SQL } from 'bun'
import { SPAM_PROFILES } from '../../scripts/migration/import/profiles'
import { IMPORT_CONTEXT } from '../../src/lib/import-context'
import { assignSlugs } from '../../src/lib/slug'
import { PUBLIC_PROFILE_FIELDS, readPublicProfile } from '../../src/services/public/profiles'
import { BENCH_DECISION_FILE, BENCH_DECISIONS, importCommand, importOnBench } from '../support/import'
import { countMails, emptySink } from '../support/mailpit'
import { emptyBase, testPayload } from '../support/payload-test'
import { benchSource, createSourceStrapi, eraseSourceStrapi, sourceFingerprint } from '../support/source-strapi'
import { sourceDefinition } from '../support/source-strapi/data'

/**
 * Tickets 026 and 059: the import takes the identity of the profiles that have an account (link,
 * slug, username of the old site, names, speciality, description, availability, score, badge,
 * dates); the server computes their status; the 13 empty profiles of the spam are set aside, and
 * any other profile without an account stops the import. The public reading gives a published
 * profile by its slug, and nothing private. The page itself is proven once, end to end
 * (tests/e2e/imported-profile-slice.spec.ts).
 *
 * One import for the whole file: each test reads what it left.
 */

const source = benchSource()
const { lignes: lines } = sourceDefinition(source.medias)

/** As the owner of the bench, the only one who may write into the source. */
async function withOwner<T>(travail: (sql: SQL) => Promise<T>): Promise<T> {
	const owner = new SQL({ url: source.administration, max: 1 })
	try {
		return await travail(owner)
	} finally {
		await owner.close()
	}
}

const inIso = (horodatage: unknown): string => `${String(horodatage).replace(' ', 'T')}Z`

/** The profiles of the source, with the account they are linked to. */
const LINKS = new Map(
	lines.makeup_artistes_user_links.map(lien => [Number(lien.makeup_artiste_id), Number(lien.user_id)])
)

/** The accounts the table of decisions of the bench sets aside: profile 29 belongs to account 11. */
const DISCARDED_ACCOUNTS = [10, 11, 12]

/** The profiles the slice takes: linked to an account it takes. */
const TAKEN = lines.makeup_artistes.filter(profil => {
	const account = LINKS.get(Number(profil.id))
	return account !== undefined && !DISCARDED_ACCOUNTS.includes(account)
})

/** The slugs of the old site, computed on every profile of the source. */
const SLUGS = new Map(
	assignSlugs(
		lines.makeup_artistes.map(({ id, username, created_at }) => ({
			id: Number(id),
			username: String(username),
			createdAt: `${String(created_at).replace(' ', 'T')}Z`,
		}))
	).map(({ id, slug }) => [Number(id), slug])
)

let fingerprintBefore = ''
let first: Awaited<ReturnType<typeof importOnBench>>

beforeAll(async () => {
	await emptyBase()
	await emptySink()
	await createSourceStrapi()
	fingerprintBefore = (await sourceFingerprint()).empreinte
	first = await importOnBench()
	// Emptying the base and creating the source take longer than the default 5 s on a loaded machine.
}, 60_000)

afterAll(async () => {
	await emptyBase()
	await eraseSourceStrapi()
})

async function targetProfiles() {
	const payload = await testPayload()
	const { docs } = await payload.find({
		collection: 'profiles',
		depth: 1,
		pagination: false,
		overrideAccess: true,
		sort: 'strapiId',
	})
	return docs
}

describe('Après l’import de la source factice', () => {
	test('chaque profil qui a un compte repris est repris, relié à ce compte, un pour un (I41)', async () => {
		const target = await targetProfiles()

		expect(target.map(({ strapiId }) => strapiId)).toEqual(TAKEN.map(({ id }) => Number(id)))
		for (const profile of target) {
			const account = typeof profile.pro === 'object' ? profile.pro : null
			expect(account?.strapiId, String(profile.strapiId)).toBe(LINKS.get(Number(profile.strapiId)) ?? -1)
		}
		expect(new Set(target.map(({ pro }) => (typeof pro === 'object' ? pro.id : pro))).size).toBe(target.length)
		// An account without a profile at the source stays without one: account 8 (I41).
		const { docs: accounts } = await (await testPayload()).find({
			collection: 'pros',
			depth: 0,
			pagination: false,
			overrideAccess: true,
		})
		const relies = new Set(target.map(({ pro }) => (typeof pro === 'object' ? pro.id : pro)))
		expect(accounts.filter(({ id }) => !relies.has(id)).map(({ strapiId }) => strapiId)).toEqual([8])
		// Profile 29, whose account the table sets aside, is set aside by its own decision; the 13
		// profiles of the spam have no account at all, and are set aside by the import itself.
		expect(first.collections.profiles).toMatchObject({
			source: 27,
			created: 13,
			refused: [],
			excluded: [29],
			spam: [...SPAM_PROFILES],
		})
		expect(first.pointlessDecisions).toBe(0)
		expect(await countMails()).toBe(0)
	})

	test('profils de la source = profils repris + profils écartés ; les 13 du spam sont absents de la cible (I39)', async () => {
		const target = await targetProfiles()
		const summary = first.collections.profiles

		expect(lines.makeup_artistes).toHaveLength(27)
		expect((summary?.excluded?.length ?? 0) + (summary?.spam?.length ?? 0) + target.length).toBe(summary?.source ?? -1)
		for (const id of SPAM_PROFILES)
			expect(
				target.some(({ strapiId }) => strapiId === id),
				String(id)
			).toBe(false)
		expect(first.gaps['profils-spam-non-repris']).toBe(13)
		expect(first.parity?.profiles).toMatchObject({
			expected: 13,
			equal: 13,
			different: [],
			missing: [],
			extra: [],
		})
	})

	test('le slug est celui de la règle portée de l’ancien site ; l’ancien nom d’utilisateur, les noms, la spécialité et la description tels quels', async () => {
		for (const profile of await targetProfiles()) {
			const line = TAKEN.find(({ id }) => Number(id) === profile.strapiId)
			expect(profile, String(profile.strapiId)).toMatchObject({
				slug: SLUGS.get(Number(profile.strapiId)),
				legacyUsername: line?.username ?? null,
				firstName: line?.first_name ?? null,
				lastName: line?.last_name ?? null,
				artistName: line?.company_artist_name ?? null,
				specialty: line?.speciality ?? null,
				description: line?.description ?? null,
			})
		}
		const zoe = (await targetProfiles()).find(({ strapiId }) => strapiId === 21)
		expect([zoe?.slug, zoe?.legacyUsername]).toEqual(['zoe-lefevre', 'Zoé Lefèvre'])
	})

	test('le score, le badge et les dates tels quels ; une disponibilité nulle devient « disponible »', async () => {
		for (const profile of await targetProfiles()) {
			const line = TAKEN.find(({ id }) => Number(id) === profile.strapiId)
			expect(profile, String(profile.strapiId)).toMatchObject({
				score: line?.score ?? null,
				superArtist: line?.pro ?? null,
				available: line?.available ?? true,
				createdAt: inIso(line?.created_at),
				updatedAt: inIso(line?.updated_at),
			})
		}
		const byId = new Map((await targetProfiles()).map(profil => [profil.strapiId, profil]))
		expect([byId.get(21)?.score, byId.get(25)?.score, byId.get(25)?.superArtist]).toEqual([12.5, 3, true])
		expect([byId.get(22)?.available, byId.get(24)?.available, byId.get(34)?.available]).toEqual([true, false, false])
		// 2023-05-12 for its creation, 2026-09-28 for its last change, never the day of the import.
		expect(byId.get(21)?.updatedAt).toBe('2026-09-28T10:11:12.131Z')
		const nullValues = TAKEN.filter(({ available }) => available === null).length
		expect(first.gaps['disponibilite-par-defaut']).toBe(nullValues)
	})

	test('le statut est calculé par le serveur : le profil entièrement vide en brouillon, les autres publiés, le choix laissé à la règle', async () => {
		const target = await targetProfiles()
		const statuses = Object.fromEntries(target.map(({ strapiId, status }) => [strapiId, status]))

		expect(statuses[27]).toBe('draft')
		expect(target.every(({ chosenStatus }) => chosenStatus === 'automatic')).toBe(true)
		// 32 has a city and nothing else: published by its commune (ticket 063), as at the source.
		expect(statuses[32]).toBe('published')
		expect(first.collections.profiles?.statusesDifferingFromSource).toEqual([])
		expect(Object.entries(statuses).filter(([, statut]) => statut === 'published')).toHaveLength(12)
		expect(first.gaps).toMatchObject({ 'profils-vides-brouillon': 1, 'slug-stocke': 12 })
		expect(first.parity?.profiles).toMatchObject({ expected: 13, equal: 13, statuses: { published: 12, draft: 1 } })
	})

	test('second passage : 0 création, 0 mise à jour, et la source n’a pas bougé', async () => {
		const target = await targetProfiles()

		const second = await importOnBench()

		for (const collection of ['pros', 'profiles', 'talents'] as const)
			expect(second.collections[collection], collection).toMatchObject({ created: 0, updated: 0, refused: [] })
		expect(await targetProfiles()).toEqual(target)
		expect((await sourceFingerprint()).empreinte).toBe(fingerprintBefore)
	})
})

describe('Un choix du statut fixé par un passage précédent', () => {
	test('l’import de la première tranche écrivait le statut : le choix revient à la règle, une seule fois', async () => {
		const payload = await testPayload()
		const [zoe] = (await targetProfiles()).filter(({ strapiId }) => strapiId === 21)
		// What the first slice left: a status written by server code becomes the admin's choice.
		await payload.update({
			collection: 'profiles',
			id: zoe?.id ?? 0,
			data: { status: 'draft' },
			overrideAccess: true,
			context: IMPORT_CONTEXT,
		})
		expect((await targetProfiles()).find(({ strapiId }) => strapiId === 21)).toMatchObject({
			status: 'draft',
			chosenStatus: 'draft',
		})

		const after = await importOnBench()
		const third = await importOnBench()

		expect(after.collections.profiles).toMatchObject({ created: 0, updated: 1 })
		expect((await targetProfiles()).find(({ strapiId }) => strapiId === 21)).toMatchObject({
			status: 'published',
			chosenStatus: 'automatic',
			updatedAt: '2026-09-28T10:11:12.131Z',
		})
		expect(third.collections.profiles).toMatchObject({ created: 0, updated: 0 })
	})
})

describe('Un profil sans compte, hors des 13 profils du spam (SCHEMA.md §4.1)', () => {
	const ORPHAN = 200

	beforeAll(() =>
		withOwner(sql =>
			sql.unsafe(
				`INSERT INTO makeup_artistes (id, username, available, pro, created_at, updated_at)
				VALUES (${ORPHAN}, 'ProfilSansCompte', NULL, false, '2026-10-01 08:00:00', '2026-10-01 08:00:00')`
			)
		)
	)

	afterAll(() => withOwner(sql => sql.unsafe(`DELETE FROM makeup_artistes WHERE id = ${ORPHAN}`)))

	test('sans décision, la commande s’arrête avant toute écriture et le nomme par identifiant', async () => {
		const target = await targetProfiles()

		const { code, sortie: output } = await importCommand(['--real', '--decisions', BENCH_DECISION_FILE])

		expect(code, output).toBe(3)
		expect(output).toContain('Import arrêté avant toute écriture')
		expect(output).toContain(
			`Des profils n’ont aucun compte dans la source et ne sont pas parmi les 13 profils du spam (SCHEMA.md §4.1). Profils, par identifiant : 1 (${ORPHAN}).`
		)
		expect(await targetProfiles()).toEqual(target)
	}, 60_000)

	test('avec sa décision, il est écarté et compté, et rien d’autre ne change', async () => {
		const report = await importOnBench('real', {
			decisions: { ...BENCH_DECISIONS, excludedProfiles: [...BENCH_DECISIONS.excludedProfiles, ORPHAN] },
		})

		expect(report.halt).toBeNull()
		expect(report.collections.profiles).toMatchObject({ source: 28, created: 0, updated: 0, excluded: [29, ORPHAN] })
		expect((await targetProfiles()).some(({ strapiId }) => strapiId === ORPHAN)).toBe(false)
	})
})

describe('Un profil dont la table de décision écarte le compte (SCHEMA.md §11)', () => {
	test('sans décision pour ce profil, la commande s’arrête avant toute écriture et le nomme par identifiant', async () => {
		const target = await targetProfiles()
		const folder = mkdtempSync(path.join(tmpdir(), 'decisions-import-'))
		try {
			// The accounts that share one email are decided, profile 29 of account 11 is not.
			const file = path.join(folder, 'decisions.json')
			writeFileSync(file, JSON.stringify({ sharedEmails: [{ accounts: [9, 10, 11, 12], kept: 9 }] }))

			const { code, sortie: output } = await importCommand(['--real', '--decisions', file])

			expect(code, output).toBe(3)
			expect(output).toContain('Import arrêté avant toute écriture')
			expect(output).toContain('Profils, par identifiant : 1 (29).')
			expect(await targetProfiles()).toEqual(target)
		} finally {
			rmSync(folder, { recursive: true, force: true })
		}
	}, 60_000)
})

describe('La lecture publique d’un profil repris', () => {
	test('par son slug, le profil publié donne son nom, sa spécialité et sa description, rien d’autre', async () => {
		const payload = await testPayload()

		const profile = await readPublicProfile(payload, 'zoe-lefevre')

		expect(profile).toMatchObject({
			slug: 'zoe-lefevre',
			nom: 'Zoé Lefèvre',
			specialite: 'Mariage',
			description: String(TAKEN.find(({ id }) => id === 21)?.description),
		})
		// Profile 21 has a phone and an email on the old site: they leave this reading only when she
		// published them (ticket 071), and then they are exactly what the old site holds.
		const target = (await targetProfiles()).find(({ strapiId }) => strapiId === 21)
		const stored = await payload.findByID({ collection: 'profiles', id: target?.id ?? 0, depth: 0 })
		if (stored.publicContact === true) {
			expect(profile?.coordonnees).toEqual({
				telephone: stored.contactDetails?.phone ?? null,
				email: stored.contactDetails?.email ?? null,
			})
		} else {
			expect(profile?.coordonnees).toBeNull()
			const text = JSON.stringify(profile)
			expect(text).not.toContain('06 39 98')
			expect(text).not.toContain('@example.test')
		}
	})

	test('un slug inconnu, une ancienne forme du nom ne donnent rien (le brouillon est lu, en noindex : ticket 104)', async () => {
		const payload = await testPayload()

		expect((await readPublicProfile(payload, 'manon-petit'))?.indexable).toBe(false)
		for (const slug of ['audit-inexistant-zz9', 'Zoe-Lefevre', 'zoé lefèvre', ''])
			expect(await readPublicProfile(payload, slug), slug).toBeNull()
	})

	test('les champs lus sont choisis un par un, et ce sont les seuls que le public lit', async () => {
		const payload = await testPayload()

		expect(Object.keys(PUBLIC_PROFILE_FIELDS).sort()).toEqual([
			'artistName',
			'description',
			'firstName',
			'lastName',
			'slug',
			'specialty',
		])
		const { docs } = await payload.find({
			collection: 'profiles',
			where: { slug: { equals: 'zoe-lefevre' } },
			select: PUBLIC_PROFILE_FIELDS,
			depth: 0,
			overrideAccess: false,
		})
		expect(Object.keys(docs[0] ?? {}).sort()).toEqual([
			'artistName',
			'description',
			'firstName',
			'id',
			'lastName',
			'slug',
			'specialty',
		])
	})
})
