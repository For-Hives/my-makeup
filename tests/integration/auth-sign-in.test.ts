import { afterAll, describe, expect, test } from 'bun:test'
import { createRateLimit } from '@/lib/auth/rate-limit'
import { signInWithPassword } from '@/lib/auth/sign-in'
import { openWithPassword } from '@/lib/auth/token'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

/**
 * The sign-in of a makeup artist (tickets 074 and 075; plan 02 I09). The Server Action itself,
 * the cookie in a browser and the pages are played by tests/e2e/connexion.spec.ts.
 */

afterAll(async () => {
	await emptyBase()
})

const MOT_DE_PASSE = 'aaaaaaaa'
const adresse = (n: number) => new Headers({ 'x-forwarded-for': `192.0.2.${n}` })

describe('I09 : la session tient dans un seul cookie', () => {
	test('la connexion pose payload-token : HttpOnly, SameSite=Lax, et le jeton ne sort pas du cookie', async () => {
		const compte = await createAccount('maquilleuse', { motDePasse: () => MOT_DE_PASSE })

		const { statut, enTetes, texte } = await callRest('POST', '/api/pros/login', {
			corps: { email: compte.email, password: MOT_DE_PASSE },
			enTetes: { 'x-forwarded-for': '192.0.2.11' },
		})

		expect(statut).toBe(200)
		const cookie = enTetes.get('set-cookie') ?? ''
		expect(cookie).toStartWith('payload-token=')
		expect(cookie).toMatch(/HttpOnly/i)
		expect(cookie).toMatch(/SameSite=Lax/i)
		const jeton = /^payload-token=([^;]+)/.exec(cookie)?.[1] ?? ''
		expect(jeton.length).toBeGreaterThan(20)
		// removeTokenFromResponses: the body does not carry it.
		expect(texte).not.toContain(jeton)
		expect(JSON.parse(texte)).not.toHaveProperty('token')
	})

	test('le cookie dure 14 jours', async () => {
		const payload = await testPayload()
		expect(payload.collections.pros.config.auth.tokenExpiration).toBe(14 * 24 * 3600)
	})
})

