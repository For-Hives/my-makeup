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
 * The pages and the whole path in a browser are played by tests/e2e/passwordless-accounts.spec.ts.
 */

beforeAll(() => clearDocuments())
beforeEach(async () => {
	await Promise.all([emptyBase(), emptySink()])
})
afterAll(async () => {
	await Promise.all([emptyBase(), emptySink()])
})

/** Everything that makes « the same account and the same profile as before ». */
async function identity(id: number | string) {
	const payload = await testPayload()
	const account = await payload.findByID({ collection: 'pros', id, depth: 0, overrideAccess: true })
	const profiles = await payload.find({
		collection: 'profiles',
		depth: 0,
		overrideAccess: true,
		where: { pro: { equals: id } },
	})
	return {
		compte: { id: account.id, email: account.email, nom: account.name, provider: account.legacyProvider },
		profils: profiles.docs.map(profil => ({ id: profil.id, slug: profil.slug })),
	}
}

const events = async (type: string) =>
	(await (await testPayload()).find({ collection: 'auth-events', depth: 0, where: { type: { equals: type } } })).docs

describe.each([
	['reprise-google', 'google'],
	['reprise-facebook', 'facebook'],
] as [
	AccountType,
	string,
][])('E74 : un compte %s sans mot de passe en définit un par « Mot de passe oublié »', (type, fournisseur) => {
	test('avant : la connexion par mot de passe renvoie le message générique, quel que soit le mot de passe', async () => {
		const account = await createAccount(type)

		for (const test of ['mot-de-passe-au-hasard', CHOICE, '']) {
			const result = await connect(account.email, test)
			expect(result).toEqual({ ok: false, code: 'identifiants-invalides' })
		}
	})

	test('le lien, le mot de passe, la connexion avec lui : même compte, même profil qu’avant', async () => {
		const account = await createAccount(type)
		const before = await identity(account.id)
		expect(before.compte.provider).toBe(fournisseur)
		expect(before.profils).toHaveLength(1)

		const token = await requestLink(account.email)
		expect(await pickPassword(token)).toEqual({ ok: true })

		const signIn = await connect(account.email, CHOICE)
		expect(signIn.ok).toBe(true)
		expect(await identity(account.id)).toEqual(before)
		// The link is spent, and no second account was made.
		expect(await pickPassword(token)).toMatchObject({ ok: false })
		expect(
			(await (await testPayload()).find({ collection: 'pros', depth: 0, where: { email: { equals: account.email } } }))
				.totalDocs
		).toBe(1)
		// The journal says how: a reset (and the refusal of the replayed link), then a sign-in by password. Not « heritee »: she has no old hash.
		const codes = (await events('password-reset')).map(l => l.code).sort()
		expect(codes).toEqual(['lien-invalide', 'ok'])
		expect((await events('sign-in')).map(l => l.code)).toContain('ok')
	})
})

describe('E74 : Google marche toujours après le mot de passe', () => {
	test('l’ancien compte Google définit un mot de passe, se connecte avec, puis se connecte par Google : même compte', async () => {
		const account = await createAccount('reprise-google')
		const before = await identity(account.id)

		expect(await pickPassword(await requestLink(account.email))).toEqual({ ok: true })
		expect((await connect(account.email, CHOICE)).ok).toBe(true)

		const byGoogle = await connectByGoogle(account.email)
		if (!byGoogle.ok) throw new Error(`Google refusé : ${byGoogle.code}`)
		expect(byGoogle.nouveau).toBe(false)
		expect(await identity(account.id)).toEqual(before)
		const payload = await testPayload()
		expect((await payload.count({ collection: 'pros' })).totalDocs).toBe(1)
	})

	test('un compte Google qui avait aussi un hash hérité : le nouveau mot de passe efface le hash, l’ancien mot de passe ne marche plus', async () => {
		const account = await createAccount('reprise-google-avec-hash')

		expect(await pickPassword(await requestLink(account.email))).toEqual({ ok: true })

		expect((await connect(account.email, CHOICE)).ok).toBe(true)
		const line = await (await testPayload()).db.findOne<{ id: number; legacyBcrypt?: string | null }>({
			collection: 'pros',
			where: { id: { equals: account.id } },
		})
		expect(line?.legacyBcrypt ?? null).toBeNull()
		expect((await connectByGoogle(account.email)).ok).toBe(true)
	})
})
