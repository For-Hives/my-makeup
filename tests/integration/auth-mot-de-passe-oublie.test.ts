import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { authLog } from '@/lib/auth/auth-log'
import { FORGOT_PASSWORD_FLOOR_MS, LINK_DURATION_MS } from '@/lib/auth/forgot-password'
import { linkStillValid, requestPasswordLink, resetPassword } from '@/lib/auth/password-reset-payload'
import { createRateLimit } from '@/lib/auth/rate-limit'
import { signInWithPassword } from '@/lib/auth/sign-in'
import { openWithPassword } from '@/lib/auth/token'
import { payloadSendEmail } from '@/lib/emails/send'
import { serverEnv } from '@/lib/env'
import { creerCompte } from '../outils/fabrique-comptes'
import { attendreLeMail, compterLesMails, mailsRecus, viderLeCapteur } from '../outils/mailpit'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'
import { ouvrirSession } from '../outils/session'

/**
 * The forgotten password (tickets 085 and 086; plan 02 I10 and I17): the mail and its link of one
 * hour, a link that serves once, the same answer in the same time for any address, the other
 * sessions closed, the doors of Payload closed. The pages and the whole path through a browser are
 * played by tests/e2e/mot-de-passe-oublie.spec.ts (E08, E15).
 */

afterAll(async () => {
	await Promise.all([viderLaBase(), viderLeCapteur()])
})

const ANCIEN = 'ancien-mot-de-passe-fictif'
const NOUVEAU = 'nouveau-mot-de-passe-fictif'
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100'

let n = 0
const adresseCliente = () => new Headers({ 'x-forwarded-for': `198.51.100.${1 + (n++ % 250)}` })
const libre = () => createRateLimit({ nom: `essai-oubli-${n++}`, limite: 1000, fenetreMs: 60_000 })

/** The work after the answer is awaited, so that a test can read the mail it causes. */
function demande(email: unknown, options: { frein?: ReturnType<typeof createRateLimit>; headers?: Headers } = {}) {
	const travaux: Promise<void>[] = []
	return payloadDeTest().then(async payload => {
		const debut = Date.now()
		const resultat = await requestPasswordLink({
			payload,
			headers: options.headers ?? adresseCliente(),
			email,
			envoyer: payloadSendEmail(payload, serverEnv()),
			site: SITE,
			apres: travail => {
				travaux.push(travail())
			},
			frein: options.frein ?? libre(),
			journal: authLog(payload),
		})
		const duree = Date.now() - debut
		await Promise.all(travaux)
		return { resultat, duree }
	})
}

const jetonDuMail = async (email: string): Promise<string> => {
	const mail = await attendreLeMail({ pour: email, sujet: /Réinitialise ton mot de passe/ })
	const lien = mail.liens.find(l => new URL(l).pathname === '/auth/reinitialiser')
	if (!lien) throw new Error('Le mail ne porte pas le lien.')
	expect(lien).toStartWith(`${SITE}/auth/reinitialiser?code=`)
	return new URL(lien).searchParams.get('code') ?? ''
}

const reinit = async (
	jeton: unknown,
	motDePasse: unknown = NOUVEAU,
	confirmation: unknown = motDePasse,
	frein = libre()
) =>
	resetPassword({
		payload: await payloadDeTest(),
		headers: adresseCliente(),
		jeton,
		motDePasse,
		confirmation,
		frein,
		journal: authLog(await payloadDeTest()),
	})

const ligne = async (id: number | string) => {
	const payload = await payloadDeTest()
	return payload.db.findOne<{
		id: number
		resetPasswordToken?: string | null
		resetPasswordExpiration?: string | null
		legacyBcrypt?: string | null
		sessions?: unknown[] | null
		lastSignInAt?: string | null
	}>({ collection: 'pros', where: { id: { equals: id } } })
}

const seConnecter = async (email: string, password: string) => {
	const payload = await payloadDeTest()
	return signInWithPassword({
		ouvrir: data => openWithPassword(payload, 'pros', data),
		headers: adresseCliente(),
		email,
		password,
		frein: libre(),
	})
}

const compteConnu = () => creerCompte('maquilleuse', { motDePasse: () => ANCIEN })

