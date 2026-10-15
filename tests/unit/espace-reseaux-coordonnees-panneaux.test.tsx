import { describe, expect, test } from 'bun:test'
import { EditeurDeCoordonnees, type EnvoiDesCoordonnees } from '@/components/espace/EditeurDeCoordonnees'
import { EditeurDeReseaux, type EnvoiDesReseaux } from '@/components/espace/EditeurDeReseaux'
import type { ValeursDesCoordonnees } from '@/lib/espace/coordonnees'
import type { ValeursDesReseaux } from '@/lib/espace/reseaux'
import { MESSAGE_ECHEC } from '@/lib/espace/resultat'
import { ouvrirFenetre } from '../outils/dom-react'

/**
 * The panels of the networks and of the contact details (tickets 125 and 126; plan 02 U28, E30,
 * E31): « @pseudo » sent as the address, a refusal under the field with no request, a failure that
 * keeps the old value and says so. The send functions are fakes: no network.
 */

const fenetre = ouvrirFenetre()

const RESEAUX: ValeursDesReseaux = {
	instagram: 'https://www.instagram.com/studio.fictif',
	facebook: '',
	youtube: '',
	linkedin: '',
	siteWeb: 'https://studio-fictif.example.test',
}
const COORDONNEES: ValeursDesCoordonnees = {
	telephone: '06 12 34 56 78',
	email: 'a@example.test',
	contactPublic: false,
}

const dialogue = (): HTMLElement | null => fenetre.w.document.querySelector('[role="dialog"]')
const statut = (): string => fenetre.w.document.querySelector('[role="status"]')?.textContent ?? ''
const erreurDe = (id: string): string | undefined => fenetre.w.document.getElementById(id)?.textContent ?? undefined

describe('125 : le panneau des réseaux', () => {
	function fauxEnvoi(reponse?: Awaited<ReturnType<EnvoiDesReseaux>>) {
		const appels: ValeursDesReseaux[] = []
		const envoyer: EnvoiDesReseaux = async valeurs => {
			appels.push(valeurs)
			return reponse ?? { ok: true, valeurs }
		}
		return { appels, envoyer }
	}
	async function ouvrir(envoyer: EnvoiDesReseaux) {
		await fenetre.monter(<EditeurDeReseaux valeurs={RESEAUX} envoyer={envoyer} />)
		await fenetre.cliquer(fenetre.bouton('Modifier mes réseaux'))
	}

	test('il s’ouvre avec les valeurs enregistrées, un champ par réseau', async () => {
		await ouvrir(fauxEnvoi().envoyer)
		expect(dialogue()?.getAttribute('aria-modal')).toBe('true')
		expect((fenetre.champ('Instagram') as HTMLInputElement).value).toBe(RESEAUX.instagram)
		for (const nom of ['Facebook', 'YouTube', 'LinkedIn', 'Site web']) expect(fenetre.champ(nom)).toBeTruthy()
	})

	test('U28 : « @pseudo » part en adresse complète, un champ vidé part vide', async () => {
		const { appels, envoyer } = fauxEnvoi()
		await ouvrir(envoyer)

		await fenetre.saisir(fenetre.champ('Facebook'), '@studio.fictif')
		await fenetre.saisir(fenetre.champ('Instagram'), '')
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => dialogue() === null)

		expect(appels).toEqual([{ ...RESEAUX, instagram: '', facebook: 'https://www.facebook.com/studio.fictif' }])
		expect(statut()).toBe('Tes réseaux sont enregistrés.')
	})

	test('E30 : l’adresse d’un autre site est refusée sous le champ, rien n’est envoyé', async () => {
		const { appels, envoyer } = fauxEnvoi()
		await ouvrir(envoyer)

		await fenetre.saisir(fenetre.champ('Instagram'), 'https://www.facebook.com/studio.fictif')
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))

		await fenetre.attendre(() => erreurDe('reseaux-instagram-erreur'))
		expect(erreurDe('reseaux-instagram-erreur')).toBe(
			'Cette adresse n’est pas celle d’Instagram : colle l’adresse de ta page Instagram ou écris ton @pseudo.'
		)
		expect(fenetre.champ('Instagram').getAttribute('aria-invalid')).toBe('true')
		expect(fenetre.champ('Instagram').getAttribute('aria-describedby')).toBe('reseaux-instagram-erreur')
		expect(appels).toHaveLength(0)
		expect(dialogue()).not.toBeNull()
	})

	test('E31 : un échec du serveur garde la saisie, dit pourquoi, et la carte ne change pas', async () => {
		const { envoyer } = fauxEnvoi({ ok: false, message: MESSAGE_ECHEC })
		await ouvrir(envoyer)

		await fenetre.saisir(fenetre.champ('Facebook'), '@studio.fictif')
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))

		const alerte = await fenetre.attendre(() => fenetre.w.document.querySelector('[role="alert"] p'))
		expect(alerte.textContent).toBe(MESSAGE_ECHEC)
		expect((fenetre.champ('Facebook') as HTMLInputElement).value).toBe('@studio.fictif')
		expect(statut()).toBe('')
		expect(dialogue()).not.toBeNull()
	})

	test('E31 : le refus d’un champ par le serveur s’affiche sous ce champ', async () => {
		const refus = fauxEnvoi({
			ok: false,
			message: 'Un lien n’est pas valide.',
			champs: { siteWeb: 'Refusé par le serveur.' },
		})
		await ouvrir(refus.envoyer)
		await fenetre.saisir(fenetre.champ('Facebook'), '@studio.fictif')
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => erreurDe('reseaux-siteWeb-erreur'))
		expect(erreurDe('reseaux-siteWeb-erreur')).toBe('Refusé par le serveur.')
	})

	test('E31 : une fonction d’envoi qui lève donne le message du site', async () => {
		const lever: EnvoiDesReseaux = async () => {
			throw new Error('Failed to fetch')
		}
		await ouvrir(lever)
		await fenetre.saisir(fenetre.champ('Facebook'), '@studio.fictif')
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		const alerte = await fenetre.attendre(() => fenetre.w.document.querySelector('[role="alert"] p'))
		expect(alerte.textContent).toBe(MESSAGE_ECHEC)
	})
})

