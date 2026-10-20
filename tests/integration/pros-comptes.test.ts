import { afterAll, describe, expect, test } from 'bun:test'
import { canAccessAdmin, createLocalReq } from 'payload'
import { z } from 'zod'
import { creerCompte, motDePasseAleatoire } from '../support/account-factory'
import { mailsRecus, viderLeCapteur } from '../support/mailpit'
import { payloadDeTest, viderLaBase } from '../support/payload-test'
import { appelerRest } from '../support/rest'

/**
 * The accounts of the makeup artists (ticket 019). Who reaches which account is in the access
 * matrix (tests/integration/payload-acces.test.ts); here, what an account never lets out, how its
 * address is compared, what the factory makes, and the admin panel that stays closed.
 */

/**
 * What never leaves the server, whoever asks (plan 02 §7.3, I06). `sessions` is not in the list of
 * keys: Payload always answers it as an empty list, its content withheld; the test checks that no
 * session identifier appears anywhere in the answer.
 */
const CLES_SECRETES = ['hash', 'salt', 'legacyBcrypt', 'resetPasswordToken', '_verificationToken'] as const

/** A made-up bcrypt hash, of the shape of the old site's: never the hash of a real password. */
const hashFictif = () =>
	`$2a$10$${'fictif'.repeat(9).slice(0, 53 - 36)}${crypto.randomUUID().replaceAll('-', '')}`.slice(0, 60)

/** Every key of a JSON value, at any depth. */
const cles = (valeur: unknown): string[] => {
	if (Array.isArray(valeur)) return valeur.flatMap(cles)
	if (typeof valeur !== 'object' || valeur === null) return []
	return Object.entries(valeur).flatMap(([cle, sous]) => [cle, ...cles(sous)])
}

/** Payload leaves `canAccessAdmin` out of the answer when it is false. */
const Acces = z.object({ canAccessAdmin: z.boolean().default(false) })
const MonCompte = z.object({ user: z.object({ id: z.number(), email: z.string() }).nullable() })

afterAll(async () => {
	await Promise.all([viderLaBase(), viderLeCapteur()])
})

