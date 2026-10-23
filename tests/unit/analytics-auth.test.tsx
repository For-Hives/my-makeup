import { describe, expect, test } from 'bun:test'
import { SignInSucceeded } from '@/components/analytics/SignInSucceeded'
import { GoogleLink } from '@/components/auth/GoogleLink'
import { SignInForm } from '@/components/auth/SignInForm'
import { SignInPageEvents } from '@/components/auth/SignInPageEvents'
import { SignUpForm } from '@/components/auth/SignUpForm'
import { AUTH_ERROR_CODES, eventData } from '@/lib/analytics/events'
import { markMethod } from '@/lib/analytics/sign-in-mark'
import type { Track } from '@/lib/analytics/track'
import { ERROR_CODES, GOOGLE_ERROR_CODES } from '@/lib/auth/errors'
import { SIGN_UP_FAILURE_CODES } from '@/lib/auth/sign-up'
import { openWindow } from '../support/dom-react'

/**
 * Ticket 146: the events of sign-up and sign-in (plan 04 §3.3, events 9 to 12; U82, U83, E12).
 * Each component takes its `suivre`, so the test sees exactly what would leave.
 */
const jsdomWindow = openWindow()

type Upload = { nom: string; proprietes: unknown }
function spy() {
	const uploads: Upload[] = []
	const follow = ((nom: string, proprietes: unknown = {}) => {
		uploads.push({ nom, proprietes })
		return true
	}) as unknown as Track
	return { envois: uploads, suivre: follow }
}

describe('le catalogue couvre tous les codes que les pages peuvent montrer', () => {
	test('chaque code de connexion, de Google et d’inscription est dans la liste fermée', () => {
		const list: readonly string[] = AUTH_ERROR_CODES
		for (const code of [...ERROR_CODES, ...GOOGLE_ERROR_CODES, ...SIGN_UP_FAILURE_CODES])
			expect(list, code).toContain(code)
	})

	test('un code qui n’est pas de la liste fait tomber l’événement', () => {
		expect(eventData('login_result', { method: 'google', ok: false, code: 'google-annule' })).not.toBeNull()
		expect(eventData('login_result', { method: 'google', ok: false, code: 'a@example.test' })).toBeNull()
		expect(eventData('auth_error', { code: 'jeton-abc' })).toBeNull()
	})
})

describe('connexion par email', () => {
	test('un refus envoie login_result une fois, avec le code affiché', async () => {
		const { envois: uploads, suivre: follow } = spy()
		const zone = await jsdomWindow.monter(
			<SignInForm
				action={(async () => ({ code: 'identifiants-invalides' })) as never}
				retour="/auth/profil"
				suivre={follow}
			/>
		)
		await jsdomWindow.saisir(jsdomWindow.champ('Adresse email'), 'lea@example.test')
		await jsdomWindow.saisir(jsdomWindow.champ('Mot de passe'), 'secret-fictif-1')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Se connecter'))
		await jsdomWindow.attendre(() => zone.querySelector('[role="alert"] p'))

		expect(uploads).toEqual([
			{ nom: 'login_result', proprietes: { method: 'email', ok: false, code: 'identifiants-invalides' } },
		])
		expect(JSON.stringify(uploads)).not.toContain('example.test')
		expect(JSON.stringify(uploads)).not.toContain('secret-fictif')
	})

	test('rien n’est envoyé avant la première réponse', async () => {
		const { envois: uploads, suivre: follow } = spy()
		await jsdomWindow.monter(<SignInForm action={(async () => null) as never} retour="/auth/profil" suivre={follow} />)
		expect(uploads).toEqual([])
	})
})

