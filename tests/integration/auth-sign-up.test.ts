import { afterAll, describe, expect, test } from 'bun:test'
import { authLog } from '@/lib/auth/auth-log'
import { confirmEmail } from '@/lib/auth/confirmation'
import { createRateLimit } from '@/lib/auth/rate-limit'
import { signInWithPassword } from '@/lib/auth/sign-in'
import { signUpAccount } from '@/lib/auth/sign-up-payload'
import type { MailboxRateLimits } from '@/lib/auth/sign-up-rate-limits'
import { openWithPassword } from '@/lib/auth/token'
import { EmailSendFailed, payloadSendEmail } from '@/lib/emails/send'
import { parseServerEnv, serverEnv } from '@/lib/env'
import { createAccount } from '../support/account-factory'
import { emptySink, mailReceived, waitMail } from '../support/mailpit'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

/**
 * The sign-up and the confirmation of the email (ticket 082; plan 02 I08). The page, the cookie and
 * the whole path through a browser are played by tests/e2e/sign-up.spec.ts.
 */

afterAll(async () => {
	await Promise.all([emptyBase(), emptySink()])
})

const PASSWORD = 'aaaaaaaa'
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100'
const rateLimit = createRateLimit({ nom: 'essai-inscription', limite: 1000, fenetreMs: 60_000 })
let n = 0
// The sign-ups of this file are many and fast: no floor, and brakes by mailbox wide open unless a test says otherwise.
const wideRateLimits = (): MailboxRateLimits => ({
	parMinute: createRateLimit({ nom: `essai-boite-minute-${crypto.randomUUID()}`, limite: 1000, fenetreMs: 60_000 }),
	parJour: createRateLimit({ nom: `essai-boite-jour-${crypto.randomUUID()}`, limite: 1000, fenetreMs: 60_000 }),
})
const url = () => new Headers({ 'x-forwarded-for': `192.0.2.${150 + (n++ % 90)}` })
const address = (prefixe: string) => `${prefixe}-${crypto.randomUUID()}@example.test`

async function signUp(options: {
	email?: string
	nom?: string
	verifier?: boolean
	envoyer?: Parameters<typeof signUpAccount>[0]['envoyer']
	plancherMs?: number
	freins?: MailboxRateLimits
}) {
	const payload = await testPayload()
	const email = options.email ?? address('nouvelle')
	const result = await signUpAccount({
		payload,
		donnees: { nom: options.nom ?? 'Léa Fictive', email, password: PASSWORD },
		verifier: options.verifier ?? true,
		envoyer: options.envoyer ?? payloadSendEmail(payload, serverEnv()),
		site: SITE,
		journal: authLog(payload),
		plancherMs: options.plancherMs ?? 0,
		freins: options.freins ?? wideRateLimits(),
	})
	return { resultat: result, email, payload }
}

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

const account = async (email: string) => {
	const payload = await testPayload()
	return (await payload.find({ collection: 'pros', depth: 0, limit: 1, where: { email: { equals: email } } })).docs[0]
}

const log = async () =>
	(await (await testPayload()).find({ collection: 'auth-events', depth: 0, limit: 1000, sort: 'id' })).docs

const linkCode = (lien: string): string => new URL(lien).searchParams.get('code') ?? ''

describe('I08 : l’inscription envoie le mail de confirmation, et le compte attend le lien', () => {
	test('compte non confirmé, profil vide avec son slug fait par le serveur, un mail avec le lien', async () => {
		const { resultat: result, email } = await signUp({ nom: 'Léa Fictive' })

		expect(result).toEqual({ ok: true, confirmee: false })
		const pro = await account(email)
		expect(pro?._verified).toBe(false)
		expect(pro?.name).toBe('Léa Fictive')
		const payload = await testPayload()
		const profiles = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: pro?.id } } })
		expect(profiles.totalDocs).toBe(1)
		expect(profiles.docs[0]?.slug).toMatch(/^lea-fictive(-\d+)?$/)
		const mail = await waitMail({ pour: email })
		expect(mail.sujet).toContain('Confirme ton adresse email')
		const link = mail.liens.find(l => l.includes('/auth/verification-complete'))
		expect(link).toStartWith(`${SITE}/auth/verification-complete?code=`)
		expect(linkCode(link ?? '')).toMatch(/^[0-9a-f]{40}$/)
		expect(mail.texte).toContain(link ?? 'x')
		expect(mail.liens.some(l => l.includes('/admin'))).toBe(false)
	})

	test('le mot de passe n’est dans aucun mail ni dans la base en clair', async () => {
		const { email } = await signUp({})
		const mail = await waitMail({ pour: email })
		expect(mail.texte + mail.html).not.toContain(PASSWORD)
		const pro = await account(email)
		expect(JSON.stringify(pro)).not.toContain(PASSWORD)
	})

	test('deux maquilleuses peuvent porter le même nom : deux comptes, deux slugs', async () => {
		const a = await signUp({ nom: 'Marie Homonyme' })
		const b = await signUp({ nom: 'Marie Homonyme' })
		expect(a.resultat.ok && b.resultat.ok).toBe(true)
		const payload = await testPayload()
		const slugs = (
			await payload.find({
				collection: 'profiles',
				depth: 0,
				where: { pro: { in: [(await account(a.email))?.id, (await account(b.email))?.id] } },
			})
		).docs.map(({ slug }) => slug)
		expect(new Set(slugs).size).toBe(2)
	})
})

