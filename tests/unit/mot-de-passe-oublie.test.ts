import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import {
	FORGOT_PASSWORD_FLOOR_MS,
	LINK_DURATION_MS,
	linkPlan,
	PASSWORD_MESSAGES,
	PASSWORD_RESET_COOKIE,
	passwordResetToken,
	validateAddress,
	validateNewPassword,
} from '@/lib/auth/forgot-password'
import { closeForgotPasswordRestDoors } from '@/lib/auth/forgot-payload'
import { requestPasswordLink } from '@/lib/auth/password-reset-payload'
import { createRateLimit } from '@/lib/auth/rate-limit'
import { composerEmail } from '@/lib/emails/layout'
import { passwordResetEmailContent } from '@/lib/emails/password-reset'

/** Tickets 085 and 086: the rules of the forgotten password that need no database. */

const JETON = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'

describe('l’adresse de la demande', () => {
	test('une adresse est rognée et acceptée', () => {
		expect(validateAddress('  lea@example.test ')).toEqual({ ok: true, email: 'lea@example.test' })
	})
	test.each<[unknown, 'email-vide' | 'email-invalide']>([
		['', 'email-vide'],
		['   ', 'email-vide'],
		[undefined, 'email-vide'],
		[42, 'email-vide'],
		['pas-une-adresse', 'email-invalide'],
		['a@b', 'email-invalide'],
		[`${'a'.repeat(250)}@example.test`, 'email-invalide'],
	])('%p est refusée : %s', (brut, code) => {
		expect(validateAddress(brut)).toEqual({ ok: false, code })
	})
})

describe('le nouveau mot de passe', () => {
	test('8 caractères, aucune règle de composition, jamais rogné', () => {
		expect(validateNewPassword('aaaaaaaa', 'aaaaaaaa')).toEqual({ ok: true, motDePasse: 'aaaaaaaa' })
		expect(validateNewPassword('  aaaaaa  ', '  aaaaaa  ')).toEqual({ ok: true, motDePasse: '  aaaaaa  ' })
	})
	test('trop court, trop long, confirmation différente', () => {
		expect(validateNewPassword('1234567', '1234567')).toEqual({ ok: false, code: 'mot-de-passe-trop-court' })
		expect(validateNewPassword(undefined, undefined)).toEqual({ ok: false, code: 'mot-de-passe-trop-court' })
		expect(validateNewPassword('a'.repeat(256), 'a'.repeat(256))).toEqual({
			ok: false,
			code: 'mot-de-passe-trop-long',
		})
		expect(validateNewPassword('aaaaaaaa', 'aaaaaaab')).toEqual({ ok: false, code: 'mots-de-passe-differents' })
		expect(validateNewPassword('aaaaaaaa', undefined)).toEqual({ ok: false, code: 'mots-de-passe-differents' })
	})
})

describe('le jeton du lien', () => {
	test('40 caractères hexadécimaux, ou rien', () => {
		expect(passwordResetToken(JETON)).toBe(JETON)
		expect(passwordResetToken(` ${JETON} `)).toBe(JETON)
		expect(passwordResetToken([JETON, 'x'])).toBe(JETON)
		for (const faux of [
			undefined,
			null,
			'',
			'a'.repeat(39),
			'A'.repeat(40),
			'g'.repeat(40),
			'a1'.repeat(64),
			"' or 1=1",
		])
			expect(passwordResetToken(faux)).toBeNull()
	})
})

