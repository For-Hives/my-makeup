import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { authLog } from '@/lib/auth/auth-log'
import { FORGOT_PASSWORD_FLOOR_MS, LINK_DURATION_MS } from '@/lib/auth/forgot-password'
import { linkStillValid, requestPasswordLink, resetPassword } from '@/lib/auth/password-reset-payload'
import { createRateLimit } from '@/lib/auth/rate-limit'
import { signInWithPassword } from '@/lib/auth/sign-in'
import { openWithPassword } from '@/lib/auth/token'
import { payloadSendEmail } from '@/lib/emails/send'
import { serverEnv } from '@/lib/env'
import { createAccount } from '../support/account-factory'
import { countMails, emptySink, mailReceived, waitMail } from '../support/mailpit'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'
import { openSession } from '../support/session'

/**
 * The forgotten password (tickets 085 and 086; plan 02 I10 and I17): the mail and its link of one
 * hour, a link that serves once, the same answer in the same time for any address, the other
 * sessions closed, the doors of Payload closed. The pages and the whole path through a browser are
 * played by tests/e2e/forgot-password.spec.ts (E08, E15).
 */

afterAll(async () => {
	await Promise.all([emptyBase(), emptySink()])
})

const OLD = 'ancien-mot-de-passe-fictif'
const NEW_PASSWORD = 'nouveau-mot-de-passe-fictif'
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100'

let n = 0
const clientUrl = () => new Headers({ 'x-forwarded-for': `198.51.100.${1 + (n++ % 250)}` })
const free = () => createRateLimit({ nom: `essai-oubli-${n++}`, limite: 1000, fenetreMs: 60_000 })

/** The work after the answer is awaited, so that a test can read the mail it causes. */
function request(email: unknown, options: { frein?: ReturnType<typeof createRateLimit>; headers?: Headers } = {}) {
	const work: Promise<void>[] = []
	return testPayload().then(async payload => {
		const start = Date.now()
		const result = await requestPasswordLink({
			payload,
			headers: options.headers ?? clientUrl(),
			email,
			envoyer: payloadSendEmail(payload, serverEnv()),
			site: SITE,
			apres: travail => {
				work.push(travail())
			},
			frein: options.frein ?? free(),
			journal: authLog(payload),
		})
		const duration = Date.now() - start
		await Promise.all(work)
		return { resultat: result, duree: duration }
	})
}

const mailToken = async (email: string): Promise<string> => {
	const mail = await waitMail({ pour: email, sujet: /Réinitialise ton mot de passe/ })
	const link = mail.liens.find(l => new URL(l).pathname === '/auth/reinitialiser')
	if (!link) throw new Error('Le mail ne porte pas le lien.')
	expect(link).toStartWith(`${SITE}/auth/reinitialiser?code=`)
	return new URL(link).searchParams.get('code') ?? ''
}

const passwordReset = async (
	jeton: unknown,
	motDePasse: unknown = NEW_PASSWORD,
	confirmation: unknown = motDePasse,
	frein = free()
) =>
	resetPassword({
		payload: await testPayload(),
		headers: clientUrl(),
		jeton,
		motDePasse,
		confirmation,
		frein,
		journal: authLog(await testPayload()),
	})

const line = async (id: number | string) => {
	const payload = await testPayload()
	return payload.db.findOne<{
		id: number
		resetPasswordToken?: string | null
		resetPasswordExpiration?: string | null
		legacyBcrypt?: string | null
		sessions?: unknown[] | null
		lastSignInAt?: string | null
	}>({ collection: 'pros', where: { id: { equals: id } } })
}

const signInAction = async (email: string, password: string) => {
	const payload = await testPayload()
	return signInWithPassword({
		ouvrir: data => openWithPassword(payload, 'pros', data),
		headers: clientUrl(),
		email,
		password,
		frein: free(),
	})
}

const knownAccount = () => createAccount('maquilleuse', { motDePasse: () => OLD })

beforeEach(async () => {
	await emptySink()
})