beforeEach(async () => {
	await viderLeCapteur()
})

describe('I10 : la demande envoie un mail avec un lien d’une heure', () => {
	test('un mail, un lien du site, un jeton de 40 caractères, une heure de vie', async () => {
		const compte = await compteConnu()
		const avant = Date.now()

		const { resultat } = await demande(compte.email)

		expect(resultat).toEqual({ ok: true })
		const mail = await attendreLeMail({ pour: compte.email })
		expect(mail.sujet).toBe('Réinitialise ton mot de passe My Makeup')
		expect(mail.liens.some(l => l.includes('/admin'))).toBe(false)
		const jeton = await jetonDuMail(compte.email)
		expect(jeton).toMatch(/^[0-9a-f]{40}$/)
		const stocke = await ligne(compte.id)
		expect(stocke?.resetPasswordToken).toBe(jeton)
		const fin = new Date(stocke?.resetPasswordExpiration ?? 0).getTime()
		expect(fin).toBeGreaterThan(avant + LINK_DURATION_MS - 1000)
		expect(fin).toBeLessThan(Date.now() + LINK_DURATION_MS + 1000)
		expect(LINK_DURATION_MS).toBe(3_600_000)
	})

	test('le lien est refusé une fois l’heure passée', async () => {
		const compte = await compteConnu()
		await demande(compte.email)
		const jeton = await jetonDuMail(compte.email)
		expect(await linkStillValid(await payloadDeTest(), jeton)).toBe(true)

		// The hour has passed: the expiration is set in the past, the clock is not faked.
		const payload = await payloadDeTest()
		await payload.db.updateOne({
			collection: 'pros',
			data: { resetPasswordExpiration: new Date(Date.now() - 1000).toISOString() },
			returning: false,
			where: { id: { equals: compte.id } },
		})

		expect(await linkStillValid(payload, jeton)).toBe(false)
		expect(await reinit(jeton)).toEqual({ ok: false, code: 'code-invalide' })
		// Nothing changed: she still signs in with her password.
		expect((await seConnecter(compte.email, ANCIEN)).ok).toBe(true)
	})

	test('le mail ne contient ni le mot de passe ni l’adresse d’un autre compte', async () => {
		const compte = await compteConnu()
		await demande(compte.email)
		const mail = await attendreLeMail({ pour: compte.email })
		expect(mail.texte + mail.html).not.toContain(ANCIEN)
	})

	test('le mail part par le point d’envoi du site : une partie texte et une partie HTML, toutes deux avec le lien', async () => {
		const compte = await compteConnu()
		await demande(compte.email)
		const mail = await attendreLeMail({ pour: compte.email })
		expect(mail.texte).toContain('/auth/reinitialiser?code=')
		expect(mail.html).toContain('/auth/reinitialiser?code=')
	})

	test('un seul mail par compte et par quinze secondes, la demande rapprochée répond pareil', async () => {
		const compte = await compteConnu()
		const premiere = await demande(compte.email)
		const seconde = await demande(compte.email)
		expect(seconde.resultat).toEqual(premiere.resultat)
		await attendreLeMail({ pour: compte.email })
		expect(await compterLesMails()).toBe(1)
		// The window is over: the next request sends again.
		const payload = await payloadDeTest()
		await payload.db.updateOne({
			collection: 'pros',
			data: { resetPasswordRequestedAt: new Date(Date.now() - 16_000).toISOString() },
			returning: false,
			where: { id: { equals: compte.id } },
		})
		await demande(compte.email)
		expect(await compterLesMails()).toBe(2)
	})

	test('l’adresse est lue sans tenir compte de la casse ni des espaces', async () => {
		const compte = await compteConnu()
		await demande(`  ${compte.email.toUpperCase()}  `)
		await attendreLeMail({ pour: compte.email })
	})
})

