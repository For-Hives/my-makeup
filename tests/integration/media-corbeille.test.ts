import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { MESSAGE_PANNE_DU_STOCKAGE, MESSAGE_UN_A_LA_FOIS } from '@/collections/corbeille'
import { CONTEXTE_IMPORT } from '@/lib/contexte-import'
import { remettreEnPlace } from '@/lib/corbeille'
import { serverEnv } from '@/lib/env'
import { stockageS3 } from '@/lib/stockage'
import type { Media } from '@/payload-types'
import { type Espion, espionnerLeStockage, sourceDe, suppressionsSansCorbeille } from '../outils/espion-s3'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { fichierPourFormulaire, fichierPourPayload } from '../outils/photos'
import { appelerRest, formulaireAvecFichier } from '../outils/rest'
import { lireUnObjet, listerLesObjets, viderLeStockage } from '../outils/s3'

/**
 * A media that no longer serves goes to the bin, never to a direct deletion (ticket 045; plan 02
 * §7.3, I24 and I25; plan 01 §1.8). Against the S3 simulator of the bench, through the real API.
 *
 * Every request of the application to the storage is recorded (tests/outils/espion-s3.ts): after
 * each test, a removal that is not the second half of a move to the bin fails it.
 */

type Compte = Awaited<ReturnType<typeof creerCompte<'maquilleuse'>>>

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

/** A photo sent by this makeup artist through REST, as the site sends it. */
async function envoyer(compte: Compte): Promise<Media> {
	const { statut, corps, texte } = await appelerRest('POST', '/api/media?depth=0', {
		enTetes: compte.session.enTetes,
		formulaire: formulaireAvecFichier(fichierPourFormulaire()),
	})
	if (statut !== 201) throw new Error(`L’envoi de la photo a échoué : ${statut} ${texte}`)
	return (corps as { doc: Media }).doc
}

/** The profile of an account, read without access control. */
async function profilDe(compte: { id: number | string }) {
	const payload = await payloadDeTest()
	const [profil] = (await payload.find({ collection: 'profils', depth: 0, where: { pro: { equals: compte.id } } })).docs
	if (!profil) throw new Error('La fabrique n’a pas créé de profil.')
	return profil
}

/** She saves her own profile through REST, as her space will. */
const enregistrer = async (compte: Compte, corps: Record<string, unknown>) =>
	appelerRest('PATCH', `/api/profils/${(await profilDe(compte)).id}?depth=0`, {
		enTetes: compte.session.enTetes,
		corps,
	})

/** Saves it, or fails the test. */
async function enregistrerOuEchouer(compte: Compte, corps: Record<string, unknown>) {
	const { statut, texte } = await enregistrer(compte, corps)
	if (statut !== 200) throw new Error(`Enregistrement refusé : ${statut} ${texte}`)
}

/** The media as the database holds it, or nothing. */
async function stocke(id: number): Promise<Media | null> {
	const payload = await payloadDeTest()
	return payload.findByID({ collection: 'media', id, depth: 0, disableErrors: true })
}

/** The key of the object of a photo sent in the v3. */
const cle = (media: Media) => `media/${media.filename}`

/** The bytes of an object, or nothing when the storage does not hold it. */
const octets = async (cleDeLObjet: string) => (await lireUnObjet(cleDeLObjet))?.octets

/** What its public address answers, as a browser would ask it. */
const statutPublic = async (media: Media) => (await fetch(media.url ?? '')).status

/** The keys of the bin. */
const corbeille = async () => (await listerLesObjets('deleted/')).map(({ cle: cleDeLObjet }) => cleDeLObjet)

