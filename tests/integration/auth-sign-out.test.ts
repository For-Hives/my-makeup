import { afterAll, describe, expect, test } from 'bun:test'
import { authLog } from '@/lib/auth/auth-log'
import { closeSession } from '@/lib/auth/sign-out'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'
import { openSession } from '../support/session'

/**
 * The sign-out of a makeup artist (ticket 078; plan 02 I11, I13). The Server Action, the cookie in
 * a browser and the Back button are played by tests/e2e/deconnexion.spec.ts.
 */

afterAll(async () => {
	await emptyBase()
})

const MOT_DE_PASSE = 'aaaaaaaa'

async function sessionsEnBase(id: number | string): Promise<number> {
	const payload = await testPayload()
	const ligne = await payload.db.findOne<{ id: number; sessions?: unknown[] }>({
		collection: 'pros',
		where: { id: { equals: id } },
	})
	return ligne?.sessions?.length ?? 0
}

/** Who Payload says is behind these headers. */
async function qui(enTetes: Record<string, string>) {
	const payload = await testPayload()
	return (await payload.auth({ headers: new Headers(enTetes) })).user
}

const journal = async () =>
	(await (await testPayload()).find({ collection: 'auth-events', depth: 0, limit: 500, sort: 'id' })).docs

async function nouvelleSession(compte: { email: string }) {
	return openSession(await testPayload(), {
		collection: 'pros',
		email: compte.email,
		motDePasse: MOT_DE_PASSE,
	})
}

describe('I11 : la déconnexion retire la session en base, l’ancien jeton est refusé', () => {
	test('les sessions sont bien tenues en base pour les maquilleuses', async () => {
		const payload = await testPayload()
		expect(payload.collections.pros.config.auth.useSessions).toBe(true)
	})

	test('après la déconnexion, le jeton rejoué n’ouvre plus rien : ni par l’API locale, ni par REST', async () => {
		const compte = await createAccount('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		const { enTetes } = compte.session
		const payload = await testPayload()
		expect((await qui(enTetes))?.id).toBe(Number(compte.id))
		const avant = await sessionsEnBase(compte.id)

		const resultat = await closeSession({ payload, headers: new Headers(enTetes), toutes: false })

		expect(resultat).toEqual({ ok: true, fermee: true })
		expect(await sessionsEnBase(compte.id)).toBe(avant - 1)
		expect(await qui(enTetes)).toBeNull()
		const me = await callRest('GET', '/api/pros/me', { enTetes })
		expect((me.corps as { user: unknown }).user).toBeNull()
		const lecture = await callRest('GET', `/api/pros/${compte.id}`, { enTetes })
		expect(lecture.statut).toBe(403)
	})

	test('« cet appareil » ne ferme pas les autres sessions du même compte', async () => {
		const compte = await createAccount('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		const [a, b] = [await nouvelleSession(compte), await nouvelleSession(compte)]
		const payload = await testPayload()

		await closeSession({ payload, headers: new Headers(a.enTetes), toutes: false })

		expect(await qui(a.enTetes)).toBeNull()
		expect((await qui(b.enTetes))?.id).toBe(Number(compte.id))
	})

	test('une seconde déconnexion, ou une déconnexion sans session, ne fait pas d’erreur', async () => {
		const compte = await createAccount('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		const payload = await testPayload()
		const entetes = new Headers(compte.session.enTetes)
		await closeSession({ payload, headers: entetes, toutes: false })

		expect(await closeSession({ payload, headers: entetes, toutes: false })).toEqual({ ok: true, fermee: false })
		expect(await closeSession({ payload, headers: new Headers(), toutes: true })).toEqual({
			ok: true,
			fermee: false,
		})
	})

	test('la session d’un admin n’est pas une session de l’espace : elle reste ouverte', async () => {
		const admin = await createAccount('admin')
		const payload = await testPayload()

		const resultat = await closeSession({ payload, headers: new Headers(admin.session.enTetes), toutes: true })

		expect(resultat).toEqual({ ok: true, fermee: false })
		expect((await qui(admin.session.enTetes))?.id).toBe(Number(admin.id))
	})
})

describe('I13 : « me déconnecter de tous les appareils »', () => {
	test('toutes les sessions du compte sont retirées, celles des autres comptes restent', async () => {
		const [moi, autre] = await Promise.all([
			createAccount('maquilleuse', { motDePasse: () => MOT_DE_PASSE }),
			createAccount('maquilleuse', { motDePasse: () => MOT_DE_PASSE }),
		])
		const mesSessions = [moi.session, await nouvelleSession(moi), await nouvelleSession(moi)]
		const sesSessions = [autre.session, await nouvelleSession(autre)]
		const payload = await testPayload()
		expect(await sessionsEnBase(moi.id)).toBeGreaterThanOrEqual(3)
		const siennes = await sessionsEnBase(autre.id)

		const resultat = await closeSession({
			payload,
			headers: new Headers(mesSessions[1]?.enTetes),
			toutes: true,
		})

		expect(resultat).toEqual({ ok: true, fermee: true })
		expect(await sessionsEnBase(moi.id)).toBe(0)
		for (const session of mesSessions) expect(await qui(session.enTetes)).toBeNull()
		expect(await sessionsEnBase(autre.id)).toBe(siennes)
		for (const session of sesSessions) expect((await qui(session.enTetes))?.id).toBe(Number(autre.id))
	})
})

describe('le journal et ses pannes', () => {
	test('une ligne « deconnexion » et une ligne « deconnexion-partout », chacune « ok »', async () => {
		const compte = await createAccount('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		const payload = await testPayload()
		const autre = await nouvelleSession(compte)
		const avant = (await journal()).length

		await closeSession({
			payload,
			headers: new Headers(compte.session.enTetes),
			toutes: false,
			journal: authLog(payload),
		})
		await closeSession({ payload, headers: new Headers(autre.enTetes), toutes: true, journal: authLog(payload) })

		expect((await journal()).slice(avant).map(({ type, code }) => [type, code])).toEqual([
			['sign-out', 'ok'],
			['sign-out-everywhere', 'ok'],
		])
	})

	test('un journal qui échoue ne rend pas la déconnexion en échec, la session est bien retirée', async () => {
		const compte = await createAccount('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		const payload = await testPayload()

		const resultat = await closeSession({
			payload,
			headers: new Headers(compte.session.enTetes),
			toutes: false,
			journal: () => Promise.reject(new Error('journal en panne')),
		})

		expect(resultat).toEqual({ ok: true, fermee: true })
		expect(await qui(compte.session.enTetes)).toBeNull()
	})
})
