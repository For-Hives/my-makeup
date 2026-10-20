import { describe, expect, test } from 'bun:test'
import { ContactDetailsEditor, type ContactDetailsUpload } from '@/components/dashboard/ContactDetailsEditor'
import { NetworksEditor, type NetworksUpload } from '@/components/dashboard/NetworksEditor'
import type { ContactDetailsValues } from '@/lib/dashboard/contact-details'
import type { NetworksValues } from '@/lib/dashboard/networks'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { openWindow } from '../support/dom-react'

/**
 * The panels of the networks and of the contact details (tickets 125 and 126; plan 02 U28, E30,
 * E31): « @pseudo » sent as the address, a refusal under the field with no request, a failure that
 * keeps the old value and says so. The send functions are fakes: no network.
 */

const jsdomWindow = openWindow()

const NETWORKS: NetworksValues = {
	instagram: 'https://www.instagram.com/studio.fictif',
	facebook: '',
	youtube: '',
	linkedin: '',
	siteWeb: 'https://studio-fictif.example.test',
}
const CONTACT_DETAILS: ContactDetailsValues = {
	telephone: '06 12 34 56 78',
	email: 'a@example.test',
	contactPublic: false,
}

const dialogue = (): HTMLElement | null => jsdomWindow.w.document.querySelector('[role="dialog"]')
const status = (): string => jsdomWindow.w.document.querySelector('[role="status"]')?.textContent ?? ''
const errorOf = (id: string): string | undefined => jsdomWindow.w.document.getElementById(id)?.textContent ?? undefined

describe('125 : le panneau des réseaux', () => {
	function fakeUpload(reponse?: Awaited<ReturnType<NetworksUpload>>) {
		const calls: NetworksValues[] = []
		const send: NetworksUpload = async valeurs => {
			calls.push(valeurs)
			return reponse ?? { ok: true, valeurs }
		}
		return { appels: calls, envoyer: send }
	}
	async function open(envoyer: NetworksUpload) {
		await jsdomWindow.monter(<NetworksEditor valeurs={NETWORKS} envoyer={envoyer} />)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier mes réseaux'))
	}

	test('il s’ouvre avec les valeurs enregistrées, un champ par réseau', async () => {
		await open(fakeUpload().envoyer)
		expect(dialogue()?.getAttribute('aria-modal')).toBe('true')
		expect((jsdomWindow.champ('Instagram') as HTMLInputElement).value).toBe(NETWORKS.instagram)
		for (const name of ['Facebook', 'YouTube', 'LinkedIn', 'Site web']) expect(jsdomWindow.champ(name)).toBeTruthy()
	})

	test('U28 : « @pseudo » part en adresse complète, un champ vidé part vide', async () => {
		const { appels: calls, envoyer: send } = fakeUpload()
		await open(send)

		await jsdomWindow.saisir(jsdomWindow.champ('Facebook'), '@studio.fictif')
		await jsdomWindow.saisir(jsdomWindow.champ('Instagram'), '')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => dialogue() === null)

		expect(calls).toEqual([{ ...NETWORKS, instagram: '', facebook: 'https://www.facebook.com/studio.fictif' }])
		expect(status()).toBe('Tes réseaux sont enregistrés.')
	})

	test('E30 : l’adresse d’un autre site est refusée sous le champ, rien n’est envoyé', async () => {
		const { appels: calls, envoyer: send } = fakeUpload()
		await open(send)

		await jsdomWindow.saisir(jsdomWindow.champ('Instagram'), 'https://www.facebook.com/studio.fictif')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))

		await jsdomWindow.attendre(() => errorOf('reseaux-instagram-erreur'))
		expect(errorOf('reseaux-instagram-erreur')).toBe(
			'Cette adresse n’est pas celle d’Instagram : colle l’adresse de ta page Instagram ou écris ton @pseudo.'
		)
		expect(jsdomWindow.champ('Instagram').getAttribute('aria-invalid')).toBe('true')
		expect(jsdomWindow.champ('Instagram').getAttribute('aria-describedby')).toBe('reseaux-instagram-erreur')
		expect(calls).toHaveLength(0)
		expect(dialogue()).not.toBeNull()
	})

	test('E31 : un échec du serveur garde la saisie, dit pourquoi, et la carte ne change pas', async () => {
		const { envoyer: send } = fakeUpload({ ok: false, message: FAILURE_MESSAGE })
		await open(send)

		await jsdomWindow.saisir(jsdomWindow.champ('Facebook'), '@studio.fictif')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))

		const alert = await jsdomWindow.attendre(() => jsdomWindow.w.document.querySelector('[role="alert"] p'))
		expect(alert.textContent).toBe(FAILURE_MESSAGE)
		expect((jsdomWindow.champ('Facebook') as HTMLInputElement).value).toBe('@studio.fictif')
		expect(status()).toBe('')
		expect(dialogue()).not.toBeNull()
	})

	test('E31 : le refus d’un champ par le serveur s’affiche sous ce champ', async () => {
		const refusal = fakeUpload({
			ok: false,
			message: 'Un lien n’est pas valide.',
			champs: { siteWeb: 'Refusé par le serveur.' },
		})
		await open(refusal.envoyer)
		await jsdomWindow.saisir(jsdomWindow.champ('Facebook'), '@studio.fictif')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => errorOf('reseaux-siteWeb-erreur'))
		expect(errorOf('reseaux-siteWeb-erreur')).toBe('Refusé par le serveur.')
	})

	test('E31 : une fonction d’envoi qui lève donne le message du site', async () => {
		const raise: NetworksUpload = async () => {
			throw new Error('Failed to fetch')
		}
		await open(raise)
		await jsdomWindow.saisir(jsdomWindow.champ('Facebook'), '@studio.fictif')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		const alert = await jsdomWindow.attendre(() => jsdomWindow.w.document.querySelector('[role="alert"] p'))
		expect(alert.textContent).toBe(FAILURE_MESSAGE)
	})
})