describe('Photo remplacée : ancien objet en corbeille (I24) ; photo encore référencée : en place (I25)', () => {
	test('I24 : la photo principale remplacée par la maquilleuse : l’ancienne part à la corbeille, octet pour octet', async () => {
		const compte = await creerCompte('maquilleuse')
		const [ancienne, nouvelle] = [await envoyer(compte), await envoyer(compte)]
		await enregistrerOuEchouer(compte, { photoPrincipale: ancienne.id })
		const avant = await octets(cle(ancienne))

		await enregistrerOuEchouer(compte, { photoPrincipale: nouvelle.id })

		expect((await profilDe(compte)).photoPrincipale).toBe(nouvelle.id)
		expect(await stocke(ancienne.id)).toBeNull()
		expect(await octets(cle(ancienne))).toBeUndefined()
		expect(await octets(`deleted/${cle(ancienne)}`)).toEqual(avant)
		expect(await stocke(nouvelle.id)).not.toBeNull()
		expect(await octets(cle(nouvelle))).toBeDefined()
		expect(await corbeille()).toEqual([`deleted/${cle(ancienne)}`])
	})

	test('I25 : une photo retirée de la galerie part à la corbeille ; celle qui reste photo principale reste en place', async () => {
		const compte = await creerCompte('maquilleuse')
		const [principale, retiree, gardee] = [await envoyer(compte), await envoyer(compte), await envoyer(compte)]
		await enregistrerOuEchouer(compte, {
			photoPrincipale: principale.id,
			galerie: [principale.id, retiree.id, gardee.id],
		})

		await enregistrerOuEchouer(compte, { galerie: [gardee.id] })

		expect(await stocke(retiree.id)).toBeNull()
		expect(await octets(`deleted/${cle(retiree)}`)).toBeDefined()
		for (const media of [principale, gardee]) {
			expect(await stocke(media.id)).not.toBeNull()
			expect(await octets(cle(media))).toBeDefined()
		}
		expect(await corbeille()).toEqual([`deleted/${cle(retiree)}`])
	})

	test('une photo qu’une version d’un article garde encore reste en place, même retirée du profil', async () => {
		const payload = await payloadDeTest()
		const compte = await creerCompte('maquilleuse')
		const remplacante = await envoyer(compte)
		// A photo of the newsroom, in a version of an article only, then given to the account by an admin.
		const photo = await payload.create({ collection: 'media', data: {}, file: fichierPourPayload() })
		const article = await payload.create({
			collection: 'articles',
			data: { title: 'Article fictif', slug: 'article-fictif', galerie: [photo.id], _status: 'published' },
		})
		await payload.update({ collection: 'articles', id: article.id, data: { galerie: [] } })
		await payload.update({ collection: 'media', id: photo.id, data: { owner: Number(compte.id) } })
		await payload.update({
			collection: 'profils',
			id: (await profilDe(compte)).id,
			data: { photoPrincipale: photo.id },
		})

		await enregistrerOuEchouer(compte, { photoPrincipale: remplacante.id })

		expect(await stocke(photo.id)).not.toBeNull()
		expect(await octets(cle(photo))).toBeDefined()
		expect(await corbeille()).toEqual([])
	})

	test('un profil supprimé par un admin : ses photos et celles de son compte partent à la corbeille, pas celles d’une autre', async () => {
		const [a, b, admin] = await Promise.all([
			creerCompte('maquilleuse'),
			creerCompte('maquilleuse'),
			creerCompte('admin'),
		])
		const [principale, galerie, nonRattachee, deB] = [
			await envoyer(a),
			await envoyer(a),
			await envoyer(a),
			await envoyer(b),
		]
		await enregistrerOuEchouer(a, { photoPrincipale: principale.id, galerie: [galerie.id] })
		await enregistrerOuEchouer(b, { photoPrincipale: deB.id })

		const { statut } = await appelerRest('DELETE', `/api/profils/${(await profilDe(a)).id}`, {
			enTetes: admin.session.enTetes,
		})

		expect(statut).toBe(200)
		for (const media of [principale, galerie, nonRattachee]) {
			expect(await stocke(media.id)).toBeNull()
			expect(await octets(cle(media))).toBeUndefined()
		}
		expect((await corbeille()).sort()).toEqual(
			[principale, galerie, nonRattachee].map(media => `deleted/${cle(media)}`).sort()
		)
		expect(await stocke(deB.id)).not.toBeNull()
		expect(await octets(cle(deB))).toBeDefined()
	})

	test('un média supprimé par sa propriétaire : son objet part à la corbeille, il n’est pas effacé', async () => {
		const compte = await creerCompte('maquilleuse')
		const media = await envoyer(compte)
		const avant = await octets(cle(media))

		const { statut } = await appelerRest('DELETE', `/api/media/${media.id}`, { enTetes: compte.session.enTetes })

		expect(statut).toBe(200)
		expect(await octets(cle(media))).toBeUndefined()
		expect(await octets(`deleted/${cle(media)}`)).toEqual(avant)
	})

	test('le fichier d’un média remplacé : l’ancien objet part à la corbeille, le nouveau est en place', async () => {
		const compte = await creerCompte('maquilleuse')
		const media = await envoyer(compte)

		const { statut, corps, texte } = await appelerRest('PATCH', `/api/media/${media.id}?depth=0`, {
			enTetes: compte.session.enTetes,
			formulaire: formulaireAvecFichier(fichierPourFormulaire()),
		})

		expect([statut, texte]).toEqual([200, texte])
		const remplace = (corps as { doc: Media }).doc
		expect(remplace.filename).not.toBe(media.filename)
		expect(await octets(cle(remplace))).toBeDefined()
		expect(await octets(cle(media))).toBeUndefined()
		expect(await corbeille()).toEqual([`deleted/${cle(media)}`])
	})
})

