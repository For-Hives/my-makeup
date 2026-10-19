import { expect, test } from 'bun:test'
import {
	avecLeRefusDuProxy,
	type EtatDInscription,
	FormulaireDInscription,
} from '@/components/auth/SignUpForm'
import { CHAMP_PIEGE, MESSAGES_ECHEC_INSCRIPTION, MESSAGES_INSCRIPTION } from '@/lib/auth/sign-up'
import { ouvrirFenetre } from '../outils/dom-react'

const fenetre = ouvrirFenetre()

const formulaire = (action: (p: EtatDInscription, f: FormData) => Promise<EtatDInscription>) => (
	<FormulaireDInscription action={action as never} />
)

test('U25 : un message par champ, sous le champ, relié à lui pour un lecteur d’écran', async () => {
	const zone = await fenetre.monter(
		formulaire(async () => ({
			erreurs: {
				nom: MESSAGES_INSCRIPTION.nom.vide,
				email: MESSAGES_INSCRIPTION.email.invalide,
				password: MESSAGES_INSCRIPTION.password.court,
				cgu: MESSAGES_INSCRIPTION.cgu.refusees,
			},
			valeurs: { nom: '', email: 'lea', cgu: false },
		}))
	)

	await fenetre.cliquer(fenetre.bouton('S’inscrire'))

	await fenetre.attendre(() => zone.querySelector('#erreur-nom')?.textContent)
	expect(zone.querySelector('#erreur-nom')?.textContent).toBe(MESSAGES_INSCRIPTION.nom.vide)
	expect(zone.querySelector('#erreur-email')?.textContent).toBe(MESSAGES_INSCRIPTION.email.invalide)
	expect(zone.querySelector('#erreur-password')?.textContent).toBe(MESSAGES_INSCRIPTION.password.court)
	expect(zone.querySelector('#erreur-cgu')?.textContent).toBe(MESSAGES_INSCRIPTION.cgu.refusees)
	for (const [id, champ] of [
		['nom', 'nom'],
		['email', 'email'],
		['password', 'password'],
		['cgu', 'cgu'],
	] as const) {
		const saisie = zone.querySelector(`#${id}`)
		expect(saisie?.getAttribute('aria-invalid')).toBe('true')
		expect(saisie?.getAttribute('aria-describedby')).toContain(`erreur-${champ}`)
	}
})

test('ce qu’elle a tapé revient, le mot de passe jamais', async () => {
	const zone = await fenetre.monter(
		formulaire(async () => ({
			erreurs: { password: MESSAGES_INSCRIPTION.password.court },
			valeurs: { nom: 'Léa Fictive', email: 'lea@example.test', cgu: true },
		}))
	)
	await fenetre.saisir(fenetre.champ('Mot de passe'), 'secret-tape-12345')

	await fenetre.cliquer(fenetre.bouton('S’inscrire'))
	await fenetre.attendre(() => zone.querySelector('#erreur-password')?.textContent)

	expect((fenetre.champ('Nom') as HTMLInputElement).value).toBe('Léa Fictive')
	expect((fenetre.champ('Adresse email') as HTMLInputElement).value).toBe('lea@example.test')
	expect((fenetre.champ('Mot de passe') as HTMLInputElement).value).toBe('')
	expect(zone.innerHTML).not.toContain('secret-tape-12345')
})

test('un refus du serveur qui n’est pas un champ (adresse déjà utilisée) s’annonce dans une zone role=alert', async () => {
	const zone = await fenetre.monter(formulaire(async () => ({ echec: 'email-deja-pris' })))

	await fenetre.cliquer(fenetre.bouton('S’inscrire'))

	const alerte = await fenetre.attendre(() => zone.querySelector('[role="alert"] p'))
	expect(alerte.textContent).toBe(MESSAGES_ECHEC_INSCRIPTION['email-deja-pris'])
})

test('les attributs des gestionnaires de mots de passe : nom, email, nouveau mot de passe', async () => {
	const zone = await fenetre.monter(formulaire(async () => null))
	expect(zone.querySelector('#nom')?.getAttribute('autocomplete')).toBe('name')
	expect(zone.querySelector('#email')?.getAttribute('autocomplete')).toBe('email')
	expect(zone.querySelector('#password')?.getAttribute('autocomplete')).toBe('new-password')
	expect(zone.querySelector('form')?.hasAttribute('novalidate')).toBe(true)
})

test('Entrée maintenue : un seul envoi tant que le premier n’a pas répondu', async () => {
	let envois = 0
	let repondre: () => void = () => {}
	const zone = await fenetre.monter(
		formulaire(() => {
			envois++
			return new Promise(fin => {
				repondre = () => fin({ echec: 'service-indisponible' })
			})
		})
	)
	const form = zone.querySelector('form') as HTMLFormElement

	for (let i = 0; i < 5; i++) form.requestSubmit()
	await new Promise(r => setTimeout(r, 20))
	expect(envois).toBe(1)

	repondre()
	await fenetre.attendre(() => zone.querySelector('[role="alert"] p'))
})

test('le champ piège existe, hors de vue, hors du clavier et caché des lecteurs d’écran (ticket 084)', async () => {
	const zone = await fenetre.monter(formulaire(async () => null))

	const piege = zone.querySelector(`input[name="${CHAMP_PIEGE}"]`)
	expect(piege).not.toBeNull()
	expect(piege?.getAttribute('tabindex')).toBe('-1')
	expect(piege?.getAttribute('autocomplete')).toBe('off')
	expect(piege?.closest('[aria-hidden="true"]')).not.toBeNull()
	expect((piege as HTMLInputElement).value).toBe('')
})

test('le refus du frein par adresse se lit en français sous le formulaire', async () => {
	const zone = await fenetre.monter(formulaire(async () => ({ echec: 'trop-de-tentatives' })))

	await fenetre.cliquer(fenetre.bouton('S’inscrire'))
	await fenetre.attendre(() => zone.querySelector('[data-testid="erreur-inscription"]')?.textContent)

	expect(zone.querySelector('[data-testid="erreur-inscription"]')?.textContent).toBe(
		MESSAGES_ECHEC_INSCRIPTION['trop-de-tentatives']
	)
})

test('le 429 du proxy, que le script de Next jette comme une erreur, redevient un refus montré sous le formulaire', async () => {
	const zone = await fenetre.monter(
		formulaire(async () => {
			throw new Error(MESSAGES_ECHEC_INSCRIPTION['trop-de-tentatives'])
		})
	)
	await fenetre.saisir(fenetre.champ('Adresse email'), 'lea@example.test')

	await fenetre.cliquer(fenetre.bouton('S’inscrire'))

	const alerte = await fenetre.attendre(() => zone.querySelector('[role="alert"] p'))
	expect(alerte.textContent).toBe(MESSAGES_ECHEC_INSCRIPTION['trop-de-tentatives'])
	expect((fenetre.champ('Adresse email') as HTMLInputElement).value).toBe('lea@example.test')
})

test('une autre erreur n’est pas avalée', async () => {
	const action = avecLeRefusDuProxy(async () => {
		throw new Error('panne')
	})

	await expect(action(null, new FormData())).rejects.toThrow('panne')
})
