import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import sharp from 'sharp'
import { serverEnv } from '@/lib/env'
import { reconcileStorageAndDatabase } from '@/lib/reconciliation-read'
import { listStorage } from '@/lib/storage'
import type { Media } from '@/payload-types'
import { createAccount } from '../support/account-factory'
import { ROOT } from '../support/bench'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest, formWithFile } from '../support/rest'
import { deleteObject, dropObject, emptyStorage, listObjects } from '../support/s3'
import { type Spy, spyStorage } from '../support/s3-spy'

// The bench is shared by every checkout of the machine, and a suite under load runs several times slower than alone:
// the default 5 s is passed by the heaviest tests of this file (ticket 225). The delay bounds a call that hangs, it
// is not a duration the test promises. A test that times out leaves its queries running into the next file.
setDefaultTimeout(30_000)

/**
 * The dry reconciliation of the storage and the database (ticket 137; plan 02 §7.3 I27, §10.1
 * point 5): the orphans the test lays are named exactly, nothing is changed, and the command a CI
 * step runs exits red on an orphan and green on none.
 */

let espion: Spy

beforeEach(() => {
	espion = spyStorage()
})

afterEach(async () => {
	espion.arreter()
	await Promise.all([emptyBase(), emptyStorage()])
})

const image = () =>
	sharp({ create: { width: 1200, height: 800, channels: 3, background: '#80a0c0' } })
		.webp()
		.toBuffer()

type Compte = Awaited<ReturnType<typeof createAccount<'maquilleuse'>>>

async function envoyer(compte: Compte): Promise<Media> {
	const fichier = new File([Uint8Array.from(await image())], 'photo.webp', { type: 'image/webp' })
	const { statut, corps, texte } = await callRest('POST', '/api/media?depth=0', {
		enTetes: compte.session.enTetes,
		formulaire: formWithFile(fichier),
	})
	if (statut !== 201) throw new Error(`L’envoi a échoué : ${statut} ${texte}`)
	return (corps as { doc: Media }).doc
}

/** The honest state: a main photo and a two-photo gallery, all attached to the profile. */
async function etatSain() {
	const compte = await createAccount('maquilleuse')
	const [principale, galerie1, galerie2] = [await envoyer(compte), await envoyer(compte), await envoyer(compte)]
	const payload = await testPayload()
	const [profil] = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } }))
		.docs
	if (!profil) throw new Error('Pas de profil.')
	const { statut } = await callRest('PATCH', `/api/profiles/${profil.id}?depth=0`, {
		enTetes: compte.session.enTetes,
		corps: { mainPicture: principale.id, gallery: [galerie1.id, galerie2.id] },
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
	return reconcileStorageAndDatabase(await testPayload(), () => listStorage(storage))
}

/** The command, in its own process, as the CI step runs it. */
async function commande() {
	const enfant = Bun.spawn([process.execPath, '--no-env-file', 'scripts/media/reconciliation.ts', '--json'], {
		cwd: ROOT,
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
		expect((await listObjects()).map(({ cle }) => cle).sort()).toEqual(attendus)
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
		await dropObject('media/orphelin-pose-par-le-test.webp', 'x', { type: 'image/webp' })
		await dropObject('deleted/media/ancien-pose-par-le-test.webp', 'x', { type: 'image/webp' })
		await deleteObject(`media/${galerie1.filename}`)

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

		await dropObject('media/orphelin-pose-par-le-test.webp', 'x', { type: 'image/webp' })
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
		await dropObject('media/orphelin-pose-par-le-test.webp', 'x', { type: 'image/webp' })
		const payload = await testPayload()
		const instantane = async () => ({
			objets: await listObjects(),
			medias: (await payload.find({ collection: 'media', depth: 0, pagination: false, sort: 'id' })).docs,
			profils: (await payload.find({ collection: 'profiles', depth: 0, pagination: false, sort: 'id' })).docs,
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