describe('L’adresse publique d’une photo en corbeille ne répond plus 200', () => {
	test('200 tant qu’elle sert ; plus 200 une fois remplacée', async () => {
		const compte = await creerCompte('maquilleuse')
		const [ancienne, nouvelle] = [await envoyer(compte), await envoyer(compte)]
		await enregistrerOuEchouer(compte, { photoPrincipale: ancienne.id })
		expect(await statutPublic(ancienne)).toBe(200)

		await enregistrerOuEchouer(compte, { photoPrincipale: nouvelle.id })

		expect(await statutPublic(ancienne)).not.toBe(200)
		expect(await statutPublic(nouvelle)).toBe(200)
	})
})

describe('Panne du stockage : document et objet intacts, erreur remontée', () => {
	test('le stockage tombe pendant le remplacement : 503 en français ; profil, média et objet comme avant', async () => {
		const compte = await creerCompte('maquilleuse')
		const [ancienne, nouvelle] = [await envoyer(compte), await envoyer(compte)]
		await enregistrerOuEchouer(compte, { photoPrincipale: ancienne.id })
		espion.fairePanne(commande => commande.nom === 'CopyObject')

		const { statut, texte } = await enregistrer(compte, { photoPrincipale: nouvelle.id })

		expect(statut).toBe(503)
		expect(texte).toContain(MESSAGE_PANNE_DU_STOCKAGE)
		expect((await profilDe(compte)).photoPrincipale).toBe(ancienne.id)
		expect(await stocke(ancienne.id)).not.toBeNull()
		expect(await octets(cle(ancienne))).toBeDefined()
		expect(await corbeille()).toEqual([])
		expect(await statutPublic(ancienne)).toBe(200)
	})

	test('la suppression d’un média pendant la panne : refusée en 503, le média et son objet restent', async () => {
		const compte = await creerCompte('maquilleuse')
		const media = await envoyer(compte)
		espion.fairePanne(commande => commande.nom === 'HeadObject')

		const { statut, texte } = await appelerRest('DELETE', `/api/media/${media.id}`, {
			enTetes: compte.session.enTetes,
		})

		expect(statut).toBe(503)
		expect(texte).toContain(MESSAGE_PANNE_DU_STOCKAGE)
		expect(await stocke(media.id)).not.toBeNull()
		expect(await octets(cle(media))).toBeDefined()
	})
})

