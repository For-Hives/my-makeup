import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import type { Payload } from 'payload'
import { MESSAGE_PANNE_DU_STOCKAGE } from '@/collections/trash'
import { supprimerLeCompteEtToutCeQuiEnDepend } from '@/lib/compte/suppression'
import { MESSAGES_DE_SUPPRESSION } from '@/lib/espace/confirmation-suppression'
import { freinDeLaSuppression, supprimerMonCompte } from '@/lib/espace/supprimer-compte'
import type { Media } from '@/payload-types'
import { type Espion, espionnerLeStockage, suppressionsSansCorbeille } from '../outils/espion-s3'
import { type CompteDeTest, creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { fichierPourFormulaire } from '../outils/photos'
import { appelerRest, formulaireAvecFichier } from '../outils/rest'
import { lireUnObjet, listerLesObjets, viderLeStockage } from '../outils/s3'

// The bench is shared by every checkout of the machine, and a suite under load runs several times slower than alone:
// the default 5 s is passed by the heaviest tests of this file (ticket 225). The delay bounds a call that hangs, it
// is not a duration the test promises. A test that times out leaves its queries running into the next file.
setDefaultTimeout(30_000)

/**
 * She deletes her account (ticket 141; plan 02 I36, I38, E33 in its integration half): the account,
 * the profile, the sessions and the photos (to the bin) go together, a wrong confirmation deletes
 * nothing and is braked, a storage failure leaves everything in place, and two requests at once
 * delete once. Against the S3 simulator of the bench. Every request to the storage is recorded:
 * a removal that is not the second half of a move to the bin fails the test.
 */

const MOT_DE_PASSE = 'un-mot-de-passe-fictif-du-banc'
type Maquilleuse = CompteDeTest<'maquilleuse'>

let espion: Espion
let numero = 0
/** The headers of a request from a made-up client address: each test has its own. */
const depuis = (adresse = `192.0.2.${100 + (++numero % 100)}`) => new Headers({ 'x-forwarded-for': adresse })

beforeEach(() => {
	espion = espionnerLeStockage()
	freinDeLaSuppression.vider()
})

afterEach(async () => {
	const fautes = suppressionsSansCorbeille(espion.journal)
	espion.arreter()
	await Promise.all([viderLaBase(), viderLeStockage()])
	expect(fautes).toEqual([])
})

const maquilleuse = () => creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })

/** A photo sent by this makeup artist through REST, as the site sends it. */
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
	const compte = await maquilleuse()
	const [principale, galerie, libre] = [await envoyer(compte), await envoyer(compte), await envoyer(compte)]
	const profil = await profilDe(compte)
	if (!profil) throw new Error('pas de profil')
	const payload = await payloadDeTest()
	await payload.update({
		collection: 'profiles',
		id: profil.id,
		data: { mainPicture: principale.id, gallery: [principale.id, galerie.id] },
	})
	return { compte, profil, photos: [principale, galerie, libre] }
}

const cle = (media: Media) => `media/${media.filename}`
const present = async (collection: 'pros' | 'profiles' | 'media', id: number | string) =>
	(await (await payloadDeTest()).findByID({ collection, id, depth: 0, disableErrors: true, overrideAccess: true })) !==
	null
const enPlace = async (media: Media) => (await lireUnObjet(cle(media))) !== undefined
const enCorbeille = async (media: Media) => (await lireUnObjet(`deleted/${cle(media)}`)) !== undefined

const supprimer = (payload: Payload, compte: Maquilleuse, confirmation: string, entetes = depuis()) =>
	supprimerMonCompte({ payload, compte, headers: entetes, saisie: { confirmation } })

