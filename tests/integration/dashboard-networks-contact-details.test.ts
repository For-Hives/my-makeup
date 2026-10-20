import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfileView } from '@/components/profile/ProfileView'
import { artistProfile, type DashboardUser } from '@/lib/dashboard/my-profile'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { saveContactDetails } from '@/lib/dashboard/save-contact-details'
import { saveNetworks } from '@/lib/dashboard/save-networks'
import { listProfiles, readPublicProfile } from '@/services/public/profiles'
import { createAccount, type TestAccount } from '../support/account-factory'
import { ANNECY } from '../support/completeness-cases'
import { emptyBase, testPayload } from '../support/payload-test'
import { fileForPayload } from '../support/photos'
import { callRest } from '../support/rest'
import { emptyStorage } from '../support/s3'

/**
 * The networks and the contact details saved from her space (tickets 125 and 126; plan 02 U28, U22,
 * E30, E31, I02, I03): « @pseudo » and the address give the same stored value, an address of another
 * site is refused, the date of her choice is the server's, hidden details leave no trace in the
 * public page, and a profile with nothing shown and no network is not publishable. Made-up values only.
 */

afterEach(async () => {
	await Promise.all([emptyBase(), emptyStorage()])
})

type Artist = TestAccount<'maquilleuse'>

const PHONE = '06 39 98 12 34'
const EMAIL = 'contact-fictif@example.test'
const EMPTY = { instagram: '', facebook: '', youtube: '', linkedin: '', siteWeb: '' }

async function userOf(payload: Payload, compte: Artist): Promise<DashboardUser> {
	const doc = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as DashboardUser
}

async function storedProfile(payload: Payload, compte: Artist) {
	const { docs } = await payload.find({
		collection: 'profiles',
		depth: 0,
		overrideAccess: true,
		where: { pro: { equals: compte.id } },
	})
	const profile = docs[0]
	if (!profile) throw new Error('pas de profil')
	return profile
}

/** A makeup artist with a published profile, and the account as Payload hands it to a request. */
async function artist() {
	const account = await createAccount('maquilleuse')
	const payload = await testPayload()
	const user = await userOf(payload, account)
	const profile = await storedProfile(payload, account)
	await payload.update({ collection: 'profiles', id: profile.id, data: { specialty: 'Mariage' } })
	return { compte: account, payload, utilisateur: user, id: profile.id, slug: profile.slug }
}

describe('125, U28 : « @pseudo » et l’adresse complète donnent la même valeur stockée', () => {
	test('les deux écritures du même compte, enregistrées l’une après l’autre, donnent la même valeur', async () => {
		const { payload, utilisateur: user, compte: account } = await artist()

		const pseudo = await saveNetworks(payload, user, { ...EMPTY, instagram: '@studio.fictif' })
		const storedPseudo = (await storedProfile(payload, account)).networks?.instagram
		const url = await saveNetworks(payload, user, {
			...EMPTY,
			instagram: 'https://www.instagram.com/studio.fictif/',
		})
		const storedUrl = (await storedProfile(payload, account)).networks?.instagram

		expect(pseudo).toMatchObject({ ok: true, valeurs: { instagram: 'https://www.instagram.com/studio.fictif' } })
		expect(url).toEqual({ ok: true, valeurs: { ...EMPTY, instagram: 'https://www.instagram.com/studio.fictif' } })
		expect(storedPseudo).toBe(storedUrl ?? '')
	})

	test('les cinq champs sont écrits ensemble, et rendus tels que la base les a gardés', async () => {
		const { payload, utilisateur: user, compte: account } = await artist()

		const result = await saveNetworks(payload, user, {
			instagram: '@studio.fictif',
			facebook: 'facebook.com/studio.fictif',
			youtube: '@studio.fictif',
			linkedin: 'https://fr.linkedin.com/in/studio-fictif',
			siteWeb: 'studio-fictif.example.test',
		})

		const expected = {
			instagram: 'https://www.instagram.com/studio.fictif',
			facebook: 'https://www.facebook.com/studio.fictif',
			youtube: 'https://www.youtube.com/@studio.fictif',
			linkedin: 'https://fr.linkedin.com/in/studio-fictif',
			siteWeb: 'https://studio-fictif.example.test/',
		}
		expect(result).toEqual({ ok: true, valeurs: expected })
		const { siteWeb, ...othersNetworks } = expected
		expect((await storedProfile(payload, account)).networks).toMatchObject({ ...othersNetworks, website: siteWeb })
		// The card she reads next shows the same values.
		expect((await artistProfile(payload, user))?.networks).toMatchObject({
			...othersNetworks,
			website: siteWeb,
		})
	})
})

