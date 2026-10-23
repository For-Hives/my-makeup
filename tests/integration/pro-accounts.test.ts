import { afterAll, describe, expect, test } from 'bun:test'
import { canAccessAdmin, createLocalReq } from 'payload'
import { z } from 'zod'
import { createAccount, randomPassword } from '../support/account-factory'
import { emptySink, mailReceived } from '../support/mailpit'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

/**
 * The accounts of the makeup artists (ticket 019). Who reaches which account is in the access
 * matrix (tests/integration/payload-access.test.ts); here, what an account never lets out, how its
 * address is compared, what the factory makes, and the admin panel that stays closed.
 */

/**
 * What never leaves the server, whoever asks (plan 02 §7.3, I06). `sessions` is not in the list of
 * keys: Payload always answers it as an empty list, its content withheld; the test checks that no
 * session identifier appears anywhere in the answer.
 */
const SECRET_KEYS = ['hash', 'salt', 'legacyBcrypt', 'resetPasswordToken', '_verificationToken'] as const

/** A made-up bcrypt hash, of the shape of the old site's: never the hash of a real password. */
const fictionalHash = () =>
	`$2a$10$${'fictif'.repeat(9).slice(0, 53 - 36)}${crypto.randomUUID().replaceAll('-', '')}`.slice(0, 60)

/** Every key of a JSON value, at any depth. */
const keys = (valeur: unknown): string[] => {
	if (Array.isArray(valeur)) return valeur.flatMap(keys)
	if (typeof valeur !== 'object' || valeur === null) return []
	return Object.entries(valeur).flatMap(([cle, sous]) => [cle, ...keys(sous)])
}

/** Payload leaves `canAccessAdmin` out of the answer when it is false. */
const Access = z.object({ canAccessAdmin: z.boolean().default(false) })
const MyAccount = z.object({ user: z.object({ id: z.number(), email: z.string() }).nullable() })

afterAll(async () => {
	await Promise.all([emptyBase(), emptySink()])
})