describe('Les comptes des maquilleuses', () => {
	test('la fabrique crée A, B et une maquilleuse non vérifiée, sans envoyer aucun mail', async () => {
		const [a, b, nonVerifiee] = await Promise.all([
			creerCompte('maquilleuse'),
			creerCompte('maquilleuse'),
			creerCompte('maquilleuse-non-verifiee'),
		])
		const payload = await payloadDeTest()

		expect(new Set([a.id, b.id, nonVerifiee.id]).size).toBe(3)
		for (const compte of [a, b]) {
			const { corps } = await appelerRest('GET', '/api/pros/me', { enTetes: compte.session.enTetes })
			expect(MonCompte.parse(corps).user).toEqual({ id: Number(compte.id), email: compte.email })
		}
		// An account that has not confirmed its address cannot log in: no session to give.
		expect(nonVerifiee.session).toBeNull()
		expect((await payload.findByID({ collection: 'pros', id: nonVerifiee.id }))._verified).toBe(false)
		expect((await payload.findByID({ collection: 'pros', id: a.id }))._verified).toBe(true)
		// Payload would send a confirmation email for a new account: the factory sends none.
		for (const { email } of [a, b, nonVerifiee]) expect(await mailsRecus(email)).toEqual([])
	})

	test('hash, sel, sessions et hash hérité ne sortent jamais, même pour un admin (I06)', async () => {
		const [admin, a, b] = await Promise.all([
			creerCompte('admin'),
			creerCompte('maquilleuse'),
			creerCompte('maquilleuse'),
		])
		const payload = await payloadDeTest()
		const hash = hashFictif()
		// As the import will write it: by the server, without access control.
		await payload.update({ collection: 'pros', id: a.id, data: { legacyBcrypt: hash } })
		const stocke = await payload.db.findOne<{ id: number; legacyBcrypt?: string; sessions?: { id: string }[] }>({
			collection: 'pros',
			where: { id: { equals: a.id } },
		})
		expect(stocke?.legacyBcrypt).toBe(hash)
		const session = stocke?.sessions?.[0]?.id ?? ''
		expect(session).not.toBe('')

		const utilisateur = async (compte: { collection: 'admins' | 'pros'; id: number | string }) => ({
			...(await payload.findByID({ collection: compte.collection, id: compte.id, depth: 0 })),
			collection: compte.collection,
		})
		const parAdmin = { overrideAccess: false, user: await utilisateur({ collection: 'admins', id: admin.id }) }
		const parA = { overrideAccess: false, user: await utilisateur({ collection: 'pros', id: a.id }) }
		const reponses: Record<string, unknown> = {
			'REST, admin, liste': (await appelerRest('GET', '/api/pros?limit=100', { enTetes: admin.session.enTetes })).corps,
			'REST, admin, document': (await appelerRest('GET', `/api/pros/${a.id}`, { enTetes: admin.session.enTetes }))
				.corps,
			'REST, A, liste': (await appelerRest('GET', '/api/pros?limit=100', { enTetes: a.session.enTetes })).corps,
			'REST, A, document': (await appelerRest('GET', `/api/pros/${a.id}`, { enTetes: a.session.enTetes })).corps,
			'REST, A, mon compte': (await appelerRest('GET', '/api/pros/me', { enTetes: a.session.enTetes })).corps,
			'API locale, admin, liste': await payload.find({ collection: 'pros', ...parAdmin }),
			'API locale, admin, document': await payload.findByID({ collection: 'pros', id: a.id, ...parAdmin }),
			'API locale, A, liste': await payload.find({ collection: 'pros', ...parA }),
			'API locale, A, document': await payload.findByID({ collection: 'pros', id: a.id, ...parA }),
		}

		for (const [lecture, reponse] of Object.entries(reponses)) {
			const texte = JSON.stringify(reponse)
			expect({
				lecture,
				cles: cles(reponse).filter(cle => (CLES_SECRETES as readonly string[]).includes(cle)),
			}).toEqual({
				lecture,
				cles: [],
			})
			expect({ lecture, hash: texte.includes(hash), session: texte.includes(session) }).toEqual({
				lecture,
				hash: false,
				session: false,
			})
			expect({ lecture, sessions: texte.match(/"sessions":\[[^\]]/g) }).toEqual({ lecture, sessions: null })
		}
		// A reads her own account and nobody else's: B is in none of her lists.
		const listeDeA = reponses['REST, A, liste'] as { docs: { id: number }[] }
		expect(listeDeA.docs.map(({ id }) => id)).toEqual([Number(a.id)])
		expect((await appelerRest('GET', `/api/pros/${b.id}`, { enTetes: a.session.enTetes })).statut).toBe(404)
		// Even the server's own reads, without access control, never carry the old hash.
		const sansControle = await payload.findByID({ collection: 'pros', id: a.id })
		expect(Object.keys(sansControle)).not.toContain('legacyBcrypt')
	})

	test('une maquilleuse qui envoie ses champs réservés, son hash ou celui de l’ancien site ne change rien', async () => {
		const a = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const avant = await payload.db.findOne<Record<string, unknown> & { id: number }>({
			collection: 'pros',
			where: { id: { equals: a.id } },
		})

		const { statut } = await appelerRest('PATCH', `/api/pros/${a.id}`, {
			enTetes: a.session.enTetes,
			corps: {
				bloque: true,
				_verified: false,
				legacyProvider: 'facebook',
				strapiId: 4242,
				legacyBcrypt: hashFictif(),
				hash: 'faux',
				salt: 'faux',
			},
		})

		expect(statut).toBe(200)
		const apres = await payload.db.findOne<Record<string, unknown> & { id: number }>({
			collection: 'pros',
			where: { id: { equals: a.id } },
		})
		for (const champ of ['blocked', '_verified', 'legacyProvider', 'strapiId', 'legacyBcrypt', 'hash', 'salt'])
			expect({ champ, valeur: apres?.[champ] }).toEqual({ champ, valeur: avant?.[champ] })
		// Her session still opens her account: neither her password nor her confirmation moved.
		const { corps } = await appelerRest('GET', '/api/pros/me', { enTetes: a.session.enTetes })
		expect(MonCompte.parse(corps).user?.id).toBe(Number(a.id))
	})

	test('deux emails qui ne diffèrent que par la casse sont le même compte', async () => {
		const admin = await creerCompte('admin')
		const payload = await payloadDeTest()
		const local = `lea.martin-${crypto.randomUUID()}`
		const motDePasse = motDePasseAleatoire()

		const compte = await payload.create({
			collection: 'pros',
			data: { email: `  ${local.toUpperCase()}@Example.TEST `, password: motDePasse, _verified: true },
			disableVerificationEmail: true,
		})
		expect(compte.email).toBe(`${local}@example.test`)

		// The same address, in another case: refused, by the Local API as by an admin through REST.
		await expect(
			payload.create({
				collection: 'pros',
				data: { email: `${local}@example.test`, password: motDePasseAleatoire() },
				disableVerificationEmail: true,
			})
		).rejects.toThrow()
		const parRest = await appelerRest('POST', '/api/pros', {
			enTetes: admin.session.enTetes,
			corps: { email: `${local}@EXAMPLE.test`, password: motDePasseAleatoire() },
		})
		expect(parRest.statut).toBe(400)
		const memeAdresse = { email: { equals: `${local}@example.test` } }
		expect((await payload.count({ collection: 'pros', where: memeAdresse })).totalDocs).toBe(1)

		// Logging in with any case opens that one account.
		const connexion = await payload.login({
			collection: 'pros',
			data: { email: `${local.toUpperCase()}@EXAMPLE.TEST`, password: motDePasse },
		})
		expect(connexion.user?.id).toBe(compte.id)
		await viderLeCapteur()
	})

	test('une maquilleuse n’entre jamais dans le back-office', async () => {
		const [admin, redaction, a] = await Promise.all([
			creerCompte('admin'),
			creerCompte('redaction'),
			creerCompte('maquilleuse'),
		])
		const acces = async (enTetes: Record<string, string>) =>
			Acces.parse((await appelerRest('GET', '/api/access', { enTetes })).corps).canAccessAdmin

		expect(await acces(a.session.enTetes)).toBe(false)
		expect(await acces(admin.session.enTetes)).toBe(true)
		expect(await acces(redaction.session.enTetes)).toBe(true)

		// The check the admin panel runs before any of its pages and server functions.
		const payload = await payloadDeTest()
		const maquilleuse = { ...(await payload.findByID({ collection: 'pros', id: a.id })), collection: 'pros' as const }
		const req = await createLocalReq({ user: maquilleuse }, payload)
		await expect(canAccessAdmin({ req })).rejects.toThrow()
	})

	test('aucun anonyme ne crée de compte par REST, même sur une base vide', async () => {
		await viderLaBase()
		const payload = await payloadDeTest()
		const corps = { email: `anonyme-${crypto.randomUUID()}@example.test`, password: motDePasseAleatoire() }

		// The « first account » route of Payload, which creates without access control on an empty collection.
		expect((await appelerRest('POST', '/api/pros/first-register', { corps })).statut).toBe(403)
		expect((await appelerRest('POST', '/api/pros', { corps })).statut).toBe(403)
		expect((await payload.count({ collection: 'pros' })).totalDocs).toBe(0)
	})
})
