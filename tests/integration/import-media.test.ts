import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { MissingFile } from 'payload'
import { PROFILE_TYPE } from '../../scripts/migration/import/media'
import type { Report } from '../../scripts/migration/import/report'
import type { Media } from '../../src/payload-types'
import { createAccount } from '../support/account-factory'
import { importOnBench } from '../support/import'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'
import { emptyStorage, listObjects, readObject } from '../support/s3'
import { spyStorage } from '../support/s3-spy'
import { benchSource, createSourceStrapi, eraseSourceStrapi, sourceFingerprint } from '../support/source-strapi'
import { sourceDefinition } from '../support/source-strapi/data'

/**
 * Ticket 058: the files a profile or an article the import takes designates become media, adopted
 * where they are, without a copy (docs/migration/SCHEMA.md §4.3 and §8; plan 02 §7.3, I39 and I42).
 * The fake source of the bench puts its objects in the storage of the bench, under `1/` and at the
 * root, as the old site did (docs/tests/source-strapi.md).
 *
 * One import for the whole file: each test reads what it left.
 */

const source = benchSource()
const { lignes: lines, objets: objects } = sourceDefinition(source.medias)

/** The files of the source, by identifier. */
const FILES = new Map(lines.files.map(fichier => [Number(fichier.id), fichier]))

/** The profiles the import takes, with their account: the table of decisions of the bench sets profile 29 aside. */
const PROFILE_ACCOUNT = new Map(
	lines.makeup_artistes_user_links
		.filter(lien => Number(lien.makeup_artiste_id) !== 29)
		.map(lien => [Number(lien.makeup_artiste_id), Number(lien.user_id)])
)

/** The images a profile the import takes designates: 108 is a PDF, 110 and 111 are linked to a profile that no longer exists. */
const ADOPTED = [101, 102, 103, 104, 105, 106, 107, 109]

/** Each object of the bucket, with a fingerprint of its content. */
async function storageState(): Promise<string[]> {
	const state: string[] = []
	for (const { cle: key, taille: size } of await listObjects()) {
		const object = await readObject(key)
		state.push(
			`${key} ${size} ${createHash('sha256')
				.update(object?.octets ?? new Uint8Array())
				.digest('hex')}`
		)
	}
	return state
}

async function targetMedia(): Promise<Media[]> {
	const payload = await testPayload()
	const { docs } = await payload.find({
		collection: 'media',
		depth: 0,
		pagination: false,
		overrideAccess: true,
		sort: 'strapiId',
	})
	return docs
}

let storageBefore: string[] = []
let fingerprintBefore = ''
let dryRun: Report
let first: Report
let storageLog: string[] = []

beforeAll(async () => {
	await emptyBase()
	// Before the source: emptying the bucket would take its objects away.
	await emptyStorage()
	await createSourceStrapi()
	storageBefore = await storageState()
	fingerprintBefore = (await sourceFingerprint()).empreinte
	const spy = spyStorage()
	try {
		dryRun = await importOnBench('dry-run')
		first = await importOnBench()
	} finally {
		spy.arreter()
		storageLog = spy.journal.map(({ nom }) => nom)
	}
}, 60_000)

afterAll(async () => {
	await emptyBase()
	await eraseSourceStrapi()
})