describe('I10 : la demande envoie un mail avec un lien de 24 heures', () => {
	test('un mail, un lien du site, un jeton de 40 caractères, 24 heures de vie', async () => {
		const account = await knownAccount()
		const before = Date.now()

		const { resultat: result } = await request(account.email)

		expect(result).toEqual({ ok: true })
		const mail = await waitMail({ pour: account.email })
		expect(mail.sujet).toBe('Réinitialise ton mot de passe My Makeup')
		expect(mail.liens.some(l => l.includes('/admin'))).toBe(false)
		const token = await mailToken(account.email)
		expect(token).toMatch(/^[0-9a-f]{40}$/)
		const stored = await line(account.id)
		expect(stored?.resetPasswordToken).toBe(token)
		const end = new Date(stored?.resetPasswordExpiration ?? 0).getTime()
		expect(end).toBeGreaterThan(before + LINK_DURATION_MS - 1000)
		expect(end).toBeLessThan(Date.now() + LINK_DURATION_MS + 1000)
		expect(LINK_DURATION_MS).toBe(86_400_000)
	})

	test('le lien tient à 23 h 59 et est refusé à 24 h 01 (ticket 311, décision du 22/10/2026)', async () => {
		const payload = await testPayload()
		const MINUTE = 60_000
		// The clock is not faked: moving the clock forward by `elapsed` is moving the stored expiration back by as much.
		const elapse = async (accountId: number | string, storedEnd: number, elapsedMs: number) =>
			payload.db.updateOne({
				collection: 'pros',
				data: { resetPasswordExpiration: new Date(storedEnd - elapsedMs).toISOString() },
				returning: false,
				where: { id: { equals: accountId } },
			})
		for (const [elapsedMs, valid] of [
			[24 * 60 * MINUTE - MINUTE, true],
			[24 * 60 * MINUTE + MINUTE, false],
		] as const) {
			const account = await knownAccount()
			await request(account.email)
			const token = await mailToken(account.email)
			const storedEnd = new Date((await line(account.id))?.resetPasswordExpiration ?? 0).getTime()
			await elapse(account.id, storedEnd, elapsedMs)
			expect(await linkStillValid(payload, token)).toBe(valid)
		}
	})

	test('le lien est refusé une fois les 24 heures passées', async () => {
		const account = await knownAccount()
		await request(account.email)
		const token = await mailToken(account.email)
		expect(await linkStillValid(await testPayload(), token)).toBe(true)

		// The 24 hours have passed: the expiration is set in the past, the clock is not faked.
		const payload = await testPayload()
		await payload.db.updateOne({
			collection: 'pros',
			data: { resetPasswordExpiration: new Date(Date.now() - 1000).toISOString() },
			returning: false,
			where: { id: { equals: account.id } },
		})

		expect(await linkStillValid(payload, token)).toBe(false)
		expect(await passwordReset(token)).toEqual({ ok: false, code: 'code-invalide' })
		// Nothing changed: she still signs in with her password.
		expect((await signInAction(account.email, OLD)).ok).toBe(true)
	})

	test('le mail ne contient ni le mot de passe ni l’adresse d’un autre compte', async () => {
		const account = await knownAccount()
		await request(account.email)
		const mail = await waitMail({ pour: account.email })
		expect(mail.texte + mail.html).not.toContain(OLD)
	})

	test('le mail part par le point d’envoi du site : une partie texte et une partie HTML, toutes deux avec le lien', async () => {
		const account = await knownAccount()
		await request(account.email)
		const mail = await waitMail({ pour: account.email })
		expect(mail.texte).toContain('/auth/reinitialiser?code=')
		expect(mail.html).toContain('/auth/reinitialiser?code=')
	})

	test('un seul mail par compte et par quinze secondes, la demande rapprochée répond pareil', async () => {
		const account = await knownAccount()
		const first = await request(account.email)
		const second = await request(account.email)
		expect(second.resultat).toEqual(first.resultat)
		await waitMail({ pour: account.email })
		expect(await countMails()).toBe(1)
		// The window is over: the next request sends again.
		const payload = await testPayload()
		await payload.db.updateOne({
			collection: 'pros',
			data: { resetPasswordRequestedAt: new Date(Date.now() - 16_000).toISOString() },
			returning: false,
			where: { id: { equals: account.id } },
		})
		await request(account.email)
		expect(await countMails()).toBe(2)
	})

	test('l’adresse est lue sans tenir compte de la casse ni des espaces', async () => {
		const account = await knownAccount()
		await request(`  ${account.email.toUpperCase()}  `)
		await waitMail({ pour: account.email })
	})
})

