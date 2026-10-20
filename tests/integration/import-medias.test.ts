import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { MissingFile } from 'payload'
import { TYPE_PROFIL } from '../../scripts/migration/import/media'
import type { Rapport } from '../../scripts/migration/import/report'
import type { Media } from '../../src/payload-types'
import { espionnerLeStockage } from '../outils/espion-s3'
import { creerCompte } from '../outils/fabrique-comptes'
import { importerSurLeBanc } from '../outils/import'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'
import { lireUnObjet, listerLesObjets, viderLeStockage } from '../outils/s3'
import { creerLaSourceStrapi, effacerLaSourceStrapi, empreinteDeLaSource, sourceDuBanc } from '../outils/source-strapi'
import { definitionDeLaSource } from '../outils/source-strapi/donnees'

/**
 * Ticket 058: the files a profile or an article the import takes designates become media, adopted
 * where they are, without a copy (docs/migration/SCHEMA.md §4.3 and §8; plan 02 §7.3, I39 and I42).
 * The fake source of the bench puts its objects in the storage of the bench, under `1/` and at the
 * root, as the old site did (docs/tests/source-strapi.md).
 *
 * One import for the whole file: each test reads what it left.
 */

const source = sourceDuBanc()
const { lignes, objets } = definitionDeLaSource(source.medias)

/** The files of the source, by identifier. */
const FICHIERS = new Map(lignes.files.map(fichier => [Number(fichier.id), fichier]))

/** The profiles the import takes, with their account: the table of decisions of the bench sets profile 29 aside. */
const COMPTE_DU_PROFIL = new Map(
	lignes.makeup_artistes_user_links
		.filter(lien => Number(lien.makeup_artiste_id) !== 29)
		.map(lien => [Number(lien.makeup_artiste_id), Number(lien.user_id)])
)

/** The images a profile the import takes designates: 108 is a PDF, 110 and 111 are linked to a profile that no longer exists. */
const ADOPTES = [101, 102, 103, 104, 105, 106, 107, 109]

/** Each object of the bucket, with a fingerprint of its content. */
async function etatDuStockage(): Promise<string[]> {
	const etat: string[] = []
	for (const { cle, taille } of await listerLesObjets()) {
		const objet = await lireUnObjet(cle)
		etat.push(
			`${cle} ${taille} ${createHash('sha256')
				.update(objet?.octets ?? new Uint8Array())
				.digest('hex')}`
		)
	}
	return etat
}

async function mediasDeLaCible(): Promise<Media[]> {
	const payload = await payloadDeTest()
	const { docs } = await payload.find({
		collection: 'media',
		depth: 0,
		pagination: false,
		overrideAccess: true,
		sort: 'strapiId',
	})
	return docs
}

let stockageAvant: string[] = []
let empreinteAvant = ''
let aBlanc: Rapport
let premier: Rapport
let journalDuStockage: string[] = []

beforeAll(async () => {
	await viderLaBase()
	// Before the source: emptying the bucket would take its objects away.
	await viderLeStockage()
	await creerLaSourceStrapi()
	stockageAvant = await etatDuStockage()
	empreinteAvant = (await empreinteDeLaSource()).empreinte
	const espion = espionnerLeStockage()
	try {
		aBlanc = await importerSurLeBanc('a-blanc')
		premier = await importerSurLeBanc()
	} finally {
		espion.arreter()
		journalDuStockage = espion.journal.map(({ nom }) => nom)
	}
}, 60_000)

afterAll(async () => {
	await viderLaBase()
	await effacerLaSourceStrapi()
})

