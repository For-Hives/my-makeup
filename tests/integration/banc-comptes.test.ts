import { afterEach, describe, expect, test } from 'bun:test'
import type { BrowserContext } from '@playwright/test'
import { z } from 'zod'
import { GET } from '@/app/(payload)/api/[...slug]/route'
import { COOKIE_SURVIVAL_AFTER_END_S } from '@/lib/auth/session-state'
import { RACINE } from '../outils/banc'
import { type CompteDeTest, creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'

const MonCompte = z.object({
	user: z.object({ id: z.number(), email: z.string(), collection: z.string() }).nullable(),
})

/**
 * « Mon compte » : GET /api/admins/me, answered by the real route of the application, called
 * with a web request as Next would call it. It says which account the request is logged in as.
 */
async function monCompte(enTetes: Record<string, string>) {
	const requete = new Request(`${process.env.NEXT_PUBLIC_SITE_URL}/api/admins/me`, { headers: enTetes })
	const reponse = await GET(requete, { params: Promise.resolve({ slug: ['admins', 'me'] }) })
	return { status: reponse.status, compte: MonCompte.parse(await reponse.json()).user }
}

const cookieDe = (compte: CompteDeTest<'admin'>) => {
	const [cookie] = compte.session.cookies
	if (!cookie) throw new Error('la session ne porte aucun cookie')
	return cookie
}

describe('La fabrique de comptes : un compte de test et sa session, sans mot de passe saisi', () => {
	afterEach(viderLaBase)

	test('un appel crée un compte en @example.test et rend une session valide sur « mon compte »', async () => {
		const compte = await creerCompte('admin')

		expect(compte.email).toMatch(/^admin-[0-9a-f-]{36}@example\.test$/)
		expect(await monCompte(compte.session.enTetes)).toEqual({
			status: 200,
			compte: { id: compte.id as number, email: compte.email, collection: 'admins' },
		})
		// The account is a real document of the bench database.
		const payload = await payloadDeTest()
		expect((await payload.findByID({ collection: 'admins', id: compte.id })).email).toBe(compte.email)
	})

	test('pour un client HTTP : le cookie et son Origin vont ensemble, le cookie seul est ignoré', async () => {
		const { session } = await creerCompte('admin')

		expect(Object.keys(session.enTetes).sort()).toEqual(['Cookie', 'Origin'])
		expect(session.enTetes.Origin).toBe(process.env.NEXT_PUBLIC_SITE_URL ?? '')
		expect((await monCompte({ Cookie: session.enTetes.Cookie })).compte).toBeNull()
		expect((await monCompte({ ...session.enTetes, Origin: 'https://exemple.test' })).compte).toBeNull()
	})

	test('pour un navigateur : un cookie HttpOnly posé sur l’adresse du site, valable jusqu’à la fin de la session', async () => {
		const compte = await creerCompte('admin')
		const cookie = cookieDe(compte)
		// Checked by the compiler: this is what Playwright's `context.addCookies()` takes.
		const pourPlaywright: Parameters<BrowserContext['addCookies']>[0] = compte.session.cookies

		expect(pourPlaywright.length).toBe(1)
		expect(cookie).toMatchObject({
			name: 'payload-token',
			url: process.env.NEXT_PUBLIC_SITE_URL ?? '',
			httpOnly: true,
			secure: false,
			sameSite: 'Lax',
		})
		// The cookie outlives its token by the grace period of ticket 080, so that « session expirée » can be told.
		expect(cookie.expires).toBe(compte.session.expire.getTime() / 1000 + COOKIE_SURVIVAL_AFTER_END_S)
		expect(compte.session.expire.getTime()).toBeGreaterThan(Date.now())
		// What a browser sends once the cookie is set: no Origin on a page of the site itself, but
		// the header that says where the request comes from.
		const duNavigateur = { Cookie: `${cookie.name}=${cookie.value}` }
		expect((await monCompte({ ...duNavigateur, 'Sec-Fetch-Site': 'same-origin' })).compte?.email).toBe(compte.email)
		expect((await monCompte({ ...duNavigateur, 'Sec-Fetch-Site': 'cross-site' })).compte).toBeNull()
	})

	test('deux tests en parallèle obtiennent deux comptes distincts, effacés à la remise à zéro', async () => {
		// Two calls at the same moment, as two tests running side by side would make them.
		const [une, autre] = await Promise.all([creerCompte('admin'), creerCompte('admin')])

		expect(une.id).not.toBe(autre.id)
		expect(une.email).not.toBe(autre.email)
		expect(cookieDe(une).value).not.toBe(cookieDe(autre).value)
		expect((await monCompte(une.session.enTetes)).compte?.email).toBe(une.email)
		expect((await monCompte(autre.session.enTetes)).compte?.email).toBe(autre.email)

		await viderLaBase()

		const payload = await payloadDeTest()
		expect((await payload.count({ collection: 'admins' })).totalDocs).toBe(0)
		// Their sessions went with them: the two cookies open nothing any more.
		expect((await monCompte(une.session.enTetes)).compte).toBeNull()
		expect((await monCompte(autre.session.enTetes)).compte).toBeNull()
	})

	test('aucun mot de passe dans les journaux ni dans ce que rend la fabrique', async () => {
		// The factory runs in a child process, with a password this test chose: everything the
		// child prints is read, the logs of Payload at their most talkative included.
		const motDePasse = `mot-de-passe-temoin-${crypto.randomUUID()}`
		const enfant = Bun.spawn([process.execPath, '--no-env-file', 'tests/fixtures/temoin-fabrique.ts'], {
			cwd: RACINE,
			env: { ...process.env, TEMOIN_MOT_DE_PASSE: motDePasse },
			stdout: 'pipe',
			stderr: 'pipe',
		})
		const [code, sortie, erreurs] = await Promise.all([
			enfant.exited,
			new Response(enfant.stdout).text(),
			new Response(enfant.stderr).text(),
		])
		const journaux = sortie + erreurs
		const rendu = /^TEMOIN-FABRIQUE (.+)$/m.exec(sortie)?.[1] ?? ''
		const compte = z.object({ id: z.number(), email: z.string() }).parse(JSON.parse(rendu || '{}'))

		expect(code).toBe(0)
		expect(journaux).not.toContain(motDePasse)
		// The witness is a fair one: this password is the one the account was created with.
		const payload = await payloadDeTest()
		const connexion = await payload.login({ collection: 'admins', data: { email: compte.email, password: motDePasse } })
		expect(connexion.user?.id).toBe(compte.id)
	}, 20_000)
})
