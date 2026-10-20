import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { clearDocuments } from '@/lib/auth/google/oidc'
import { creerCompte, type TypeDeCompte } from '../support/account-factory'
import { viderLeCapteur } from '../support/mailpit'
import { CHOIX, choisirUnMotDePasse, connecterParGoogle, demanderLeLien, seConnecter } from '../support/legacy-journeys'
import { payloadDeTest, viderLaBase } from '../support/payload-test'

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
	await Promise.all([viderLaBase(), viderLeCapteur()])
})
afterAll(async () => {
	await Promise.all([viderLaBase(), viderLeCapteur()])
})

/** Everything that makes « the same account and the same profile as before ». */
async function identite(id: number | string) {
	const payload = await payloadDeTest()
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
	(await (await payloadDeTest()).find({ collection: 'auth-events', depth: 0, where: { type: { equals: type } } })).docs

describe.each([
	['reprise-google', 'google'],
	['reprise-facebook', 'facebook'],
] as [
	TypeDeCompte,
	string,
][])('E74 : un compte %s sans mot de passe en définit un par « Mot de passe oublié »', (type, fournisseur) => {
	test('avant : la connexion par mot de passe renvoie le message générique, quel que soit le mot de passe', async () => {
		const compte = await creerCompte(type)

		for (const essai of ['mot-de-passe-au-hasard', CHOIX, '']) {
			const resultat = await seConnecter(compte.email, essai)
			expect(resultat).toEqual({ ok: false, code: 'identifiants-invalides' })
		}
	})

	test('le lien, le mot de passe, la connexion avec lui : même compte, même profil qu’avant', async () => {
		const compte = await creerCompte(type)
		const avant = await identite(compte.id)
		expect(avant.compte.provider).toBe(fournisseur)
		expect(avant.profils).toHaveLength(1)

		const jeton = await demanderLeLien(compte.email)
		expect(await choisirUnMotDePasse(jeton)).toEqual({ ok: true })

		const connexion = await seConnecter(compte.email, CHOIX)
		expect(connexion.ok).toBe(true)
		expect(await identite(compte.id)).toEqual(avant)
		// The link is spent, and no second account was made.
		expect(await choisirUnMotDePasse(jeton)).toMatchObject({ ok: false })
		expect(
			(await (await payloadDeTest()).find({ collection: 'pros', depth: 0, where: { email: { equals: compte.email } } }))
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
		const compte = await creerCompte('reprise-google')
		const avant = await identite(compte.id)

		expect(await choisirUnMotDePasse(await demanderLeLien(compte.email))).toEqual({ ok: true })
		expect((await seConnecter(compte.email, CHOIX)).ok).toBe(true)

		const parGoogle = await connecterParGoogle(compte.email)
		if (!parGoogle.ok) throw new Error(`Google refusé : ${parGoogle.code}`)
		expect(parGoogle.nouveau).toBe(false)
		expect(await identite(compte.id)).toEqual(avant)
		const payload = await payloadDeTest()
		expect((await payload.count({ collection: 'pros' })).totalDocs).toBe(1)
	})

	test('un compte Google qui avait aussi un hash hérité : le nouveau mot de passe efface le hash, l’ancien mot de passe ne marche plus', async () => {
		const compte = await creerCompte('reprise-google-avec-hash')

		expect(await choisirUnMotDePasse(await demanderLeLien(compte.email))).toEqual({ ok: true })

		expect((await seConnecter(compte.email, CHOIX)).ok).toBe(true)
		const ligne = await (await payloadDeTest()).db.findOne<{ id: number; legacyBcrypt?: string | null }>({
			collection: 'pros',
			where: { id: { equals: compte.id } },
		})
		expect(ligne?.legacyBcrypt ?? null).toBeNull()
		expect((await connecterParGoogle(compte.email)).ok).toBe(true)
	})
})
