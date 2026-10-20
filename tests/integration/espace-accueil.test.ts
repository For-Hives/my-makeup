import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { ensureProfile } from '@/lib/dashboard/empty-profile'
import { artistProfile, type DashboardUser, profileId } from '@/lib/dashboard/my-profile'
import { onboardingPosition } from '@/lib/dashboard/onboarding'
import { saveOnboardingIdentity, saveOnboardingPhoto } from '@/lib/dashboard/save-onboarding'
import type { Media } from '@/payload-types'
import { createAccount, type TestAccount } from '../support/account-factory'
import { ANNECY } from '../support/completeness-cases'
import { emptyBase, testPayload } from '../support/payload-test'
import { fileForForm } from '../support/photos'
import { callRest, formWithFile } from '../support/rest'
import { emptyStorage } from '../support/s3'
import { type Spy, spyStorage } from '../support/s3-spy'

/**
 * The onboarding on the server side (ticket 140; plan 02 E02, I02): an account without a profile
 * gets exactly one, made by the server; the speciality is required; the photo save says where she
 * stands from the database, so a profile that went through the three steps is active and published.
 */

let espion: Spy
beforeEach(() => {
	espion = spyStorage()
})
afterEach(async () => {
	espion.arreter()
	await Promise.all([emptyBase(), emptyStorage()])
})

async function utilisateurDe(payload: Payload, compte: { id: number | string }): Promise<DashboardUser> {
	const doc = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as DashboardUser
}

const profilsDuCompte = async (compte: { id: number | string }) =>
	(
		await (
			await testPayload()
		).find({ collection: 'profiles', depth: 0, pagination: false, where: { pro: { equals: compte.id } } })
	).docs

async function envoyerUnePhoto(compte: TestAccount<'maquilleuse'>): Promise<Media> {
	const { statut, corps, texte } = await callRest('POST', '/api/media?depth=0', {
		enTetes: compte.session.enTetes,
		formulaire: formWithFile(fileForForm(), { alt: 'Photo principale' }),
	})
	if (statut !== 201) throw new Error(`Envoi refusé : ${statut} ${texte}`)
	return (corps as { doc: Media }).doc
}

describe('un compte importé sans profil : le profil vide est créé côté serveur', () => {
	test('un compte sans profil en reçoit un, une seule fois, et le slug vient de son nom', async () => {
		const compte = await createAccount('maquilleuse-sans-profil')
		const payload = await testPayload()
		const utilisateur = await utilisateurDe(payload, compte)
		expect(await profilsDuCompte(compte)).toHaveLength(0)
		expect(await artistProfile(payload, utilisateur)).toBeNull()

		const id = await ensureProfile(payload, utilisateur)

		const profils = await profilsDuCompte(compte)
		expect(profils).toHaveLength(1)
		expect(profils[0]?.id).toBe(id ?? undefined)
		expect(profils[0]?.slug).toBeTruthy()
		expect(profils[0]?.status).toBe('draft')
		// She reads her own empty profile now, and the onboarding starts at the first step.
		expect(onboardingPosition(await artistProfile(payload, utilisateur))).toBe(1)
	})

	test('deux appels au même moment ne font qu’un profil', async () => {
		const compte = await createAccount('maquilleuse-sans-profil')
		const payload = await testPayload()
		const utilisateur = await utilisateurDe(payload, compte)

		const [a, b] = await Promise.all([ensureProfile(payload, utilisateur), ensureProfile(payload, utilisateur)])

		expect(a).not.toBeNull()
		expect(a).toBe(b)
		expect(await profilsDuCompte(compte)).toHaveLength(1)
	})

	test('un compte qui a son profil n’en reçoit pas un second', async () => {
		const compte = await createAccount('maquilleuse')
		const payload = await testPayload()
		const avant = (await profilsDuCompte(compte))[0]?.id
		expect(await ensureProfile(payload, await utilisateurDe(payload, compte))).toBe(avant ?? null)
		expect(await profilsDuCompte(compte)).toHaveLength(1)
	})

	test('un compte de l’administration n’en reçoit pas', async () => {
		const admin = await createAccount('admin')
		const payload = await testPayload()
		const doc = await payload.findByID({ collection: 'admins', id: admin.id, depth: 0, overrideAccess: true })
		const utilisateur = { ...doc, collection: 'admins' } as unknown as DashboardUser
		expect(await ensureProfile(payload, utilisateur)).toBeNull()
		expect(await profileId(payload, utilisateur)).toBeNull()
	})
})

describe('E02 : les trois étapes donnent un profil actif', () => {
	test('identité, zone, photo : à chaque étape la position avance, à la fin le profil est actif et publié', async () => {
		const compte = await createAccount('maquilleuse')
		const payload = await testPayload()
		const utilisateur = await utilisateurDe(payload, compte)
		const id = (await profilsDuCompte(compte))[0]?.id as number

		// Step 1 refuses a missing speciality, and stores nothing.
		const sans = await saveOnboardingIdentity(payload, utilisateur, {
			prenom: 'Léa',
			nom: 'Fictive',
			nomArtiste: '',
			specialite: ' ',
		})
		expect(sans.ok).toBe(false)
		expect(sans.ok ? '' : sans.champs?.specialite).toBe('Indique ta spécialité.')
		expect((await profilsDuCompte(compte))[0]?.firstName ?? null).toBeNull()

		const identite = await saveOnboardingIdentity(payload, utilisateur, {
			prenom: 'Léa',
			nom: 'Fictive',
			nomArtiste: '',
			specialite: 'Mariée',
		})
		expect(identite.ok).toBe(true)
		expect(onboardingPosition(await artistProfile(payload, utilisateur))).toBe(2)

		// The zone is saved by the save of her space; here it is written as it would be.
		await payload.update({ collection: 'profiles', id, data: { city: ANNECY } })
		expect(onboardingPosition(await artistProfile(payload, utilisateur))).toBe(3)
		expect((await profilsDuCompte(compte))[0]?.active).toBe(false)

		const media = await envoyerUnePhoto(compte)
		const photo = await saveOnboardingPhoto(payload, utilisateur, { photoPrincipale: media.id })

		expect(photo.ok).toBe(true)
		expect(photo.ok ? photo.valeurs.position : null).toBe('terminee')
		const profil = (await profilsDuCompte(compte))[0]
		expect(profil?.active).toBe(true)
		expect(profil?.status).toBe('published')
	})

	test('la photo enregistrée alors qu’une étape manque dit où elle en est, pas « terminée »', async () => {
		const compte = await createAccount('maquilleuse')
		const payload = await testPayload()
		const utilisateur = await utilisateurDe(payload, compte)
		const media = await envoyerUnePhoto(compte)

		const photo = await saveOnboardingPhoto(payload, utilisateur, { photoPrincipale: media.id })

		expect(photo.ok).toBe(true)
		expect(photo.ok ? photo.valeurs.position : null).toBe(1)
		expect((await profilsDuCompte(compte))[0]?.active).toBe(false)
	})

	test('un champ réservé dans l’identité refuse toute la demande (U32)', async () => {
		const compte = await createAccount('maquilleuse')
		const payload = await testPayload()
		const utilisateur = await utilisateurDe(payload, compte)
		const refus = await saveOnboardingIdentity(payload, utilisateur, {
			prenom: 'Léa',
			nom: 'Fictive',
			nomArtiste: '',
			specialite: 'Mariée',
			status: 'published',
			origine: 'ia',
		})
		expect(refus.ok).toBe(false)
		expect((await profilsDuCompte(compte))[0]?.firstName ?? null).toBeNull()
	})
})
