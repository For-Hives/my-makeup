import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { randomBytes } from 'node:crypto'
import { PROFILE_TYPE } from '../../scripts/migration/import/media'
import type { Report } from '../../scripts/migration/import/report'
import { NO_PROFILE_CONTEXT } from '../../src/collections/Profiles'
import { createAccount } from '../support/account-factory'
import { importOnBench } from '../support/import'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'
import { emptyStorage } from '../support/s3'
import { benchSource, createSourceStrapi, eraseSourceStrapi } from '../support/source-strapi'
import { sourceDefinition } from '../support/source-strapi/data'

/**
 * Ticket 058: the photos of an account Payload refuses are not adopted. Written without an owner,
 * they would pass for newsroom photos: the `editor` role could read, change and delete them,
 * and attach them to an article, which makes them public.
 */

const source = benchSource()
const { lignes: lines } = sourceDefinition(source.medias)

/** The account whose email is taken beforehand, so that Payload refuses it. */
const REFUSED_ACCOUNT = 1

const ACCOUNT_PROFILES = new Set(
	lines.makeup_artistes_user_links
		.filter(lien => Number(lien.user_id) === REFUSED_ACCOUNT)
		.map(lien => Number(lien.makeup_artiste_id))
)

/** The files the profiles of that account designate. */
const ACCOUNT_FILES = lines.files_related_morphs
	.filter(lien => lien.related_type === PROFILE_TYPE && ACCOUNT_PROFILES.has(Number(lien.related_id)))
	.map(lien => Number(lien.file_id))

let report: Report

beforeAll(async () => {
	await emptyBase()
	await emptyStorage()
	await createSourceStrapi()
	const payload = await testPayload()
	const line = lines.up_users.find(({ id }) => Number(id) === REFUSED_ACCOUNT)
	await payload.create({
		collection: 'pros',
		data: { email: String(line?.email).trim().toLowerCase(), password: randomBytes(24).toString('base64url') },
		context: NO_PROFILE_CONTEXT,
		disableVerificationEmail: true,
		overrideAccess: true,
	})
	report = await importOnBench()
}, 60_000)

afterAll(async () => {
	await emptyBase()
	await eraseSourceStrapi()
})

describe('Un compte que la cible refuse n’emporte pas ses photos (ticket 058, I39)', () => {
	test('le fichier du compte refusé est listé « compte-refuse », jamais écrit, sans média sans propriétaire', async () => {
		expect(ACCOUNT_FILES.length).toBeGreaterThan(0)
		expect(report.collections.pros?.refused.map(({ strapiId }) => strapiId)).toEqual([REFUSED_ACCOUNT])
		expect(report.collections.media?.refused).toEqual([])
		const refuses = report.collections.media?.files?.notAdopted.filter(({ reason: motif }) => motif === 'compte-refuse')
		expect(refuses?.map(({ file }) => file).sort()).toEqual([...ACCOUNT_FILES].sort())

		const payload = await testPayload()
		const { docs } = await payload.find({
			collection: 'media',
			depth: 0,
			pagination: false,
			overrideAccess: true,
		})
		const written = docs.map(({ strapiId }) => Number(strapiId))
		for (const file of ACCOUNT_FILES) expect(written).not.toContain(file)
		expect(docs.filter(({ owner }) => owner === null || owner === undefined)).toEqual([])
	})

	test('la rédaction ne lit aucune photo de ce compte', async () => {
		const editor = await createAccount('redaction')
		const list = await callRest('GET', '/api/media?depth=0&limit=100', { enTetes: editor.session.enTetes })
		expect(list.statut).toBe(200)
		expect((list.corps as { docs: unknown[] }).docs).toEqual([])
	})
})