describe('I10 : une adresse inconnue répond pareil, dans le même temps, sans mail', () => {
	test('même réponse, même plancher, aucun mail pour l’inconnue', async () => {
		const compte = await compteConnu()
		const inconnue = `inconnue-${crypto.randomUUID()}@example.test`

		const connue = await demande(compte.email)
		const autre = await demande(inconnue)

		expect(autre.resultat).toEqual(connue.resultat)
		expect(autre.resultat).toEqual({ ok: true })
		// Both wait for the floor, and neither goes far past it: the work is after the answer.
		for (const { duree } of [connue, autre]) {
			expect(duree).toBeGreaterThanOrEqual(FORGOT_PASSWORD_FLOOR_MS - 20)
			expect(duree).toBeLessThan(FORGOT_PASSWORD_FLOOR_MS + 400)
		}
		expect(Math.abs(connue.duree - autre.duree)).toBeLessThan(150)
		await attendreLeMail({ pour: compte.email })
		expect(await mailsRecus(inconnue)).toEqual([])
		expect(await compterLesMails()).toBe(1)
	})

	test('une adresse qui n’en est pas une est refusée, sans mail', async () => {
		expect((await demande('pas-une-adresse')).resultat).toEqual({ ok: false, code: 'email-invalide' })
		expect((await demande('   ')).resultat).toEqual({ ok: false, code: 'email-vide' })
		expect((await demande(undefined)).resultat).toEqual({ ok: false, code: 'email-vide' })
		expect(await compterLesMails()).toBe(0)
	})

	test('le frein par adresse cliente : la 11e demande est refusée, connue ou non, et ne part pas', async () => {
		const compte = await compteConnu()
		const frein = createRateLimit({ nom: `essai-frein-oubli-${n++}`, limite: 10, fenetreMs: 60_000 })
		const headers = adresseCliente()
		for (let i = 0; i < 10; i++) {
			const email = i % 2 === 0 ? `inconnue-${i}@example.test` : compte.email
			expect((await demande(email, { frein, headers })).resultat.ok).toBe(true)
		}
		await attendreLeMail({ pour: compte.email })
		await viderLeCapteur()

		const refusee = await demande(compte.email, { frein, headers })
		const aussi = await demande(`inconnue-${crypto.randomUUID()}@example.test`, { frein, headers })

		expect(refusee.resultat).toEqual({ ok: false, code: 'trop-de-tentatives' })
		expect(aussi.resultat).toEqual(refusee.resultat)
		expect(await compterLesMails()).toBe(0)
		// Another address is free.
		expect((await demande(compte.email, { frein, headers: adresseCliente() })).resultat.ok).toBe(true)
	})

	test('le journal : une ligne « ok » par demande, la même pour une adresse inconnue, sans adresse ni jeton', async () => {
		const compte = await compteConnu()
		const payload = await payloadDeTest()
		const lire = async () =>
			(
				await payload.find({
					collection: 'auth-events',
					depth: 0,
					limit: 1000,
					sort: 'id',
					where: { type: { equals: 'forgot-password' } },
				})
			).docs
		const avant = (await lire()).length
		await demande(compte.email)
		await demande(`inconnue-${crypto.randomUUID()}@example.test`)

		const nouvelles = (await lire()).slice(avant)
		expect(nouvelles.map(l => l.code)).toEqual(['ok', 'ok'])
		expect(JSON.stringify(nouvelles)).not.toMatch(/example\.test|[0-9a-f]{40}/)
	})
})

describe('les portes REST de Payload sont fermées', () => {
	test('forgot-password et reset-password répondent 403 pour tout le monde, et aucun mail ne part', async () => {
		const compte = await compteConnu()
		const inconnue = `inconnue-${crypto.randomUUID()}@example.test`
		for (const email of [compte.email, inconnue]) {
			const r = await appelerRest('POST', '/api/pros/forgot-password', { corps: { email } })
			expect(r.statut).toBe(403)
		}
		const reset = await appelerRest('POST', '/api/pros/reset-password', {
			corps: { token: 'a'.repeat(40), password: NOUVEAU },
		})
		expect(reset.statut).toBe(403)
		expect(await compterLesMails()).toBe(0)
		expect((await ligne(compte.id))?.resetPasswordToken ?? null).toBeNull()
	})
})