describe('Panne du stockage : plusieurs documents à la fois sont refusés, rien n’est écrit', () => {
	// Payload commits an operation on several documents (by a `where`) even when one of them fails:
	// media and profiles are deleted and changed one at a time, where a failure undoes everything.

	test('la propriétaire supprime sa photo principale par un filtre, pendant une panne : refusé ; média, objet et profil intacts', async () => {
		const compte = await creerCompte('maquilleuse')
		const photo = await envoyer(compte)
		await enregistrerOuEchouer(compte, { photoPrincipale: photo.id })
		espion.fairePanne(commande => commande.nom === 'HeadObject')
		const avant = espion.journal.length

		const { statut } = await appelerRest('DELETE', `/api/media?where[id][equals]=${photo.id}`, {
			enTetes: compte.session.enTetes,
		})

		expect(statut).toBe(403)
		expect(espion.journal.slice(avant)).toEqual([])
		expect(await stocke(photo.id)).not.toBeNull()
		expect(await octets(cle(photo))).toBeDefined()
		expect((await profilDe(compte)).photoPrincipale).toBe(photo.id)
		expect(await corbeille()).toEqual([])
	})

	test('la propriétaire change sa photo principale par un filtre, pendant une panne : refusé ; le profil garde l’ancienne', async () => {
		const compte = await creerCompte('maquilleuse')
		const [ancienne, nouvelle] = [await envoyer(compte), await envoyer(compte)]
		await enregistrerOuEchouer(compte, { photoPrincipale: ancienne.id })
		const profil = await profilDe(compte)
		espion.fairePanne(commande => commande.nom === 'CopyObject')

		const { statut } = await appelerRest('PATCH', `/api/profils?where[id][equals]=${profil.id}&depth=0`, {
			enTetes: compte.session.enTetes,
			corps: { photoPrincipale: nouvelle.id },
		})

		expect(statut).toBe(403)
		expect((await profilDe(compte)).photoPrincipale).toBe(ancienne.id)
		expect(await stocke(ancienne.id)).not.toBeNull()
		expect(await octets(cle(ancienne))).toBeDefined()
		expect(await corbeille()).toEqual([])
	})

	test('un admin supprime deux profils par un filtre, et le stockage tombe à la troisième copie : refusé ; profils, médias et objets intacts', async () => {
		const [a, b, admin] = await Promise.all([
			creerCompte('maquilleuse'),
			creerCompte('maquilleuse'),
			creerCompte('admin'),
		])
		const [a1, a2, b1, b2] = [await envoyer(a), await envoyer(a), await envoyer(b), await envoyer(b)]
		await enregistrerOuEchouer(a, { photoPrincipale: a1.id, galerie: [a2.id] })
		await enregistrerOuEchouer(b, { photoPrincipale: b1.id, galerie: [b2.id] })
		const [profilA, profilB] = [await profilDe(a), await profilDe(b)]
		let copiesEnCorbeille = 0
		espion.fairePanne(
			commande =>
				commande.nom === 'CopyObject' && String(commande.entree.Key).startsWith('deleted/') && ++copiesEnCorbeille === 3
		)

		const { statut } = await appelerRest('DELETE', `/api/profils?where[id][in]=${profilA.id},${profilB.id}`, {
			enTetes: admin.session.enTetes,
		})

		expect(statut).toBe(403)
		expect([(await profilDe(a)).id, (await profilDe(b)).id]).toEqual([profilA.id, profilB.id])
		for (const media of [a1, a2, b1, b2]) {
			expect(await stocke(media.id)).not.toBeNull()
			expect(await octets(cle(media))).toBeDefined()
		}
		expect(await corbeille()).toEqual([])
	})

	test('par l’API locale, même sans contrôle d’accès : chaque suppression et chaque modification par un filtre est refusée en français', async () => {
		const payload = await payloadDeTest()
		const compte = await creerCompte('maquilleuse')
		const photo = await envoyer(compte)
		await enregistrerOuEchouer(compte, { photoPrincipale: photo.id })
		const profil = await profilDe(compte)
		const media = { collection: 'media', where: { id: { equals: photo.id } } } as const
		const profils = { collection: 'profils', where: { id: { equals: profil.id } } } as const

		for (const operation of [
			() => payload.delete(media),
			() => payload.update({ ...media, data: { alt: 'Texte fictif' } }),
			() => payload.delete(profils),
			() => payload.update({ ...profils, data: { photoPrincipale: null } }),
		])
			await expect(operation()).rejects.toThrow(MESSAGE_UN_A_LA_FOIS)

		const gardee = await stocke(photo.id)
		expect(gardee).not.toBeNull()
		expect(gardee?.alt).not.toBe('Texte fictif')
		expect((await profilDe(compte)).photoPrincipale).toBe(photo.id)
		expect(await octets(cle(photo))).toBeDefined()
		expect(await corbeille()).toEqual([])
	})
})

