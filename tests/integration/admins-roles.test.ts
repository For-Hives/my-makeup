import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'
import { z } from 'zod'
import { ADMIN_SESSION_DURATION_S } from '@/collections/Admins'
import { createAccount } from '../support/account-factory'
import { countMails, emptySink } from '../support/mailpit'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

const MyAccount = z.object({
	user: z.object({ id: z.number(), email: z.string(), role: z.enum(['admin', 'editor']) }).nullable(),
	exp: z.number().optional(),
})

/** « Mon compte » of the admin panel: which account the request is logged in as, and when its session ends. */
async function myAccount(enTetes: Record<string, string>) {
	const { statut: status, corps } = await callRest('GET', '/api/admins/me', { enTetes })
	expect(status).toBe(200)
	return MyAccount.parse(corps)
}

describe('Les comptes admins : deux rôles, une session de 8 heures', () => {
	afterEach(async () => {
		setSystemTime()
		await emptyBase()
	})

	test('la fabrique crée un compte admin et un compte redaction, et chacun ouvre sa session', async () => {
		const [admin, editor] = await Promise.all([createAccount('admin'), createAccount('redaction')])

		expect((await myAccount(admin.session.enTetes)).user).toEqual({
			id: Number(admin.id),
			email: admin.email,
			role: 'admin',
		})
		expect((await myAccount(editor.session.enTetes)).user).toEqual({
			id: Number(editor.id),
			email: editor.email,
			role: 'editor',
		})
	})

	test('la session d’un compte admin dure 8 heures, puis elle n’ouvre plus rien (horloge simulée)', async () => {
		const start = Date.now()
		const { email, session } = await createAccount('admin')

		expect(ADMIN_SESSION_DURATION_S).toBe(8 * 3600)
		const { exp } = await myAccount(session.enTetes)
		// The token is signed for 8 hours from its opening, to the second.
		expect((exp ?? 0) - Math.floor(start / 1000)).toBeGreaterThanOrEqual(8 * 3600 - 5)
		expect((exp ?? 0) - Math.floor(start / 1000)).toBeLessThanOrEqual(8 * 3600 + 5)
		expect(session.expire.getTime()).toBe((exp ?? 0) * 1000)

		setSystemTime(new Date((exp ?? 0) * 1000 - 60_000))
		expect((await myAccount(session.enTetes)).user?.email).toBe(email)

		setSystemTime(new Date((exp ?? 0) * 1000 + 1000))
		expect((await myAccount(session.enTetes)).user).toBeNull()
	})

	test('la session d’un compte redaction dure aussi 8 heures', async () => {
		const start = Date.now()
		const { session } = await createAccount('redaction')
		const { exp } = await myAccount(session.enTetes)

		expect(Math.abs((exp ?? 0) - Math.floor(start / 1000) - 8 * 3600)).toBeLessThanOrEqual(5)
		setSystemTime(new Date((exp ?? 0) * 1000 - 60_000))
		expect((await myAccount(session.enTetes)).user?.role).toBe('editor')

		setSystemTime(new Date((exp ?? 0) * 1000 + 1000))
		expect((await myAccount(session.enTetes)).user).toBeNull()
	})

	test('sur une base vide, l’écran du premier compte est fermé : un visiteur n’y crée aucun compte', async () => {
		const email = `premier-${crypto.randomUUID()}@example.test`
		const payload = await testPayload()
		expect((await payload.count({ collection: 'admins' })).totalDocs).toBe(0)

		// What Payload's « create the first account » screen posts, without any session.
		const { statut: status } = await callRest('POST', '/api/admins/first-register', {
			corps: { email, password: crypto.randomUUID(), role: 'admin' },
		})

		expect(status).toBe(403)
		expect((await payload.count({ collection: 'admins' })).totalDocs).toBe(0)
	})

	test('sur une base vide, la session d’une maquilleuse ne crée aucun compte admin, avec ou sans rôle dans le corps', async () => {
		const artist = await createAccount('maquilleuse')
		const payload = await testPayload()

		for (const corps of [
			{ role: 'editor' },
			{ role: 'admin' },
			// Without a role: the default would be `editor`.
			{},
		]) {
			const { statut: status } = await callRest('POST', '/api/admins/first-register', {
				enTetes: artist.session.enTetes,
				corps: { email: `intrus-${crypto.randomUUID()}@example.test`, password: crypto.randomUUID(), ...corps },
			})
			expect([JSON.stringify(corps), status]).toEqual([JSON.stringify(corps), 403])
		}
		expect((await payload.count({ collection: 'admins' })).totalDocs).toBe(0)
	})

	test('le premier compte se crée par la Local API de la procédure d’exploitation, avec le rôle admin', async () => {
		const email = `procedure-${crypto.randomUUID()}@example.test`
		const payload = await testPayload()

		// What `bun run admin:create` does: the Local API, without any request.
		await payload.create({ collection: 'admins', data: { email, password: crypto.randomUUID(), role: 'admin' } })

		const { docs } = await payload.find({ collection: 'admins', where: { email: { equals: email } } })
		expect(docs.map(({ role }) => role)).toEqual(['admin'])
	})

	test('une fois le premier compte créé, l’écran du premier compte est fermé', async () => {
		await createAccount('admin')
		const email = `second-${crypto.randomUUID()}@example.test`

		const { statut: status } = await callRest('POST', '/api/admins/first-register', {
			corps: { email, password: crypto.randomUUID(), role: 'admin' },
		})

		expect(status).toBe(403)
		const payload = await testPayload()
		expect((await payload.count({ collection: 'admins', where: { email: { equals: email } } })).totalDocs).toBe(0)
	})

	test('un compte créé par un admin sans rôle choisi est un compte redaction, le plus étroit', async () => {
		const admin = await createAccount('admin')
		const email = `sans-role-${crypto.randomUUID()}@example.test`

		const { statut: status, corps } = await callRest('POST', '/api/admins', {
			enTetes: admin.session.enTetes,
			corps: { email, password: crypto.randomUUID() },
		})

		expect(status).toBe(201)
		expect((corps as { doc?: { role?: string } }).doc?.role).toBe('editor')
	})
})