describe('Les photos référencées sont adoptées là où elles sont (ticket 058)', () => {
	test('médias adoptés = fichiers image désignés par un profil repris ; aucun orphelin (I39)', async () => {
		const medias = await mediasDeLaCible()

		expect(medias.map(({ strapiId }) => strapiId)).toEqual(ADOPTES)
		expect(premier.collections.media).toMatchObject({ source: 13, crees: 8, modifies: 0, refuses: [] })
		expect(premier.collections.media?.fichiers).toEqual({
			designes: 9,
			deEntreesNonPrises: 0,
			deEntreesDisparues: 2,
			sansLien: 2,
			sansStockage: false,
			nonAdoptes: [{ fichier: 108, motif: 'pas-une-image' }],
			introuvables: [107],
			nomsDifferents: [],
			envoyesParUnAutreCompte: [],
		})
		expect(premier.parite?.media).toMatchObject({ attendus: 8, egaux: 8, differents: [], manquants: [], enTrop: [] })
		expect(premier.ecarts).toMatchObject({ 'SCHEMA.md §8 (size)': 8, 'fichiers-non-images-non-repris': 1 })
		// Each media belongs to the account of the profile that designates it.
		const payload = await payloadDeTest()
		const { docs: comptes } = await payload.find({ collection: 'pros', depth: 0, pagination: false })
		const compteEnPayload = new Map(comptes.map(({ id, strapiId }) => [Number(strapiId), id]))
		for (const media of medias) {
			const lien = lignes.files_related_morphs.find(
				l => Number(l.file_id) === media.strapiId && l.related_type === TYPE_PROFIL
			)
			const compte = COMPTE_DU_PROFIL.get(Number(lien?.related_id))
			expect(media.owner, String(media.strapiId)).toBe(compteEnPayload.get(compte ?? -1) ?? -1)
		}
	})

	test('le passage à blanc annonce les mêmes adoptions et n’écrit rien', () => {
		expect(aBlanc.collections.media).toMatchObject({ source: 13, crees: 8, modifies: 0, refuses: [] })
		expect(aBlanc.collections.media?.fichiers).toEqual(premier.collections.media?.fichiers)
	})

	test('le stockage est identique avant et après : aucune écriture, aucun appel du client S3 de l’application', async () => {
		expect(await etatDuStockage()).toEqual(stockageAvant)
		expect(journalDuStockage).toEqual([])
		expect((await empreinteDeLaSource()).empreinte).toBe(empreinteAvant)
	})

	test('l’adresse publique est l’adresse source, caractère pour caractère, et répond 200 en HEAD (I42)', async () => {
		const tailles = new Map(objets.map(({ cle, octets }) => [cle, octets.length]))
		for (const media of await mediasDeLaCible()) {
			const fichier = FICHIERS.get(Number(media.strapiId))
			const adresse = String(fichier?.url)
			expect(media.url, String(media.strapiId)).toBe(adresse)
			expect(media.filename).toBe(`${fichier?.hash}${fichier?.ext}`)
			expect(media).toMatchObject({
				alt: fichier?.alternative_text ?? null,
				mimeType: fichier?.mime,
				width: fichier?.width,
				height: fichier?.height,
				strapiFormats: fichier?.formats ?? null,
			})
			const reponse = await fetch(adresse, { method: 'HEAD' })
			if (media.strapiId === 107) {
				expect(reponse.status).toBe(404)
				expect(media.filesize).toBeNull()
				continue
			}
			expect(reponse.status, adresse).toBe(200)
			// The size of the object in bytes, not the rounded kilobytes of Strapi.
			const cle = adresse.slice(source.medias.length + 1)
			expect(media.filesize).toBe(tailles.get(cle) ?? -1)
		}
		const prefixes = Object.fromEntries((await mediasDeLaCible()).map(({ strapiId, prefix }) => [strapiId, prefix]))
		expect(prefixes).toEqual({ 101: '1', 102: '1', 103: '1', 104: '1', 105: '', 106: '', 107: '1', 109: '1' })
	})

	test('l’objet manquant est listé en « 404 connus » sans bloquer le reste : le profil garde sa photo', async () => {
		const payload = await payloadDeTest()
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
		expect(premier.collections.media?.fichiers?.introuvables).toEqual([107])
		expect(premier.collections.media?.crees).toBe(8)
	})

	test('second passage : 0 création, 0 mise à jour', async () => {
		const avant = await mediasDeLaCible()

		const second = await importerSurLeBanc()

		expect(second.collections.media).toMatchObject({ crees: 0, modifies: 0, inchanges: 8, refuses: [] })
		expect(await mediasDeLaCible()).toEqual(avant)
		expect(await etatDuStockage()).toEqual(stockageAvant)
	})
})

describe('Seul l’import crée un média sans recevoir de fichier', () => {
	test('une maquilleuse qui envoie un média sans fichier est refusée, comme avant (400)', async () => {
		const compte = await creerCompte('maquilleuse')

		const { statut } = await appelerRest('POST', '/api/media', {
			enTetes: compte.session.enTetes,
			corps: { alt: 'Sans fichier', filename: 'photo.png', prefix: '1' },
		})

		expect(statut).toBe(400)
		expect(await mediasDeLaCible()).toHaveLength(ADOPTES.length)
	})

	test('le code serveur qui crée un média sans fichier ni nom de fichier est refusé aussi', async () => {
		const payload = await payloadDeTest()

		await expect(payload.create({ collection: 'media', data: { alt: 'Sans fichier' } })).rejects.toBeInstanceOf(
			MissingFile
		)
	})
})
