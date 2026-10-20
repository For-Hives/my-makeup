import { afterAll, describe, expect, test } from 'bun:test'
import { createRateLimit } from '@/lib/auth/rate-limit'
import { signInWithPassword } from '@/lib/auth/sign-in'
import { openWithPassword } from '@/lib/auth/token'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

/**
 * The sign-in of a makeup artist (tickets 074 and 075; plan 02 I09). The Server Action itself,
 * the cookie in a browser and the pages are played by tests/e2e/sign-in.spec.ts.
 */

afterAll(async () => {
	await emptyBase()
})

const PASSWORD = 'aaaaaaaa'
const url = (n: number) => new Headers({ 'x-forwarded-for': `192.0.2.${n}` })

describe('I09 : la session tient dans un seul cookie', () => {
	test('la connexion pose payload-token : HttpOnly, SameSite=Lax, et le jeton ne sort pas du cookie', async () => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })

		const {
			statut: status,
			enTetes: headers,
			texte: text,
		} = await callRest('POST', '/api/pros/login', {
			corps: { email: account.email, password: PASSWORD },
			enTetes: { 'x-forwarded-for': '192.0.2.11' },
		})

		expect(status).toBe(200)
		const cookie = headers.get('set-cookie') ?? ''
		expect(cookie).toStartWith('payload-token=')
		expect(cookie).toMatch(/HttpOnly/i)
		expect(cookie).toMatch(/SameSite=Lax/i)
		const token = /^payload-token=([^;]+)/.exec(cookie)?.[1] ?? ''
		expect(token.length).toBeGreaterThan(20)
		// removeTokenFromResponses: the body does not carry it.
		expect(text).not.toContain(token)
		expect(JSON.parse(text)).not.toHaveProperty('token')
	})

	test('le cookie dure 14 jours', async () => {
		const payload = await testPayload()
		expect(payload.collections.pros.config.auth.tokenExpiration).toBe(14 * 24 * 3600)
	})
})

describe('connecter, avec la vraie base', () => {
	test('l’email est insensible à la casse et aux espaces de bord', async () => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		const payload = await testPayload()
		const open = (data: { email: string; password: string }) => openWithPassword(payload, 'pros', data)
		const rateLimit = createRateLimit({ nom: 'essai-int-casse', limite: 10, fenetreMs: 60_000 })

		const r = await signInWithPassword({
			ouvrir: open,
			headers: url(12),
			email: `  ${account.email.toUpperCase()} `,
			password: PASSWORD,
			frein: rateLimit,
		})

		expect(r.ok).toBe(true)
	})

	test('un mot de passe sans majuscule, chiffre ni symbole est accepté à la connexion : aucune règle de composition', async () => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		const payload = await testPayload()
		const open = (data: { email: string; password: string }) => openWithPassword(payload, 'pros', data)
		const rateLimit = createRateLimit({ nom: 'essai-int-regle', limite: 10, fenetreMs: 60_000 })

		const just = await signInWithPassword({
			ouvrir: open,
			headers: url(13),
			email: account.email,
			password: PASSWORD,
			frein: rateLimit,
		})
		const fake = await signInWithPassword({
			ouvrir: open,
			headers: url(13),
			email: account.email,
			password: 'b',
			frein: rateLimit,
		})

		expect(just.ok).toBe(true)
		expect(fake).toEqual({ ok: false, code: 'identifiants-invalides' })
	})

	test('une adresse inconnue, un mauvais mot de passe et un mauvais mot de passe sur un compte non confirmé donnent la même réponse', async () => {
		const [known, unconfirmed] = await Promise.all([
			createAccount('maquilleuse', { motDePasse: () => PASSWORD }),
			createAccount('maquilleuse-non-verifiee', { motDePasse: () => PASSWORD }),
		])
		const payload = await testPayload()
		const open = (data: { email: string; password: string }) => openWithPassword(payload, 'pros', data)
		const rateLimit = createRateLimit({ nom: 'essai-int-generique', limite: 50, fenetreMs: 60_000 })
		const attempt = (email: string, password: string) =>
			signInWithPassword({ ouvrir: open, headers: url(14), email, password, frein: rateLimit })

		const responses = await Promise.all([
			attempt('personne@example.test', PASSWORD),
			attempt(known.email, 'mauvais'),
			attempt(unconfirmed.email, 'mauvais'),
		])

		for (const response of responses) expect(response).toEqual({ ok: false, code: 'identifiants-invalides' })
	})

	test('un compte non confirmé qui donne le bon mot de passe reçoit le message dédié (ticket 082)', async () => {
		const unconfirmed = await createAccount('maquilleuse-non-verifiee', { motDePasse: () => PASSWORD })
		const payload = await testPayload()
		const open = (data: { email: string; password: string }) => openWithPassword(payload, 'pros', data)
		const rateLimit = createRateLimit({ nom: 'essai-int-non-confirme', limite: 50, fenetreMs: 60_000 })

		const response = await signInWithPassword({
			ouvrir: open,
			headers: url(15),
			email: unconfirmed.email,
			password: PASSWORD,
			frein: rateLimit,
		})

		expect(response).toEqual({ ok: false, code: 'email-non-confirme' })
	})
})

