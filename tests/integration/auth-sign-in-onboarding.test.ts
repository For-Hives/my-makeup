import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { ACCOUNT_ONBOARDING_PAGE, DEFAULT_DASHBOARD } from '@/lib/auth/return-to'
import { openWithoutPassword } from '@/lib/auth/token'
import type { DashboardUser } from '@/lib/dashboard/my-profile'
import { googleSignInDestination, onboardingToDo, passwordSignInDestination } from '@/lib/dashboard/sign-in-destination'
import type { Media } from '@/payload-types'
import { createAccount, type TestAccount } from '../support/account-factory'
import { ANNECY } from '../support/completeness-cases'
import { emptyBase, testPayload } from '../support/payload-test'
import { fileForForm } from '../support/photos'
import { callRest, formWithFile } from '../support/rest'
import { emptyStorage } from '../support/s3'

/**
 * Where a sign-in leads a makeup artist whose profile is still empty (ticket 296): the onboarding,
 * unless she asked for a precise page. Both ways in: the password (the session just opened) and
 * Google (the account known by its identifier). Accounts taken over from the old site (empty profile,
 * never signed in, or no profile at all) are covered.
 */

afterEach(async () => {
	await Promise.all([emptyBase(), emptyStorage()])
})

async function userOf(payload: Payload, account: { id: number | string }): Promise<DashboardUser> {
	const doc = await payload.findByID({ collection: 'pros', id: account.id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as DashboardUser
}

/** The token of a session opened as the sign-in does, for the account. */
async function tokenOf(payload: Payload, account: { id: number | string }): Promise<string> {
	return (await openWithoutPassword(payload, { collection: 'pros', id: account.id })).token
}

/** Gives her profile the three steps: identity, commune and a main photo. */
async function activate(payload: Payload, account: TestAccount<'maquilleuse'>): Promise<void> {
	const response = await callRest('POST', '/api/media?depth=0', {
		enTetes: account.session.enTetes,
		formulaire: formWithFile(fileForForm(), { alt: 'Photo principale' }),
	})
	if (response.statut !== 201) throw new Error(`Envoi refusé : ${response.statut}`)
	const media = (response.corps as { doc: Media }).doc
	const { docs } = await payload.find({
		collection: 'profiles',
		depth: 0,
		overrideAccess: true,
		where: { pro: { equals: account.id } },
	})
	await payload.update({
		collection: 'profiles',
		id: docs[0]?.id as number,
		overrideAccess: true,
		data: { firstName: 'Léa', lastName: 'Fictive', specialty: 'Mariée', city: ANNECY, mainPicture: media.id },
	})
}

describe('la connexion par mot de passe', () => {
	test('un profil vide revient par « Me connecter » : l’accueil', async () => {
		const account = await createAccount('maquilleuse')
		const payload = await testPayload()
		expect(await passwordSignInDestination(payload, await tokenOf(payload, account), DEFAULT_DASHBOARD)).toBe(
			ACCOUNT_ONBOARDING_PAGE
		)
	})

	test('un compte repris sans profil : l’accueil aussi, sans cycle ni erreur', async () => {
		const account = await createAccount('maquilleuse-sans-profil')
		const payload = await testPayload()
		expect(await onboardingToDo(payload, await userOf(payload, account))).toBe(true)
		expect(await passwordSignInDestination(payload, await tokenOf(payload, account), DEFAULT_DASHBOARD)).toBe(
			ACCOUNT_ONBOARDING_PAGE
		)
	})

	test('un lien précis vers une page privée est respecté, même profil vide', async () => {
		const account = await createAccount('maquilleuse')
		const payload = await testPayload()
		const token = await tokenOf(payload, account)
		expect(await passwordSignInDestination(payload, token, '/auth/apercu-profil')).toBe('/auth/apercu-profil')
	})

	test('un profil actif arrive sur l’espace', async () => {
		const account = await createAccount('maquilleuse')
		const payload = await testPayload()
		await activate(payload, account)
		expect(await onboardingToDo(payload, await userOf(payload, account))).toBe(false)
		expect(await passwordSignInDestination(payload, await tokenOf(payload, account), DEFAULT_DASHBOARD)).toBe(
			DEFAULT_DASHBOARD
		)
	})

	test('un jeton qui ne désigne personne ne casse pas la connexion : la page demandée', async () => {
		const payload = await testPayload()
		expect(await passwordSignInDestination(payload, 'jeton-invalide', DEFAULT_DASHBOARD)).toBe(DEFAULT_DASHBOARD)
	})
})

describe('la connexion par Google d’un compte déjà là', () => {
	test('profil vide : l’accueil ; lien précis : respecté ; profil actif : l’espace', async () => {
		const account = await createAccount('maquilleuse')
		const payload = await testPayload()
		expect(await googleSignInDestination(payload, account.id, DEFAULT_DASHBOARD)).toBe(ACCOUNT_ONBOARDING_PAGE)
		expect(await googleSignInDestination(payload, account.id, '/auth/apercu-profil')).toBe('/auth/apercu-profil')
		await activate(payload, account)
		expect(await googleSignInDestination(payload, account.id, DEFAULT_DASHBOARD)).toBe(DEFAULT_DASHBOARD)
	})

	test('un compte inconnu : la page demandée, sans erreur', async () => {
		const payload = await testPayload()
		expect(await googleSignInDestination(payload, 987654321, DEFAULT_DASHBOARD)).toBe(DEFAULT_DASHBOARD)
	})
})
