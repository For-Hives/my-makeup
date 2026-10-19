import { describe, expect, test } from 'bun:test'
import { ConnexionReussie } from '@/components/analytics/ConnexionReussie'
import { EvenementsDeLaPageDeConnexion } from '@/components/auth/SignInPageEvents'
import { FormulaireDeConnexion } from '@/components/auth/SignInForm'
import { FormulaireDInscription } from '@/components/auth/SignUpForm'
import { LienGoogle } from '@/components/auth/GoogleLink'
import { CODES_D_ERREUR_D_AUTHENTIFICATION, donneesDEvenement } from '@/lib/analytics/events'
import { methodeDeLaMarque } from '@/lib/analytics/marque-connexion'
import type { Suivre } from '@/lib/analytics/track'
import { CODES_ERREUR, CODES_ERREUR_GOOGLE } from '@/lib/auth/errors'
import { CODES_ECHEC_INSCRIPTION } from '@/lib/auth/sign-up'
import { ouvrirFenetre } from '../outils/dom-react'

/**
 * Ticket 146: the events of sign-up and sign-in (plan 04 §3.3, events 9 to 12; U82, U83, E12).
 * Each component takes its `suivre`, so the test sees exactly what would leave.
 */
const fenetre = ouvrirFenetre()

type Envoi = { nom: string; proprietes: unknown }
function espion() {
	const envois: Envoi[] = []
	const suivre = ((nom: string, proprietes: unknown = {}) => {
		envois.push({ nom, proprietes })
		return true
	}) as unknown as Suivre
	return { envois, suivre }
}

describe('le catalogue couvre tous les codes que les pages peuvent montrer', () => {
	test('chaque code de connexion, de Google et d’inscription est dans la liste fermée', () => {
		const liste: readonly string[] = CODES_D_ERREUR_D_AUTHENTIFICATION
		for (const code of [...CODES_ERREUR, ...CODES_ERREUR_GOOGLE, ...CODES_ECHEC_INSCRIPTION])
			expect(liste, code).toContain(code)
	})

	test('un code qui n’est pas de la liste fait tomber l’événement', () => {
		expect(donneesDEvenement('login_result', { method: 'google', ok: false, code: 'google-annule' })).not.toBeNull()
		expect(donneesDEvenement('login_result', { method: 'google', ok: false, code: 'a@example.test' })).toBeNull()
		expect(donneesDEvenement('auth_error', { code: 'jeton-abc' })).toBeNull()
	})
})

describe('connexion par email', () => {
	test('un refus envoie login_result une fois, avec le code affiché', async () => {
		const { envois, suivre } = espion()
		const zone = await fenetre.monter(
			<FormulaireDeConnexion
				action={(async () => ({ code: 'identifiants-invalides' })) as never}
				retour="/auth/profil"
				suivre={suivre}
			/>
		)
		await fenetre.saisir(fenetre.champ('Adresse email'), 'lea@example.test')
		await fenetre.saisir(fenetre.champ('Mot de passe'), 'secret-fictif-1')
		await fenetre.cliquer(fenetre.bouton('Se connecter'))
		await fenetre.attendre(() => zone.querySelector('[role="alert"] p'))

		expect(envois).toEqual([
			{ nom: 'login_result', proprietes: { method: 'email', ok: false, code: 'identifiants-invalides' } },
		])
		expect(JSON.stringify(envois)).not.toContain('example.test')
		expect(JSON.stringify(envois)).not.toContain('secret-fictif')
	})

	test('rien n’est envoyé avant la première réponse', async () => {
		const { envois, suivre } = espion()
		await fenetre.monter(
			<FormulaireDeConnexion action={(async () => null) as never} retour="/auth/profil" suivre={suivre} />
		)
		expect(envois).toEqual([])
	})
})