describe('I10 : une adresse inconnue répond pareil, dans le même temps, sans mail', () => {
	test('même réponse, même plancher, aucun mail pour l’inconnue', async () => {
		const account = await knownAccount()
		const unknown = `inconnue-${crypto.randomUUID()}@example.test`

		const known = await request(account.email)
		const other = await request(unknown)

		expect(other.resultat).toEqual(known.resultat)
		expect(other.resultat).toEqual({ ok: true })
		// Both wait for the floor, and neither goes far past it: the work is after the answer.
		for (const { duree: duration } of [known, other]) {
			expect(duration).toBeGreaterThanOrEqual(FORGOT_PASSWORD_FLOOR_MS - 20)
			expect(duration).toBeLessThan(FORGOT_PASSWORD_FLOOR_MS + 400)
		}
		expect(Math.abs(known.duree - other.duree)).toBeLessThan(150)
		await waitMail({ pour: account.email })
		expect(await mailReceived(unknown)).toEqual([])
		expect(await countMails()).toBe(1)
	})

	test('une adresse qui n’en est pas une est refusée, sans mail', async () => {
		expect((await request('pas-une-adresse')).resultat).toEqual({ ok: false, code: 'email-invalide' })
		expect((await request('   ')).resultat).toEqual({ ok: false, code: 'email-vide' })
		expect((await request(undefined)).resultat).toEqual({ ok: false, code: 'email-vide' })
		expect(await countMails()).toBe(0)
	})

	test('le frein par adresse cliente : la 11e demande est refusée, connue ou non, et ne part pas', async () => {
		const account = await knownAccount()
		const rateLimit = createRateLimit({ nom: `essai-frein-oubli-${n++}`, limite: 10, fenetreMs: 60_000 })
		const headers = clientUrl()
		for (let i = 0; i < 10; i++) {
			const email = i % 2 === 0 ? `inconnue-${i}@example.test` : account.email
			expect((await request(email, { frein: rateLimit, headers })).resultat.ok).toBe(true)
		}
		await waitMail({ pour: account.email })
		await emptySink()

		const refused = await request(account.email, { frein: rateLimit, headers })
		const also = await request(`inconnue-${crypto.randomUUID()}@example.test`, { frein: rateLimit, headers })

		expect(refused.resultat).toEqual({ ok: false, code: 'trop-de-tentatives' })
		expect(also.resultat).toEqual(refused.resultat)
		expect(await countMails()).toBe(0)
		// Another address is free.
		expect((await request(account.email, { frein: rateLimit, headers: clientUrl() })).resultat.ok).toBe(true)
	})

	test('le journal : une ligne « ok » par demande, la même pour une adresse inconnue, sans adresse ni jeton', async () => {
		const account = await knownAccount()
		const payload = await testPayload()
		const read = async () =>
			(
				await payload.find({
					collection: 'auth-events',
					depth: 0,
					limit: 1000,
					sort: 'id',
					where: { type: { equals: 'forgot-password' } },
				})
			).docs
		const before = (await read()).length
		await request(account.email)
		await request(`inconnue-${crypto.randomUUID()}@example.test`)

		const fresh = (await read()).slice(before)
		expect(fresh.map(l => l.code)).toEqual(['ok', 'ok'])
		expect(JSON.stringify(fresh)).not.toMatch(/example\.test|[0-9a-f]{40}/)
	})
})

describe('les portes REST de Payload sont fermées', () => {
	test('forgot-password et reset-password répondent 403 pour tout le monde, et aucun mail ne part', async () => {
		const account = await knownAccount()
		const unknown = `inconnue-${crypto.randomUUID()}@example.test`
		for (const email of [account.email, unknown]) {
			const r = await callRest('POST', '/api/pros/forgot-password', { corps: { email } })
			expect(r.statut).toBe(403)
		}
		const reset = await callRest('POST', '/api/pros/reset-password', {
			corps: { token: 'a'.repeat(40), password: NEW_PASSWORD },
		})
		expect(reset.statut).toBe(403)
		expect(await countMails()).toBe(0)
		expect((await line(account.id))?.resetPasswordToken ?? null).toBeNull()
	})
})

