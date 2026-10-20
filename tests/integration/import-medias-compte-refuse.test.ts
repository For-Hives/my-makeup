import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { randomBytes } from 'node:crypto'
import { PROFILE_TYPE } from '../../scripts/migration/import/media'
import type { Report } from '../../scripts/migration/import/report'
import { NO_PROFILE_CONTEXT } from '../../src/collections/Profiles'
import { creerCompte } from '../outils/fabrique-comptes'
import { importerSurLeBanc } from '../outils/import'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'
import { viderLeStockage } from '../outils/s3'
import { creerLaSourceStrapi, effacerLaSourceStrapi, sourceDuBanc } from '../outils/source-strapi'
import { definitionDeLaSource } from '../outils/source-strapi/donnees'

/**
 * Ticket 058: the photos of an account Payload refuses are not adopted. Written without an owner,
 * they would pass for newsroom photos: the `editor` role could read, change and delete them,
 * and attach them to an article, which makes them public.
 */

const source = sourceDuBanc()
const { lignes } = definitionDeLaSource(source.medias)

/** The account whose email is taken beforehand, so that Payload refuses it. */
const COMPTE_REFUSE = 1

const PROFILS_DU_COMPTE = new Set(
	lignes.makeup_artistes_user_links
		.filter(lien => Number(lien.user_id) === COMPTE_REFUSE)
		.map(lien => Number(lien.makeup_artiste_id))
)

/** The files the profiles of that account designate. */
const FICHIERS_DU_COMPTE = lignes.files_related_morphs
	.filter(lien => lien.related_type === PROFILE_TYPE && PROFILS_DU_COMPTE.has(Number(lien.related_id)))
	.map(lien => Number(lien.file_id))

let rapport: Report

beforeAll(async () => {
	await viderLaBase()
	await viderLeStockage()
	await creerLaSourceStrapi()
	const payload = await payloadDeTest()
	const ligne = lignes.up_users.find(({ id }) => Number(id) === COMPTE_REFUSE)
	await payload.create({
		collection: 'pros',
		data: { email: String(ligne?.email).trim().toLowerCase(), password: randomBytes(24).toString('base64url') },
		context: NO_PROFILE_CONTEXT,
		disableVerificationEmail: true,
		overrideAccess: true,
	})
	rapport = await importerSurLeBanc()
}, 60_000)

afterAll(async () => {
	await viderLaBase()
	await effacerLaSourceStrapi()
})

describe('Un compte que la cible refuse n’emporte pas ses photos (ticket 058, I39)', () => {
	test('le fichier du compte refusé est listé « compte-refuse », jamais écrit, sans média sans propriétaire', async () => {
		expect(FICHIERS_DU_COMPTE.length).toBeGreaterThan(0)
		expect(rapport.collections.pros?.refuses.map(({ strapiId }) => strapiId)).toEqual([COMPTE_REFUSE])
		expect(rapport.collections.media?.refuses).toEqual([])
		const refuses = rapport.collections.media?.fichiers?.nonAdoptes.filter(({ motif }) => motif === 'compte-refuse')
		expect(refuses?.map(({ fichier }) => fichier).sort()).toEqual([...FICHIERS_DU_COMPTE].sort())

		const payload = await payloadDeTest()
		const { docs } = await payload.find({
			collection: 'media',
			depth: 0,
			pagination: false,
			overrideAccess: true,
		})
		const ecrits = docs.map(({ strapiId }) => Number(strapiId))
		for (const fichier of FICHIERS_DU_COMPTE) expect(ecrits).not.toContain(fichier)
		expect(docs.filter(({ owner }) => owner === null || owner === undefined)).toEqual([])
	})

	test('la rédaction ne lit aucune photo de ce compte', async () => {
		const redaction = await creerCompte('redaction')
		const liste = await appelerRest('GET', '/api/media?depth=0&limit=100', { enTetes: redaction.session.enTetes })
		expect(liste.statut).toBe(200)
		expect((liste.corps as { docs: unknown[] }).docs).toEqual([])
	})
})