describe('des homonymes qui s’inscrivent au même instant', () => {
	/** More than the 5 connections of the pool, and more than the 3 tries the sign-up had (CI of 15/10/2026). */
	const NAMESAKES = 8

	test('tous aboutissent, chacun avec son propre slug', async () => {
		const all = await Promise.all(
			Array.from({ length: NAMESAKES }, () => signUp({ nom: 'Homonyme Simultanée', verifier: false }))
		)

		expect(all.map(({ resultat: result }) => result.ok)).toEqual(Array(NAMESAKES).fill(true))
		const payload = await testPayload()
		const pros = await Promise.all(all.map(({ email }) => account(email)))
		const slugs = (
			await payload.find({ collection: 'profiles', depth: 0, where: { pro: { in: pros.map(p => p?.id) } } })
		).docs.map(({ slug }) => slug)
		expect(new Set(slugs).size).toBe(NAMESAKES)
	})
})

describe('l’interrupteur d’exploitation : AUTH_VERIFY', () => {
	const base = { DATABASE_URI: process.env.DATABASE_URI, PAYLOAD_SECRET: process.env.PAYLOAD_SECRET }

	test('par défaut (variable absente ou « on ») la confirmation est demandée', async () => {
		for (const AUTH_VERIFY of [undefined, 'on']) {
			const env = parseServerEnv({ ...base, AUTH_VERIFY })
			const { resultat: result, email } = await signUp({ verifier: env.authVerify })
			expect(result).toEqual({ ok: true, confirmee: false })
			expect((await account(email))?._verified).toBe(false)
			await waitMail({ pour: email })
		}
	})

	test('« off » : le compte est confirmé sur le champ, il se connecte aussitôt, aucun mail ne part', async () => {
		const env = parseServerEnv({ ...base, AUTH_VERIFY: 'off' })
		const { resultat: result, email } = await signUp({ verifier: env.authVerify })

		expect(result).toEqual({ ok: true, confirmee: true })
		expect((await account(email))?._verified).toBe(true)
		expect((await signInAction(email, PASSWORD)).ok).toBe(true)
		expect(await mailReceived(email)).toEqual([])
	})
})

describe('connexion avant confirmation', () => {
	test('avec le bon mot de passe : le message dédié ; avec un mauvais ou une adresse inconnue : le message générique', async () => {
		const { email } = await signUp({})

		expect(await signInAction(email, PASSWORD)).toEqual({ ok: false, code: 'email-non-confirme' })
		expect(await signInAction(email, 'mauvais-mot-de-passe')).toEqual({ ok: false, code: 'identifiants-invalides' })
		expect(await signInAction(address('inconnue'), PASSWORD)).toEqual({
			ok: false,
			code: 'identifiants-invalides',
		})
	})

	test('par l’API REST aussi : refusé, sans session ; la ligne du journal dit « email-non-confirme »', async () => {
		const { email } = await signUp({})
		const before = (await log()).length

		const response = await callRest('POST', '/api/pros/login', {
			corps: { email, password: PASSWORD },
			enTetes: { 'x-forwarded-for': '198.51.100.230' },
		})

		expect(response.statut).toBe(403)
		expect(response.enTetes.get('set-cookie') ?? '').not.toContain('payload-token=')
		expect((await log()).slice(before).map(({ type, code }) => [type, code])).toEqual([
			['sign-in', 'email-non-confirme'],
		])
	})

	test('un refus « non confirmé » rend sa place au frein : ce n’est pas un essai de mot de passe', async () => {
		const { email } = await signUp({})
		const smallRateLimit = createRateLimit({ nom: 'essai-non-confirme', limite: 2, fenetreMs: 60_000 })
		const payload = await testPayload()
		const attempt = () =>
			signInWithPassword({
				ouvrir: data => openWithPassword(payload, 'pros', data),
				headers: url(),
				email,
				password: PASSWORD,
				frein: smallRateLimit,
			})
		const codes = []
		for (let i = 0; i < 5; i++) codes.push((await attempt()).ok ? 'ok' : 'non-confirme')
		expect(codes).toEqual(Array(5).fill('non-confirme'))
	})
})

