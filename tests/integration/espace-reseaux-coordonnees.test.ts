import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { VueDuProfil } from '@/components/profile/ProfileView'
import { artistProfile, type DashboardUser } from '@/lib/dashboard/my-profile'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { saveContactDetails } from '@/lib/dashboard/save-contact-details'
import { saveNetworks } from '@/lib/dashboard/save-networks'
import { lireLeProfilPublic, listerLesProfils } from '@/services/public/profiles'
import { ANNECY } from '../outils/cas-completude'
import { type CompteDeTest, creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { fichierPourPayload } from '../outils/photos'
import { appelerRest } from '../outils/rest'
import { viderLeStockage } from '../outils/s3'

/**
 * The networks and the contact details saved from her space (tickets 125 and 126; plan 02 U28, U22,
 * E30, E31, I02, I03): « @pseudo » and the address give the same stored value, an address of another
 * site is refused, the date of her choice is the server's, hidden details leave no trace in the
 * public page, and a profile with nothing shown and no network is not publishable. Made-up values only.
 */

afterEach(async () => {
	await Promise.all([viderLaBase(), viderLeStockage()])
})

type Maquilleuse = CompteDeTest<'maquilleuse'>

const TELEPHONE = '06 39 98 12 34'
const EMAIL = 'contact-fictif@example.test'
const VIDES = { instagram: '', facebook: '', youtube: '', linkedin: '', siteWeb: '' }

async function utilisateurDe(payload: Payload, compte: Maquilleuse): Promise<DashboardUser> {
	const doc = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as DashboardUser
}

async function profilStocke(payload: Payload, compte: Maquilleuse) {
	const { docs } = await payload.find({
		collection: 'profiles',
		depth: 0,
		overrideAccess: true,
		where: { pro: { equals: compte.id } },
	})
	const profil = docs[0]
	if (!profil) throw new Error('pas de profil')
	return profil
}

/** A makeup artist with a published profile, and the account as Payload hands it to a request. */
async function maquilleuse() {
	const compte = await creerCompte('maquilleuse')
	const payload = await payloadDeTest()
	const utilisateur = await utilisateurDe(payload, compte)
	const profil = await profilStocke(payload, compte)
	await payload.update({ collection: 'profiles', id: profil.id, data: { specialty: 'Mariage' } })
	return { compte, payload, utilisateur, id: profil.id, slug: profil.slug }
}

describe('125, U28 : « @pseudo » et l’adresse complète donnent la même valeur stockée', () => {
	test('les deux écritures du même compte, enregistrées l’une après l’autre, donnent la même valeur', async () => {
		const { payload, utilisateur, compte } = await maquilleuse()

		const pseudo = await saveNetworks(payload, utilisateur, { ...VIDES, instagram: '@studio.fictif' })
		const stockePseudo = (await profilStocke(payload, compte)).networks?.instagram
		const adresse = await saveNetworks(payload, utilisateur, {
			...VIDES,
			instagram: 'https://www.instagram.com/studio.fictif/',
		})
		const stockeAdresse = (await profilStocke(payload, compte)).networks?.instagram

		expect(pseudo).toMatchObject({ ok: true, valeurs: { instagram: 'https://www.instagram.com/studio.fictif' } })
		expect(adresse).toEqual({ ok: true, valeurs: { ...VIDES, instagram: 'https://www.instagram.com/studio.fictif' } })
		expect(stockePseudo).toBe(stockeAdresse ?? '')
	})

	test('les cinq champs sont écrits ensemble, et rendus tels que la base les a gardés', async () => {
		const { payload, utilisateur, compte } = await maquilleuse()

		const resultat = await saveNetworks(payload, utilisateur, {
			instagram: '@studio.fictif',
			facebook: 'facebook.com/studio.fictif',
			youtube: '@studio.fictif',
			linkedin: 'https://fr.linkedin.com/in/studio-fictif',
			siteWeb: 'studio-fictif.example.test',
		})

		const attendu = {
			instagram: 'https://www.instagram.com/studio.fictif',
			facebook: 'https://www.facebook.com/studio.fictif',
			youtube: 'https://www.youtube.com/@studio.fictif',
			linkedin: 'https://fr.linkedin.com/in/studio-fictif',
			siteWeb: 'https://studio-fictif.example.test/',
		}
		expect(resultat).toEqual({ ok: true, valeurs: attendu })
		const { siteWeb, ...autresReseaux } = attendu
		expect((await profilStocke(payload, compte)).networks).toMatchObject({ ...autresReseaux, website: siteWeb })
		// The card she reads next shows the same values.
		expect((await artistProfile(payload, utilisateur))?.networks).toMatchObject({
			...autresReseaux,
			website: siteWeb,
		})
	})
})

describe('125, E30 et E31 : une adresse d’un autre site est refusée, un champ vidé retire le réseau', () => {
	test('l’adresse de Facebook dans le champ d’Instagram : le message est sous le champ, la base ne bouge pas', async () => {
		const { payload, utilisateur, compte } = await maquilleuse()
		await saveNetworks(payload, utilisateur, { ...VIDES, instagram: '@studio.fictif' })
		const avant = await profilStocke(payload, compte)

		const resultat = await saveNetworks(payload, utilisateur, {
			...VIDES,
			instagram: 'https://www.facebook.com/studio.fictif',
			facebook: '@autre.fictif',
		})

		expect(resultat).toMatchObject({
			ok: false,
			champs: {
				instagram:
					'Cette adresse n’est pas celle d’Instagram : colle l’adresse de ta page Instagram ou écris ton @pseudo.',
			},
		})
		const apres = await profilStocke(payload, compte)
		expect(apres.updatedAt).toBe(avant.updatedAt)
		expect(apres.networks).toEqual(avant.networks)
	})

	test('vider un champ retire le réseau, les autres restent', async () => {
		const { payload, utilisateur, compte } = await maquilleuse()
		await saveNetworks(payload, utilisateur, {
			...VIDES,
			instagram: '@studio.fictif',
			facebook: '@studio.fictif',
		})

		const resultat = await saveNetworks(payload, utilisateur, { ...VIDES, facebook: '@studio.fictif' })

		expect(resultat).toEqual({ ok: true, valeurs: { ...VIDES, facebook: 'https://www.facebook.com/studio.fictif' } })
		const reseaux = (await profilStocke(payload, compte)).networks
		expect(reseaux?.instagram ?? null).toBeNull()
		expect(reseaux?.facebook).toBe('https://www.facebook.com/studio.fictif')
	})

	test('un compte sans profil : le message du site, rien n’est créé', async () => {
		const sansProfil = await creerCompte('maquilleuse-sans-profil')
		const payload = await payloadDeTest()
		const doc = await payload.findByID({ collection: 'pros', id: sansProfil.id, depth: 0, overrideAccess: true })

		const resultat = await saveNetworks(payload, { ...doc, collection: 'pros' } as DashboardUser, {
			...VIDES,
			instagram: '@studio.fictif',
		})

		expect(resultat).toEqual({ ok: false, message: FAILURE_MESSAGE })
		expect((await payload.count({ collection: 'profiles', overrideAccess: true })).totalDocs).toBe(0)
	})

	test.each([
		['status', 'published'],
		['pro', 1],
		['slug', 'pirate'],
		['id', 1],
		['contactPublic', true],
	])('U32, I03 : la clé réservée %s refuse la requête entière', async (cle, valeur) => {
		const { payload, utilisateur, compte } = await maquilleuse()
		const avant = await profilStocke(payload, compte)

		const resultat = await saveNetworks(payload, utilisateur, {
			...VIDES,
			instagram: '@studio.fictif',
			[cle]: valeur,
		})

		expect(resultat).toEqual({ ok: false, message: FAILURE_MESSAGE })
		const apres = await profilStocke(payload, compte)
		expect(apres.updatedAt).toBe(avant.updatedAt)
		expect(apres.slug).toBe(avant.slug)
	})

	test('I02 : elle n’écrit que son profil', async () => {
		const a = await maquilleuse()
		const b = await maquilleuse()

		await saveNetworks(a.payload, a.utilisateur, { ...VIDES, instagram: '@studio.fictif' })

		expect((await profilStocke(b.payload, b.compte)).networks?.instagram ?? null).toBeNull()
	})
})

describe('126 : la maquilleuse choisit d’afficher son téléphone et son email', () => {
	test('sa page lit ses coordonnées, son choix et la date, jamais le compte', async () => {
		const { payload, utilisateur } = await maquilleuse()
		await saveContactDetails(payload, utilisateur, { telephone: TELEPHONE, email: EMAIL, contactPublic: true })

		const lu = await artistProfile(payload, utilisateur)

		expect(lu).toMatchObject({ contactDetails: { phone: TELEPHONE, email: EMAIL }, publicContact: true })
		expect(typeof lu?.consentedAt).toBe('string')
		expect(lu).not.toHaveProperty('pro')
	})

	test('un téléphone ou un email invalide : message sous le champ, la base ne bouge pas (U28, E30)', async () => {
		const { payload, utilisateur, compte } = await maquilleuse()
		const avant = await profilStocke(payload, compte)

		const resultat = await saveContactDetails(payload, utilisateur, {
			telephone: '06 ab',
			email: 'pas-un-email',
			contactPublic: true,
		})

		expect(resultat).toMatchObject({
			ok: false,
			champs: {
				telephone: 'Ce numéro n’est pas valide : écris-le avec des chiffres, par exemple 06 12 34 56 78.',
				email: 'Cet email n’est pas valide : écris-le comme prenom@exemple.fr.',
			},
		})
		const apres = await profilStocke(payload, compte)
		expect(apres.updatedAt).toBe(avant.updatedAt)
		expect(apres.publicContact).toBe(false)
	})

	test('affichage activé : la date est celle du serveur, la source est elle, et la page publique les montre', async () => {
		const { payload, utilisateur, compte, slug } = await maquilleuse()

		const avant = Date.now()
		const resultat = await saveContactDetails(payload, utilisateur, {
			telephone: TELEPHONE,
			email: EMAIL,
			contactPublic: true,
		})
		const apres = Date.now()

		if (!resultat.ok) throw new Error(`refusé : ${resultat.message}`)
		expect(resultat.valeurs).toMatchObject({ telephone: TELEPHONE, email: EMAIL, contactPublic: true })
		const date = Date.parse(resultat.valeurs.consentiLe ?? '')
		expect(date).toBeGreaterThanOrEqual(avant - 1000)
		expect(date).toBeLessThanOrEqual(apres + 1000)
		const stocke = await profilStocke(payload, compte)
		expect(stocke).toMatchObject({ publicContact: true, consentSource: 'artist' })
		expect(stocke.consentedAt).toBe(resultat.valeurs.consentiLe ?? '')

		const profil = await lireLeProfilPublic(payload, slug)
		expect(profil?.coordonnees).toEqual({ telephone: TELEPHONE, email: EMAIL })
		if (!profil) throw new Error('pas de page')
		const html = renderToStaticMarkup(VueDuProfil({ profil }))
		expect(html).toContain(`mailto:${EMAIL}`)
		expect(html).toContain('tel:0639981234')
	})

	test('la date de son choix ne bouge pas à un enregistrement suivant, et elle ne peut pas l’écrire', async () => {
		const { payload, utilisateur } = await maquilleuse()
		const premier = await saveContactDetails(payload, utilisateur, {
			telephone: TELEPHONE,
			email: '',
			contactPublic: true,
		})

		const forge = await saveContactDetails(payload, utilisateur, {
			telephone: TELEPHONE,
			email: '',
			contactPublic: true,
			consentiLe: '2020-01-01T00:00:00.000Z',
		})
		const suivant = await saveContactDetails(payload, utilisateur, {
			telephone: TELEPHONE,
			email: EMAIL,
			contactPublic: true,
		})

		expect(forge).toEqual({ ok: false, message: FAILURE_MESSAGE })
		if (!premier.ok || !suivant.ok) throw new Error('refusé')
		expect(suivant.valeurs.consentiLe).toBe(premier.valeurs.consentiLe ?? '')
	})

	test('affichage coupé : la date est effacée, et la page publique n’a plus rien, ni dans les données ni dans le HTML', async () => {
		const { payload, utilisateur, compte, slug } = await maquilleuse()
		await saveContactDetails(payload, utilisateur, { telephone: TELEPHONE, email: EMAIL, contactPublic: true })

		const resultat = await saveContactDetails(payload, utilisateur, {
			telephone: TELEPHONE,
			email: EMAIL,
			contactPublic: false,
		})

		expect(resultat).toEqual({
			ok: true,
			valeurs: { telephone: TELEPHONE, email: EMAIL, contactPublic: false, consentiLe: null },
		})
		expect(await profilStocke(payload, compte)).toMatchObject({
			publicContact: false,
			consentedAt: null,
			consentSource: null,
		})
		// She keeps what she typed: it is hers, and hidden.
		expect((await profilStocke(payload, compte)).contactDetails).toMatchObject({ phone: TELEPHONE, email: EMAIL })

		const profil = await lireLeProfilPublic(payload, slug)
		if (!profil) throw new Error('pas de page')
		expect(profil.coordonnees).toBeNull()
		expect(JSON.stringify(profil)).not.toContain(EMAIL)
		expect(JSON.stringify(profil)).not.toContain('39 98')
		const html = renderToStaticMarkup(VueDuProfil({ profil }))
		expect(html).not.toContain(EMAIL)
		expect(html).not.toContain('39 98')
		expect(html).not.toContain('tel:')

		const rest = await appelerRest('GET', `/api/profiles?depth=0`)
		expect(rest.texte).not.toContain(EMAIL)
		expect(rest.texte).not.toContain('39 98')
	})

	test('U22 : jamais dans les listes, montrées ou non', async () => {
		const { payload, utilisateur } = await maquilleuse()
		await saveContactDetails(payload, utilisateur, { telephone: TELEPHONE, email: EMAIL, contactPublic: true })

		const liste = await listerLesProfils(payload)

		expect(liste.totalDocs).toBe(1)
		const texte = JSON.stringify(liste)
		expect(texte).not.toContain(EMAIL)
		expect(texte).not.toContain('39 98')
		expect(texte).not.toMatch(/coordonnees|contactPublic|consenti/)
		const rest = await appelerRest('GET', '/api/profiles?depth=0')
		expect(rest.texte).not.toContain(EMAIL)
		expect(rest.texte).not.toContain('contactPublic')
	})

	test('une maquilleuse n’écrit pas les coordonnées d’une autre (I02)', async () => {
		const a = await maquilleuse()
		const b = await maquilleuse()

		await saveContactDetails(a.payload, a.utilisateur, { telephone: TELEPHONE, email: EMAIL, contactPublic: true })

		expect(await profilStocke(b.payload, b.compte)).toMatchObject({ publicContact: false, consentedAt: null })
		expect((await profilStocke(b.payload, b.compte)).contactDetails?.phone ?? null).toBeNull()
	})
})

describe('126 : masquées et aucun réseau, le profil n’est pas publiable', () => {
	/** Everything a publishable profile has, but a channel of contact. */
	async function toutSaufLeContact() {
		const m = await maquilleuse()
		const photo = await m.payload.create({
			collection: 'media',
			data: { owner: Number(m.compte.id) },
			file: fichierPourPayload(),
		})
		await m.payload.update({
			collection: 'profiles',
			id: m.id,
			data: {
				mainPicture: photo.id,
				city: ANNECY,
				specialty: 'Mariage',
				serviceOffers: [{ name: 'Prestation fictive', priceFrom: 80 }],
				description: 'Maquilleuse fictive, pour les essais du banc. '.repeat(5),
			},
		})
		return m
	}
	const publiable = async (m: Awaited<ReturnType<typeof toutSaufLeContact>>) =>
		(await profilStocke(m.payload, m.compte)).publishable

	test('masquées, ses coordonnées ne sont pas un canal ; montrées, elles le sont ; et un réseau suffit', async () => {
		const m = await toutSaufLeContact()
		const coordonnees = { telephone: TELEPHONE, email: EMAIL }

		await saveContactDetails(m.payload, m.utilisateur, { ...coordonnees, contactPublic: false })
		expect(await publiable(m)).toBe(false)

		await saveContactDetails(m.payload, m.utilisateur, { ...coordonnees, contactPublic: true })
		expect(await publiable(m)).toBe(true)

		await saveContactDetails(m.payload, m.utilisateur, { ...coordonnees, contactPublic: false })
		expect(await publiable(m)).toBe(false)

		await saveNetworks(m.payload, m.utilisateur, { ...VIDES, instagram: '@studio.fictif' })
		expect(await publiable(m)).toBe(true)

		await saveNetworks(m.payload, m.utilisateur, VIDES)
		expect(await publiable(m)).toBe(false)
	})
})
