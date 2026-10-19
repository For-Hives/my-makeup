import { afterEach, describe, expect, test } from 'bun:test'
import type { Media } from '@/payload-types'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { fichierPourFormulaire, fichierPourPayload, nomDePhoto } from '../outils/photos'
import { appelerRest, formulaireAvecFichier } from '../outils/rest'
import { deposerUnObjet, lireUnObjet, viderLeStockage } from '../outils/s3'

/**
 * The media: their objects in the storage, their owner, their reading, and the photos of a profile
 * (ticket 043; plan 02 §7.3, I04; U56 and U80 through the real API).
 */

afterEach(async () => {
	await Promise.all([viderLaBase(), viderLeStockage()])
})

type Compte = Awaited<ReturnType<typeof creerCompte<'maquilleuse'>>>

/** The base of the photos on the bench: the simulator serves its bucket under its own name. */
const base = () => `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}`

/** A photo sent by this makeup artist through REST, as the site sends it: the media it created. */
async function envoyer(compte: Compte, champs: Record<string, unknown> = {}): Promise<Media> {
	const { statut, corps, texte } = await appelerRest('POST', '/api/media?depth=0', {
		enTetes: compte.session.enTetes,
		formulaire: formulaireAvecFichier(fichierPourFormulaire(), champs),
	})
	if (statut !== 201) throw new Error(`L’envoi de la photo a échoué : ${statut} ${texte}`)
	return (corps as { doc: Media }).doc
}

/** The profile of an account. */
async function profilDe(compte: Compte) {
	const payload = await payloadDeTest()
	const [profil] = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } }))
		.docs
	if (!profil) throw new Error('La fabrique n’a pas créé de profil.')
	return profil
}

/** A makeup artist, her profile in this status, with a main photo and a gallery of her own. */
async function maquilleuseAvecPhotos(statut: 'publie' | 'masque' | 'brouillon') {
	const compte = await creerCompte('maquilleuse')
	const [principale, galerie] = [await envoyer(compte), await envoyer(compte)]
	const profil = await profilDe(compte)
	const payload = await payloadDeTest()
	await payload.update({
		collection: 'profiles',
		id: profil.id,
		data: { statut, photoPrincipale: principale.id, galerie: [galerie.id] },
	})
	return { compte, profil, principale, galerie }
}

/** The media as the database holds it, read without access control. */
async function stocke(id: number): Promise<Media | null> {
	const payload = await payloadDeTest()
	return payload.findByID({ collection: 'media', id, depth: 0, disableErrors: true })
}

describe('Liste anonyme refusée ; média d’un profil publié lu ; d’un profil masqué introuvable (I04, U56)', () => {
	test('la liste : 403 ; la photo principale et la galerie d’un profil publié : 200 ; d’un profil masqué : 404', async () => {
		const publie = await maquilleuseAvecPhotos('publie')
		const masque = await maquilleuseAvecPhotos('masque')

		expect((await appelerRest('GET', '/api/media')).statut).toBe(403)
		for (const media of [publie.principale, publie.galerie]) {
			const { statut, corps } = await appelerRest('GET', `/api/media/${media.id}?depth=0`)
			expect(statut).toBe(200)
			expect(corps).toMatchObject({ id: media.id, url: media.url, filename: media.filename })
			// Who owns it is not public.
			expect(corps).not.toHaveProperty('owner')
		}
		for (const media of [masque.principale, masque.galerie])
			expect((await appelerRest('GET', `/api/media/${media.id}`)).statut).toBe(404)
	})

	test('un profil publié puis masqué : sa photo devient introuvable', async () => {
		const { profil, principale } = await maquilleuseAvecPhotos('publie')
		const admin = await creerCompte('admin')
		expect((await appelerRest('GET', `/api/media/${principale.id}`)).statut).toBe(200)

		// The admin hides it by her choice of status: the status itself is the server's (ticket 044).
		await appelerRest('PATCH', `/api/profiles/${profil.id}`, {
			enTetes: admin.session.enTetes,
			corps: { statutChoisi: 'masque' },
		})

		expect((await appelerRest('GET', `/api/media/${principale.id}`)).statut).toBe(404)
	})

	test('un identifiant mal formé : refusé avant la base, jamais une erreur 500', async () => {
		const [maquilleuse, admin] = await Promise.all([creerCompte('maquilleuse'), creerCompte('admin')])
		const payload = await payloadDeTest()

		for (const enTetes of [{}, maquilleuse.session.enTetes, admin.session.enTetes])
			for (const id of ['abc', 'wp-login.php', '1e999', '99999999999', '1.5']) {
				expect([id, (await appelerRest('GET', `/api/media/${id}`, { enTetes })).statut]).toEqual([id, 403])
				// A change or a deletion: refused by the rule (403), or by Payload itself before it (400), when
				// it reads no identifier at all in the address (`abc` gives NaN, « Missing ID »).
				for (const reponse of [
					await appelerRest('PATCH', `/api/media/${id}`, { enTetes, corps: { alt: 'Texte fictif' } }),
					await appelerRest('DELETE', `/api/media/${id}`, { enTetes }),
				])
					expect([id, [400, 403].includes(reponse.statut)]).toEqual([id, true])
			}
		await expect(payload.findByID({ collection: 'media', id: 'abc', overrideAccess: false })).rejects.toMatchObject({
			status: 403,
		})
	})

	test('une photo envoyée mais rattachée à rien : introuvable pour le public, lue par sa propriétaire', async () => {
		const compte = await creerCompte('maquilleuse')
		const media = await envoyer(compte)

		expect((await appelerRest('GET', `/api/media/${media.id}`)).statut).toBe(404)
		const lecture = await appelerRest('GET', `/api/media/${media.id}?depth=0`, { enTetes: compte.session.enTetes })
		expect(lecture.statut).toBe(200)
		expect(lecture.corps).toMatchObject({ owner: Number(compte.id) })
	})
})