describe('I36 : tout part avec le compte', () => {
	test('compte, profil, sessions et photos : les documents disparaissent, les objets vont à la corbeille, l’ancien jeton ne vaut plus', async () => {
		const payload = await payloadDeTest()
		const { compte, profil, photos } = await compteGarni()
		const autre = await garnirUnAutre()

		expect(await supprimer(payload, compte, MOT_DE_PASSE)).toEqual({ ok: true })

		expect(await present('pros', compte.id)).toBe(false)
		expect(await present('profiles', profil.id)).toBe(false)
		for (const photo of photos) {
			expect(await present('media', photo.id)).toBe(false)
			expect(await enPlace(photo)).toBe(false)
			expect(await enCorbeille(photo)).toBe(true)
			expect((await fetch(photo.url ?? '')).status).not.toBe(200)
		}
		expect((await payload.auth({ headers: new Headers(compte.session.enTetes) })).user).toBeNull()
		const slugs = await payload.find({ collection: 'profiles', depth: 0, where: { slug: { equals: profil.slug } } })
		expect(slugs.totalDocs).toBe(0)
		expect((await listerLesObjets('deleted/')).length).toBe(photos.length)
		// The others are untouched.
		expect(await present('pros', autre.compte.id)).toBe(true)
		expect(await present('profiles', autre.profil.id)).toBe(true)
		expect(await present('media', autre.photo.id)).toBe(true)
		expect(await enPlace(autre.photo)).toBe(true)
	})

	test('un compte sans profil se supprime aussi ; un compte déjà supprimé n’est pas une erreur', async () => {
		const payload = await payloadDeTest()
		const compte = await creerCompte('maquilleuse-sans-profil', { motDePasse: () => MOT_DE_PASSE })
		expect(
			await supprimerMonCompte({ payload, compte, headers: depuis(), saisie: { confirmation: MOT_DE_PASSE } })
		).toEqual({
			ok: true,
		})
		expect(await present('pros', compte.id)).toBe(false)

		expect(await supprimerLeCompteEtToutCeQuiEnDepend(payload, compte.id)).toEqual({ supprime: false, profils: 0 })
	})

	test('un compte venu de Google se confirme par son adresse, en minuscules ou non, entourée d’espaces', async () => {
		const payload = await payloadDeTest()
		const compte = await creerCompte('reprise-google')

		const refus = await supprimerMonCompte({
			payload,
			compte,
			headers: depuis(),
			saisie: { confirmation: 'autre@example.test' },
		})
		expect(refus).toEqual({ ok: false, message: MESSAGES_DE_SUPPRESSION.email })
		expect(await present('pros', compte.id)).toBe(true)

		const ok = await supprimerMonCompte({
			payload,
			compte,
			headers: depuis(),
			saisie: { confirmation: `  ${compte.email.toUpperCase()} ` },
		})
		expect(ok).toEqual({ ok: true })
		expect(await present('pros', compte.id)).toBe(false)
	})
})

async function garnirUnAutre() {
	const compte = await maquilleuse()
	const photo = await envoyer(compte)
	const profil = await profilDe(compte)
	if (!profil) throw new Error('pas de profil')
	await (await payloadDeTest()).update({ collection: 'profiles', id: profil.id, data: { mainPicture: photo.id } })
	return { compte, profil, photo }
}

describe('Mot de passe faux : rien de supprimé ; essais freinés', () => {
	test('un mauvais mot de passe, un champ vide, une clé en trop : rien ne bouge', async () => {
		const payload = await payloadDeTest()
		const { compte, profil, photos } = await compteGarni()

		expect(await supprimer(payload, compte, 'pas-le-bon')).toEqual({
			ok: false,
			message: MESSAGES_DE_SUPPRESSION.motDePasse,
		})
		expect(await supprimer(payload, compte, '')).toEqual({ ok: false, message: MESSAGES_DE_SUPPRESSION.motDePasse })
		const enTrop = await supprimerMonCompte({
			payload,
			compte,
			headers: depuis(),
			saisie: { confirmation: MOT_DE_PASSE, id: 1 },
		})
		expect(enTrop.ok).toBe(false)

		expect(await present('pros', compte.id)).toBe(true)
		expect(await present('profiles', profil.id)).toBe(true)
		for (const photo of photos) expect(await enPlace(photo)).toBe(true)
		expect((await payload.auth({ headers: new Headers(compte.session.enTetes) })).user).not.toBeNull()
		expect(espion.journal.filter(({ nom }) => nom === 'CopyObject')).toEqual([])
	})

	test('la 11e tentative d’une même adresse est freinée, même avec le bon mot de passe ; une autre adresse est libre mais le compte garde son frein', async () => {
		const payload = await payloadDeTest()
		const { compte } = await compteGarni()
		const entetes = depuis('192.0.2.7')
		for (let i = 0; i < 10; i++) expect((await supprimer(payload, compte, `faux-${i}`, entetes)).ok).toBe(false)

		const freine = await supprimer(payload, compte, MOT_DE_PASSE, entetes)
		expect(freine).toEqual({ ok: false, message: MESSAGES_DE_SUPPRESSION.freine, freine: true })
		expect(await present('pros', compte.id)).toBe(true)

		// Another address: the account itself has used its ten places, so a thief who changes address is braked too.
		const ailleurs = await supprimer(payload, compte, MOT_DE_PASSE, depuis('192.0.2.8'))
		expect(ailleurs).toEqual({ ok: false, message: MESSAGES_DE_SUPPRESSION.freine, freine: true })
		expect(await present('pros', compte.id)).toBe(true)
	})

	test('le frein de la suppression ne bloque pas le compte : la connexion par mot de passe marche encore', async () => {
		const payload = await payloadDeTest()
		const { compte } = await compteGarni()
		for (let i = 0; i < 11; i++) await supprimer(payload, compte, `faux-${i}`, depuis('192.0.2.9'))

		const { ouvrirParMotDePasse } = await import('@/lib/auth/jeton')
		const { token } = await ouvrirParMotDePasse(payload, 'pros', { email: compte.email, password: MOT_DE_PASSE })
		expect(token).toBeTruthy()
	})

	test('le frein d’un compte ne touche pas celui d’un autre', async () => {
		const payload = await payloadDeTest()
		const { compte } = await compteGarni()
		const autre = await maquilleuse()
		for (let i = 0; i < 10; i++) await supprimer(payload, compte, `faux-${i}`, depuis('192.0.2.20'))

		expect(await supprimer(payload, autre, MOT_DE_PASSE, depuis('192.0.2.21'))).toEqual({ ok: true })
	})
})

