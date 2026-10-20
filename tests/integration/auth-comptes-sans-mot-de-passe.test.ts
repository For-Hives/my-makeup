import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { clearDocuments } from '@/lib/auth/google/oidc'
import { type AccountType, createAccount } from '../support/account-factory'
import { CHOICE, connect, connectByGoogle, pickPassword, requestLink } from '../support/legacy-journeys'
import { emptySink } from '../support/mailpit'
import { emptyBase, testPayload } from '../support/payload-test'

// The bench is shared by every checkout of the machine, and a suite under load runs several times slower than alone:
// the default 5 s is passed by the heaviest tests of this file (ticket 225). The delay bounds a call that hangs, it
// is not a duration the test promises. A test that times out leaves its queries running into the next file.
setDefaultTimeout(30_000)

/**
 * Ticket 093 (plan 02 E74, in its integration half): an account that holds no password of its own,
 * an old Google one or an old Facebook one, asks for a link through « Mot de passe oublié », chooses
 * its password, and signs in with it. Same account, same profile. Google keeps working afterwards.
 * The pages and the whole path in a browser are played by tests/e2e/comptes-sans-mot-de-passe.spec.ts.
 */

beforeAll(() => clearDocuments())
beforeEach(async () => {
	await Promise.all([emptyBase(), emptySink()])
})
afterAll(async () => {
	await Promise.all([emptyBase(), emptySink()])
})

/** Everything that makes « the same account and the same profile as before ». */
async function identite(id: number | string) {
	const payload = await testPayload()
	const compte = await payload.findByID({ collection: 'pros', id, depth: 0, overrideAccess: true })
	const profils = await payload.find({
		collection: 'profiles',
		depth: 0,
		overrideAccess: true,
		where: { pro: { equals: id } },
	})
	return {
		compte: { id: compte.id, email: compte.email, nom: compte.name, provider: compte.legacyProvider },
		profils: profils.docs.map(profil => ({ id: profil.id, slug: profil.slug })),
	}
}

const evenements = async (type: string) =>
	(await (await testPayload()).find({ collection: 'auth-events', depth: 0, where: { type: { equals: type } } })).docs

describe.each([
	['reprise-google', 'google'],
	['reprise-facebook', 'facebook'],
] as [
	AccountType,
	string,
][])('E74 : un compte %s sans mot de passe en définit un par « Mot de passe oublié »', (type, fournisseur) => {
	test('avant : la connexion par mot de passe renvoie le message générique, quel que soit le mot de passe', async () => {
		const compte = await createAccount(type)

		for (const essai of ['mot-de-passe-au-hasard', CHOICE, '']) {
			const resultat = await connect(compte.email, essai)
			expect(resultat).toEqual({ ok: false, code: 'identifiants-invalides' })
		}
	})

	test('le lien, le mot de passe, la connexion avec lui : même compte, même profil qu’avant', async () => {
		const compte = await createAccount(type)
		const avant = await identite(compte.id)
		expect(avant.compte.provider).toBe(fournisseur)
		expect(avant.profils).toHaveLength(1)

		const jeton = await requestLink(compte.email)
		expect(await pickPassword(jeton)).toEqual({ ok: true })

		const connexion = await connect(compte.email, CHOICE)
		expect(connexion.ok).toBe(true)
		expect(await identite(compte.id)).toEqual(avant)
		// The link is spent, and no second account was made.
		expect(await pickPassword(jeton)).toMatchObject({ ok: false })
		expect(
			(await (await testPayload()).find({ collection: 'pros', depth: 0, where: { email: { equals: compte.email } } }))
				.totalDocs
		).toBe(1)
		// The journal says how: a reset (and the refusal of the replayed link), then a sign-in by password. Not « heritee »: she has no old hash.
		const codes = (await evenements('password-reset')).map(l => l.code).sort()
		expect(codes).toEqual(['lien-invalide', 'ok'])
		expect((await evenements('sign-in')).map(l => l.code)).toContain('ok')
	})
})

describe('E74 : Google marche toujours après le mot de passe', () => {
	test('l’ancien compte Google définit un mot de passe, se connecte avec, puis se connecte par Google : même compte', async () => {
		const compte = await createAccount('reprise-google')
		const avant = await identite(compte.id)

		expect(await pickPassword(await requestLink(compte.email))).toEqual({ ok: true })
		expect((await connect(compte.email, CHOICE)).ok).toBe(true)

		const parGoogle = await connectByGoogle(compte.email)
		if (!parGoogle.ok) throw new Error(`Google refusé : ${parGoogle.code}`)
		expect(parGoogle.nouveau).toBe(false)
		expect(await identite(compte.id)).toEqual(avant)
		const payload = await testPayload()
		expect((await payload.count({ collection: 'pros' })).totalDocs).toBe(1)
	})

	test('un compte Google qui avait aussi un hash hérité : le nouveau mot de passe efface le hash, l’ancien mot de passe ne marche plus', async () => {
		const compte = await createAccount('reprise-google-avec-hash')

		expect(await pickPassword(await requestLink(compte.email))).toEqual({ ok: true })

		expect((await connect(compte.email, CHOICE)).ok).toBe(true)
		const ligne = await (await testPayload()).db.findOne<{ id: number; legacyBcrypt?: string | null }>({
			collection: 'pros',
			where: { id: { equals: compte.id } },
		})
		expect(ligne?.legacyBcrypt ?? null).toBeNull()
		expect((await connectByGoogle(compte.email)).ok).toBe(true)
	})
})