describe('Le propriétaire est la maquilleuse qui envoie, même si elle en déclare un autre', () => {
	test('par REST : le propriétaire déclaré est ignoré', async () => {
		const [a, b] = await Promise.all([creerCompte('maquilleuse'), creerCompte('maquilleuse')])

		const media = await envoyer(a, { alt: 'Une photo fictive', owner: Number(b.id) })

		expect((await stocke(media.id))?.owner).toBe(Number(a.id))
	})

	test('par l’API locale avec les règles actives : de même', async () => {
		const [a, b] = await Promise.all([creerCompte('maquilleuse'), creerCompte('maquilleuse')])
		const payload = await payloadDeTest()
		const utilisateur = await payload.findByID({ collection: 'pros', id: a.id, depth: 0 })

		const media = await payload.create({
			collection: 'media',
			data: { owner: Number(b.id) },
			file: fichierPourPayload(),
			overrideAccess: false,
			user: { ...utilisateur, collection: 'pros' },
		})

		expect((await stocke(media.id))?.owner).toBe(Number(a.id))
	})
})

describe('A ne rattache ni ne supprime un média de B ; galerie de 11 photos refusée', () => {
	test('la photo de B en photo principale ou dans la galerie de A : refusée en français, rien ne change', async () => {
		const [a, b] = await Promise.all([creerCompte('maquilleuse'), creerCompte('maquilleuse')])
		const [sienne, deB] = [await envoyer(a), await envoyer(b)]
		const profil = await profilDe(a)

		for (const corps of [{ photoPrincipale: deB.id }, { galerie: [sienne.id, deB.id] }]) {
			const { statut, texte } = await appelerRest('PATCH', `/api/profiles/${profil.id}`, {
				enTetes: a.session.enTetes,
				corps,
			})
			expect(statut).toBe(400)
			expect(texte).toContain('Choisis à nouveau ta photo')
		}
		expect(await profilDe(a)).toMatchObject({ photoPrincipale: null, galerie: [] })
	})

	test('A supprime la photo de B : refusé, la photo et son objet restent', async () => {
		const [a, b] = await Promise.all([creerCompte('maquilleuse'), creerCompte('maquilleuse')])
		const deB = await envoyer(b)

		const { statut } = await appelerRest('DELETE', `/api/media/${deB.id}`, { enTetes: a.session.enTetes })

		expect([403, 404]).toContain(statut)
		expect(await stocke(deB.id)).not.toBeNull()
		expect(await lireUnObjet(`media/${deB.filename}`)).toBeDefined()
	})

	test('11 photos dans la galerie : refusé ; 10 : enregistrées dans l’ordre donné, gardé à la relecture', async () => {
		const a = await creerCompte('maquilleuse')
		const photos: Media[] = []
		for (let i = 0; i < 11; i += 1) photos.push(await envoyer(a))
		const profil = await profilDe(a)
		const ids = photos.map(({ id }) => id)

		const onze = await appelerRest('PATCH', `/api/profiles/${profil.id}`, {
			enTetes: a.session.enTetes,
			corps: { galerie: ids },
		})
		expect(onze.statut).toBe(400)
		expect(onze.texte).toContain('Ton portfolio contient déjà 10 photos')
		expect((await profilDe(a)).galerie).toEqual([])

		const dix = ids.slice(0, 10).reverse()
		const enregistre = await appelerRest('PATCH', `/api/profiles/${profil.id}`, {
			enTetes: a.session.enTetes,
			corps: { galerie: dix },
		})
		expect(enregistre.statut).toBe(200)
		expect((await profilDe(a)).galerie).toEqual(dix)
	})
})