describe('125, E30 et E31 : une adresse d’un autre site est refusée, un champ vidé retire le réseau', () => {
	test('l’adresse de Facebook dans le champ d’Instagram : le message est sous le champ, la base ne bouge pas', async () => {
		const { payload, utilisateur: user, compte: account } = await artist()
		await saveNetworks(payload, user, { ...EMPTY, instagram: '@studio.fictif' })
		const before = await storedProfile(payload, account)

		const result = await saveNetworks(payload, user, {
			...EMPTY,
			instagram: 'https://www.facebook.com/studio.fictif',
			facebook: '@autre.fictif',
		})

		expect(result).toMatchObject({
			ok: false,
			champs: {
				instagram:
					'Cette adresse n’est pas celle d’Instagram : colle l’adresse de ta page Instagram ou écris ton @pseudo.',
			},
		})
		const after = await storedProfile(payload, account)
		expect(after.updatedAt).toBe(before.updatedAt)
		expect(after.networks).toEqual(before.networks)
	})

	test('vider un champ retire le réseau, les autres restent', async () => {
		const { payload, utilisateur: user, compte: account } = await artist()
		await saveNetworks(payload, user, {
			...EMPTY,
			instagram: '@studio.fictif',
			facebook: '@studio.fictif',
		})

		const result = await saveNetworks(payload, user, { ...EMPTY, facebook: '@studio.fictif' })

		expect(result).toEqual({ ok: true, valeurs: { ...EMPTY, facebook: 'https://www.facebook.com/studio.fictif' } })
		const networks = (await storedProfile(payload, account)).networks
		expect(networks?.instagram ?? null).toBeNull()
		expect(networks?.facebook).toBe('https://www.facebook.com/studio.fictif')
	})

	test('un compte sans profil : le message du site, rien n’est créé', async () => {
		const withoutProfile = await createAccount('maquilleuse-sans-profil')
		const payload = await testPayload()
		const doc = await payload.findByID({ collection: 'pros', id: withoutProfile.id, depth: 0, overrideAccess: true })

		const result = await saveNetworks(payload, { ...doc, collection: 'pros' } as DashboardUser, {
			...EMPTY,
			instagram: '@studio.fictif',
		})

		expect(result).toEqual({ ok: false, message: FAILURE_MESSAGE })
		expect((await payload.count({ collection: 'profiles', overrideAccess: true })).totalDocs).toBe(0)
	})

	test.each([
		['status', 'published'],
		['pro', 1],
		['slug', 'pirate'],
		['id', 1],
		['contactPublic', true],
	])('U32, I03 : la clé réservée %s refuse la requête entière', async (cle, valeur) => {
		const { payload, utilisateur: user, compte: account } = await artist()
		const before = await storedProfile(payload, account)

		const result = await saveNetworks(payload, user, {
			...EMPTY,
			instagram: '@studio.fictif',
			[cle]: valeur,
		})

		expect(result).toEqual({ ok: false, message: FAILURE_MESSAGE })
		const after = await storedProfile(payload, account)
		expect(after.updatedAt).toBe(before.updatedAt)
		expect(after.slug).toBe(before.slug)
	})

	test('I02 : elle n’écrit que son profil', async () => {
		const a = await artist()
		const b = await artist()

		await saveNetworks(a.payload, a.utilisateur, { ...EMPTY, instagram: '@studio.fictif' })

		expect((await storedProfile(b.payload, b.compte)).networks?.instagram ?? null).toBeNull()
	})
})

