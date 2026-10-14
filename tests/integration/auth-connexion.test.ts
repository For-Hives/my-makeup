import { afterAll, describe, expect, test } from 'bun:test'
import { connecter } from '@/lib/auth/connexion'
import { creerFrein } from '@/lib/auth/frein'
import { ouvrirParMotDePasse } from '@/lib/auth/jeton'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'

/**
 * The sign-in of a makeup artist (tickets 074 and 075; plan 02 I09). The Server Action itself,
 * the cookie in a browser and the pages are played by tests/e2e/connexion.spec.ts.
 */

afterAll(async () => {
	await viderLaBase()
})

const MOT_DE_PASSE = 'aaaaaaaa'
const adresse = (n: number) => new Headers({ 'x-forwarded-for': `192.0.2.${n}` })

describe('I09 : la session tient dans un seul cookie', () => {
	test('la connexion pose payload-token : HttpOnly, SameSite=Lax, et le jeton ne sort pas du cookie', async () => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })

		const { statut, enTetes, texte } = await appelerRest('POST', '/api/pros/login', {
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
		const payload = await payloadDeTest()
		expect(payload.collections.pros.config.auth.tokenExpiration).toBe(14 * 24 * 3600)
	})
})

describe('connecter, avec la vraie base', () => {
	test('l’email est insensible à la casse et aux espaces de bord', async () => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		const payload = await payloadDeTest()
		const ouvrir = (data: { email: string; password: string }) => ouvrirParMotDePasse(payload, 'pros', data)
		const frein = creerFrein({ nom: 'essai-int-casse', limite: 10, fenetreMs: 60_000 })

		const r = await connecter({
			ouvrir,
			headers: adresse(12),
			email: `  ${compte.email.toUpperCase()} `,
			password: MOT_DE_PASSE,
			frein,
		})

		expect(r.ok).toBe(true)
	})

	test('un mot de passe sans majuscule, chiffre ni symbole est accepté à la connexion : aucune règle de composition', async () => {
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		const payload = await payloadDeTest()
		const ouvrir = (data: { email: string; password: string }) => ouvrirParMotDePasse(payload, 'pros', data)
		const frein = creerFrein({ nom: 'essai-int-regle', limite: 10, fenetreMs: 60_000 })

		const juste = await connecter({ ouvrir, headers: adresse(13), email: compte.email, password: MOT_DE_PASSE, frein })
		const faux = await connecter({ ouvrir, headers: adresse(13), email: compte.email, password: 'b', frein })

		expect(juste.ok).toBe(true)
		expect(faux).toEqual({ ok: false, code: 'identifiants-invalides' })
	})

	test('une adresse inconnue, un mauvais mot de passe et un compte non confirmé donnent la même réponse', async () => {
		const [connu, nonConfirme] = await Promise.all([
			creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE }),
			creerCompte('maquilleuse-non-verifiee', { motDePasse: () => MOT_DE_PASSE }),
		])
		const payload = await payloadDeTest()
		const ouvrir = (data: { email: string; password: string }) => ouvrirParMotDePasse(payload, 'pros', data)
		const frein = creerFrein({ nom: 'essai-int-generique', limite: 50, fenetreMs: 60_000 })
		const essayer = (email: string, password: string) =>
			connecter({ ouvrir, headers: adresse(14), email, password, frein })

		const reponses = await Promise.all([
			essayer('personne@example.test', MOT_DE_PASSE),
			essayer(connu.email, 'mauvais'),
			essayer(nonConfirme.email, MOT_DE_PASSE),
		])

		for (const reponse of reponses) expect(reponse).toEqual({ ok: false, code: 'identifiants-invalides' })
	})
})
