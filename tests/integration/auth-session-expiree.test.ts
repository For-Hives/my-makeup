import { afterAll, describe, expect, test } from 'bun:test'
import { readExpiration } from '@/lib/auth/session-state'
import { creerCompte } from '../support/account-factory'
import { payloadDeTest, viderLaBase } from '../support/payload-test'
import { appelerRest } from '../support/rest'
import { ouvrirSessionSansMotDePasse } from '../support/session'

/** The session that ended (ticket 080; plan 02 I12). The pages and the redirection are played by tests/e2e/session-expiree.spec.ts. */

afterAll(async () => {
	await viderLaBase()
})

describe('I12 : un jeton dont la date de fin est passée est refusé', () => {
	test('le même compte : la session en cours passe, la session expirée n’est plus une session', async () => {
		const compte = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const expiree = await ouvrirSessionSansMotDePasse(payload, { collection: 'pros', id: compte.id }, process.env, {
			dureeS: -60,
		})
		const jeton = /payload-token=(.+)$/.exec(expiree.enTetes.Cookie)?.[1] ?? ''
		// The fixture is what it says: an end date in the past, and the session is still in the database.
		expect(readExpiration(jeton)).toBeLessThan(Math.floor(Date.now() / 1000))

		const moi = (enTetes: Record<string, string>) => appelerRest('GET', '/api/pros/me', { enTetes })
		const compteLu = (enTetes: Record<string, string>) => appelerRest('GET', `/api/pros/${compte.id}`, { enTetes })
		const prolonger = (enTetes: Record<string, string>) => appelerRest('POST', '/api/pros/refresh-token', { enTetes })

		// Payload answers « no user » to `me` and 403 to a protected route: it has no 401 of its own,
		// and an expired token is refused exactly like a missing one (the site turns both into a sign-in).
		expect((await moi(compte.session.enTetes)).statut).toBe(200)
		expect((await moi(compte.session.enTetes)).corps).toHaveProperty('user.id', compte.id)
		expect((await moi(expiree.enTetes)).corps).toMatchObject({ user: null })
		expect((await compteLu(compte.session.enTetes)).statut).toBe(200)
		expect((await compteLu(expiree.enTetes)).statut).toBe(403)
		expect((await prolonger(compte.session.enTetes)).statut).toBe(200)
		expect((await prolonger(expiree.enTetes)).statut).toBe(403)
	})
})