describe('085 : choisir un nouveau mot de passe', () => {
	test('le nouveau marche, l’ancien est refusé', async () => {
		const compte = await compteConnu()
		await demande(compte.email)
		const jeton = await jetonDuMail(compte.email)

		expect(await reinit(jeton)).toEqual({ ok: true })

		expect((await seConnecter(compte.email, NOUVEAU)).ok).toBe(true)
		expect(await seConnecter(compte.email, ANCIEN)).toEqual({ ok: false, code: 'identifiants-invalides' })
	})

	test('le lien sert une seule fois : le même jeton rejoué est « plus valable »', async () => {
		const compte = await compteConnu()
		await demande(compte.email)
		const jeton = await jetonDuMail(compte.email)

		expect(await reinit(jeton, NOUVEAU)).toEqual({ ok: true })
		expect(await reinit(jeton, 'un-autre-mot-de-passe')).toEqual({ ok: false, code: 'code-invalide' })

		expect((await seConnecter(compte.email, NOUVEAU)).ok).toBe(true)
		expect((await seConnecter(compte.email, 'un-autre-mot-de-passe')).ok).toBe(false)
		expect((await ligne(compte.id))?.resetPasswordToken ?? null).toBeNull()
	})

	test('deux envois du même lien au même instant : un seul passe, l’autre est « plus valable »', async () => {
		const compte = await compteConnu()
		await demande(compte.email)
		const jeton = await jetonDuMail(compte.email)

		const [a, b] = await Promise.all([
			reinit(jeton, 'premier-mot-de-passe-fictif'),
			reinit(jeton, 'second-mot-de-passe-fictif'),
		])

		expect([a.ok, b.ok].sort()).toEqual([false, true])
		const refuse = a.ok ? b : a
		expect(refuse).toEqual({ ok: false, code: 'code-invalide' })
		// Exactly one of the two passwords works.
		const gagnant = a.ok ? 'premier-mot-de-passe-fictif' : 'second-mot-de-passe-fictif'
		const perdant = a.ok ? 'second-mot-de-passe-fictif' : 'premier-mot-de-passe-fictif'
		expect((await seConnecter(compte.email, gagnant)).ok).toBe(true)
		expect((await seConnecter(compte.email, perdant)).ok).toBe(false)
	})

	test('un mot de passe trop court, trop long ou mal confirmé est refusé, et le lien reste bon', async () => {
		const compte = await compteConnu()
		await demande(compte.email)
		const jeton = await jetonDuMail(compte.email)

		expect(await reinit(jeton, 'court')).toEqual({ ok: false, code: 'mot-de-passe-trop-court' })
		expect(await reinit(jeton, 'x'.repeat(256))).toEqual({ ok: false, code: 'mot-de-passe-trop-long' })
		expect(await reinit(jeton, NOUVEAU, 'autre-chose-fictif')).toEqual({ ok: false, code: 'mots-de-passe-differents' })
		expect(await linkStillValid(await payloadDeTest(), jeton)).toBe(true)
		expect(await reinit(jeton)).toEqual({ ok: true })
	})

	test('un code absent, inconnu ou de l’ancien site (128 caractères) donne « plus valable », jamais une erreur', async () => {
		const ancien = 'a1'.repeat(64)
		expect(await reinit(undefined)).toEqual({ ok: false, code: 'code-absent' })
		expect(await reinit('')).toEqual({ ok: false, code: 'code-absent' })
		expect(await reinit(ancien)).toEqual({ ok: false, code: 'code-invalide' })
		expect(await reinit('f'.repeat(40))).toEqual({ ok: false, code: 'code-invalide' })
		expect(await reinit("' or 1=1 --")).toEqual({ ok: false, code: 'code-invalide' })
		const payload = await payloadDeTest()
		expect(await linkStillValid(payload, ancien)).toBe(false)
		expect(await linkStillValid(payload, 'f'.repeat(40))).toBe(false)
		expect(await linkStillValid(payload, undefined)).toBe(false)
	})

	test('le frein de la réinitialisation : la 11e tentative est refusée, une réussite rend sa place', async () => {
		const compte = await compteConnu()
		await demande(compte.email)
		const jeton = await jetonDuMail(compte.email)
		const frein = createRateLimit({ nom: `essai-frein-reinit-${n++}`, limite: 10, fenetreMs: 60_000 })
		const headers = adresseCliente()
		const tenter = async (code: unknown) =>
			resetPassword({
				payload: await payloadDeTest(),
				headers,
				jeton: code,
				motDePasse: NOUVEAU,
				confirmation: NOUVEAU,
				frein,
			})
		for (let i = 0; i < 10; i++) expect((await tenter('f'.repeat(40))).ok).toBe(false)

		expect(await tenter(jeton)).toEqual({ ok: false, code: 'trop-de-tentatives' })
		// The right link did not get through, so nothing changed.
		expect((await seConnecter(compte.email, ANCIEN)).ok).toBe(true)
	})

	test('la réinitialisation n’est pas une connexion : la date de dernière connexion ne bouge pas', async () => {
		const compte = await compteConnu()
		const avant = (await ligne(compte.id))?.lastSignInAt ?? null
		await demande(compte.email)
		await reinit(await jetonDuMail(compte.email))
		expect((await ligne(compte.id))?.lastSignInAt ?? null).toBe(avant)
	})

	test('le journal : une ligne « reinitialisation » par essai, sans jeton ni adresse', async () => {
		const compte = await compteConnu()
		const payload = await payloadDeTest()
		await demande(compte.email)
		const jeton = await jetonDuMail(compte.email)
		await reinit(jeton)
		await reinit(jeton)

		const lignes = (
			await payload.find({
				collection: 'auth-events',
				depth: 0,
				limit: 100,
				sort: 'id',
				where: { type: { equals: 'password-reset' } },
			})
		).docs.map(l => l.code)
		expect(lignes.slice(-2)).toEqual(['ok', 'lien-invalide'])
	})
})

