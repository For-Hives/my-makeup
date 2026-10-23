import { afterAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { authLog } from '@/lib/auth/auth-log'
import { createRateLimit } from '@/lib/auth/rate-limit'
import { signInWithPassword } from '@/lib/auth/sign-in'
import { openWithPassword } from '@/lib/auth/token'
import { CHANGE_MESSAGES, changeMyPassword, passwordChangeRateLimit } from '@/lib/dashboard/change-password'
import { payloadSendEmail } from '@/lib/emails/send'
import { serverEnv } from '@/lib/env'
import { createAccount } from '../support/account-factory'
import { emptySink, mailReceived, waitMail } from '../support/mailpit'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'
import { openSession } from '../support/session'

setDefaultTimeout(30_000)

/**
 * She changes her password from her space (ticket 999): the current password is asked, a wrong one is refused and
 * braked, the other sessions are closed and this one stays, the account is told by a mail that holds no secret, and an
 * account with no password of her own is sent to the mail link. The dialog in a browser is played by
 * tests/e2e/dashboard-password.spec.ts.
 */

afterAll(async () => {
	await Promise.all([emptyBase(), emptySink()])
})

const CURRENT = 'mot-de-passe-actuel-fictif'
const NEXT = 'nouveau-mot-de-passe-fictif'
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100'

let n = 0
const clientUrl = () => new Headers({ 'x-forwarded-for': `203.0.113.${1 + (n++ % 250)}` })
const withCookie = (cookie: Record<string, string>, address = clientUrl()) => {
	const headers = new Headers(cookie)
	headers.set('x-forwarded-for', address.get('x-forwarded-for') ?? '')
	return headers
}

beforeEach(() => passwordChangeRateLimit.vider())

async function change(headers: Headers, saisie: unknown, options: { frein?: ReturnType<typeof createRateLimit> } = {}) {
	const payload = await testPayload()
	const work: Promise<void>[] = []
	const result = await changeMyPassword({
		payload,
		headers,
		saisie,
		envoyer: payloadSendEmail(payload, serverEnv()),
		site: SITE,
		apres: travail => {
			work.push(travail())
		},
		journal: authLog(payload),
		...options,
	})
	await Promise.all(work)
	return result
}

const typed = (current = CURRENT, password = NEXT, confirmation = password) => ({ current, password, confirmation })

const accountWithTwoSessions = async () => {
	const account = await createAccount('maquilleuse', { motDePasse: () => CURRENT })
	const payload = await testPayload()
	const other = await openSession(payload, { collection: 'pros', email: account.email, motDePasse: CURRENT })
	return { account, other, current: account.session.enTetes }
}

const which = async (enTetes: Record<string, string>) =>
	(await (await testPayload()).auth({ headers: new Headers(enTetes) })).user

const canSignIn = async (email: string, password: string) =>
	(
		await signInWithPassword({
			ouvrir: async data => openWithPassword(await testPayload(), 'pros', data),
			headers: clientUrl(),
			email,
			password,
			frein: createRateLimit({ nom: `essai-connexion-${n++}`, limite: 1000, fenetreMs: 60_000 }),
			horloge: { maintenant: () => 0, attendre: async () => undefined },
		})
	).ok

describe('the change of password', () => {
	test('the right current password changes it: the new one opens the account, the old one no longer', async () => {
		const { account, current } = await accountWithTwoSessions()
		const result = await change(withCookie(current), typed())
		expect(result).toEqual({ ok: true, message: CHANGE_MESSAGES.ok })
		expect(await canSignIn(account.email, NEXT)).toBe(true)
		expect(await canSignIn(account.email, CURRENT)).toBe(false)
	})

	test('this session stays and the others are closed', async () => {
		const { account, other, current } = await accountWithTwoSessions()
		expect((await which(other.enTetes))?.id).toBe(Number(account.id))
		expect((await change(withCookie(current), typed())).ok).toBe(true)
		expect((await which(current))?.id).toBe(Number(account.id))
		expect(await which(other.enTetes)).toBeNull()
		const me = await callRest('GET', '/api/pros/me', { enTetes: other.enTetes })
		expect((me.corps as { user: unknown }).user).toBeNull()
	})

	test('a wrong current password changes nothing and the other sessions stay open', async () => {
		const { account, other, current } = await accountWithTwoSessions()
		const result = await change(withCookie(current), typed('pas-le-bon-mot-de-passe'))
		expect(result).toMatchObject({ ok: false, code: 'actuel', message: CHANGE_MESSAGES.actuel })
		expect(await canSignIn(account.email, CURRENT)).toBe(true)
		expect(await canSignIn(account.email, NEXT)).toBe(false)
		expect((await which(other.enTetes))?.id).toBe(Number(account.id))
	})

	test('a session alone proves nothing: with no cookie, or a closed session, nothing changes', async () => {
		const { account, current } = await accountWithTwoSessions()
		expect(await change(clientUrl(), typed())).toMatchObject({ ok: false, code: 'session', session: 'expiree' })
		const payload = await testPayload()
		const old = await openSession(payload, { collection: 'pros', email: account.email, motDePasse: CURRENT })
		await payload.update({ collection: 'pros', id: account.id, data: { sessions: [] } as never, overrideAccess: true })
		expect(await change(withCookie(old.enTetes), typed())).toMatchObject({ ok: false, code: 'session' })
		expect(await canSignIn(account.email, CURRENT)).toBe(true)
		expect(current).toBeDefined()
	})

	test('the new password is checked: too short, different, same as the current', async () => {
		const { current } = await accountWithTwoSessions()
		expect(await change(withCookie(current), typed(CURRENT, 'court'))).toMatchObject({
			code: 'mot-de-passe-trop-court',
		})
		expect(await change(withCookie(current), typed(CURRENT, NEXT, `${NEXT}x`))).toMatchObject({
			code: 'mots-de-passe-differents',
		})
		expect(await change(withCookie(current), typed(CURRENT, CURRENT))).toMatchObject({ code: 'identique' })
		expect(await change(withCookie(current), { ...typed(), extra: 'x' })).toMatchObject({ ok: false, code: 'echec' })
	})

	test('wrong attempts are braked by address and by account; the sign-in is not', async () => {
		const { account, current } = await accountWithTwoSessions()
		const address = clientUrl()
		for (let i = 0; i < 10; i += 1)
			expect(await change(withCookie(current, address), typed('faux-mot-de-passe'))).toMatchObject({ code: 'actuel' })
		expect(await change(withCookie(current, address), typed())).toMatchObject({
			ok: false,
			code: 'freine',
			freine: true,
		})
		// Another address, same account: the brake by account holds too.
		expect(await change(withCookie(current), typed())).toMatchObject({ ok: false, code: 'freine' })
		expect(await canSignIn(account.email, CURRENT)).toBe(true)
	})

	test('the mail tells her it changed, holds no password and no token, and leads to the forgotten password', async () => {
		const { account, current } = await accountWithTwoSessions()
		expect((await change(withCookie(current), typed())).ok).toBe(true)
		const mail = await waitMail({ pour: account.email, sujet: /Ton mot de passe My Makeup a changé/ })
		const everything = `${mail.sujet}\n${mail.texte}\n${mail.html}`
		expect(everything).not.toContain(CURRENT)
		expect(everything).not.toContain(NEXT)
		expect(everything).not.toMatch(/[?&](code|token)=/)
		expect(mail.liens.map(link => new URL(link).pathname)).toContain('/auth/mot-de-passe-oublie')
	})

	test('a wrong current password sends no mail', async () => {
		const { account, current } = await accountWithTwoSessions()
		await change(withCookie(current), typed('faux-mot-de-passe'))
		expect(await mailReceived(account.email)).toEqual([])
	})

	test('the journal holds a kind and a code, never a password', async () => {
		const { current } = await accountWithTwoSessions()
		await change(withCookie(current), typed('faux-mot-de-passe'))
		await change(withCookie(current), typed())
		const rows = (await (await testPayload()).find({ collection: 'auth-events', depth: 0, limit: 500, sort: 'id' }))
			.docs
		const mine = rows.filter(row => row.type === 'password-reset' && row.method === 'password')
		expect(mine.map(row => row.code).slice(-2)).toEqual(['identifiants-invalides', 'ok'])
		expect(JSON.stringify(rows)).not.toContain(CURRENT)
		expect(JSON.stringify(rows)).not.toContain(NEXT)
	})
})

describe('an account with no password of her own', () => {
	test('an account that came from Google cannot change one here: it is sent to the mail link', async () => {
		const account = await createAccount('reprise-google')
		const result = await change(withCookie(account.session.enTetes), typed('quelque-chose', NEXT))
		expect(result).toMatchObject({ ok: false, code: 'lien', message: CHANGE_MESSAGES.lien })
		expect(await canSignIn(account.email, NEXT)).toBe(false)
	})

	test('an account that still holds the hash of the old site is sent to the mail link too', async () => {
		const account = await createAccount('reprise-google-avec-hash')
		const result = await change(withCookie(account.session.enTetes), typed('quelque-chose', NEXT))
		expect(result).toMatchObject({ ok: false, code: 'lien' })
	})
})
