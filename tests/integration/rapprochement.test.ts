import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import sharp from 'sharp'
import { serverEnv } from '@/lib/env'
import { rapprocherLeStockageEtLaBase } from '@/lib/rapprochement-lecture'
import { listerLeStockage } from '@/lib/stockage'
import type { Media } from '@/payload-types'
import { RACINE } from '../outils/banc'
import { type Espion, espionnerLeStockage } from '../outils/espion-s3'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest, formulaireAvecFichier } from '../outils/rest'
import { deposerUnObjet, listerLesObjets, supprimerUnObjet, viderLeStockage } from '../outils/s3'

/**
 * The dry reconciliation of the storage and the database (ticket 137; plan 02 §7.3 I27, §10.1
 * point 5): the orphans the test lays are named exactly, nothing is changed, and the command a CI
 * step runs exits red on an orphan and green on none.
 */

let espion: Espion

beforeEach(() => {
	espion = espionnerLeStockage()
})

afterEach(async () => {
	espion.arreter()
	await Promise.all([viderLaBase(), viderLeStockage()])
})

const image = () =>
	sharp({ create: { width: 1200, height: 800, channels: 3, background: '#80a0c0' } })
		.webp()
		.toBuffer()

type Compte = Awaited<ReturnType<typeof creerCompte<'maquilleuse'>>>

async function envoyer(compte: Compte): Promise<Media> {
	const fichier = new File([Uint8Array.from(await image())], 'photo.webp', { type: 'image/webp' })
	const { statut, corps, texte } = await appelerRest('POST', '/api/media?depth=0', {
		enTetes: compte.session.enTetes,
		formulaire: formulaireAvecFichier(fichier),
	})
	if (statut !== 201) throw new Error(`L’envoi a échoué : ${statut} ${texte}`)
	return (corps as { doc: Media }).doc
}

/** The honest state: a main photo and a two-photo gallery, all attached to the profile. */
async function etatSain() {
	const compte = await creerCompte('maquilleuse')
	const [principale, galerie1, galerie2] = [await envoyer(compte), await envoyer(compte), await envoyer(compte)]
	const payload = await payloadDeTest()
	const [profil] = (await payload.find({ collection: 'profils', depth: 0, where: { pro: { equals: compte.id } } })).docs
	if (!profil) throw new Error('Pas de profil.')
	const { statut } = await appelerRest('PATCH', `/api/profils/${profil.id}?depth=0`, {
		enTetes: compte.session.enTetes,
		corps: { photoPrincipale: principale.id, galerie: [galerie1.id, galerie2.id] },
	})
	expect(statut).toBe(200)
	return { compte, principale, galerie1, galerie2 }
}

const cles = (media: Media) => [
	`media/${media.filename}`,
	...Object.values(media.sizes ?? {}).flatMap(taille => (taille?.filename ? [`media/${taille.filename}`] : [])),
]

const rapprocher = async () => {
	const storage = serverEnv().storage
	if (!storage) throw new Error('Pas de stockage sur le banc.')
	return rapprocherLeStockageEtLaBase(await payloadDeTest(), () => listerLeStockage(storage))
}

/** The command, in its own process, as the CI step runs it. */
async function commande() {
	const enfant = Bun.spawn([process.execPath, '--no-env-file', 'scripts/medias/rapprochement.ts', '--json'], {
		cwd: RACINE,
		env: process.env,
		stdin: 'ignore',
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const [code, sortie, erreurs] = await Promise.all([
		enfant.exited,
		new Response(enfant.stdout).text(),
		new Response(enfant.stderr).text(),
	])
	return { code, sortie, erreurs }
}

describe('I27 : un état sain rend 0 orphelin ; chaque orphelin posé est nommé exactement', () => {
	test('objets hors corbeille = les objets des photos principales et des galeries, 0 orphelin', async () => {
		const { principale, galerie1, galerie2 } = await etatSain()
		const rapport = await rapprocher()
		expect(rapport).toMatchObject({
			sansOrphelin: true,
			objetsSansMedia: [],
			mediasSansObjet: [],
			mediasSansProfil: [],
		})
		const attendus = [principale, galerie1, galerie2].flatMap(cles).sort()
		expect((await listerLesObjets()).map(({ cle }) => cle).sort()).toEqual(attendus)
		expect(rapport.comptes).toMatchObject({
			objetsHorsCorbeille: attendus.length,
			objetsAttendus: attendus.length,
			objetsEnCorbeille: 0,
			medias: 3,
			mediasUtilises: 3,
		})
		// The original and its derived sizes: more objects than photos.
		expect(attendus.length).toBeGreaterThan(3)
	})

	test('un objet sans média, un média sans objet, un média sans profil : nommés, la corbeille comptée à part', async () => {
		const { compte, principale, galerie1 } = await etatSain()
		const sansProfil = await envoyer(compte)
		await deposerUnObjet('media/orphelin-pose-par-le-test.webp', 'x', { type: 'image/webp' })
		await deposerUnObjet('deleted/media/ancien-pose-par-le-test.webp', 'x', { type: 'image/webp' })
		await supprimerUnObjet(`media/${galerie1.filename}`)

		const rapport = await rapprocher()
		expect(rapport.objetsSansMedia).toEqual(['media/orphelin-pose-par-le-test.webp'])
		expect(rapport.mediasSansObjet).toEqual([{ id: String(galerie1.id), cles: [`media/${galerie1.filename}`] }])
		expect(rapport.mediasSansProfil).toEqual([String(sansProfil.id)])
		expect(rapport.comptes.objetsEnCorbeille).toBe(1)
		expect(rapport.sansOrphelin).toBe(false)
		// The main photo is still whole.
		expect(rapport.mediasSansObjet.map(({ id }) => id)).not.toContain(String(principale.id))
	})

	test('la commande rend le rapport en clés et en comptes, sort en erreur sur un orphelin, en succès sans', async () => {
		await etatSain()
		const propre = await commande()
		expect([propre.code, JSON.parse(propre.sortie).sansOrphelin]).toEqual([0, true])

		await deposerUnObjet('media/orphelin-pose-par-le-test.webp', 'x', { type: 'image/webp' })
		const sale = await commande()
		expect(sale.code).toBe(1)
		expect(JSON.parse(sale.sortie).objetsSansMedia).toEqual(['media/orphelin-pose-par-le-test.webp'])
		// Keys, identifiers and counts only: no address, no email, no account.
		expect(sale.sortie).not.toMatch(/@|https?:/)
	}, 60_000)
})

describe('Stockage et base inchangés ; aucun mode de suppression', () => {
	test('le rapprochement ne laisse ni objet ni ligne différents, et n’envoie que des lectures au stockage', async () => {
		const { compte } = await etatSain()
		await envoyer(compte)
		await deposerUnObjet('media/orphelin-pose-par-le-test.webp', 'x', { type: 'image/webp' })
		const payload = await payloadDeTest()
		const instantane = async () => ({
			objets: await listerLesObjets(),
			medias: (await payload.find({ collection: 'media', depth: 0, pagination: false, sort: 'id' })).docs,
			profils: (await payload.find({ collection: 'profils', depth: 0, pagination: false, sort: 'id' })).docs,
		})
		const avant = await instantane()
		espion.journal.length = 0

		await rapprocher()
		await commande()

		expect(await instantane()).toEqual(avant)
		expect(espion.journal.filter(({ nom }) => !/^(List|Head|Get)/.test(nom))).toEqual([])
		expect(espion.journal.length).toBeGreaterThan(0)
	}, 60_000)
})