describe('connexion réussie (email ou Google), sur la page d’arrivée', () => {
	test('la marque du serveur donne un login_result ok, puis elle est dépensée', async () => {
		const { envois: uploads, suivre: follow } = spy()
		document.cookie = 'mm-sign-in-mark=google; Path=/'
		await jsdomWindow.monter(<SignInSucceeded suivre={follow} />)
		expect(uploads).toEqual([{ nom: 'login_result', proprietes: { method: 'google', ok: true, code: 'ok' } }])
		expect(document.cookie).not.toContain('mm-sign-in-mark')
		// Mounted again: nothing left to send.
		await jsdomWindow.monter(<SignInSucceeded suivre={follow} />)
		expect(uploads).toHaveLength(1)
	})

	test('sans marque, ou avec une valeur inconnue, rien ne part', async () => {
		const { envois: uploads, suivre: follow } = spy()
		document.cookie = 'mm-sign-in-mark=a@example.test; Path=/'
		await jsdomWindow.monter(<SignInSucceeded suivre={follow} />)
		expect(uploads).toEqual([])
		expect(markMethod('a=1; mm-sign-in-mark=email')).toBe('email')
		expect(markMethod('a=1')).toBeNull()
		document.cookie = 'mm-sign-in-mark=; Max-Age=0; Path=/'
	})
})

describe('page de connexion avec ?error=', () => {
	test('session expirée : session_expired une fois, ni login_result ni auth_error (E12 reste vert)', async () => {
		const { envois: uploads, suivre: follow } = spy()
		await jsdomWindow.monter(<SignInPageEvents code="session-expiree" suivre={follow} />)
		expect(uploads).toEqual([{ nom: 'session_expired', proprietes: { where: 'jwt_expire' } }])
	})

	for (const code of GOOGLE_ERROR_CODES) {
		test(`retour de Google en échec ${code} : login_result google et auth_error, une fois`, async () => {
			const { envois: uploads, suivre: follow } = spy()
			await jsdomWindow.monter(<SignInPageEvents code={code} suivre={follow} />)
			expect(uploads).toEqual([
				{ nom: 'login_result', proprietes: { method: 'google', ok: false, code } },
				{ nom: 'auth_error', proprietes: { code } },
			])
		})
	}

	test('sans code, ou avec un code hors liste, rien ne part', async () => {
		const { envois: uploads, suivre: follow } = spy()
		await jsdomWindow.monter(<SignInPageEvents code={null} suivre={follow} />)
		await jsdomWindow.monter(<SignInPageEvents code="texte-libre" suivre={follow} />)
		expect(uploads).toEqual([])
	})
})

describe('inscription', () => {
	test('signup_start part au premier envoi seulement, method email', async () => {
		const { envois: uploads, suivre: follow } = spy()
		const zone = await jsdomWindow.monter(
			<SignUpForm action={(async () => ({ erreurs: { nom: 'Trop court.' } })) as never} suivre={follow} />
		)
		await jsdomWindow.cliquer(jsdomWindow.bouton('S’inscrire'))
		await jsdomWindow.attendre(() => zone.querySelector('#erreur-nom')?.textContent)
		await jsdomWindow.cliquer(jsdomWindow.bouton('S’inscrire'))
		expect(uploads).toEqual([{ nom: 'signup_start', proprietes: { method: 'email' } }])
	})

	test('un refus du serveur envoie auth_error avec son code', async () => {
		const { envois: uploads, suivre: follow } = spy()
		const zone = await jsdomWindow.monter(
			<SignUpForm action={(async () => ({ echec: 'service-indisponible' })) as never} suivre={follow} />
		)
		await jsdomWindow.cliquer(jsdomWindow.bouton('S’inscrire'))
		await jsdomWindow.attendre(() => zone.querySelector('[role="alert"] p'))
		expect(uploads).toContainEqual({ nom: 'auth_error', proprietes: { code: 'service-indisponible' } })
	})

	test('le bouton Google de l’inscription envoie signup_start google ; celui de la connexion, rien', async () => {
		const { envois: uploads, suivre: follow } = spy()
		const zone = await jsdomWindow.monter(
			<div>
				<GoogleLink adresse="#a" debutDInscription={true} className="x" suivre={follow}>
					a
				</GoogleLink>
				<GoogleLink adresse="#b" debutDInscription={false} className="x" suivre={follow}>
					b
				</GoogleLink>
			</div>
		)
		const links = zone.querySelectorAll('a')
		await jsdomWindow.cliquer(links[0] as HTMLElement)
		await jsdomWindow.cliquer(links[1] as HTMLElement)
		expect(uploads).toEqual([{ nom: 'signup_start', proprietes: { method: 'google' } }])
	})
})