describe('connecter, avec la vraie base', () => {
	test('l’email est insensible à la casse et aux espaces de bord', async () => {
		const compte = await createAccount('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		const payload = await testPayload()
		const ouvrir = (data: { email: string; password: string }) => openWithPassword(payload, 'pros', data)
		const frein = createRateLimit({ nom: 'essai-int-casse', limite: 10, fenetreMs: 60_000 })

		const r = await signInWithPassword({
			ouvrir,
			headers: adresse(12),
			email: `  ${compte.email.toUpperCase()} `,
			password: MOT_DE_PASSE,
			frein,
		})

		expect(r.ok).toBe(true)
	})

	test('un mot de passe sans majuscule, chiffre ni symbole est accepté à la connexion : aucune règle de composition', async () => {
		const compte = await createAccount('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		const payload = await testPayload()
		const ouvrir = (data: { email: string; password: string }) => openWithPassword(payload, 'pros', data)
		const frein = createRateLimit({ nom: 'essai-int-regle', limite: 10, fenetreMs: 60_000 })

		const juste = await signInWithPassword({
			ouvrir,
			headers: adresse(13),
			email: compte.email,
			password: MOT_DE_PASSE,
			frein,
		})
		const faux = await signInWithPassword({ ouvrir, headers: adresse(13), email: compte.email, password: 'b', frein })

		expect(juste.ok).toBe(true)
		expect(faux).toEqual({ ok: false, code: 'identifiants-invalides' })
	})

	test('une adresse inconnue, un mauvais mot de passe et un mauvais mot de passe sur un compte non confirmé donnent la même réponse', async () => {
		const [connu, nonConfirme] = await Promise.all([
			createAccount('maquilleuse', { motDePasse: () => MOT_DE_PASSE }),
			createAccount('maquilleuse-non-verifiee', { motDePasse: () => MOT_DE_PASSE }),
		])
		const payload = await testPayload()
		const ouvrir = (data: { email: string; password: string }) => openWithPassword(payload, 'pros', data)
		const frein = createRateLimit({ nom: 'essai-int-generique', limite: 50, fenetreMs: 60_000 })
		const essayer = (email: string, password: string) =>
			signInWithPassword({ ouvrir, headers: adresse(14), email, password, frein })

		const reponses = await Promise.all([
			essayer('personne@example.test', MOT_DE_PASSE),
			essayer(connu.email, 'mauvais'),
			essayer(nonConfirme.email, 'mauvais'),
		])

		for (const reponse of reponses) expect(reponse).toEqual({ ok: false, code: 'identifiants-invalides' })
	})

	test('un compte non confirmé qui donne le bon mot de passe reçoit le message dédié (ticket 082)', async () => {
		const nonConfirme = await createAccount('maquilleuse-non-verifiee', { motDePasse: () => MOT_DE_PASSE })
		const payload = await testPayload()
		const ouvrir = (data: { email: string; password: string }) => openWithPassword(payload, 'pros', data)
		const frein = createRateLimit({ nom: 'essai-int-non-confirme', limite: 50, fenetreMs: 60_000 })

		const reponse = await signInWithPassword({
			ouvrir,
			headers: adresse(15),
			email: nonConfirme.email,
			password: MOT_DE_PASSE,
			frein,
		})

		expect(reponse).toEqual({ ok: false, code: 'email-non-confirme' })
	})
})

describe('I14 : le frein par adresse, sans verrouiller le compte', () => {
	const connexion = (email: string, password: string, xForwardedFor: string) =>
		callRest('POST', '/api/pros/login', {
			corps: { email, password },
			enTetes: { 'x-forwarded-for': xForwardedFor },
		})

	test('le 11e échec d’une adresse est refusé en 429 ; le compte reste ouvert pour une autre adresse', async () => {
		const compte = await createAccount('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		const adresseFrenee = '198.51.100.20'

		for (let i = 0; i < 10; i++) expect((await connexion(compte.email, `faux-${i}`, adresseFrenee)).statut).toBe(401)
		const onzieme = await connexion(compte.email, 'faux-10', adresseFrenee)

		expect(onzieme.statut).toBe(429)
		expect(onzieme.texte).toContain('Trop d’essais, réessaie dans quelques minutes.')
		// The account is not locked: another address signs in with the right password…
		expect((await connexion(compte.email, MOT_DE_PASSE, '198.51.100.21')).statut).toBe(200)
		// …while the braked address is refused even with the right one, until the window runs out.
		expect((await connexion(compte.email, MOT_DE_PASSE, adresseFrenee)).statut).toBe(429)
		const payload = await testPayload()
		const ligne = await payload.db.findOne<{ id: number; lockUntil?: unknown }>({
			collection: 'pros',
			where: { id: { equals: compte.id } },
		})
		expect(ligne?.lockUntil ?? null).toBeNull()
	})

	test('les essais des autres ne bloquent pas une personne qui n’a rien fait de mal', async () => {
		const compte = await createAccount('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		for (let i = 0; i < 12; i++) await connexion(compte.email, `faux-${i}`, '198.51.100.30')

		expect((await connexion(compte.email, MOT_DE_PASSE, '198.51.100.31')).statut).toBe(200)
	})

	test('un en-tête X-Forwarded-For forgé n’y change rien : seule la dernière entrée compte', async () => {
		const compte = await createAccount('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		for (let i = 0; i < 10; i++) await connexion(compte.email, 'faux', `10.1.1.${i}, 198.51.100.40`)

		expect((await connexion(compte.email, 'faux', '10.9.9.9, 198.51.100.40')).statut).toBe(429)
	})

	test('une IPv6 compte par bloc /64', async () => {
		const compte = await createAccount('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		for (let i = 0; i < 10; i++) await connexion(compte.email, 'faux', `2001:db8:0:50::${i + 1}`)

		expect((await connexion(compte.email, 'faux', '2001:db8:0:50:aaaa::1')).statut).toBe(429)
		expect((await connexion(compte.email, MOT_DE_PASSE, '2001:db8:0:51::1')).statut).toBe(200)
	})

	test('aucune adresse IP dans ce que l’application écrit, au refus comme avant', async () => {
		const compte = await createAccount('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		const adresse = '203.0.113.77'
		const ecrit: string[] = []
		const sortie = process.stdout.write.bind(process.stdout)
		const erreur = process.stderr.write.bind(process.stderr)
		const noter =
			(ecriture: typeof process.stdout.write) =>
			(morceau: string | Uint8Array, ...suite: unknown[]) => {
				ecrit.push(String(morceau))
				return (ecriture as (...a: unknown[]) => boolean)(morceau, ...suite)
			}
		process.stdout.write = noter(sortie) as typeof process.stdout.write
		process.stderr.write = noter(erreur) as typeof process.stderr.write
		const consoles = (['log', 'info', 'warn', 'error'] as const).map(niveau => {
			const original = console[niveau]
			console[niveau] = (...arguments_: unknown[]) => {
				ecrit.push(arguments_.map(String).join(' '))
			}
			return () => {
				console[niveau] = original
			}
		})
		try {
			for (let i = 0; i < 11; i++) await connexion(compte.email, 'faux', adresse)
		} finally {
			process.stdout.write = sortie
			process.stderr.write = erreur
			for (const rendre of consoles) rendre()
		}

		expect(ecrit.join('\n')).not.toContain(adresse)
	})
})
