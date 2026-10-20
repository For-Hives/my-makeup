import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { type DashboardUser, profileId } from '@/lib/dashboard/my-profile'
import { readProfilePreview, readProfileUrlTarget } from '@/services/public/profiles'
import { type CompteDeTest, creerCompte } from '../support/account-factory'
import { payloadDeTest, viderLaBase } from '../support/payload-test'

/**
 * The preview of her own page (ticket 139; plan 02 RG-06): the same content as the public page for a
 * complete profile, the profile found by her account and no one else's, a draft and a hidden profile
 * still previewed, and the contact details only when she published them.
 */

afterEach(viderLaBase)

type Maquilleuse = CompteDeTest<'maquilleuse'>

async function ficheDe(payload: Payload, compte: Maquilleuse) {
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })
	const [fiche] = docs
	if (!fiche) throw new Error('pas de profil')
	return fiche
}

async function utilisateurDe(payload: Payload, compte: Maquilleuse): Promise<DashboardUser> {
	const doc = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as DashboardUser
}

const COMPLET = {
	firstName: 'Léa',
	lastName: 'Fictive',
	specialty: 'Maquillage mariée',
	description: 'Je maquille pour les mariages.\nDeuxième ligne.',
	skills: [{ name: 'Teint', description: 'Un teint lumineux' }],
	languages: [{ name: 'Français' }],
	networks: { instagram: 'https://www.instagram.com/lea.fictive' },
	contactDetails: { phone: '06 39 98 00 01', email: 'lea@example.test' },
	publicContact: true,
}

describe('139 : l’aperçu est la page publique', () => {
	test('profil complet : exactement le même profil que la lecture de l’adresse publique', async () => {
		const compte = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const fiche = await ficheDe(payload, compte)
		await payload.update({ collection: 'profiles', id: fiche.id, data: COMPLET })
		const slug = (await ficheDe(payload, compte)).slug

		const apercu = await readProfilePreview(payload, fiche.id)
		const adresse = await readProfileUrlTarget(payload, slug)
		expect(adresse.type).toBe('profil')
		if (adresse.type !== 'profil') return
		expect(apercu?.profil).toEqual(adresse.profil)
		expect(apercu?.profil.coordonnees).toEqual({ telephone: '06 39 98 00 01', email: 'lea@example.test' })
	})

	test('coordonnées non publiées : ni téléphone ni email dans l’aperçu, comme dans la page publique', async () => {
		const compte = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const fiche = await ficheDe(payload, compte)
		await payload.update({ collection: 'profiles', id: fiche.id, data: { ...COMPLET, publicContact: false } })
		const apercu = await readProfilePreview(payload, fiche.id)
		expect(apercu?.profil.coordonnees).toBeNull()
		expect(JSON.stringify(apercu?.profil)).not.toMatch(/example\.test|06 39 98/)
	})

	test('profil vide (brouillon) : aperçu possible, état dit vide ; profil masqué : aperçu possible, état masqué', async () => {
		const compte = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const fiche = await ficheDe(payload, compte)
		const vide = await readProfilePreview(payload, fiche.id)
		expect(vide?.etat).toMatchObject({ status: 'draft', fullyEmpty: true })

		await payload.update({ collection: 'profiles', id: fiche.id, data: COMPLET })
		await payload.update({
			collection: 'profiles',
			id: fiche.id,
			data: { chosenStatus: 'hidden', reason: 'Masqué pour le test' },
		})
		const slug = (await ficheDe(payload, compte)).slug
		expect((await readProfileUrlTarget(payload, slug)).type).toBe('inconnue')
		const masque = await readProfilePreview(payload, fiche.id)
		expect(masque?.etat.status).toBe('hidden')
		expect(masque?.profil.nom).toBe('Léa Fictive')
	})

	test('un identifiant inconnu ne donne rien', async () => {
		const payload = await payloadDeTest()
		expect(await readProfilePreview(payload, 987_654)).toBeNull()
	})
})

describe('139 : seulement le sien', () => {
	test('l’identifiant vient de la session : A obtient son profil, B le sien, jamais l’autre', async () => {
		const a = await creerCompte('maquilleuse')
		const b = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const ficheA = await ficheDe(payload, a)
		const ficheB = await ficheDe(payload, b)
		await payload.update({ collection: 'profiles', id: ficheB.id, data: { firstName: 'Bea', lastName: 'Autre' } })

		const idA = await profileId(payload, await utilisateurDe(payload, a))
		const idB = await profileId(payload, await utilisateurDe(payload, b))
		expect(idA).toBe(ficheA.id)
		expect(idB).toBe(ficheB.id)
		expect((await readProfilePreview(payload, idA ?? -1))?.profil.nom).not.toContain('Bea')
		expect((await readProfilePreview(payload, idB ?? -1))?.profil.nom).toBe('Bea Autre')
	})

	test('un compte sans profil n’a pas d’aperçu', async () => {
		const compte = await creerCompte('maquilleuse-sans-profil')
		const payload = await payloadDeTest()
		expect(await profileId(payload, await utilisateurDe(payload, compte as unknown as Maquilleuse))).toBeNull()
	})
})