describe('I38 : panne du stockage, tout est encore là', () => {
	test('la copie vers la corbeille échoue : le message le dit, comptes, profil, photos et session sont intacts ; l’essai suivant réussit', async () => {
		const payload = await payloadDeTest()
		const { compte, profil, photos } = await compteGarni()
		let copies = 0
		// The second object fails: the first has already moved, and must be put back.
		espion.fairePanne(
			commande => commande.nom === 'CopyObject' && String(commande.entree.Key).startsWith('deleted/') && ++copies === 2
		)

		const resultat = await supprimer(payload, compte, MOT_DE_PASSE)

		expect(resultat).toEqual({ ok: false, message: MESSAGES_DE_SUPPRESSION.stockage })
		expect(MESSAGE_PANNE_DU_STOCKAGE).toContain('Le stockage des photos ne répond pas')
		expect(await present('pros', compte.id)).toBe(true)
		expect(await present('profiles', profil.id)).toBe(true)
		for (const photo of photos) {
			expect(await present('media', photo.id)).toBe(true)
			expect(await enPlace(photo)).toBe(true)
			expect((await fetch(photo.url ?? '')).status).toBe(200)
		}
		expect((await payload.auth({ headers: new Headers(compte.session.enTetes) })).user).not.toBeNull()
		expect((await profilDe(compte))?.mainPicture).toBe(photos[0]?.id)

		espion.fairePanne(() => false)
		expect(await supprimer(payload, compte, MOT_DE_PASSE)).toEqual({ ok: true })
		expect(await present('pros', compte.id)).toBe(false)
		for (const photo of photos) expect(await enCorbeille(photo)).toBe(true)
	})
})

describe('Entrée maintenue : une seule suppression', () => {
	test('deux demandes au même instant : une suppression, une seule copie par objet, aucune erreur', async () => {
		const payload = await payloadDeTest()
		const { compte, photos } = await compteGarni()

		const [a, b] = await Promise.all([
			supprimer(payload, compte, MOT_DE_PASSE, depuis('192.0.2.30')),
			supprimer(payload, compte, MOT_DE_PASSE, depuis('192.0.2.30')),
		])

		expect(a).toEqual({ ok: true })
		expect(b.ok).toBe(true)
		expect(await present('pros', compte.id)).toBe(false)
		const copies = espion.journal.filter(
			({ nom, entree }) => nom === 'CopyObject' && String(entree.Key).startsWith('deleted/')
		)
		expect(copies).toHaveLength(photos.length)
	})
})

describe('La suppression reste fermée à la maquilleuse par l’API', () => {
	test('DELETE /api/pros/<id> et /api/profiles/<id> par la propriétaire : 403, rien n’est supprimé', async () => {
		const { compte, profil } = await compteGarni()

		for (const chemin of [`/api/pros/${compte.id}`, `/api/profiles/${profil.id}`]) {
			const { statut } = await appelerRest('DELETE', chemin, { enTetes: compte.session.enTetes })
			expect(statut).toBe(403)
		}

		expect(await present('pros', compte.id)).toBe(true)
		expect(await present('profiles', profil.id)).toBe(true)
	})
})