describe('Les comptes des maquilleuses', () => {
	test('la fabrique crée A, B et une maquilleuse non vérifiée, sans envoyer aucun mail', async () => {
		const [a, b, unverified] = await Promise.all([
			createAccount('maquilleuse'),
			createAccount('maquilleuse'),
			createAccount('maquilleuse-non-verifiee'),
		])
		const payload = await testPayload()

		expect(new Set([a.id, b.id, unverified.id]).size).toBe(3)
		for (const account of [a, b]) {
			const { corps } = await callRest('GET', '/api/pros/me', { enTetes: account.session.enTetes })
			expect(MyAccount.parse(corps).user).toEqual({ id: Number(account.id), email: account.email })
		}
		// An account that has not confirmed its address cannot log in: no session to give.
		expect(unverified.session).toBeNull()
		expect((await payload.findByID({ collection: 'pros', id: unverified.id }))._verified).toBe(false)
		expect((await payload.findByID({ collection: 'pros', id: a.id }))._verified).toBe(true)
		// Payload would send a confirmation email for a new account: the factory sends none.
		for (const { email } of [a, b, unverified]) expect(await mailReceived(email)).toEqual([])
	})

	test('hash, sel, sessions et hash hérité ne sortent jamais, même pour un admin (I06)', async () => {
		const [admin, a, b] = await Promise.all([
			createAccount('admin'),
			createAccount('maquilleuse'),
			createAccount('maquilleuse'),
		])
		const payload = await testPayload()
		const hash = fictionalHash()
		// As the import will write it: by the server, without access control.
		await payload.update({ collection: 'pros', id: a.id, data: { legacyBcrypt: hash } })
		const stored = await payload.db.findOne<{ id: number; legacyBcrypt?: string; sessions?: { id: string }[] }>({
			collection: 'pros',
			where: { id: { equals: a.id } },
		})
		expect(stored?.legacyBcrypt).toBe(hash)
		const session = stored?.sessions?.[0]?.id ?? ''
		expect(session).not.toBe('')

		const user = async (compte: { collection: 'admins' | 'pros'; id: number | string }) => ({
			...(await payload.findByID({ collection: compte.collection, id: compte.id, depth: 0 })),
			collection: compte.collection,
		})
		const byAdmin = { overrideAccess: false, user: await user({ collection: 'admins', id: admin.id }) }
		const byA = { overrideAccess: false, user: await user({ collection: 'pros', id: a.id }) }
		const responses: Record<string, unknown> = {
			'REST, admin, liste': (await callRest('GET', '/api/pros?limit=100', { enTetes: admin.session.enTetes })).corps,
			'REST, admin, document': (await callRest('GET', `/api/pros/${a.id}`, { enTetes: admin.session.enTetes })).corps,
			'REST, A, liste': (await callRest('GET', '/api/pros?limit=100', { enTetes: a.session.enTetes })).corps,
			'REST, A, document': (await callRest('GET', `/api/pros/${a.id}`, { enTetes: a.session.enTetes })).corps,
			'REST, A, mon compte': (await callRest('GET', '/api/pros/me', { enTetes: a.session.enTetes })).corps,
			'API locale, admin, liste': await payload.find({ collection: 'pros', ...byAdmin }),
			'API locale, admin, document': await payload.findByID({ collection: 'pros', id: a.id, ...byAdmin }),
			'API locale, A, liste': await payload.find({ collection: 'pros', ...byA }),
			'API locale, A, document': await payload.findByID({ collection: 'pros', id: a.id, ...byA }),
		}

		for (const [read, response] of Object.entries(responses)) {
			const text = JSON.stringify(response)
			expect({
				lecture: read,
				cles: keys(response).filter(cle => (SECRET_KEYS as readonly string[]).includes(cle)),
			}).toEqual({
				lecture: read,
				cles: [],
			})
			expect({ lecture: read, hash: text.includes(hash), session: text.includes(session) }).toEqual({
				lecture: read,
				hash: false,
				session: false,
			})
			expect({ lecture: read, sessions: text.match(/"sessions":\[[^\]]/g) }).toEqual({ lecture: read, sessions: null })
		}
		// A reads her own account and nobody else's: B is in none of her lists.
		const listOfA = responses['REST, A, liste'] as { docs: { id: number }[] }
		expect(listOfA.docs.map(({ id }) => id)).toEqual([Number(a.id)])
		expect((await callRest('GET', `/api/pros/${b.id}`, { enTetes: a.session.enTetes })).statut).toBe(404)
		// Even the server's own reads, without access control, never carry the old hash.
		const withoutCheck = await payload.findByID({ collection: 'pros', id: a.id })
		expect(Object.keys(withoutCheck)).not.toContain('legacyBcrypt')
	})

	test('une maquilleuse qui envoie ses champs réservés, son hash ou celui de l’ancien site ne change rien', async () => {
		const a = await createAccount('maquilleuse')
		const payload = await testPayload()
		const before = await payload.db.findOne<Record<string, unknown> & { id: number }>({
			collection: 'pros',
			where: { id: { equals: a.id } },
		})

		const { statut: status } = await callRest('PATCH', `/api/pros/${a.id}`, {
			enTetes: a.session.enTetes,
			corps: {
				bloque: true,
				_verified: false,
				legacyProvider: 'facebook',
				strapiId: 4242,
				legacyBcrypt: fictionalHash(),
				hash: 'faux',
				salt: 'faux',
			},
		})

		expect(status).toBe(200)
		const after = await payload.db.findOne<Record<string, unknown> & { id: number }>({
			collection: 'pros',
			where: { id: { equals: a.id } },
		})
		for (const field of ['blocked', '_verified', 'legacyProvider', 'strapiId', 'legacyBcrypt', 'hash', 'salt'])
			expect({ champ: field, valeur: after?.[field] }).toEqual({ champ: field, valeur: before?.[field] })
		// Her session still opens her account: neither her password nor her confirmation moved.
		const { corps } = await callRest('GET', '/api/pros/me', { enTetes: a.session.enTetes })
		expect(MyAccount.parse(corps).user?.id).toBe(Number(a.id))
	})

	test('deux emails qui ne diffèrent que par la casse sont le même compte', async () => {
		const admin = await createAccount('admin')
		const payload = await testPayload()
		const local = `lea.martin-${crypto.randomUUID()}`
		const password = randomPassword()

		const account = await payload.create({
			collection: 'pros',
			data: { email: `  ${local.toUpperCase()}@Example.TEST `, password: password, _verified: true },
			disableVerificationEmail: true,
		})
		expect(account.email).toBe(`${local}@example.test`)

		// The same address, in another case: refused, by the Local API as by an admin through REST.
		await expect(
			payload.create({
				collection: 'pros',
				data: { email: `${local}@example.test`, password: randomPassword() },
				disableVerificationEmail: true,
			})
		).rejects.toThrow()
		const byRest = await callRest('POST', '/api/pros', {
			enTetes: admin.session.enTetes,
			corps: { email: `${local}@EXAMPLE.test`, password: randomPassword() },
		})
		expect(byRest.statut).toBe(400)
		const sameUrl = { email: { equals: `${local}@example.test` } }
		expect((await payload.count({ collection: 'pros', where: sameUrl })).totalDocs).toBe(1)

		// Logging in with any case opens that one account.
		const signIn = await payload.login({
			collection: 'pros',
			data: { email: `${local.toUpperCase()}@EXAMPLE.TEST`, password: password },
		})
		expect(signIn.user?.id).toBe(account.id)
		await emptySink()
	})

	test('une maquilleuse n’entre jamais dans le back-office', async () => {
		const [admin, editor, a] = await Promise.all([
			createAccount('admin'),
			createAccount('redaction'),
			createAccount('maquilleuse'),
		])
		const access = async (enTetes: Record<string, string>) =>
			Access.parse((await callRest('GET', '/api/access', { enTetes })).corps).canAccessAdmin

		expect(await access(a.session.enTetes)).toBe(false)
		expect(await access(admin.session.enTetes)).toBe(true)
		expect(await access(editor.session.enTetes)).toBe(true)

		// The check the admin panel runs before any of its pages and server functions.
		const payload = await testPayload()
		const artist = { ...(await payload.findByID({ collection: 'pros', id: a.id })), collection: 'pros' as const }
		const req = await createLocalReq({ user: artist }, payload)
		await expect(canAccessAdmin({ req })).rejects.toThrow()
	})

	test('aucun anonyme ne crée de compte par REST, même sur une base vide', async () => {
		await emptyBase()
		const payload = await testPayload()
		const corps = { email: `anonyme-${crypto.randomUUID()}@example.test`, password: randomPassword() }

		// The « first account » route of Payload, which creates without access control on an empty collection.
		expect((await callRest('POST', '/api/pros/first-register', { corps })).statut).toBe(403)
		expect((await callRest('POST', '/api/pros', { corps })).statut).toBe(403)
		expect((await payload.count({ collection: 'pros' })).totalDocs).toBe(0)
	})
})
