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

let spy: Spy

beforeEach(() => {
	spy = spyStorage()
})

afterEach(async () => {
	spy.arreter()
	await Promise.all([emptyBase(), emptyStorage()])
})

const image = () =>
	sharp({ create: { width: 1200, height: 800, channels: 3, background: '#80a0c0' } })
		.webp()
		.toBuffer()

type Account = Awaited<ReturnType<typeof createAccount<'maquilleuse'>>>

async function send(compte: Account): Promise<Media> {
	const file = new File([Uint8Array.from(await image())], 'photo.webp', { type: 'image/webp' })
	const {
		statut: status,
		corps,
		texte: text,
	} = await callRest('POST', '/api/media?depth=0', {
		enTetes: compte.session.enTetes,
		formulaire: formWithFile(file),
	})
	if (status !== 201) throw new Error(`L’envoi a échoué : ${status} ${text}`)
	return (corps as { doc: Media }).doc
}

/** The honest state: a main photo and a two-photo gallery, all attached to the profile. */
async function healthyState() {
	const account = await createAccount('maquilleuse')
	const [main, gallery1, gallery2] = [await send(account), await send(account), await send(account)]
	const payload = await testPayload()
	const [profile] = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } }))
		.docs
	if (!profile) throw new Error('Pas de profil.')
	const { statut: status } = await callRest('PATCH', `/api/profiles/${profile.id}?depth=0`, {
		enTetes: account.session.enTetes,
		corps: { mainPicture: main.id, gallery: [gallery1.id, gallery2.id] },
	})
	expect(status).toBe(200)
	return { compte: account, principale: main, galerie1: gallery1, galerie2: gallery2 }
}

const keys = (media: Media) => [
	`media/${media.filename}`,
	...Object.values(media.sizes ?? {}).flatMap(taille => (taille?.filename ? [`media/${taille.filename}`] : [])),
]

const reconcile = async () => {
	const storage = serverEnv().storage
	if (!storage) throw new Error('Pas de stockage sur le banc.')
	return reconcileStorageAndDatabase(await testPayload(), () => listStorage(storage))
}

/** The command, in its own process, as the CI step runs it. */
async function command() {
	const child = Bun.spawn([process.execPath, '--no-env-file', 'scripts/media/reconciliation.ts', '--json'], {
		cwd: ROOT,
		env: process.env,
		stdin: 'ignore',
		stdout: 'pipe',
		stderr: 'pipe',
	})
	const [code, output, errors] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	])
	return { code, sortie: output, erreurs: errors }
}

describe('I27 : un état sain rend 0 orphelin ; chaque orphelin posé est nommé exactement', () => {
	test('objets hors corbeille = les objets des photos principales et des galeries, 0 orphelin', async () => {
		const { principale: main, galerie1: gallery1, galerie2: gallery2 } = await healthyState()
		const report = await reconcile()
		expect(report).toMatchObject({
			sansOrphelin: true,
			objetsSansMedia: [],
			mediasSansObjet: [],
			mediasSansProfil: [],
		})
		const expected = [main, gallery1, gallery2].flatMap(keys).sort()
		expect((await listObjects()).map(({ cle }) => cle).sort()).toEqual(expected)
		expect(report.comptes).toMatchObject({
			objetsHorsCorbeille: expected.length,
			objetsAttendus: expected.length,
			objetsEnCorbeille: 0,
			medias: 3,
			mediasUtilises: 3,
		})
		// The original and its derived sizes: more objects than photos.
		expect(expected.length).toBeGreaterThan(3)
	})

	test('un objet sans média, un média sans objet, un média sans profil : nommés, la corbeille comptée à part', async () => {
		const { compte: account, principale: main, galerie1: gallery1 } = await healthyState()
		const withoutProfile = await send(account)
		await dropObject('media/orphelin-pose-par-le-test.webp', 'x', { type: 'image/webp' })
		await dropObject('deleted/media/ancien-pose-par-le-test.webp', 'x', { type: 'image/webp' })
		await deleteObject(`media/${gallery1.filename}`)

		const report = await reconcile()
		expect(report.objetsSansMedia).toEqual(['media/orphelin-pose-par-le-test.webp'])
		expect(report.mediasSansObjet).toEqual([{ id: String(gallery1.id), cles: [`media/${gallery1.filename}`] }])
		expect(report.mediasSansProfil).toEqual([String(withoutProfile.id)])
		expect(report.comptes.objetsEnCorbeille).toBe(1)
		expect(report.sansOrphelin).toBe(false)
		// The main photo is still whole.
		expect(report.mediasSansObjet.map(({ id }) => id)).not.toContain(String(main.id))
	})

	test('la commande rend le rapport en clés et en comptes, sort en erreur sur un orphelin, en succès sans', async () => {
		await healthyState()
		const own = await command()
		expect([own.code, JSON.parse(own.sortie).sansOrphelin]).toEqual([0, true])

		await dropObject('media/orphelin-pose-par-le-test.webp', 'x', { type: 'image/webp' })
		const sale = await command()
		expect(sale.code).toBe(1)
		expect(JSON.parse(sale.sortie).objetsSansMedia).toEqual(['media/orphelin-pose-par-le-test.webp'])
		// Keys, identifiers and counts only: no address, no email, no account.
		expect(sale.sortie).not.toMatch(/@|https?:/)
	}, 60_000)
})

describe('Stockage et base inchangés ; aucun mode de suppression', () => {
	test('le rapprochement ne laisse ni objet ni ligne différents, et n’envoie que des lectures au stockage', async () => {
		const { compte: account } = await healthyState()
		await send(account)
		await dropObject('media/orphelin-pose-par-le-test.webp', 'x', { type: 'image/webp' })
		const payload = await testPayload()
		const snapshot = async () => ({
			objets: await listObjects(),
			medias: (await payload.find({ collection: 'media', depth: 0, pagination: false, sort: 'id' })).docs,
			profils: (await payload.find({ collection: 'profiles', depth: 0, pagination: false, sort: 'id' })).docs,
		})
		const before = await snapshot()
		spy.journal.length = 0

		await reconcile()
		await command()

		expect(await snapshot()).toEqual(before)
		expect(spy.journal.filter(({ nom }) => !/^(List|Head|Get)/.test(nom))).toEqual([])
		expect(spy.journal.length).toBeGreaterThan(0)
	}, 60_000)
})