describe('connexion réussie (email ou Google), sur la page d’arrivée', () => {
	test('la marque du serveur donne un login_result ok, puis elle est dépensée', async () => {
		const { envois, suivre } = espion()
		document.cookie = 'mm-connexion=google; Path=/'
		await fenetre.monter(<ConnexionReussie suivre={suivre} />)
		expect(envois).toEqual([{ nom: 'login_result', proprietes: { method: 'google', ok: true, code: 'ok' } }])
		expect(document.cookie).not.toContain('mm-connexion')
		// Mounted again: nothing left to send.
		await fenetre.monter(<ConnexionReussie suivre={suivre} />)
		expect(envois).toHaveLength(1)
	})

	test('sans marque, ou avec une valeur inconnue, rien ne part', async () => {
		const { envois, suivre } = espion()
		document.cookie = 'mm-connexion=a@example.test; Path=/'
		await fenetre.monter(<ConnexionReussie suivre={suivre} />)
		expect(envois).toEqual([])
		expect(methodeDeLaMarque('a=1; mm-connexion=email')).toBe('email')
		expect(methodeDeLaMarque('a=1')).toBeNull()
		document.cookie = 'mm-connexion=; Max-Age=0; Path=/'
	})
})

describe('page de connexion avec ?error=', () => {
	test('session expirée : session_expired une fois, ni login_result ni auth_error (E12 reste vert)', async () => {
		const { envois, suivre } = espion()
		await fenetre.monter(<EvenementsDeLaPageDeConnexion code="session-expiree" suivre={suivre} />)
		expect(envois).toEqual([{ nom: 'session_expired', proprietes: { where: 'jwt_expire' } }])
	})

	for (const code of CODES_ERREUR_GOOGLE) {
		test(`retour de Google en échec ${code} : login_result google et auth_error, une fois`, async () => {
			const { envois, suivre } = espion()
			await fenetre.monter(<EvenementsDeLaPageDeConnexion code={code} suivre={suivre} />)
			expect(envois).toEqual([
				{ nom: 'login_result', proprietes: { method: 'google', ok: false, code } },
				{ nom: 'auth_error', proprietes: { code } },
			])
		})
	}

	test('sans code, ou avec un code hors liste, rien ne part', async () => {
		const { envois, suivre } = espion()
		await fenetre.monter(<EvenementsDeLaPageDeConnexion code={null} suivre={suivre} />)
		await fenetre.monter(<EvenementsDeLaPageDeConnexion code="texte-libre" suivre={suivre} />)
		expect(envois).toEqual([])
	})
})

describe('inscription', () => {
	test('signup_start part au premier envoi seulement, method email', async () => {
		const { envois, suivre } = espion()
		const zone = await fenetre.monter(
			<FormulaireDInscription action={(async () => ({ erreurs: { nom: 'Trop court.' } })) as never} suivre={suivre} />
		)
		await fenetre.cliquer(fenetre.bouton('S’inscrire'))
		await fenetre.attendre(() => zone.querySelector('#erreur-nom')?.textContent)
		await fenetre.cliquer(fenetre.bouton('S’inscrire'))
		expect(envois).toEqual([{ nom: 'signup_start', proprietes: { method: 'email' } }])
	})

	test('un refus du serveur envoie auth_error avec son code', async () => {
		const { envois, suivre } = espion()
		const zone = await fenetre.monter(
			<FormulaireDInscription action={(async () => ({ echec: 'service-indisponible' })) as never} suivre={suivre} />
		)
		await fenetre.cliquer(fenetre.bouton('S’inscrire'))
		await fenetre.attendre(() => zone.querySelector('[role="alert"] p'))
		expect(envois).toContainEqual({ nom: 'auth_error', proprietes: { code: 'service-indisponible' } })
	})

	test('le bouton Google de l’inscription envoie signup_start google ; celui de la connexion, rien', async () => {
		const { envois, suivre } = espion()
		const zone = await fenetre.monter(
			<div>
				<LienGoogle adresse="#a" debutDInscription={true} className="x" suivre={suivre}>
					a
				</LienGoogle>
				<LienGoogle adresse="#b" debutDInscription={false} className="x" suivre={suivre}>
					b
				</LienGoogle>
			</div>
		)
		const liens = zone.querySelectorAll('a')
		await fenetre.cliquer(liens[0] as HTMLElement)
		await fenetre.cliquer(liens[1] as HTMLElement)
		expect(envois).toEqual([{ nom: 'signup_start', proprietes: { method: 'google' } }])
	})
})