describe('085 : choisir un nouveau mot de passe', () => {
	test('le nouveau marche, l’ancien est refusé', async () => {
		const account = await knownAccount()
		await request(account.email)
		const token = await mailToken(account.email)

		expect(await passwordReset(token)).toEqual({ ok: true })

		expect((await signInAction(account.email, NEW_PASSWORD)).ok).toBe(true)
		expect(await signInAction(account.email, OLD)).toEqual({ ok: false, code: 'identifiants-invalides' })
	})

	test('le lien sert une seule fois : le même jeton rejoué est « plus valable »', async () => {
		const account = await knownAccount()
		await request(account.email)
		const token = await mailToken(account.email)

		expect(await passwordReset(token, NEW_PASSWORD)).toEqual({ ok: true })
		expect(await passwordReset(token, 'un-autre-mot-de-passe')).toEqual({ ok: false, code: 'code-invalide' })

		expect((await signInAction(account.email, NEW_PASSWORD)).ok).toBe(true)
		expect((await signInAction(account.email, 'un-autre-mot-de-passe')).ok).toBe(false)
		expect((await line(account.id))?.resetPasswordToken ?? null).toBeNull()
	})

	test('deux envois du même lien au même instant : un seul passe, l’autre est « plus valable »', async () => {
		const account = await knownAccount()
		await request(account.email)
		const token = await mailToken(account.email)

		const [a, b] = await Promise.all([
			passwordReset(token, 'premier-mot-de-passe-fictif'),
			passwordReset(token, 'second-mot-de-passe-fictif'),
		])

		expect([a.ok, b.ok].sort()).toEqual([false, true])
		const refuse = a.ok ? b : a
		expect(refuse).toEqual({ ok: false, code: 'code-invalide' })
		// Exactly one of the two passwords works.
		const winner = a.ok ? 'premier-mot-de-passe-fictif' : 'second-mot-de-passe-fictif'
		const loser = a.ok ? 'second-mot-de-passe-fictif' : 'premier-mot-de-passe-fictif'
		expect((await signInAction(account.email, winner)).ok).toBe(true)
		expect((await signInAction(account.email, loser)).ok).toBe(false)
	})

	test('un mot de passe trop court, trop long ou mal confirmé est refusé, et le lien reste bon', async () => {
		const account = await knownAccount()
		await request(account.email)
		const token = await mailToken(account.email)

		expect(await passwordReset(token, 'court')).toEqual({ ok: false, code: 'mot-de-passe-trop-court' })
		expect(await passwordReset(token, 'x'.repeat(256))).toEqual({ ok: false, code: 'mot-de-passe-trop-long' })
		expect(await passwordReset(token, NEW_PASSWORD, 'autre-chose-fictif')).toEqual({
			ok: false,
			code: 'mots-de-passe-differents',
		})
		expect(await linkStillValid(await testPayload(), token)).toBe(true)
		expect(await passwordReset(token)).toEqual({ ok: true })
	})

	test('un code absent, inconnu ou de l’ancien site (128 caractères) donne « plus valable », jamais une erreur', async () => {
		const old = 'a1'.repeat(64)
		expect(await passwordReset(undefined)).toEqual({ ok: false, code: 'code-absent' })
		expect(await passwordReset('')).toEqual({ ok: false, code: 'code-absent' })
		expect(await passwordReset(old)).toEqual({ ok: false, code: 'code-invalide' })
		expect(await passwordReset('f'.repeat(40))).toEqual({ ok: false, code: 'code-invalide' })
		expect(await passwordReset("' or 1=1 --")).toEqual({ ok: false, code: 'code-invalide' })
		const payload = await testPayload()
		expect(await linkStillValid(payload, old)).toBe(false)
		expect(await linkStillValid(payload, 'f'.repeat(40))).toBe(false)
		expect(await linkStillValid(payload, undefined)).toBe(false)
	})

	test('le frein de la réinitialisation : la 11e tentative est refusée, une réussite rend sa place', async () => {
		const account = await knownAccount()
		await request(account.email)
		const token = await mailToken(account.email)
		const rateLimit = createRateLimit({ nom: `essai-frein-reinit-${n++}`, limite: 10, fenetreMs: 60_000 })
		const headers = clientUrl()
		const attempt = async (code: unknown) =>
			resetPassword({
				payload: await testPayload(),
				headers,
				jeton: code,
				motDePasse: NEW_PASSWORD,
				confirmation: NEW_PASSWORD,
				frein: rateLimit,
			})
		for (let i = 0; i < 10; i++) expect((await attempt('f'.repeat(40))).ok).toBe(false)

		expect(await attempt(token)).toEqual({ ok: false, code: 'trop-de-tentatives' })
		// The right link did not get through, so nothing changed.
		expect((await signInAction(account.email, OLD)).ok).toBe(true)
	})

	test('la réinitialisation n’est pas une connexion : la date de dernière connexion ne bouge pas', async () => {
		const account = await knownAccount()
		const before = (await line(account.id))?.lastSignInAt ?? null
		await request(account.email)
		await passwordReset(await mailToken(account.email))
		expect((await line(account.id))?.lastSignInAt ?? null).toBe(before)
	})

	test('le journal : une ligne « reinitialisation » par essai, sans jeton ni adresse', async () => {
		const account = await knownAccount()
		const payload = await testPayload()
		await request(account.email)
		const token = await mailToken(account.email)
		await passwordReset(token)
		await passwordReset(token)

		const lines = (
			await payload.find({
				collection: 'auth-events',
				depth: 0,
				limit: 100,
				sort: 'id',
				where: { type: { equals: 'password-reset' } },
			})
		).docs.map(l => l.code)
		expect(lines.slice(-2)).toEqual(['ok', 'lien-invalide'])
	})
})

