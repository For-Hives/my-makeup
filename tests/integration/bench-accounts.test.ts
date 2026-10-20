import { afterEach, describe, expect, test } from 'bun:test'
import type { BrowserContext } from '@playwright/test'
import { z } from 'zod'
import { GET } from '@/app/(payload)/api/[...slug]/route'
import { COOKIE_SURVIVAL_AFTER_END_S } from '@/lib/auth/session-state'
import { createAccount, type TestAccount } from '../support/account-factory'
import { ROOT } from '../support/bench'
import { emptyBase, testPayload } from '../support/payload-test'

const MyAccount = z.object({
	user: z.object({ id: z.number(), email: z.string(), collection: z.string() }).nullable(),
})

/**
 * « Mon compte » : GET /api/admins/me, answered by the real route of the application, called
 * with a web request as Next would call it. It says which account the request is logged in as.
 */
async function myAccount(enTetes: Record<string, string>) {
	const request = new Request(`${process.env.NEXT_PUBLIC_SITE_URL}/api/admins/me`, { headers: enTetes })
	const response = await GET(request, { params: Promise.resolve({ slug: ['admins', 'me'] }) })
	return { status: response.status, compte: MyAccount.parse(await response.json()).user }
}

const cookieOf = (compte: TestAccount<'admin'>) => {
	const [cookie] = compte.session.cookies
	if (!cookie) throw new Error('la session ne porte aucun cookie')
	return cookie
}

describe('La fabrique de comptes : un compte de test et sa session, sans mot de passe saisi', () => {
	afterEach(emptyBase)

	test('un appel crée un compte en @example.test et rend une session valide sur « mon compte »', async () => {
		const account = await createAccount('admin')

		expect(account.email).toMatch(/^admin-[0-9a-f-]{36}@example\.test$/)
		expect(await myAccount(account.session.enTetes)).toEqual({
			status: 200,
			compte: { id: account.id as number, email: account.email, collection: 'admins' },
		})
		// The account is a real document of the bench database.
		const payload = await testPayload()
		expect((await payload.findByID({ collection: 'admins', id: account.id })).email).toBe(account.email)
	})

	test('pour un client HTTP : le cookie et son Origin vont ensemble, le cookie seul est ignoré', async () => {
		const { session } = await createAccount('admin')

		expect(Object.keys(session.enTetes).sort()).toEqual(['Cookie', 'Origin'])
		expect(session.enTetes.Origin).toBe(process.env.NEXT_PUBLIC_SITE_URL ?? '')
		expect((await myAccount({ Cookie: session.enTetes.Cookie })).compte).toBeNull()
		expect((await myAccount({ ...session.enTetes, Origin: 'https://exemple.test' })).compte).toBeNull()
	})

	test('pour un navigateur : un cookie HttpOnly posé sur l’adresse du site, valable jusqu’à la fin de la session', async () => {
		const account = await createAccount('admin')
		const cookie = cookieOf(account)
		// Checked by the compiler: this is what Playwright's `context.addCookies()` takes.
		const forPlaywright: Parameters<BrowserContext['addCookies']>[0] = account.session.cookies

		expect(forPlaywright.length).toBe(1)
		expect(cookie).toMatchObject({
			name: 'payload-token',
			url: process.env.NEXT_PUBLIC_SITE_URL ?? '',
			httpOnly: true,
			secure: false,
			sameSite: 'Lax',
		})
		// The cookie outlives its token by the grace period of ticket 080, so that « session expirée » can be told.
		expect(cookie.expires).toBe(account.session.expire.getTime() / 1000 + COOKIE_SURVIVAL_AFTER_END_S)
		expect(account.session.expire.getTime()).toBeGreaterThan(Date.now())
		// What a browser sends once the cookie is set: no Origin on a page of the site itself, but
		// the header that says where the request comes from.
		const ofBrowser = { Cookie: `${cookie.name}=${cookie.value}` }
		expect((await myAccount({ ...ofBrowser, 'Sec-Fetch-Site': 'same-origin' })).compte?.email).toBe(account.email)
		expect((await myAccount({ ...ofBrowser, 'Sec-Fetch-Site': 'cross-site' })).compte).toBeNull()
	})

	test('deux tests en parallèle obtiennent deux comptes distincts, effacés à la remise à zéro', async () => {
		// Two calls at the same moment, as two tests running side by side would make them.
		const [a, other] = await Promise.all([createAccount('admin'), createAccount('admin')])

		expect(a.id).not.toBe(other.id)
		expect(a.email).not.toBe(other.email)
		expect(cookieOf(a).value).not.toBe(cookieOf(other).value)
		expect((await myAccount(a.session.enTetes)).compte?.email).toBe(a.email)
		expect((await myAccount(other.session.enTetes)).compte?.email).toBe(other.email)

		await emptyBase()

		const payload = await testPayload()
		expect((await payload.count({ collection: 'admins' })).totalDocs).toBe(0)
		// Their sessions went with them: the two cookies open nothing any more.
		expect((await myAccount(a.session.enTetes)).compte).toBeNull()
		expect((await myAccount(other.session.enTetes)).compte).toBeNull()
	})

	test('aucun mot de passe dans les journaux ni dans ce que rend la fabrique', async () => {
		// The factory runs in a child process, with a password this test chose: everything the
		// child prints is read, the logs of Payload at their most talkative included.
		const password = `mot-de-passe-temoin-${crypto.randomUUID()}`
		const child = Bun.spawn([process.execPath, '--no-env-file', 'tests/fixtures/factory-sentinel.ts'], {
			cwd: ROOT,
			env: { ...process.env, SENTINEL_PASSWORD: password },
			stdout: 'pipe',
			stderr: 'pipe',
		})
		const [code, output, errors] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		])
		const logs = output + errors
		const rendered = /^TEMOIN-FABRIQUE (.+)$/m.exec(output)?.[1] ?? ''
		const account = z.object({ id: z.number(), email: z.string() }).parse(JSON.parse(rendered || '{}'))

		expect(code).toBe(0)
		expect(logs).not.toContain(password)
		// The witness is a fair one: this password is the one the account was created with.
		const payload = await testPayload()
		const signIn = await payload.login({ collection: 'admins', data: { email: account.email, password: password } })
		expect(signIn.user?.id).toBe(account.id)
	}, 20_000)
})