describe('le lien du mail sort de l’adresse (proxy)', () => {
	const params = (requete: string) => new URLSearchParams(requete)

	test('le lien du mail : un cookie d’une heure, et l’adresse sans code', () => {
		const plan = linkPlan('/auth/reinitialiser', params(`code=${JETON}`))
		expect(plan).toEqual({ aller: '/auth/reinitialiser', cookie: { valeur: JETON, maxAgeS: 3600 } })
		expect(LINK_DURATION_MS / 1000).toBe(3600)
	})
	test('un lien de l’ancien site (128 caractères) est gardé : la page dira « plus valable »', () => {
		const ancien = 'a1'.repeat(64)
		expect(linkPlan('/auth/reinitialiser', params(`code=${ancien}`))?.cookie.valeur).toBe(ancien)
		expect(passwordResetToken(ancien)).toBeNull()
	})
	test('un code qui n’en est pas un efface le cookie et ne le remplace pas', () => {
		for (const code of ['', 'x', '<script>alert(1)</script>', 'a b c d e f g h i j k l'])
			expect(linkPlan('/auth/reinitialiser', params(`code=${encodeURIComponent(code)}`))?.cookie).toEqual({
				valeur: '',
				maxAgeS: 0,
			})
	})
	test('rien d’autre n’est concerné : sans code, ou une autre page', () => {
		expect(linkPlan('/auth/reinitialiser', params(''))).toBeNull()
		expect(linkPlan('/auth/signin', params(`code=${JETON}`))).toBeNull()
		expect(linkPlan('/auth/reinitialiser/autre', params(`code=${JETON}`))).toBeNull()
	})
	test('le cookie a le nom des anciennes pages', () => {
		expect(PASSWORD_RESET_COOKIE).toBe('mm-reset')
	})
})

describe('le mail', () => {
	test('un bouton vers la page du site avec le jeton, une heure, un seul usage, « tu »', () => {
		const email = composerEmail(passwordResetEmailContent(JETON), 'https://my-makeup.fr')
		expect(email.sujet).toBe('Réinitialise ton mot de passe My Makeup')
		expect(email.lien).toBe(`https://my-makeup.fr/auth/reinitialiser?code=${JETON}`)
		expect(email.texte).toContain(email.lien ?? 'x')
		expect(email.html).toContain('valable une heure')
		expect(email.html).toContain('ne sert qu’une fois')
		expect(email.html + email.texte).not.toContain('/admin')
	})
})

describe('les textes sont ceux du site actuel', () => {
	test('trois phrases reprises au mot près', () => {
		expect(PASSWORD_MESSAGES.envoyee).toBe(
			'Si un compte existe avec cette adresse, tu vas recevoir un email avec un lien pour choisir un nouveau mot de passe. Pense à regarder dans tes courriers indésirables.'
		)
		expect(PASSWORD_MESSAGES['code-invalide']).toStartWith('Ce lien n’est plus valable')
		expect(PASSWORD_MESSAGES.modifie).toBe(
			'Ton mot de passe est modifié. Tu peux te connecter avec ton email et ce nouveau mot de passe.'
		)
	})
})

