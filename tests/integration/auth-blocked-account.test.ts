import { afterAll, describe, expect, test } from 'bun:test'
import { authLog } from '@/lib/auth/auth-log'
import { errorMessage } from '@/lib/auth/errors'
import { createRateLimit } from '@/lib/auth/rate-limit'
import { signInWithPassword } from '@/lib/auth/sign-in'
import { openWithPassword } from '@/lib/auth/token'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

/**
 * The account an admin has blocked (ticket 089; plan 01 §6.1). The page of the sign-in with its
 * message is played by the unit tests of the form; the admin screen that blocks arrives with
 * ticket 168.
 */

afterAll(async () => {
	await emptyBase()
})

const PASSWORD = 'aaaaaaaa'
const rateLimit = createRateLimit({ nom: 'essai-int-bloque', limite: 1000, fenetreMs: 60_000 })
let n = 0
const url = () => new Headers({ 'x-forwarded-for': `192.0.2.${150 + (n++ % 100)}` })

async function signInAction(email: string, password: string) {
	const payload = await testPayload()
	return signInWithPassword({
		ouvrir: data => openWithPassword(payload, 'pros', data),
		headers: url(),
		email,
		password,
		frein: rateLimit,
		journal: authLog(payload),
	})
}

async function sessionsInBase(id: number | string): Promise<number> {
	const payload = await testPayload()
	const line = await payload.db.findOne<{ id: number; sessions?: unknown[] }>({
		collection: 'pros',
		where: { id: { equals: id } },
	})
	return line?.sessions?.length ?? 0
}

async function which(enTetes: Record<string, string>) {
	const payload = await testPayload()
	return (await payload.auth({ headers: new Headers(enTetes) })).user
}

const log = async () =>
	(
		await (
			await testPayload()
		).find({ collection: 'auth-events', depth: 0, limit: 1000, pagination: false, sort: 'id' })
	).docs

/** What an admin does in the panel: the update goes through the access rules of her account. */
async function blockByAdmin(id: number | string, bloque: boolean) {
	const payload = await testPayload()
	const admin = await createAccount('admin')
	const user = await payload.findByID({ collection: 'admins', id: admin.id, depth: 0, overrideAccess: true })
	await payload.update({
		collection: 'pros',
		id,
		data: { blocked: bloque },
		depth: 0,
		overrideAccess: false,
		user: { ...user, collection: 'admins' },
	})
}

describe('un compte bloqué ne peut pas se connecter', () => {
	test('bon mot de passe : le code « compte-bloque », son message, aucune session ouverte', async () => {
		const account = await createAccount('maquilleuse-bloquee', { motDePasse: () => PASSWORD })
		expect(await sessionsInBase(account.id)).toBe(0)

		const response = await signInAction(account.email, PASSWORD)

		expect(response).toEqual({ ok: false, code: 'compte-bloque' })
		expect(errorMessage('compte-bloque')).toContain('bloqué')
		expect(await sessionsInBase(account.id)).toBe(0)
	})

	test('mauvais mot de passe : le message générique, comme pour une adresse inconnue', async () => {
		const account = await createAccount('maquilleuse-bloquee', { motDePasse: () => PASSWORD })

		expect(await signInAction(account.email, 'mauvais-mot-de-passe')).toEqual({
			ok: false,
			code: 'identifiants-invalides',
		})
		expect(await signInAction(`inconnue-${account.email}`, PASSWORD)).toEqual({
			ok: false,
			code: 'identifiants-invalides',
		})
	})

	test('la porte REST refuse aussi, en 403 et en français ; une ligne « compte-bloque » au journal', async () => {
		const account = await createAccount('maquilleuse-bloquee', { motDePasse: () => PASSWORD })
		const before = (await log()).length

		const {
			statut: status,
			enTetes: headers,
			texte: text,
		} = await callRest('POST', '/api/pros/login', {
			corps: { email: account.email, password: PASSWORD },
			enTetes: { 'x-forwarded-for': '192.0.2.99' },
		})

		expect(status).toBe(403)
		expect(headers.get('set-cookie') ?? '').not.toContain('payload-token=')
		expect(text).toContain(errorMessage('compte-bloque'))
		expect((await log()).slice(before).map(({ type, code }) => [type, code])).toEqual([['sign-in', 'compte-bloque']])
	})

	test('le formulaire laisse la même ligne au journal', async () => {
		const account = await createAccount('maquilleuse-bloquee', { motDePasse: () => PASSWORD })
		const before = (await log()).length

		await signInAction(account.email, PASSWORD)

		expect((await log()).slice(before).map(({ type, code }) => [type, code])).toEqual([['sign-in', 'compte-bloque']])
	})
})

describe('bloquer ferme les sessions, débloquer rend l’accès', () => {
	test('les sessions du compte sont fermées, celles des autres comptes intactes, puis le déblocage rouvre la connexion', async () => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		const other = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		const { enTetes: headers } = account.session
		expect((await which(headers))?.id).toBe(Number(account.id))
		expect(await sessionsInBase(account.id)).toBeGreaterThan(0)
		const before = (await log()).length

		await blockByAdmin(account.id, true)

		expect(await sessionsInBase(account.id)).toBe(0)
		expect(await which(headers)).toBeNull()
		expect((await which(other.session.enTetes))?.id).toBe(Number(other.id))
		expect(await signInAction(account.email, PASSWORD)).toEqual({ ok: false, code: 'compte-bloque' })

		await blockByAdmin(account.id, false)

		const reopened = await signInAction(account.email, PASSWORD)
		expect(reopened.ok).toBe(true)
		expect((await log()).slice(before).map(({ type, code }) => [type, code])).toEqual([
			['block', 'ok'],
			['sign-in', 'compte-bloque'],
			['unblock', 'ok'],
			['sign-in', 'ok'],
		])
	}, 30_000)

	test('enregistrer un compte déjà bloqué ne laisse pas de ligne de plus', async () => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		await blockByAdmin(account.id, true)
		const before = (await log()).length

		await blockByAdmin(account.id, true)

		expect((await log()).length).toBe(before)
	})
})

describe('seul l’admin change le blocage', () => {
	test('la maquilleuse ne se débloque pas elle-même, et ne se bloque pas non plus par erreur de rôle', async () => {
		const payload = await testPayload()
		const blocked = await createAccount('maquilleuse-bloquee', { motDePasse: () => PASSWORD })
		const free = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		const as = async (id: number | string) => ({
			...(await payload.findByID({ collection: 'pros', id, depth: 0, overrideAccess: true })),
			collection: 'pros' as const,
		})

		await payload
			.update({
				collection: 'pros',
				id: blocked.id,
				data: { blocked: false },
				depth: 0,
				overrideAccess: false,
				user: await as(blocked.id),
			})
			.catch(() => undefined)
		await payload.update({
			collection: 'pros',
			id: free.id,
			data: { blocked: true, name: 'Nom changé' },
			depth: 0,
			overrideAccess: false,
			user: await as(free.id),
		})

		const read = async (id: number | string) =>
			payload.findByID({ collection: 'pros', id, depth: 0, overrideAccess: true })
		expect((await read(blocked.id)).blocked).toBe(true)
		const after = await read(free.id)
		expect(after.blocked).toBe(false)
		expect(after.name).toBe('Nom changé')
		expect(await sessionsInBase(free.id)).toBeGreaterThan(0)
	})
})