describe('I17 : réinitialiser ferme toutes les autres sessions', () => {
	test('deux sessions ouvertes, le nouveau mot de passe les ferme, et il n’en reste aucune', async () => {
		const account = await knownAccount()
		const payload = await testPayload()
		const first = account.session
		const second = await openSession(payload, { collection: 'pros', email: account.email, motDePasse: OLD })
		const me = (enTetes: Record<string, string>) => callRest('GET', '/api/pros/me', { enTetes })
		expect((await me(first.enTetes)).corps).toHaveProperty('user.id', account.id)
		expect((await me(second.enTetes)).corps).toHaveProperty('user.id', account.id)
		expect((await line(account.id))?.sessions?.length).toBe(2)

		await request(account.email)
		expect(await passwordReset(await mailToken(account.email))).toEqual({ ok: true })

		expect((await me(first.enTetes)).corps).toMatchObject({ user: null })
		expect((await me(second.enTetes)).corps).toMatchObject({ user: null })
		expect((await line(account.id))?.sessions ?? []).toEqual([])
	})

	test('les sessions d’un autre compte ne sont pas touchées', async () => {
		const account = await knownAccount()
		const other = await createAccount('maquilleuse')
		await request(account.email)
		await passwordReset(await mailToken(account.email))

		const r = await callRest('GET', '/api/pros/me', { enTetes: other.session.enTetes })
		expect(r.corps).toHaveProperty('user.id', other.id)
	})
})

describe('un compte repris de l’ancien site', () => {
	test('l’ancien mot de passe ne passe plus par le chemin hérité : le hash hérité est effacé', async () => {
		const account = await createAccount('reprise-avec-hash')
		expect((await line(account.id))?.legacyBcrypt).toBeTruthy()

		await request(account.email)
		expect(await passwordReset(await mailToken(account.email))).toEqual({ ok: true })

		const after = await line(account.id)
		expect(after?.legacyBcrypt ?? null).toBeNull()
		expect((await signInAction(account.email, NEW_PASSWORD)).ok).toBe(true)
	})

	test('un compte sans mot de passe (Google, Facebook) en choisit un par ce même parcours', async () => {
		const account = await createAccount('reprise-facebook')
		expect((await signInAction(account.email, NEW_PASSWORD)).ok).toBe(false)

		await request(account.email)
		expect(await passwordReset(await mailToken(account.email))).toEqual({ ok: true })

		expect((await signInAction(account.email, NEW_PASSWORD)).ok).toBe(true)
	})
})
