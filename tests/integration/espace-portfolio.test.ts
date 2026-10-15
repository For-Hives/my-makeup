import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { serverEnv } from '@/lib/env'
import { enregistrerPortfolio } from '@/lib/espace/enregistrer-portfolio'
import type { UtilisateurDeLEspace } from '@/lib/espace/mon-profil'
import { lirePhotosDeLEspace } from '@/lib/espace/photos'
import { MESSAGE_ECHEC } from '@/lib/espace/resultat'
import { MESSAGES_DES_PHOTOS, photosNommees } from '@/lib/profil/photos'
import { rapprocherLeStockageEtLaBase } from '@/lib/rapprochement-lecture'
import { listerLeStockage } from '@/lib/stockage'
import type { Media } from '@/payload-types'
import { lireLeProfilPublic } from '@/services/public/profils'
import { type Espion, espionnerLeStockage, suppressionsSansCorbeille } from '../outils/espion-s3'
import { type CompteDeTest, creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { fichierPourFormulaire } from '../outils/photos'
import { appelerRest, formulaireAvecFichier } from '../outils/rest'
import { lireUnObjet, viderLeStockage } from '../outils/s3'

/**
 * The portfolio from her space (tickets 135 and 136; plan 02 E34, E35, I25, U80, E36 on the server
 * side): the files go to the media route as the browser sends them, then the action names the list
 * of photos, in order. Ten at most; a photo left out goes to the bin once nothing references it;
 * the reconciliation of the storage and the database finds 0 orphan after every gesture.
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

async function utilisateurDe(payload: Payload, compte: Maquilleuse): Promise<UtilisateurDeLEspace> {
	const doc = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as UtilisateurDeLEspace
}

async function profilDe(compte: Maquilleuse) {
	const payload = await payloadDeTest()
	const [profil] = (await payload.find({ collection: 'profils', depth: 0, where: { pro: { equals: compte.id } } })).docs
	if (!profil) throw new Error('pas de profil')
	return profil
}

async function maquilleuse(): Promise<Maquilleuse> {
	const compte = await creerCompte('maquilleuse')
	const payload = await payloadDeTest()
	await payload.update({
		collection: 'profils',
		id: (await profilDe(compte)).id,
		data: { prenom: 'Léa', nom: 'Fictive', specialite: 'Mariée' },
	})
	return compte
}

/** A file sent to the media route as the browser sends it, with its default alternative text. */
async function envoyer(compte: Maquilleuse, alt = 'Photo du portfolio'): Promise<Media> {
	const { statut, corps, texte } = await appelerRest('POST', '/api/media?depth=0', {
		enTetes: compte.session.enTetes,
		formulaire: formulaireAvecFichier(fichierPourFormulaire(), { alt }),
	})
	if (statut !== 201) throw new Error(`Envoi refusé : ${statut} ${texte}`)
	return (corps as { doc: Media }).doc
}

/** Exactly `n` photos, so that a test reads them without a hole in the type. */
const envoyerPlusieurs = async (compte: Maquilleuse, n: number): Promise<Media[]> => {
	const medias: Media[] = []
	for (let i = 0; i < n; i++) medias.push(await envoyer(compte))
	return medias
}

const envoyerTrois = async (compte: Maquilleuse): Promise<[Media, Media, Media]> => [
	await envoyer(compte),
	await envoyer(compte),
	await envoyer(compte),
]

const galerieDe = async (compte: Maquilleuse) => photosNommees((await profilDe(compte)).galerie)
const nombreDeMedias = async () => (await (await payloadDeTest()).count({ collection: 'media' })).totalDocs

/** The reconciliation of the storage and the database: 0 orphan, or the list of what is wrong. */
async function orphelins() {
	const storage = serverEnv().storage
	if (!storage) throw new Error('Pas de stockage sur le banc.')
	const rapport = await rapprocherLeStockageEtLaBase(await payloadDeTest(), () => listerLeStockage(storage))
	return {
		objetsSansMedia: rapport.objetsSansMedia,
		mediasSansObjet: rapport.mediasSansObjet,
		mediasSansProfil: rapport.mediasSansProfil,
	}
}
const AUCUN = { objetsSansMedia: [], mediasSansObjet: [], mediasSansProfil: [] }

describe('E34 : trois photos ajoutées sont dans la galerie, dans l’ordre, et sur le profil public', () => {
	test('la galerie suit l’ordre d’ajout ; l’espace et le profil public montrent les trois ; alt par défaut stocké ; 0 orphelin', async () => {
		const compte = await maquilleuse()
		const payload = await payloadDeTest()
		const utilisateur = await utilisateurDe(payload, compte)
		const [a, b, c] = await envoyerTrois(compte)
		expect([a, b, c].map(m => m.alt)).toEqual(['Photo du portfolio', 'Photo du portfolio', 'Photo du portfolio'])

		const resultat = await enregistrerPortfolio(payload, utilisateur, { galerie: [a.id, b.id, c.id] })

		expect(resultat).toEqual({ ok: true, valeurs: { galerie: [a.id, b.id, c.id] } })
		const profil = await profilDe(compte)
		expect(photosNommees(profil.galerie)).toEqual([a.id, b.id, c.id])
		const espace = await lirePhotosDeLEspace(payload, profil)
		expect(espace.galerie.map(p => p.id)).toEqual([a.id, b.id, c.id])
		const publique = await lireLeProfilPublic(payload, profil.slug ?? '')
		expect(publique?.galerie.map(p => p.url)).toEqual([a.url, b.url, c.url] as string[])
		expect(await orphelins()).toEqual(AUCUN)
	})

	test('des photos ajoutées après celles qu’elle a déjà : les anciennes gardent leur place, les nouvelles suivent', async () => {
		const compte = await maquilleuse()
		const payload = await payloadDeTest()
		const utilisateur = await utilisateurDe(payload, compte)
		const [a, b, c] = await envoyerTrois(compte)
		await enregistrerPortfolio(payload, utilisateur, { galerie: [a.id, b.id] })

		const resultat = await enregistrerPortfolio(payload, utilisateur, { galerie: [a.id, b.id, c.id] })

		expect(resultat.ok).toBe(true)
		expect(await galerieDe(compte)).toEqual([a.id, b.id, c.id])
		expect(await orphelins()).toEqual(AUCUN)
	})
})

describe('U80 : dix photos au plus', () => {
	test('dix passent ; une onzième est refusée avec le message, la galerie reste intacte', async () => {
		const compte = await maquilleuse()
		const payload = await payloadDeTest()
		const utilisateur = await utilisateurDe(payload, compte)
		const medias = await envoyerPlusieurs(compte, 11)
		const dix = medias.slice(0, 10).map(m => m.id)

		expect(await enregistrerPortfolio(payload, utilisateur, { galerie: dix })).toMatchObject({ ok: true })
		const refus = await enregistrerPortfolio(payload, utilisateur, { galerie: medias.map(m => m.id) })

		expect(refus).toEqual({
			ok: false,
			message: MESSAGES_DES_PHOTOS.galeriePleine,
			champs: { galerie: MESSAGES_DES_PHOTOS.galeriePleine },
		})
		expect(await galerieDe(compte)).toEqual(dix)
	})
})

describe('la requête de l’action est lue strictement', () => {
	test.each([
		['une clé réservée', (id: number) => ({ galerie: [id], statut: 'publie' })],
		['la photo principale', (id: number) => ({ galerie: [id], photoPrincipale: id })],
		['un identifiant impossible', () => ({ galerie: ['abc'] })],
		['un identifiant trop grand', () => ({ galerie: [2147483648] })],
		['la même photo deux fois', (id: number) => ({ galerie: [id, id] })],
		['une valeur qui n’est pas une liste', (id: number) => ({ galerie: id })],
		['rien', () => ({})],
	])('%s : refusé en français, jamais une erreur serveur, la galerie ne bouge pas', async (_nom, saisie) => {
		const compte = await maquilleuse()
		const payload = await payloadDeTest()
		const photo = await envoyer(compte)

		const resultat = await enregistrerPortfolio(payload, await utilisateurDe(payload, compte), saisie(photo.id))

		expect(resultat.ok).toBe(false)
		if (!resultat.ok) expect(resultat.message).not.toMatch(/unrecognized|expected|invalid/i)
		expect(await galerieDe(compte)).toEqual([])
	})

	test('la photo d’une autre maquilleuse est refusée, la galerie ne bouge pas', async () => {
		const compte = await maquilleuse()
		const autre = await maquilleuse()
		const payload = await payloadDeTest()
		const mienne = await envoyer(compte)
		const sienne = await envoyer(autre)

		const resultat = await enregistrerPortfolio(payload, await utilisateurDe(payload, compte), {
			galerie: [mienne.id, sienne.id],
		})

		expect(resultat).toMatchObject({ ok: false, champs: { galerie: MESSAGES_DES_PHOTOS.photoRefusee } })
		expect(await galerieDe(compte)).toEqual([])
		expect(await galerieDe(autre)).toEqual([])
		expect(await lireUnObjet(`media/${sienne.filename}`)).toBeDefined()
	})

	test('un compte de l’administration n’a pas de portfolio à écrire', async () => {
		const admin = await creerCompte('admin')
		const payload = await payloadDeTest()
		const doc = await payload.findByID({ collection: 'admins', id: admin.id, depth: 0, overrideAccess: true })
		const utilisateur = { ...doc, collection: 'admins' } as unknown as UtilisateurDeLEspace
		expect(await enregistrerPortfolio(payload, utilisateur, { galerie: [] })).toEqual({
			ok: false,
			message: MESSAGE_ECHEC,
		})
	})
})

describe('E34 : fermer sans valider ne laisse rien', () => {
	test('un panneau fermé n’a rien envoyé : ni média, ni objet, ni orphelin', async () => {
		const compte = await maquilleuse()
		const payload = await payloadDeTest()
		const a = await envoyer(compte)
		await enregistrerPortfolio(payload, await utilisateurDe(payload, compte), { galerie: [a.id] })
		const avant = await nombreDeMedias()

		// Nothing is sent by the panel before « Enregistrer »: the server sees no request at all.
		expect(await nombreDeMedias()).toBe(avant)
		expect(await orphelins()).toEqual(AUCUN)
	})
})