describe('126 : le panneau des coordonnées', () => {
	function fauxEnvoi(reponse?: Awaited<ReturnType<EnvoiDesCoordonnees>>) {
		const appels: ValeursDesCoordonnees[] = []
		const envoyer: EnvoiDesCoordonnees = async valeurs => {
			appels.push(valeurs)
			return (
				reponse ?? {
					ok: true,
					valeurs: { ...valeurs, consentiLe: valeurs.contactPublic ? '2026-10-15T10:00:00.000Z' : null },
				}
			)
		}
		return { appels, envoyer }
	}
	async function ouvrir(envoyer: EnvoiDesCoordonnees, valeurs = COORDONNEES) {
		await fenetre.monter(<EditeurDeCoordonnees valeurs={valeurs} envoyer={envoyer} />)
		await fenetre.cliquer(fenetre.bouton('Modifier mes coordonnées'))
	}
	const case_ = () => fenetre.champ('Afficher mon téléphone et mon email sur mon profil') as HTMLInputElement

	test('il s’ouvre avec le choix enregistré, case décochée quand elles sont masquées', async () => {
		await ouvrir(fauxEnvoi().envoyer)
		expect((fenetre.champ('Téléphone') as HTMLInputElement).value).toBe('06 12 34 56 78')
		expect(case_().checked).toBe(false)
		expect(case_().getAttribute('aria-describedby')).toBe('coordonnees-affichage-aide')
	})

	test('cocher la case et enregistrer envoie le choix, et l’annonce dit ce qui s’affiche', async () => {
		const { appels, envoyer } = fauxEnvoi()
		await ouvrir(envoyer)

		await fenetre.cliquer(case_())
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => dialogue() === null)

		expect(appels).toEqual([{ ...COORDONNEES, contactPublic: true }])
		expect(statut()).toBe('Tes coordonnées sont enregistrées : elles s’affichent sur ton profil.')
	})

	test('décocher annonce qu’elles ne s’affichent pas', async () => {
		const { appels, envoyer } = fauxEnvoi()
		await ouvrir(envoyer, { ...COORDONNEES, contactPublic: true })
		expect(case_().checked).toBe(true)

		await fenetre.cliquer(case_())
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => dialogue() === null)

		expect(appels[0]?.contactPublic).toBe(false)
		expect(statut()).toBe('Tes coordonnées sont enregistrées : elles ne s’affichent pas sur ton profil.')
	})

	test('E30 : un téléphone et un email invalides ont leur message sous le champ, rien n’est envoyé', async () => {
		const { appels, envoyer } = fauxEnvoi()
		await ouvrir(envoyer)

		await fenetre.saisir(fenetre.champ('Téléphone'), '06 ab')
		await fenetre.saisir(fenetre.champ('Email de contact'), 'pas-un-email')
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))

		await fenetre.attendre(() => erreurDe('coordonnees-email-erreur'))
		expect(erreurDe('coordonnees-telephone-erreur')).toBe(
			'Ce numéro n’est pas valide : écris-le avec des chiffres, par exemple 06 12 34 56 78.'
		)
		expect(erreurDe('coordonnees-email-erreur')).toBe('Cet email n’est pas valide : écris-le comme prenom@exemple.fr.')
		expect(fenetre.champ('Téléphone').getAttribute('aria-invalid')).toBe('true')
		expect(appels).toHaveLength(0)
		expect(dialogue()).not.toBeNull()
	})

	test('E31 : un échec du serveur garde la saisie et le choix, et le dit', async () => {
		const { envoyer } = fauxEnvoi({ ok: false, message: MESSAGE_ECHEC })
		await ouvrir(envoyer)

		await fenetre.cliquer(case_())
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))

		const alerte = await fenetre.attendre(() => fenetre.w.document.querySelector('[role="alert"] p'))
		expect(alerte.textContent).toBe(MESSAGE_ECHEC)
		expect(case_().checked).toBe(true)
		expect(statut()).toBe('')
		expect(dialogue()).not.toBeNull()
	})

	test('E31 : le refus d’un champ par le serveur s’affiche sous ce champ', async () => {
		const { envoyer } = fauxEnvoi({
			ok: false,
			message: 'Un champ n’est pas valide.',
			champs: { telephone: 'Refusé par le serveur.' },
		})
		await ouvrir(envoyer)
		await fenetre.cliquer(case_())
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => erreurDe('coordonnees-telephone-erreur'))
		expect(erreurDe('coordonnees-telephone-erreur')).toBe('Refusé par le serveur.')
	})
})
