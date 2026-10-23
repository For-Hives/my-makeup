import { afterAll, describe, expect, test } from 'bun:test'
import { readExpiration } from '@/lib/auth/session-state'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'
import { openSessionWithoutPassword } from '../support/session'

/** The session that ended (ticket 080; plan 02 I12). The pages and the redirection are played by tests/e2e/expired-session.spec.ts. */

afterAll(async () => {
	await emptyBase()
})

describe('I12 : un jeton dont la date de fin est passée est refusé', () => {
	test('le même compte : la session en cours passe, la session expirée n’est plus une session', async () => {
		const account = await createAccount('maquilleuse')
		const payload = await testPayload()
		const expired = await openSessionWithoutPassword(payload, { collection: 'pros', id: account.id }, process.env, {
			dureeS: -60,
		})
		const token = /payload-token=(.+)$/.exec(expired.enTetes.Cookie)?.[1] ?? ''
		// The fixture is what it says: an end date in the past, and the session is still in the database.
		expect(readExpiration(token)).toBeLessThan(Math.floor(Date.now() / 1000))

		const me = (enTetes: Record<string, string>) => callRest('GET', '/api/pros/me', { enTetes })
		const readAccount = (enTetes: Record<string, string>) => callRest('GET', `/api/pros/${account.id}`, { enTetes })
		const extend = (enTetes: Record<string, string>) => callRest('POST', '/api/pros/refresh-token', { enTetes })

		// Payload answers « no user » to `me` and 403 to a protected route: it has no 401 of its own,
		// and an expired token is refused exactly like a missing one (the site turns both into a sign-in).
		expect((await me(account.session.enTetes)).statut).toBe(200)
		expect((await me(account.session.enTetes)).corps).toHaveProperty('user.id', account.id)
		expect((await me(expired.enTetes)).corps).toMatchObject({ user: null })
		expect((await readAccount(account.session.enTetes)).statut).toBe(200)
		expect((await readAccount(expired.enTetes)).statut).toBe(403)
		expect((await extend(account.session.enTetes)).statut).toBe(200)
		expect((await extend(expired.enTetes)).statut).toBe(403)
	})
})