describe('demanderUnLien avec un Payload de pacotille', () => {
	const journal: { type: string; code: string }[] = []
	const appels: string[] = []
	const envoyes: { a: string; texte: string; html: string }[] = []
	const rendus: number[] = []
	const payload = () =>
		({
			db: {
				// The reservation: a known account is found, an unknown one is not.
				updateOne: async ({ data, where }: { data: Record<string, unknown>; where: unknown }) => {
					if (data.resetPasswordRequestedAt === null) {
						rendus.push(1)
						return null
					}
					const adresse = JSON.stringify(where).match(/"equals":"([^"]+)"/)?.[1] ?? ''
					appels.push(adresse)
					return adresse.startsWith('connue') ? { id: 7, email: adresse } : null
				},
			},
			forgotPassword: async ({ disableEmail }: { disableEmail?: boolean }) => {
				if (!disableEmail) throw new Error('Payload must not send the mail itself')
				return 'a'.repeat(40)
			},
			logger: { error: () => {} },
		}) as unknown as Payload
	const envoyer = (echec: boolean) => async (e: { a: string; texte: string; html: string }) => {
		if (echec) throw new Error(`le relais refuse ${e.a}`)
		envoyes.push(e)
	}
	const lancer = async (
		email: unknown,
		options: {
			echec?: boolean
			frein?: ReturnType<typeof createRateLimit>
			apres?: (t: () => Promise<void>) => void
		} = {}
	) => {
		const travaux: Promise<void>[] = []
		const debut = Date.now()
		const resultat = await requestPasswordLink({
			payload: payload(),
			envoyer: envoyer(options.echec ?? false),
			site: 'https://my-makeup.fr',
			headers: new Headers({ 'x-forwarded-for': '203.0.113.7' }),
			email,
			apres: options.apres ?? (t => void travaux.push(t())),
			frein: options.frein ?? createRateLimit({ nom: `unit-${Math.random()}`, limite: 100, fenetreMs: 1000 }),
			journal: async e => void journal.push({ type: e.type, code: e.code }),
		})
		const duree = Date.now() - debut
		await Promise.all(travaux)
		return { resultat, duree }
	}

	test('connue ou inconnue : même réponse, même plancher, et le travail est confié à `apres`', async () => {
		const connue = await lancer('connue@example.test')
		const inconnue = await lancer('inconnue@example.test')
		expect(connue.resultat).toEqual(inconnue.resultat)
		expect(envoyes.map(e => e.a)).toEqual(['connue@example.test'])
		// The mail leaves by the one door, with its two parts.
		expect(envoyes[0]?.texte).toContain('/auth/reinitialiser?code=')
		expect(envoyes[0]?.html).toContain('/auth/reinitialiser?code=')
		for (const { duree } of [connue, inconnue]) {
			expect(duree).toBeGreaterThanOrEqual(FORGOT_PASSWORD_FLOOR_MS - 20)
			expect(duree).toBeLessThan(FORGOT_PASSWORD_FLOOR_MS + 200)
		}
	})

	test('le travail ne tourne pas avant la réponse : il est remis à `apres`', async () => {
		appels.length = 0
		let remis: (() => Promise<void>) | undefined
		await lancer('connue@example.test', {
			apres: t => {
				remis = t
			},
		})
		expect(appels).toEqual([])
		await remis?.()
		expect(appels).toEqual(['connue@example.test'])
	})

	test('hors d’une requête, `after` refuse : le travail tourne quand même, la réponse ne change pas', async () => {
		appels.length = 0
		const { resultat } = await lancer('connue@example.test', {
			apres: () => {
				throw new Error('after was called outside a request scope')
			},
		})
		expect(resultat).toEqual({ ok: true })
		await Bun.sleep(20)
		expect(appels).toEqual(['connue@example.test'])
	})

	test('un relais en panne ne change pas la réponse, et le journal ne garde pas l’adresse', async () => {
		journal.length = 0
		const { resultat } = await lancer('connue@example.test', { echec: true })
		expect(resultat).toEqual({ ok: true })
		expect(journal).toEqual([{ type: 'forgot-password', code: 'service-indisponible' }])
		// The place of the mail is given back, so that she can ask again at once.
		expect(rendus.length).toBe(1)
	})

	test('la 11e demande est refusée avant tout travail, connue ou non', async () => {
		appels.length = 0
		const frein = createRateLimit({ nom: `unit-frein-${Math.random()}`, limite: 10, fenetreMs: 60_000 })
		for (let i = 0; i < 10; i++) await lancer(`inconnue${i}@example.test`, { frein })
		const avant = appels.length
		expect((await lancer('connue@example.test', { frein })).resultat).toEqual({ ok: false, code: 'trop-de-tentatives' })
		expect((await lancer('inconnue@example.test', { frein })).resultat).toEqual({
			ok: false,
			code: 'trop-de-tentatives',
		})
		expect(appels.length).toBe(avant)
	})
})

describe('les portes REST de Payload', () => {
	const hook = (operation: string, payloadAPI: string) =>
		closeForgotPasswordRestDoors({ operation, req: { payloadAPI } } as never)

	test('fermées en REST pour les deux opérations, ouvertes en API locale et pour les autres', () => {
		expect(() => hook('forgotPassword', 'REST')).toThrow('Cette opération passe par les pages du site.')
		expect(() => hook('resetPassword', 'REST')).toThrow()
		expect(() => hook('forgotPassword', 'local')).not.toThrow()
		expect(() => hook('resetPassword', 'local')).not.toThrow()
		expect(() => hook('login', 'REST')).not.toThrow()
	})
})
