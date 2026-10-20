import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import type { Payload } from 'payload'
import type { DashboardUser } from '@/lib/dashboard/my-profile'
import { readDashboardPhotos } from '@/lib/dashboard/photos'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { saveMainPicture } from '@/lib/dashboard/save-photo'
import { MESSAGES_DES_PHOTOS } from '@/lib/profile/photos'
import type { Media } from '@/payload-types'
import { lireLeProfilPublic } from '@/services/public/profils'
import { ANNECY } from '../outils/cas-completude'
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
 * The main photo chosen from her space (ticket 134; plan 02 I24, U03, E36 on the server side): the
 * file goes to the media route as the browser sends it, then the action names it. The former photo
 * goes to the bin, the public profile follows, and a failure leaves the former photo.
 *
 * The espionage of the storage fails any test after which an object was erased instead of moved
 * (ticket 045, « à savoir pour la suite »).
 */

type Maquilleuse = CompteDeTest<'maquilleuse'>

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

async function utilisateurDe(payload: Payload, compte: Maquilleuse): Promise<DashboardUser> {
	const doc = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as DashboardUser
}

async function profilDe(compte: Maquilleuse) {
	const payload = await payloadDeTest()
	const [profil] = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } }))
		.docs
	if (!profil) throw new Error('pas de profil')
	return profil
}

/** A makeup artist whose profile has a city and a speciality: only the photo is missing to be active (U03). */
async function maquilleuse(): Promise<Maquilleuse> {
	const compte = await creerCompte('maquilleuse')
	const payload = await payloadDeTest()
	await payload.update({
		collection: 'profiles',
		id: (await profilDe(compte)).id,
		data: { firstName: 'Léa', lastName: 'Fictive', specialty: 'Mariée', city: ANNECY },
	})
	return compte
}

/** A file sent to the media route as the browser sends it. */
async function envoyer(compte: Maquilleuse, alt = 'Photo principale'): Promise<Media> {
	const { statut, corps, texte } = await appelerRest('POST', '/api/media?depth=0', {
		enTetes: compte.session.enTetes,
		formulaire: formulaireAvecFichier(fichierPourFormulaire(), { alt }),
	})
	if (statut !== 201) throw new Error(`Envoi refusé : ${statut} ${texte}`)
	return (corps as { doc: Media }).doc
}

const nombreDeMedias = async () => (await (await payloadDeTest()).count({ collection: 'media' })).totalDocs
const cle = (media: Media) => `media/${media.filename}`

describe('I24 : remplacer la photo principale envoie l’ancienne à la corbeille', () => {
	test('la nouvelle remplace l’ancienne ; ancien objet en deleted/ octet pour octet ; le profil public suit ; « photo » reste remplie', async () => {
		const compte = await maquilleuse()
		const payload = await payloadDeTest()
		const utilisateur = await utilisateurDe(payload, compte)

		const ancienne = await envoyer(compte)
		expect(ancienne.alt).toBe('Photo principale')
		expect(await saveMainPicture(payload, utilisateur, { photoPrincipale: ancienne.id })).toEqual({
			ok: true,
			valeurs: { photoPrincipale: ancienne.id },
		})
		const avant = (await lireUnObjet(cle(ancienne)))?.octets
		expect(avant).toBeDefined()

		const nouvelle = await envoyer(compte)
		expect(await saveMainPicture(payload, utilisateur, { photoPrincipale: String(nouvelle.id) })).toEqual({
			ok: true,
			valeurs: { photoPrincipale: nouvelle.id },
		})

		const profil = await profilDe(compte)
		expect(profil.mainPicture).toBe(nouvelle.id)
		expect(profil.active).toBe(true)
		expect(await payload.findByID({ collection: 'media', id: ancienne.id, depth: 0, disableErrors: true })).toBeNull()
		expect(await lireUnObjet(cle(ancienne))).toBeUndefined()
		expect((await lireUnObjet(`deleted/${cle(ancienne)}`))?.octets).toEqual(avant)
		expect(await lireUnObjet(cle(nouvelle))).toBeDefined()
		// What her space shows, and what the public profile shows, is the new photo.
		const photos = await readDashboardPhotos(payload, profil)
		expect(photos.photo?.id).toBe(nouvelle.id)
		const publique = await lireLeProfilPublic(payload, profil.slug ?? '')
		expect(publique?.photo?.url).toBe(nouvelle.url ?? undefined)
	})
})