describe('126 : la maquilleuse choisit d’afficher son téléphone et son email', () => {
	test('sa page lit ses coordonnées, son choix et la date, jamais le compte', async () => {
		const { payload, utilisateur: user } = await artist()
		await saveContactDetails(payload, user, { telephone: PHONE, email: EMAIL, contactPublic: true })

		const read = await artistProfile(payload, user)

		expect(read).toMatchObject({ contactDetails: { phone: PHONE, email: EMAIL }, publicContact: true })
		expect(typeof read?.consentedAt).toBe('string')
		expect(read).not.toHaveProperty('pro')
	})

	test('un téléphone ou un email invalide : message sous le champ, la base ne bouge pas (U28, E30)', async () => {
		const { payload, utilisateur: user, compte: account } = await artist()
		const before = await storedProfile(payload, account)

		const result = await saveContactDetails(payload, user, {
			telephone: '06 ab',
			email: 'pas-un-email',
			contactPublic: true,
		})

		expect(result).toMatchObject({
			ok: false,
			champs: {
				telephone: 'Ce numéro n’est pas valide : écris-le avec des chiffres, par exemple 06 12 34 56 78.',
				email: 'Cet email n’est pas valide : écris-le comme prenom@exemple.fr.',
			},
		})
		const after = await storedProfile(payload, account)
		expect(after.updatedAt).toBe(before.updatedAt)
		expect(after.publicContact).toBe(false)
	})

	test('affichage activé : la date est celle du serveur, la source est elle, et la page publique les montre', async () => {
		const { payload, utilisateur: user, compte: account, slug } = await artist()

		const before = Date.now()
		const result = await saveContactDetails(payload, user, {
			telephone: PHONE,
			email: EMAIL,
			contactPublic: true,
		})
		const after = Date.now()

		if (!result.ok) throw new Error(`refusé : ${result.message}`)
		expect(result.valeurs).toMatchObject({ telephone: PHONE, email: EMAIL, contactPublic: true })
		const date = Date.parse(result.valeurs.consentiLe ?? '')
		expect(date).toBeGreaterThanOrEqual(before - 1000)
		expect(date).toBeLessThanOrEqual(after + 1000)
		const stored = await storedProfile(payload, account)
		expect(stored).toMatchObject({ publicContact: true, consentSource: 'artist' })
		expect(stored.consentedAt).toBe(result.valeurs.consentiLe ?? '')

		const profile = await readPublicProfile(payload, slug)
		expect(profile?.coordonnees).toEqual({ telephone: PHONE, email: EMAIL })
		if (!profile) throw new Error('pas de page')
		const html = renderToStaticMarkup(ProfileView({ profil: profile }))
		expect(html).toContain(`mailto:${EMAIL}`)
		expect(html).toContain('tel:0639981234')
	})

	test('la date de son choix ne bouge pas à un enregistrement suivant, et elle ne peut pas l’écrire', async () => {
		const { payload, utilisateur: user } = await artist()
		const first = await saveContactDetails(payload, user, {
			telephone: PHONE,
			email: '',
			contactPublic: true,
		})

		const forge = await saveContactDetails(payload, user, {
			telephone: PHONE,
			email: '',
			contactPublic: true,
			consentiLe: '2020-01-01T00:00:00.000Z',
		})
		const next = await saveContactDetails(payload, user, {
			telephone: PHONE,
			email: EMAIL,
			contactPublic: true,
		})

		expect(forge).toEqual({ ok: false, message: FAILURE_MESSAGE })
		if (!first.ok || !next.ok) throw new Error('refusé')
		expect(next.valeurs.consentiLe).toBe(first.valeurs.consentiLe ?? '')
	})

	test('affichage coupé : la date est effacée, et la page publique n’a plus rien, ni dans les données ni dans le HTML', async () => {
		const { payload, utilisateur: user, compte: account, slug } = await artist()
		await saveContactDetails(payload, user, { telephone: PHONE, email: EMAIL, contactPublic: true })

		const result = await saveContactDetails(payload, user, {
			telephone: PHONE,
			email: EMAIL,
			contactPublic: false,
		})

		expect(result).toEqual({
			ok: true,
			valeurs: { telephone: PHONE, email: EMAIL, contactPublic: false, consentiLe: null },
		})
		expect(await storedProfile(payload, account)).toMatchObject({
			publicContact: false,
			consentedAt: null,
			consentSource: null,
		})
		// She keeps what she typed: it is hers, and hidden.
		expect((await storedProfile(payload, account)).contactDetails).toMatchObject({ phone: PHONE, email: EMAIL })

		const profile = await readPublicProfile(payload, slug)
		if (!profile) throw new Error('pas de page')
		expect(profile.coordonnees).toBeNull()
		expect(JSON.stringify(profile)).not.toContain(EMAIL)
		expect(JSON.stringify(profile)).not.toContain('39 98')
		const html = renderToStaticMarkup(ProfileView({ profil: profile }))
		expect(html).not.toContain(EMAIL)
		expect(html).not.toContain('39 98')
		expect(html).not.toContain('tel:')

		const rest = await callRest('GET', `/api/profiles?depth=0`)
		expect(rest.texte).not.toContain(EMAIL)
		expect(rest.texte).not.toContain('39 98')
	})

	test('U22 : jamais dans les listes, montrées ou non', async () => {
		const { payload, utilisateur: user } = await artist()
		await saveContactDetails(payload, user, { telephone: PHONE, email: EMAIL, contactPublic: true })

		const list = await listProfiles(payload)

		expect(list.totalDocs).toBe(1)
		const text = JSON.stringify(list)
		expect(text).not.toContain(EMAIL)
		expect(text).not.toContain('39 98')
		expect(text).not.toMatch(/coordonnees|contactPublic|consenti/)
		const rest = await callRest('GET', '/api/profiles?depth=0')
		expect(rest.texte).not.toContain(EMAIL)
		expect(rest.texte).not.toContain('contactPublic')
	})

	test('une maquilleuse n’écrit pas les coordonnées d’une autre (I02)', async () => {
		const a = await artist()
		const b = await artist()

		await saveContactDetails(a.payload, a.utilisateur, { telephone: PHONE, email: EMAIL, contactPublic: true })

		expect(await storedProfile(b.payload, b.compte)).toMatchObject({ publicContact: false, consentedAt: null })
		expect((await storedProfile(b.payload, b.compte)).contactDetails?.phone ?? null).toBeNull()
	})
})