describe('le lien du mail : à usage unique', () => {
	test('le lien confirme le compte ; suivi une seconde fois avant le clic il ne change rien ; la connexion marche', async () => {
		const { email } = await signUp({})
		const mail = await waitMail({ pour: email })
		const code = linkCode(mail.liens.find(l => l.includes('verification-complete')) ?? '')
		const payload = await testPayload()
		const before = (await log()).length

		expect(await confirmEmail(payload, code, authLog(payload))).toBe('ok')
		expect((await account(email))?._verified).toBe(true)
		// Before the click of « Continuer » the offer stays (ticket 302); the spent link is tested in auth-session-after-link.
		expect(await confirmEmail(payload, code, authLog(payload))).toBe('ok')
		expect(await confirmEmail(payload, 'f'.repeat(40), authLog(payload))).toBe('lien-invalide')

		expect((await signInAction(email, PASSWORD)).ok).toBe(true)
		expect((await log()).slice(before).map(({ type, code }) => [type, code])).toEqual([
			['confirmation', 'ok'],
			['confirmation', 'ok'],
			['confirmation', 'lien-invalide'],
			['sign-in', 'ok'],
		])
	})

	test('le jeton ne reste pas en base : une trace de son usage, jamais un lien qui marche', async () => {
		const { email } = await signUp({})
		const mail = await waitMail({ pour: email })
		const code = linkCode(mail.liens.find(l => l.includes('verification-complete')) ?? '')
		const payload = await testPayload()
		await confirmEmail(payload, code)

		const line = await payload.db.findOne<{ id: number; _verificationToken?: string }>({
			collection: 'pros',
			where: { email: { equals: email } },
		})
		// Confirmed, the session of the link not yet claimed (ticket 302): a trace of the token, never the token.
		expect(line?._verificationToken).toStartWith('pending:')
		expect(line?._verificationToken).not.toContain(code)
	})

	test('le lien d’un compte ne confirme pas celui d’un autre', async () => {
		const [a, b] = [await signUp({}), await signUp({})]
		const mailA = await waitMail({ pour: a.email })
		const payload = await testPayload()

		await confirmEmail(payload, linkCode(mailA.liens.find(l => l.includes('verification-complete')) ?? ''))

		expect((await account(a.email))?._verified).toBe(true)
		expect((await account(b.email))?._verified).toBe(false)
	})

	test('l’API REST ne donne jamais le jeton de confirmation, même à la propriétaire', async () => {
		const artist = await createAccount('maquilleuse')
		const { corps, texte: text } = await callRest('GET', `/api/pros/${artist.id}`, {
			enTetes: artist.session.enTetes,
		})
		expect(corps).not.toHaveProperty('_verificationToken')
		expect(text).not.toContain('_verificationToken')
	})
})

describe('quand l’inscription ne peut pas aboutir', () => {
	test('le mail ne part pas : rien n’est gardé (ni compte, ni profil), et elle peut réessayer avec la même adresse', async () => {
		const email = address('retente')
		const payload = await testPayload()
		const profiles = (await payload.count({ collection: 'profiles' })).totalDocs

		const raté = await signUp({ email, envoyer: () => Promise.reject(new EmailSendFailed()) })

		expect(raté.resultat).toEqual({ ok: false, code: 'email-non-envoye' })
		expect(await account(email)).toBeUndefined()
		expect((await payload.count({ collection: 'profiles' })).totalDocs).toBe(profiles)
		const fresh = await signUp({ email })
		expect(fresh.resultat).toEqual({ ok: true, confirmee: false })
		await waitMail({ pour: email })
	})

	test('une panne imprévue donne « service-indisponible », jamais une exception', async () => {
		const { resultat: result } = await signUp({ envoyer: () => Promise.reject(new Error('relais en feu')) })
		expect(result).toEqual({ ok: false, code: 'service-indisponible' })
	})
})

describe('le journal de l’inscription', () => {
	test('une ligne « inscription » pour chaque issue, sans email ni nom', async () => {
		const before = (await log()).length
		const name = 'Nom Distinctif Journal'
		const email = address('journal')
		await signUp({ email, nom: name })
		await signUp({ email, nom: name })
		await signUp({ envoyer: () => Promise.reject(new EmailSendFailed()) })

		const lines = (await log()).slice(before)
		expect(lines.map(({ type, code }) => [type, code])).toEqual([
			['sign-up', 'ok'],
			['sign-up', 'email-deja-pris'],
			['sign-up', 'service-indisponible'],
		])
		expect(JSON.stringify(lines)).not.toMatch(/Distinctif|journal-/)
	})
})

describe('l’admin qui crée un compte dans le panneau', () => {
	test('le mail de Payload dit la même chose et mène à la page du site, pas à l’administration', async () => {
		const admin = await createAccount('admin')
		const email = address('par-admin')

		const response = await callRest('POST', '/api/pros', {
			enTetes: admin.session.enTetes,
			corps: { email, password: PASSWORD, nom: 'Créée Par Admin' },
		})

		expect(response.statut).toBe(201)
		const mail = await waitMail({ pour: email })
		expect(mail.sujet).toContain('Confirme ton adresse email')
		const link = mail.liens.find(l => l.includes('verification-complete'))
		expect(link).toMatch(/\/auth\/verification-complete\?code=[0-9a-f]{40}$/)
		expect(mail.liens.some(l => l.includes('/admin'))).toBe(false)
	})
})