describe('U03, E36 : un échec laisse l’ancienne photo, et le fichier envoyé pour rien part à la corbeille', () => {
	test('un envoi refusé (PDF) ne crée rien ; le profil garde sa photo et reste « actif »', async () => {
		const compte = await maquilleuse()
		const payload = await payloadDeTest()
		const ancienne = await envoyer(compte)
		await saveMainPicture(payload, await utilisateurDe(payload, compte), { photoPrincipale: ancienne.id })
		const objets = (await listerLesObjets()).length

		const pdf = new File([Buffer.from('%PDF-1.7\n')], 'cv.pdf', { type: 'application/pdf' })
		const { statut } = await appelerRest('POST', '/api/media?depth=0', {
			enTetes: compte.session.enTetes,
			formulaire: formulaireAvecFichier(pdf),
		})

		expect(statut).toBe(400)
		expect(await nombreDeMedias()).toBe(1)
		expect((await listerLesObjets()).length).toBe(objets)
		const profil = await profilDe(compte)
		expect(profil.mainPicture).toBe(ancienne.id)
		expect(profil.active).toBe(true)
	})

	test('le média d’une autre maquilleuse est refusé ; le profil est inchangé ; le fichier envoyé se supprime sans rien effacer', async () => {
		const compte = await maquilleuse()
		const autre = await maquilleuse()
		const payload = await payloadDeTest()
		const utilisateur = await utilisateurDe(payload, compte)
		const ancienne = await envoyer(compte)
		await saveMainPicture(payload, utilisateur, { photoPrincipale: ancienne.id })
		const celleDeLAutre = await envoyer(autre)
		const envoyeeEnTrop = await envoyer(compte)

		const resultat = await saveMainPicture(payload, utilisateur, { photoPrincipale: celleDeLAutre.id })

		expect(resultat).toMatchObject({ ok: false, champs: { photoPrincipale: MESSAGES_DES_PHOTOS.photoRefusee } })
		expect((await profilDe(compte)).mainPicture).toBe(ancienne.id)
		// The browser takes its own file back, as the panel does after an explicit refusal.
		const suppression = await appelerRest('DELETE', `/api/media/${envoyeeEnTrop.id}?depth=0`, {
			enTetes: compte.session.enTetes,
		})
		expect(suppression.statut).toBe(200)
		expect(await lireUnObjet(cle(envoyeeEnTrop))).toBeUndefined()
		expect(await lireUnObjet(`deleted/${cle(envoyeeEnTrop)}`)).toBeDefined()
		expect((await profilDe(compte)).mainPicture).toBe(ancienne.id)
		expect(await lireUnObjet(cle(celleDeLAutre))).toBeDefined()
	})
})

describe('la requête de l’action est lue strictement', () => {
	test.each([
		['une clé réservée', (id: number) => ({ photoPrincipale: id, status: 'published' })],
		['la galerie', (id: number) => ({ photoPrincipale: id, galerie: [id] })],
		['un identifiant impossible', () => ({ photoPrincipale: 'abc' })],
		['un identifiant décimal', () => ({ photoPrincipale: 1.5 })],
		['un identifiant trop grand', () => ({ photoPrincipale: 2147483648 })],
		['une liste', (id: number) => ({ photoPrincipale: [id] })],
		['rien', () => ({})],
	])('%s : refusé, jamais une erreur serveur, le profil ne bouge pas', async (_nom, saisie) => {
		const compte = await maquilleuse()
		const payload = await payloadDeTest()
		const photo = await envoyer(compte)

		const resultat = await saveMainPicture(payload, await utilisateurDe(payload, compte), saisie(photo.id))

		expect(resultat).toMatchObject({ ok: false })
		if (!resultat.ok) expect([FAILURE_MESSAGE, expect.any(String)]).toContain(resultat.message)
		expect((await profilDe(compte)).mainPicture ?? null).toBeNull()
	})
})
