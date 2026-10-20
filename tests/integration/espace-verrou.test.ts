import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { checkAdminDoesNotHoldProfile, DEFAULT_LOCK_DURATION_S, LOCKED_PROFILE_MESSAGE } from '@/lib/dashboard/lock'
import type { DashboardUser } from '@/lib/dashboard/my-profile'
import { saveContactDetails } from '@/lib/dashboard/save-contact-details'
import { saveIdentity } from '@/lib/dashboard/save-identity'
import { saveNetworks } from '@/lib/dashboard/save-networks'
import { type CompteDeTest, creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'

/**
 * The edit lock of the administration protects the profile from the writes of her space (ticket 224): while
 * an admin has the profile open, the makeup artist is told in French to try again, and nothing is overwritten;
 * once the lock is released, or past its duration, the write goes through.
 */

afterEach(viderLaBase)

type Maquilleuse = CompteDeTest<'maquilleuse'>

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

/** What the administration writes when an admin opens the profile. */
async function ouvrirDansLAdministration(payload: Payload, profil: number, admin: number | string) {
	return payload.create({
		collection: 'payload-locked-documents',
		overrideAccess: true,
		data: { document: { relationTo: 'profiles', value: profil }, user: { relationTo: 'admins', value: Number(admin) } },
	})
}

const IDENTITE = { prenom: 'Léa', nom: 'Fictive', nomArtiste: 'Studio Fictif', specialite: 'Maquillage mariée' }

describe('un admin tient le profil : l’espace ne l’écrase pas', () => {
	test('l’enregistrement est refusé en français, rien n’est écrit ; verrou levé, il passe', async () => {
		const payload = await payloadDeTest()
		const compte = await creerCompte('maquilleuse')
		const admin = await creerCompte('admin')
		const utilisateur = await utilisateurDe(payload, compte)
		const profil = await profilStocke(payload, compte)
		const verrou = await ouvrirDansLAdministration(payload, profil.id, admin.id)

		const refuse = await saveIdentity(payload, utilisateur, IDENTITE)

		expect(refuse).toEqual({ ok: false, message: LOCKED_PROFILE_MESSAGE })
		expect(LOCKED_PROFILE_MESSAGE).toBe(
			'Ton profil est en cours de modification par l’équipe, réessaie dans quelques minutes.'
		)
		expect((await profilStocke(payload, compte)).lastName).not.toBe('Fictive')

		await payload.delete({ collection: 'payload-locked-documents', id: verrou.id, overrideAccess: true })
		const passe = await saveIdentity(payload, utilisateur, IDENTITE)

		expect(passe.ok).toBe(true)
		expect((await profilStocke(payload, compte)).lastName).toBe('Fictive')
	})

	test('les autres enregistrements de l’espace passent par la même porte', async () => {
		const payload = await payloadDeTest()
		const compte = await creerCompte('maquilleuse')
		const admin = await creerCompte('admin')
		const utilisateur = await utilisateurDe(payload, compte)
		await ouvrirDansLAdministration(payload, (await profilStocke(payload, compte)).id, admin.id)

		const reseaux = await saveNetworks(payload, utilisateur, {
			instagram: '@fictive',
			facebook: '',
			youtube: '',
			linkedin: '',
			siteWeb: '',
		})
		const coordonnees = await saveContactDetails(payload, utilisateur, {
			telephone: '06 39 98 12 34',
			email: 'contact-fictif@example.test',
			contactPublic: false,
		})

		expect(reseaux).toEqual({ ok: false, message: LOCKED_PROFILE_MESSAGE })
		expect(coordonnees).toEqual({ ok: false, message: LOCKED_PROFILE_MESSAGE })
		expect((await profilStocke(payload, compte)).networks?.instagram ?? null).toBeNull()
	})

	test('un verrou plus vieux que sa durée n’en est plus un ; le profil d’une autre n’est pas tenu', async () => {
		const payload = await payloadDeTest()
		const compte = await creerCompte('maquilleuse')
		const autre = await creerCompte('maquilleuse')
		const admin = await creerCompte('admin')
		const profil = await profilStocke(payload, compte)
		await ouvrirDansLAdministration(payload, profil.id, admin.id)
		const plusTard = new Date(Date.now() + (DEFAULT_LOCK_DURATION_S + 60) * 1000)

		await expect(checkAdminDoesNotHoldProfile(payload, profil.id)).rejects.toThrow()
		await expect(checkAdminDoesNotHoldProfile(payload, profil.id, plusTard)).resolves.toBeUndefined()
		await expect(
			checkAdminDoesNotHoldProfile(payload, (await profilStocke(payload, autre)).id)
		).resolves.toBeUndefined()
	})
})