describe('Le frein par adresse sur la connexion du back-office (ticket 094)', () => {
	const PASSWORD = 'un-mot-de-passe-de-test-094'
	const signIn = (email: string, password: string, xForwardedFor: string) =>
		callRest('POST', '/api/admins/login', {
			corps: { email, password },
			enTetes: { 'x-forwarded-for': xForwardedFor },
		})

	afterEach(async () => {
		await emptyBase()
	})

	test('le 11e échec d’une adresse est refusé en 429, même avec le bon mot de passe ; une autre adresse reste libre', async () => {
		const account = await createAccount('admin', { motDePasse: () => PASSWORD })
		const throttledUrl = '203.0.113.40'

		for (let i = 0; i < 10; i++) expect((await signIn(account.email, `faux-${i}`, throttledUrl)).statut).toBe(401)
		const eleventh = await signIn(account.email, 'faux-10', throttledUrl)

		expect(eleventh.statut).toBe(429)
		expect(eleventh.texte).toContain('Trop d’essais, réessaie dans quelques minutes.')
		expect((await signIn(account.email, PASSWORD, throttledUrl)).statut).toBe(429)
		// Another address is not braked, and the account is not locked: the right password gets in.
		expect((await signIn(account.email, PASSWORD, '203.0.113.41')).statut).toBe(200)
	})

	test('des mots de passe faux sous le frein ne verrouillent pas le compte, pour aucune adresse', async () => {
		const account = await createAccount('admin', { motDePasse: () => PASSWORD })

		// Well past the 5 failures of Payload's default lock, still under the brake of 10.
		for (let i = 0; i < 8; i++) expect((await signIn(account.email, `faux-${i}`, '203.0.113.43')).statut).toBe(401)

		expect((await signIn(account.email, PASSWORD, '203.0.113.44')).statut).toBe(200)
	})

	test('un admin qui se trompe pas se connecte, avec son cookie', async () => {
		const account = await createAccount('admin', { motDePasse: () => PASSWORD })

		const { statut: status, enTetes: headers } = await signIn(account.email, PASSWORD, '203.0.113.42')

		expect(status).toBe(200)
		expect(headers.get('set-cookie') ?? '').toStartWith('payload-token=')
	})
})

describe('Mot de passe oublié des comptes admin : portes REST fermées (ticket 272)', () => {
	afterEach(async () => {
		await emptyBase()
		await emptySink()
	})

	test('forgot-password et reset-password répondent 403, aucun mail ne part, même après 11 demandes', async () => {
		const account = await createAccount('admin')
		await emptySink()
		const unknown = `inconnue-${crypto.randomUUID()}@example.test`

		for (let i = 0; i < 11; i++) {
			const r = await callRest('POST', '/api/admins/forgot-password', {
				corps: { email: i % 2 ? account.email : unknown },
				enTetes: { 'x-forwarded-for': '203.0.113.72' },
			})
			expect(r.statut).toBe(403)
		}
		const reset = await callRest('POST', '/api/admins/reset-password', {
			corps: { token: 'a'.repeat(40), password: 'nouveau-mot-de-passe-fictif' },
		})
		expect(reset.statut).toBe(403)

		expect(await countMails()).toBe(0)
		const payload = await testPayload()
		const line = await payload.findByID({ collection: 'admins', id: account.id, depth: 0, overrideAccess: true })
		expect((line as { resetPasswordToken?: string | null }).resetPasswordToken ?? null).toBeNull()
	})

	test('le journal garde une ligne par demande refusée, sans adresse', async () => {
		const account = await createAccount('admin')
		const payload = await testPayload()
		const count = async (type: 'forgot-password' | 'password-reset') =>
			(await payload.count({ collection: 'auth-events', where: { type: { equals: type } } })).totalDocs
		const [before, beforeReset] = [await count('forgot-password'), await count('password-reset')]

		await callRest('POST', '/api/admins/forgot-password', { corps: { email: account.email } })
		await callRest('POST', '/api/admins/forgot-password', { corps: { email: account.email } })
		await callRest('POST', '/api/admins/reset-password', { corps: { token: 'b'.repeat(40), password: 'x'.repeat(14) } })

		expect(await count('forgot-password')).toBe(before + 2)
		expect(await count('password-reset')).toBe(beforeReset + 1)
		const rows = await payload.find({ collection: 'auth-events', depth: 0, limit: 1000 })
		expect(JSON.stringify(rows.docs)).not.toContain(account.email)
	})
})