describe('Un test échoue si une suppression d’objet est appelée ; la remise en place est essayée une fois', () => {
	test('l’espion voit les requêtes du greffon de stockage : un envoi est un PutObject de sa clé', async () => {
		const compte = await creerCompte('maquilleuse')

		const media = await envoyer(compte)

		expect(espion.journal.filter(({ nom }) => nom === 'PutObject').map(({ entree }) => entree.Key)).toEqual([
			cle(media),
		])
	})

	test('la panne au milieu de deux photos : la première, déjà déplacée, est remise en place une fois ; tout est comme avant', async () => {
		const compte = await creerCompte('maquilleuse')
		const [premiere, seconde] = [await envoyer(compte), await envoyer(compte)]
		await enregistrerOuEchouer(compte, { galerie: [premiere.id, seconde.id] })
		let copiesEnCorbeille = 0
		espion.fairePanne(
			commande =>
				commande.nom === 'CopyObject' && String(commande.entree.Key).startsWith('deleted/') && ++copiesEnCorbeille === 2
		)

		const { statut } = await enregistrer(compte, { galerie: [] })

		expect(statut).toBe(503)
		expect((await profilDe(compte)).galerie).toEqual([premiere.id, seconde.id])
		for (const media of [premiere, seconde]) {
			expect(await stocke(media.id)).not.toBeNull()
			expect(await octets(cle(media))).toBeDefined()
			expect(await statutPublic(media)).toBe(200)
		}
		const remises = espion.journal.filter(
			commande => commande.nom === 'CopyObject' && sourceDe(commande).startsWith('deleted/')
		)
		expect(remises).toHaveLength(1)
	})

	test('une photo de la corbeille se remet en place : son adresse répond de nouveau 200, sa copie reste dans la corbeille', async () => {
		const compte = await creerCompte('maquilleuse')
		const [ancienne, nouvelle] = [await envoyer(compte), await envoyer(compte)]
		await enregistrerOuEchouer(compte, { photoPrincipale: ancienne.id })
		await enregistrerOuEchouer(compte, { photoPrincipale: nouvelle.id })
		const stockage = serverEnv().storage
		if (!stockage) throw new Error('Le banc n’a pas de stockage : lance les tests par « bun run test:integration ».')

		const bilan = await remettreEnPlace(stockageS3(stockage), [cle(ancienne)])

		expect(bilan).toEqual({ remises: [cle(ancienne)], nonRemises: [] })
		expect(await statutPublic(ancienne)).toBe(200)
		expect(await corbeille()).toEqual([`deleted/${cle(ancienne)}`])
	})
})

describe('Avec le contexte d’import, rien n’est déplacé', () => {
	test('un profil réécrit par l’import : l’ancienne photo et son média restent, aucun objet ne bouge', async () => {
		const payload = await payloadDeTest()
		const compte = await creerCompte('maquilleuse')
		const [ancienne, nouvelle] = [await envoyer(compte), await envoyer(compte)]
		const profil = await profilDe(compte)
		await payload.update({ collection: 'profils', id: profil.id, data: { photoPrincipale: ancienne.id } })
		const avant = espion.journal.length

		await payload.update({
			collection: 'profils',
			id: profil.id,
			data: { photoPrincipale: nouvelle.id },
			context: CONTEXTE_IMPORT,
		})

		expect((await profilDe(compte)).photoPrincipale).toBe(nouvelle.id)
		expect(await stocke(ancienne.id)).not.toBeNull()
		expect(await octets(cle(ancienne))).toBeDefined()
		expect(espion.journal.slice(avant)).toEqual([])
	})

	test('un média supprimé sous le contexte d’import : son objet reste où il est', async () => {
		const payload = await payloadDeTest()
		const compte = await creerCompte('maquilleuse')
		const media = await envoyer(compte)
		const avant = espion.journal.length

		await payload.delete({ collection: 'media', id: media.id, context: CONTEXTE_IMPORT })

		expect(await stocke(media.id)).toBeNull()
		expect(await octets(cle(media))).toBeDefined()
		expect(espion.journal.slice(avant)).toEqual([])
	})

	test('l’import peut supprimer par un filtre : le média part, son objet reste où il est', async () => {
		const payload = await payloadDeTest()
		const compte = await creerCompte('maquilleuse')
		const media = await envoyer(compte)
		const avant = espion.journal.length

		await payload.delete({ collection: 'media', where: { id: { equals: media.id } }, context: CONTEXTE_IMPORT })

		expect(await stocke(media.id)).toBeNull()
		expect(await octets(cle(media))).toBeDefined()
		expect(espion.journal.slice(avant)).toEqual([])
	})
})
