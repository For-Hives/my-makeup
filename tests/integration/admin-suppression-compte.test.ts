import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { STORAGE_OUTAGE_MESSAGE } from '@/collections/trash'
import type { Media } from '@/payload-types'
import { type Espion, espionnerLeStockage, suppressionsSansCorbeille } from '../support/s3-spy'
import { creerCompte } from '../support/account-factory'
import { payloadDeTest, viderLaBase } from '../support/payload-test'
import { fichierPourFormulaire } from '../support/photos'
import { appelerRest, formulaireAvecFichier } from '../support/rest'
import { lireUnObjet, listerLesObjets, viderLeStockage } from '../support/s3'

// The bench is shared by every checkout of the machine, and a suite under load runs several times slower than alone:
// the default 5 s is passed by the heaviest tests of this file (ticket 225). The delay bounds a call that hangs, it
// is not a duration the test promises. A test that times out leaves its queries running into the next file.
setDefaultTimeout(30_000)

/**
 * The admin deletes the account of a makeup artist (ticket 167; plan 02 I37): the same result as
 * her own deletion (I36), through `DELETE /api/pros/:id`, the route the panel's button calls. The
 * account, the profile, the sessions and the photos (to the bin) go together; nobody else may do
 * it; a failing storage leaves everything in place. Every request to the storage is recorded: a
 * removal that is not the second half of a move to the bin fails the test.
 */

let espion: Espion

beforeEach(() => {
	espion = espionnerLeStockage()
})

afterEach(async () => {
	const fautes = suppressionsSansCorbeille(espion.journal)
	espion.arreter()
	await Promise.all([viderLaBase(), viderLeStockage()])
	expect(fautes).toEqual([])
})

type Maquilleuse = Awaited<ReturnType<typeof creerCompte<'maquilleuse'>>>

async function envoyer(compte: Maquilleuse): Promise<Media> {
	const { statut, corps, texte } = await appelerRest('POST', '/api/media?depth=0', {
		enTetes: compte.session.enTetes,
		formulaire: formulaireAvecFichier(fichierPourFormulaire()),
	})
	if (statut !== 201) throw new Error(`L’envoi de la photo a échoué : ${statut} ${texte}`)
	return (corps as { doc: Media }).doc
}

async function profilDe(compte: { id: number | string }) {
	const payload = await payloadDeTest()
	return (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })).docs[0]
}

/** An account with a profile that names a main photo and a gallery photo, and one more photo nobody names. */
async function compteGarni() {
	const compte = await creerCompte('maquilleuse')
	const [principale, galerie, libre] = [await envoyer(compte), await envoyer(compte), await envoyer(compte)]
	const profil = await profilDe(compte)
	if (!profil) throw new Error('pas de profil')
	await (await payloadDeTest()).update({
		collection: 'profiles',
		id: profil.id,
		data: { mainPicture: principale.id, gallery: [principale.id, galerie.id] },
	})
	return { compte, profil, photos: [principale, galerie, libre] }
}

const present = async (collection: 'pros' | 'profiles' | 'media', id: number | string) =>
	(await (await payloadDeTest()).findByID({ collection, id, depth: 0, disableErrors: true, overrideAccess: true })) !==
	null
const cle = (media: Media) => `media/${media.filename}`
const enPlace = async (media: Media) => (await lireUnObjet(cle(media))) !== undefined
const enCorbeille = async (media: Media) => (await lireUnObjet(`deleted/${cle(media)}`)) !== undefined
const supprimerParAdmin = (admin: { session: { enTetes: Record<string, string> } }, id: number | string) =>
	appelerRest('DELETE', `/api/pros/${id}`, { enTetes: admin.session.enTetes })