describe('Adresse publique = préfixe du document + nom de fichier, à la racine comme sous préfixe', () => {
	test('une photo envoyée : rangée sous media/ dans le stockage, son adresse est la base, media/, puis son nom', async () => {
		const a = await creerCompte('maquilleuse')

		const media = await envoyer(a)

		expect(media.prefix).toBe('media')
		expect(media.url).toBe(`${base()}/media/${media.filename}`)
		expect((await lireUnObjet(`media/${media.filename}`))?.type).toBe('image/png')
	})

	test('une photo de l’ancien site adoptée où elle est, à la racine ou sous son préfixe : son adresse suit', async () => {
		const payload = await payloadDeTest()
		const [racine, sousPrefixe] = [nomDePhoto('racine'), nomDePhoto('ancienne')]
		// The objects are already in the storage, as those of the old site: nothing is copied.
		await deposerUnObjet(racine, 'octets fictifs', { type: 'image/png' })
		await deposerUnObjet(`uploads/${sousPrefixe}`, 'octets fictifs', { type: 'image/png' })

		// As the import will adopt them (ticket 058): by the server, without a session, without touching the storage.
		const adopter = (nom: string, prefix: string) =>
			payload.create({
				collection: 'media',
				data: { prefix },
				file: fichierPourPayload(nom),
				context: { skipCloudStorage: true },
			})
		const [aLaRacine, sousSonPrefixe] = [await adopter(racine, ''), await adopter(sousPrefixe, 'uploads')]

		expect(aLaRacine.url).toBe(`${base()}/${racine}`)
		expect(sousSonPrefixe.url).toBe(`${base()}/uploads/${sousPrefixe}`)
		for (const media of [aLaRacine, sousSonPrefixe]) {
			const cle = (media.url ?? '').slice(base().length + 1)
			expect(await lireUnObjet(cle)).toBeDefined()
		}
		// Nothing was written next to them.
		expect(await lireUnObjet(`media/${racine}`)).toBeUndefined()
	})

	test('la route de fichier de Payload renvoie vers l’adresse publique, jamais vers le disque du serveur', async () => {
		const { compte, principale } = await maquilleuseAvecPhotos('publie')
		const [admin, autre] = await Promise.all([creerCompte('admin'), creerCompte('maquilleuse')])
		const chemin = `/api/media/file/${principale.filename}`

		// Her own photo, or any photo for admin: a redirection to its public address.
		for (const lecteur of [compte, admin]) {
			const { statut, enTetes } = await appelerRest('GET', chemin, { enTetes: lecteur.session.enTetes })
			expect(statut).toBe(302)
			expect(enTetes.get('location')).toBe(`${base()}/media/${principale.filename}`)
		}
		// With the prefix Payload accepts in the query: the same.
		const avecPrefixe = await appelerRest('GET', `${chemin}?prefix=media`, { enTetes: admin.session.enTetes })
		expect([avecPrefixe.statut, avecPrefixe.enTetes.get('location')]).toEqual([302, principale.url ?? ''])
		// The route lists no media by name: refused to the public and to another makeup artist.
		expect((await appelerRest('GET', chemin)).statut).toBe(403)
		expect((await appelerRest('GET', chemin, { enTetes: autre.session.enTetes })).statut).toBe(403)
		// A name no media has: not found. A prefix it does not have: refused by Payload itself.
		expect((await appelerRest('GET', '/api/media/file/inconnue.png', { enTetes: admin.session.enTetes })).statut).toBe(
			404
		)
		expect((await appelerRest('GET', `${chemin}?prefix=ailleurs`, { enTetes: admin.session.enTetes })).statut).toBe(403)
	})

	test('une maquilleuse ne choisit ni le préfixe ni le nom de l’objet de sa photo', async () => {
		const a = await creerCompte('maquilleuse')

		const media = await envoyer(a, { prefix: 'ailleurs', filename: 'autre-nom.png', url: 'https://exemple.test/x' })
		const modifie = await appelerRest('PATCH', `/api/media/${media.id}`, {
			enTetes: a.session.enTetes,
			corps: { prefix: '', filename: 'autre-nom.png', alt: 'Nouveau texte' },
		})

		expect(modifie.statut).toBe(200)
		expect(await stocke(media.id)).toMatchObject({
			prefix: 'media',
			filename: media.filename,
			alt: 'Nouveau texte',
		})
		expect(media.url).toBe(`${base()}/media/${media.filename}`)
	})
})