describe('Les photos référencées sont adoptées là où elles sont (ticket 058)', () => {
	test('médias adoptés = fichiers image désignés par un profil repris ; aucun orphelin (I39)', async () => {
		const mediaList = await targetMedia()

		expect(mediaList.map(({ strapiId }) => strapiId)).toEqual(ADOPTED)
		expect(first.collections.media).toMatchObject({ source: 13, created: 8, updated: 0, refused: [] })
		expect(first.collections.media?.files).toEqual({
			pointed: 9,
			ofEntriesNotTaken: 0,
			ofVanishedEntries: 2,
			withoutLink: 2,
			withoutStorage: false,
			notAdopted: [{ file: 108, reason: 'pas-une-image' }],
			notFound: [107],
			differentNames: [],
			uploadedByAnotherAccount: [],
		})
		expect(first.parity?.media).toMatchObject({ expected: 8, equal: 8, different: [], missing: [], extra: [] })
		expect(first.gaps).toMatchObject({ 'SCHEMA.md §8 (size)': 8, 'fichiers-non-images-non-repris': 1 })
		// Each media belongs to the account of the profile that designates it.
		const payload = await testPayload()
		const { docs: accounts } = await payload.find({ collection: 'pros', depth: 0, pagination: false })
		const accountInPayload = new Map(accounts.map(({ id, strapiId }) => [Number(strapiId), id]))
		for (const media of mediaList) {
			const link = lines.files_related_morphs.find(
				l => Number(l.file_id) === media.strapiId && l.related_type === PROFILE_TYPE
			)
			const account = PROFILE_ACCOUNT.get(Number(link?.related_id))
			expect(media.owner, String(media.strapiId)).toBe(accountInPayload.get(account ?? -1) ?? -1)
		}
	})

	test('le passage à blanc annonce les mêmes adoptions et n’écrit rien', () => {
		expect(dryRun.collections.media).toMatchObject({ source: 13, created: 8, updated: 0, refused: [] })
		expect(dryRun.collections.media?.files).toEqual(first.collections.media?.files)
	})

	test('le stockage est identique avant et après : aucune écriture, aucun appel du client S3 de l’application', async () => {
		expect(await storageState()).toEqual(storageBefore)
		expect(storageLog).toEqual([])
		expect((await sourceFingerprint()).empreinte).toBe(fingerprintBefore)
	})

	test('l’adresse publique est l’adresse source, caractère pour caractère, et répond 200 en HEAD (I42)', async () => {
		const sizes = new Map(objects.map(({ cle: key, octets }) => [key, octets.length]))
		for (const media of await targetMedia()) {
			const file = FILES.get(Number(media.strapiId))
			const url = String(file?.url)
			expect(media.url, String(media.strapiId)).toBe(url)
			expect(media.filename).toBe(`${file?.hash}${file?.ext}`)
			expect(media).toMatchObject({
				alt: file?.alternative_text ?? null,
				mimeType: file?.mime,
				width: file?.width,
				height: file?.height,
				strapiFormats: file?.formats ?? null,
			})
			const response = await fetch(url, { method: 'HEAD' })
			if (media.strapiId === 107) {
				expect(response.status).toBe(404)
				expect(media.filesize).toBeNull()
				continue
			}
			expect(response.status, url).toBe(200)
			// The size of the object in bytes, not the rounded kilobytes of Strapi.
			const key = url.slice(source.medias.length + 1)
			expect(media.filesize).toBe(sizes.get(key) ?? -1)
		}
		const prefixes = Object.fromEntries((await targetMedia()).map(({ strapiId, prefix }) => [strapiId, prefix]))
		expect(prefixes).toEqual({ 101: '1', 102: '1', 103: '1', 104: '1', 105: '', 106: '', 107: '1', 109: '1' })
	})

	test('l’objet manquant est listé en « 404 connus » sans bloquer le reste : le profil garde sa photo', async () => {
		const payload = await testPayload()
		const [ines] = (
			await payload.find({
				collection: 'profiles',
				depth: 1,
				where: { strapiId: { equals: 23 } },
				overrideAccess: true,
			})
		).docs
		const photo = ines?.mainPicture as Media | undefined

		expect(photo?.strapiId).toBe(107)
		expect(first.collections.media?.files?.notFound).toEqual([107])
		expect(first.collections.media?.created).toBe(8)
	})

	test('second passage : 0 création, 0 mise à jour', async () => {
		const before = await targetMedia()

		const second = await importOnBench()

		expect(second.collections.media).toMatchObject({ created: 0, updated: 0, unchanged: 8, refused: [] })
		expect(await targetMedia()).toEqual(before)
		expect(await storageState()).toEqual(storageBefore)
	})
})

describe('Seul l’import crée un média sans recevoir de fichier', () => {
	test('une maquilleuse qui envoie un média sans fichier est refusée, comme avant (400)', async () => {
		const account = await createAccount('maquilleuse')

		const { statut: status } = await callRest('POST', '/api/media', {
			enTetes: account.session.enTetes,
			corps: { alt: 'Sans fichier', filename: 'photo.png', prefix: '1' },
		})

		expect(status).toBe(400)
		expect(await targetMedia()).toHaveLength(ADOPTED.length)
	})

	test('le code serveur qui crée un média sans fichier ni nom de fichier est refusé aussi', async () => {
		const payload = await testPayload()

		await expect(payload.create({ collection: 'media', data: { alt: 'Sans fichier' } })).rejects.toBeInstanceOf(
			MissingFile
		)
	})
})