describe('I37 : l’admin supprime un compte, le même résultat que la maquilleuse', () => {
	test('compte, profil, sessions, photos : tout part, les objets vont à la corbeille, aucune photo orpheline, les autres comptes intacts', async () => {
		const payload = await payloadDeTest()
		const admin = await creerCompte('admin')
		const { compte, profil, photos } = await compteGarni()
		const autre = await compteGarni()

		const { statut } = await supprimerParAdmin(admin, compte.id)

		expect(statut).toBe(200)
		expect(await present('pros', compte.id)).toBe(false)
		expect(await present('profiles', profil.id)).toBe(false)
		for (const photo of photos) {
			expect(await present('media', photo.id)).toBe(false)
			expect(await enPlace(photo)).toBe(false)
			expect(await enCorbeille(photo)).toBe(true)
		}
		expect((await payload.auth({ headers: new Headers(compte.session.enTetes) })).user).toBeNull()
		expect((await appelerRest('GET', `/api/pros/me`, { enTetes: compte.session.enTetes })).corps).toMatchObject({
			user: null,
		})
		expect(
			(await payload.find({ collection: 'profiles', depth: 0, where: { slug: { equals: profil.slug } } })).totalDocs
		).toBe(0)
		expect((await listerLesObjets('deleted/')).length).toBe(photos.length)

		// No profile without an owner, no photo without one: what remains is the other account's.
		const profils = await payload.find({ collection: 'profiles', depth: 0, pagination: false })
		expect(profils.docs.map(({ id }) => id)).toEqual([autre.profil.id])
		const media = await payload.find({ collection: 'media', depth: 0, pagination: false })
		expect(media.docs.map(({ id }) => id).sort()).toEqual(autre.photos.map(({ id }) => id).sort())
		for (const photo of autre.photos) expect(await enPlace(photo)).toBe(true)
		expect(await present('pros', autre.compte.id)).toBe(true)
	})

	test('un compte sans profil se supprime aussi, et ses photos vont à la corbeille', async () => {
		const admin = await creerCompte('admin')
		const compte = await creerCompte('maquilleuse-sans-profil')
		const photo = await envoyer(compte as unknown as Maquilleuse)

		expect((await supprimerParAdmin(admin, compte.id)).statut).toBe(200)

		expect(await present('pros', compte.id)).toBe(false)
		expect(await present('media', photo.id)).toBe(false)
		expect(await enPlace(photo)).toBe(false)
		expect(await enCorbeille(photo)).toBe(true)
	})

	test('un compte qui n’existe pas : 404 ; deux clics au même instant : une seule suppression', async () => {
		const admin = await creerCompte('admin')
		expect((await supprimerParAdmin(admin, 987654)).statut).toBe(404)

		const { compte, photos } = await compteGarni()
		const reponses = await Promise.all([supprimerParAdmin(admin, compte.id), supprimerParAdmin(admin, compte.id)])

		expect(reponses.map(({ statut }) => statut).sort()).toEqual([200, 200])
		expect(await present('pros', compte.id)).toBe(false)
		const copies = espion.journal.filter(
			({ nom, entree }) => nom === 'CopyObject' && String(entree.Key).startsWith('deleted/')
		)
		expect(copies).toHaveLength(photos.length)
	})
})

describe('Seul l’admin supprime un compte', () => {
	test('la rédaction, une maquilleuse (la sienne ou une autre), un visiteur, un identifiant impossible : 403, rien n’est supprimé', async () => {
		const { compte, profil, photos } = await compteGarni()
		const autre = await creerCompte('maquilleuse')
		const redaction = await creerCompte('redaction')
		const admin = await creerCompte('admin')

		const essais = [
			await appelerRest('DELETE', `/api/pros/${compte.id}`, { enTetes: redaction.session.enTetes }),
			await appelerRest('DELETE', `/api/pros/${compte.id}`, { enTetes: compte.session.enTetes }),
			await appelerRest('DELETE', `/api/pros/${compte.id}`, { enTetes: autre.session.enTetes }),
			await appelerRest('DELETE', `/api/pros/${compte.id}`, {}),
			await appelerRest('DELETE', `/api/pros/abc`, { enTetes: admin.session.enTetes }),
		]

		expect(essais.map(({ statut }) => statut)).toEqual([403, 403, 403, 403, 403])
		expect(await present('pros', compte.id)).toBe(true)
		expect(await present('profiles', profil.id)).toBe(true)
		for (const photo of photos) expect(await enPlace(photo)).toBe(true)
		expect(espion.journal.filter(({ nom }) => nom === 'CopyObject')).toEqual([])
	})

	test('la suppression de plusieurs comptes à la fois est refusée, même à l’admin ; la suppression native refuse un compte qui a encore un profil', async () => {
		const payload = await payloadDeTest()
		const admin = await creerCompte('admin')
		const { compte, profil } = await compteGarni()

		const lot = await appelerRest('DELETE', `/api/pros?where[email][exists]=true`, { enTetes: admin.session.enTetes })
		expect(lot.statut).toBeGreaterThanOrEqual(400)
		await expect(payload.delete({ collection: 'pros', id: compte.id, overrideAccess: true })).rejects.toMatchObject({
			status: 409,
		})

		expect(await present('pros', compte.id)).toBe(true)
		expect(await present('profiles', profil.id)).toBe(true)
	})
})

describe('Panne du stockage : tout est encore là', () => {
	test('la copie vers la corbeille échoue : 503 en français, rien n’est supprimé ; l’essai suivant réussit', async () => {
		const payload = await payloadDeTest()
		const admin = await creerCompte('admin')
		const { compte, profil, photos } = await compteGarni()
		let copies = 0
		espion.fairePanne(
			commande => commande.nom === 'CopyObject' && String(commande.entree.Key).startsWith('deleted/') && ++copies === 2
		)

		const { statut, texte } = await supprimerParAdmin(admin, compte.id)

		expect(statut).toBe(503)
		expect(texte).toContain(STORAGE_OUTAGE_MESSAGE)
		expect(await present('pros', compte.id)).toBe(true)
		expect(await present('profiles', profil.id)).toBe(true)
		for (const photo of photos) {
			expect(await present('media', photo.id)).toBe(true)
			expect(await enPlace(photo)).toBe(true)
		}
		expect((await payload.auth({ headers: new Headers(compte.session.enTetes) })).user).not.toBeNull()

		espion.fairePanne(() => false)
		expect((await supprimerParAdmin(admin, compte.id)).statut).toBe(200)
		for (const photo of photos) expect(await enCorbeille(photo)).toBe(true)
	})
})
