import { afterAll, describe, expect, test } from 'bun:test'
import { authLog } from '@/lib/auth/auth-log'
import { closeSession } from '@/lib/auth/sign-out'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'
import { openSession } from '../support/session'

/**
 * The sign-out of a makeup artist (ticket 078; plan 02 I11, I13). The Server Action, the cookie in
 * a browser and the Back button are played by tests/e2e/sign-out.spec.ts.
 */

afterAll(async () => {
	await emptyBase()
})

const PASSWORD = 'aaaaaaaa'

async function sessionsInBase(id: number | string): Promise<number> {
	const payload = await testPayload()
	const line = await payload.db.findOne<{ id: number; sessions?: unknown[] }>({
		collection: 'pros',
		where: { id: { equals: id } },
	})
	return line?.sessions?.length ?? 0
}

/** Who Payload says is behind these headers. */
async function which(enTetes: Record<string, string>) {
	const payload = await testPayload()
	return (await payload.auth({ headers: new Headers(enTetes) })).user
}

const log = async () =>
	(await (await testPayload()).find({ collection: 'auth-events', depth: 0, limit: 500, sort: 'id' })).docs

async function newSession(compte: { email: string }) {
	return openSession(await testPayload(), {
		collection: 'pros',
		email: compte.email,
		motDePasse: PASSWORD,
	})
}

describe('I11 : la déconnexion retire la session en base, l’ancien jeton est refusé', () => {
	test('les sessions sont bien tenues en base pour les maquilleuses', async () => {
		const payload = await testPayload()
		expect(payload.collections.pros.config.auth.useSessions).toBe(true)
	})

	test('après la déconnexion, le jeton rejoué n’ouvre plus rien : ni par l’API locale, ni par REST', async () => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		const { enTetes: requestHeaders } = account.session
		const payload = await testPayload()
		expect((await which(requestHeaders))?.id).toBe(Number(account.id))
		const before = await sessionsInBase(account.id)

		const result = await closeSession({ payload, headers: new Headers(requestHeaders), toutes: false })

		expect(result).toEqual({ ok: true, fermee: true })
		expect(await sessionsInBase(account.id)).toBe(before - 1)
		expect(await which(requestHeaders)).toBeNull()
		const me = await callRest('GET', '/api/pros/me', { enTetes: requestHeaders })
		expect((me.corps as { user: unknown }).user).toBeNull()
		const read = await callRest('GET', `/api/pros/${account.id}`, { enTetes: requestHeaders })
		expect(read.statut).toBe(403)
	})

	test('« cet appareil » ne ferme pas les autres sessions du même compte', async () => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		const [a, b] = [await newSession(account), await newSession(account)]
		const payload = await testPayload()

		await closeSession({ payload, headers: new Headers(a.enTetes), toutes: false })

		expect(await which(a.enTetes)).toBeNull()
		expect((await which(b.enTetes))?.id).toBe(Number(account.id))
	})

	test('une seconde déconnexion, ou une déconnexion sans session, ne fait pas d’erreur', async () => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		const payload = await testPayload()
		const headers = new Headers(account.session.enTetes)
		await closeSession({ payload, headers: headers, toutes: false })

		expect(await closeSession({ payload, headers: headers, toutes: false })).toEqual({ ok: true, fermee: false })
		expect(await closeSession({ payload, headers: new Headers(), toutes: true })).toEqual({
			ok: true,
			fermee: false,
		})
	})

	test('la session d’un admin n’est pas une session de l’espace : elle reste ouverte', async () => {
		const admin = await createAccount('admin')
		const payload = await testPayload()

		const result = await closeSession({ payload, headers: new Headers(admin.session.enTetes), toutes: true })

		expect(result).toEqual({ ok: true, fermee: false })
		expect((await which(admin.session.enTetes))?.id).toBe(Number(admin.id))
	})
})

describe('I13 : « me déconnecter de tous les appareils »', () => {
	test('toutes les sessions du compte sont retirées, celles des autres comptes restent', async () => {
		const [myself, other] = await Promise.all([
			createAccount('maquilleuse', { motDePasse: () => PASSWORD }),
			createAccount('maquilleuse', { motDePasse: () => PASSWORD }),
		])
		const mySessions = [myself.session, await newSession(myself), await newSession(myself)]
		const itsSessions = [other.session, await newSession(other)]
		const payload = await testPayload()
		expect(await sessionsInBase(myself.id)).toBeGreaterThanOrEqual(3)
		const hers = await sessionsInBase(other.id)

		const result = await closeSession({
			payload,
			headers: new Headers(mySessions[1]?.enTetes),
			toutes: true,
		})

		expect(result).toEqual({ ok: true, fermee: true })
		expect(await sessionsInBase(myself.id)).toBe(0)
		for (const session of mySessions) expect(await which(session.enTetes)).toBeNull()
		expect(await sessionsInBase(other.id)).toBe(hers)
		for (const session of itsSessions) expect((await which(session.enTetes))?.id).toBe(Number(other.id))
	})
})

describe('le journal et ses pannes', () => {
	test('une ligne « deconnexion » et une ligne « deconnexion-partout », chacune « ok »', async () => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		const payload = await testPayload()
		const other = await newSession(account)
		const before = (await log()).length

		await closeSession({
			payload,
			headers: new Headers(account.session.enTetes),
			toutes: false,
			journal: authLog(payload),
		})
		await closeSession({ payload, headers: new Headers(other.enTetes), toutes: true, journal: authLog(payload) })

		expect((await log()).slice(before).map(({ type, code }) => [type, code])).toEqual([
			['sign-out', 'ok'],
			['sign-out-everywhere', 'ok'],
		])
	})

	test('un journal qui échoue ne rend pas la déconnexion en échec, la session est bien retirée', async () => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		const payload = await testPayload()

		const result = await closeSession({
			payload,
			headers: new Headers(account.session.enTetes),
			toutes: false,
			journal: () => Promise.reject(new Error('journal en panne')),
		})

		expect(result).toEqual({ ok: true, fermee: true })
		expect(await which(account.session.enTetes)).toBeNull()
	})
})