describe('I14 : le frein par adresse, sans verrouiller le compte', () => {
	const signIn = (email: string, password: string, xForwardedFor: string) =>
		callRest('POST', '/api/pros/login', {
			corps: { email, password },
			enTetes: { 'x-forwarded-for': xForwardedFor },
		})

	test('le 11e échec d’une adresse est refusé en 429 ; le compte reste ouvert pour une autre adresse', async () => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		const throttledUrl = '198.51.100.20'

		for (let i = 0; i < 10; i++) expect((await signIn(account.email, `faux-${i}`, throttledUrl)).statut).toBe(401)
		const eleventh = await signIn(account.email, 'faux-10', throttledUrl)

		expect(eleventh.statut).toBe(429)
		expect(eleventh.texte).toContain('Trop d’essais, réessaie dans quelques minutes.')
		// The account is not locked: another address signs in with the right password…
		expect((await signIn(account.email, PASSWORD, '198.51.100.21')).statut).toBe(200)
		// …while the braked address is refused even with the right one, until the window runs out.
		expect((await signIn(account.email, PASSWORD, throttledUrl)).statut).toBe(429)
		const payload = await testPayload()
		const line = await payload.db.findOne<{ id: number; lockUntil?: unknown }>({
			collection: 'pros',
			where: { id: { equals: account.id } },
		})
		expect(line?.lockUntil ?? null).toBeNull()
	})

	test('les essais des autres ne bloquent pas une personne qui n’a rien fait de mal', async () => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		for (let i = 0; i < 12; i++) await signIn(account.email, `faux-${i}`, '198.51.100.30')

		expect((await signIn(account.email, PASSWORD, '198.51.100.31')).statut).toBe(200)
	})

	test('un en-tête X-Forwarded-For forgé n’y change rien : seule la dernière entrée compte', async () => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		for (let i = 0; i < 10; i++) await signIn(account.email, 'faux', `10.1.1.${i}, 198.51.100.40`)

		expect((await signIn(account.email, 'faux', '10.9.9.9, 198.51.100.40')).statut).toBe(429)
	})

	test('une IPv6 compte par bloc /64', async () => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		for (let i = 0; i < 10; i++) await signIn(account.email, 'faux', `2001:db8:0:50::${i + 1}`)

		expect((await signIn(account.email, 'faux', '2001:db8:0:50:aaaa::1')).statut).toBe(429)
		expect((await signIn(account.email, PASSWORD, '2001:db8:0:51::1')).statut).toBe(200)
	})

	test('aucune adresse IP dans ce que l’application écrit, au refus comme avant', async () => {
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		const url = '203.0.113.77'
		const written: string[] = []
		const output = process.stdout.write.bind(process.stdout)
		const error = process.stderr.write.bind(process.stderr)
		const note =
			(ecriture: typeof process.stdout.write) =>
			(morceau: string | Uint8Array, ...suite: unknown[]) => {
				written.push(String(morceau))
				return (ecriture as (...a: unknown[]) => boolean)(morceau, ...suite)
			}
		process.stdout.write = note(output) as typeof process.stdout.write
		process.stderr.write = note(error) as typeof process.stderr.write
		const consoles = (['log', 'info', 'warn', 'error'] as const).map(niveau => {
			const original = console[niveau]
			console[niveau] = (...arguments_: unknown[]) => {
				written.push(arguments_.map(String).join(' '))
			}
			return () => {
				console[niveau] = original
			}
		})
		try {
			for (let i = 0; i < 11; i++) await signIn(account.email, 'faux', url)
		} finally {
			process.stdout.write = output
			process.stderr.write = error
			for (const render of consoles) render()
		}

		expect(written.join('\n')).not.toContain(url)
	})
})