describe('126 : masquées et aucun réseau, le profil n’est pas publiable', () => {
	/** Everything a publishable profile has, but a channel of contact. */
	async function allExceptContact() {
		const m = await artist()
		const photo = await m.payload.create({
			collection: 'media',
			data: { owner: Number(m.compte.id) },
			file: fileForPayload(),
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
	const publishable = async (m: Awaited<ReturnType<typeof allExceptContact>>) =>
		(await storedProfile(m.payload, m.compte)).publishable

	test('masquées, ses coordonnées ne sont pas un canal ; montrées, elles le sont ; et un réseau suffit', async () => {
		const m = await allExceptContact()
		const contactDetails = { telephone: PHONE, email: EMAIL }

		await saveContactDetails(m.payload, m.utilisateur, { ...contactDetails, contactPublic: false })
		expect(await publishable(m)).toBe(false)

		await saveContactDetails(m.payload, m.utilisateur, { ...contactDetails, contactPublic: true })
		expect(await publishable(m)).toBe(true)

		await saveContactDetails(m.payload, m.utilisateur, { ...contactDetails, contactPublic: false })
		expect(await publishable(m)).toBe(false)

		await saveNetworks(m.payload, m.utilisateur, { ...EMPTY, instagram: '@studio.fictif' })
		expect(await publishable(m)).toBe(true)

		await saveNetworks(m.payload, m.utilisateur, EMPTY)
		expect(await publishable(m)).toBe(false)
	})
})