describe('126 : le panneau des coordonnées', () => {
	function fakeUpload(reponse?: Awaited<ReturnType<ContactDetailsUpload>>) {
		const calls: ContactDetailsValues[] = []
		const send: ContactDetailsUpload = async valeurs => {
			calls.push(valeurs)
			return (
				reponse ?? {
					ok: true,
					valeurs: { ...valeurs, consentiLe: valeurs.contactPublic ? '2026-10-15T10:00:00.000Z' : null },
				}
			)
		}
		return { appels: calls, envoyer: send }
	}
	async function open(envoyer: ContactDetailsUpload, valeurs = CONTACT_DETAILS) {
		await jsdomWindow.monter(<ContactDetailsEditor valeurs={valeurs} envoyer={envoyer} />)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier mes coordonnées'))
	}
	const case_ = () => jsdomWindow.champ('Afficher mon téléphone et mon email sur mon profil') as HTMLInputElement

	test('il s’ouvre avec le choix enregistré, case décochée quand elles sont masquées', async () => {
		await open(fakeUpload().envoyer)
		expect((jsdomWindow.champ('Téléphone') as HTMLInputElement).value).toBe('06 12 34 56 78')
		expect(case_().checked).toBe(false)
		expect(case_().getAttribute('aria-describedby')).toBe('coordonnees-affichage-aide')
	})

	test('cocher la case et enregistrer envoie le choix, et l’annonce dit ce qui s’affiche', async () => {
		const { appels: calls, envoyer: send } = fakeUpload()
		await open(send)

		await jsdomWindow.cliquer(case_())
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => dialogue() === null)

		expect(calls).toEqual([{ ...CONTACT_DETAILS, contactPublic: true }])
		expect(status()).toBe('Tes coordonnées sont enregistrées : elles s’affichent sur ton profil.')
	})

	test('décocher annonce qu’elles ne s’affichent pas', async () => {
		const { appels: calls, envoyer: send } = fakeUpload()
		await open(send, { ...CONTACT_DETAILS, contactPublic: true })
		expect(case_().checked).toBe(true)

		await jsdomWindow.cliquer(case_())
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => dialogue() === null)

		expect(calls[0]?.contactPublic).toBe(false)
		expect(status()).toBe('Tes coordonnées sont enregistrées : elles ne s’affichent pas sur ton profil.')
	})

	test('E30 : un téléphone et un email invalides ont leur message sous le champ, rien n’est envoyé', async () => {
		const { appels: calls, envoyer: send } = fakeUpload()
		await open(send)

		await jsdomWindow.saisir(jsdomWindow.champ('Téléphone'), '06 ab')
		await jsdomWindow.saisir(jsdomWindow.champ('Email de contact'), 'pas-un-email')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))

		await jsdomWindow.attendre(() => errorOf('coordonnees-email-erreur'))
		expect(errorOf('coordonnees-telephone-erreur')).toBe(
			'Ce numéro n’est pas valide : écris-le avec des chiffres, par exemple 06 12 34 56 78.'
		)
		expect(errorOf('coordonnees-email-erreur')).toBe('Cet email n’est pas valide : écris-le comme prenom@exemple.fr.')
		expect(jsdomWindow.champ('Téléphone').getAttribute('aria-invalid')).toBe('true')
		expect(calls).toHaveLength(0)
		expect(dialogue()).not.toBeNull()
	})

	test('E31 : un échec du serveur garde la saisie et le choix, et le dit', async () => {
		const { envoyer: send } = fakeUpload({ ok: false, message: FAILURE_MESSAGE })
		await open(send)

		await jsdomWindow.cliquer(case_())
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))

		const alert = await jsdomWindow.attendre(() => jsdomWindow.w.document.querySelector('[role="alert"] p'))
		expect(alert.textContent).toBe(FAILURE_MESSAGE)
		expect(case_().checked).toBe(true)
		expect(status()).toBe('')
		expect(dialogue()).not.toBeNull()
	})

	test('E31 : le refus d’un champ par le serveur s’affiche sous ce champ', async () => {
		const { envoyer: send } = fakeUpload({
			ok: false,
			message: 'Un champ n’est pas valide.',
			champs: { telephone: 'Refusé par le serveur.' },
		})
		await open(send)
		await jsdomWindow.cliquer(case_())
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => errorOf('coordonnees-telephone-erreur'))
		expect(errorOf('coordonnees-telephone-erreur')).toBe('Refusé par le serveur.')
	})
})