describe('I17 : réinitialiser ferme toutes les autres sessions', () => {
	test('deux sessions ouvertes, le nouveau mot de passe les ferme, et il n’en reste aucune', async () => {
		const compte = await compteConnu()
		const payload = await payloadDeTest()
		const premiere = compte.session
		const seconde = await ouvrirSession(payload, { collection: 'pros', email: compte.email, motDePasse: ANCIEN })
		const moi = (enTetes: Record<string, string>) => appelerRest('GET', '/api/pros/me', { enTetes })
		expect((await moi(premiere.enTetes)).corps).toHaveProperty('user.id', compte.id)
		expect((await moi(seconde.enTetes)).corps).toHaveProperty('user.id', compte.id)
		expect((await ligne(compte.id))?.sessions?.length).toBe(2)

		await demande(compte.email)
		expect(await reinit(await jetonDuMail(compte.email))).toEqual({ ok: true })

		expect((await moi(premiere.enTetes)).corps).toMatchObject({ user: null })
		expect((await moi(seconde.enTetes)).corps).toMatchObject({ user: null })
		expect((await ligne(compte.id))?.sessions ?? []).toEqual([])
	})

	test('les sessions d’un autre compte ne sont pas touchées', async () => {
		const compte = await compteConnu()
		const autre = await creerCompte('maquilleuse')
		await demande(compte.email)
		await reinit(await jetonDuMail(compte.email))

		const r = await appelerRest('GET', '/api/pros/me', { enTetes: autre.session.enTetes })
		expect(r.corps).toHaveProperty('user.id', autre.id)
	})
})

describe('un compte repris de l’ancien site', () => {
	test('l’ancien mot de passe ne passe plus par le chemin hérité : le hash hérité est effacé', async () => {
		const compte = await creerCompte('reprise-avec-hash')
		expect((await ligne(compte.id))?.legacyBcrypt).toBeTruthy()

		await demande(compte.email)
		expect(await reinit(await jetonDuMail(compte.email))).toEqual({ ok: true })

		const apres = await ligne(compte.id)
		expect(apres?.legacyBcrypt ?? null).toBeNull()
		expect((await seConnecter(compte.email, NOUVEAU)).ok).toBe(true)
	})

	test('un compte sans mot de passe (Google, Facebook) en choisit un par ce même parcours', async () => {
		const compte = await creerCompte('reprise-facebook')
		expect((await seConnecter(compte.email, NOUVEAU)).ok).toBe(false)

		await demande(compte.email)
		expect(await reinit(await jetonDuMail(compte.email))).toEqual({ ok: true })

		expect((await seConnecter(compte.email, NOUVEAU)).ok).toBe(true)
	})
})
