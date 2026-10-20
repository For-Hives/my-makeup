import { describe, expect, test } from 'bun:test'
import { DescriptionEditor, type DescriptionUpload } from '@/components/dashboard/DescriptionEditor'
import type { DescriptionValues } from '@/lib/dashboard/description'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { ouvrirFenetre } from '../support/dom-react'

/**
 * The panel of the description (ticket 122; plan 02 U05, U27, E31): the counter, the bound, the
 * HTML removed before anything is sent, a failure that keeps the old text. The send function is a
 * fake: no network.
 */

const fenetre = ouvrirFenetre()
const VALEURS: DescriptionValues = { description: 'Maquilleuse mariée.\nJe me déplace.' }

function faussementEnvoi(reponse?: Awaited<ReturnType<DescriptionUpload>>) {
	const appels: DescriptionValues[] = []
	const envoyer: DescriptionUpload = async valeurs => {
		appels.push(valeurs)
		return reponse ?? { ok: true, valeurs }
	}
	return { appels, envoyer }
}

async function ouvrir(envoyer: DescriptionUpload) {
	await fenetre.monter(<DescriptionEditor valeurs={VALEURS} envoyer={envoyer} />)
	await fenetre.cliquer(fenetre.bouton('Modifier ma description'))
}

const compteur = (): string =>
	fenetre.w.document.querySelector('[data-testid="compteur-description"]')?.textContent ?? ''
const dialogue = (): HTMLElement | null => fenetre.w.document.querySelector('[role="dialog"]')
const champ = () => fenetre.champ('Ta description') as HTMLTextAreaElement

describe('le panneau s’ouvre avec le texte enregistré et son compteur', () => {
	test('le texte garde ses sauts de ligne, le compteur donne le compte et le seuil', async () => {
		await ouvrir(faussementEnvoi().envoyer)

		expect(champ().value).toBe(VALEURS.description)
		expect(champ().getAttribute('aria-describedby')).toBe('description-compteur')
		expect(compteur()).toContain(`${VALEURS.description.replace(/\s+/g, ' ').length} / 200 caractères`)
		expect(compteur()).toContain('/ 2000 au plus')
	})
})

describe('U05 : le compteur suit la saisie', () => {
	test('199 puis 200 caractères : l’annonce du seuil apparaît une fois atteint', async () => {
		await ouvrir(faussementEnvoi().envoyer)
		const annonce = () => fenetre.w.document.querySelector('[role="dialog"] [role="status"]')?.textContent ?? ''

		await fenetre.saisir(champ(), 'a'.repeat(199))
		expect(compteur()).toContain('199 / 200')
		expect(annonce()).toBe('')

		await fenetre.saisir(champ(), `  ${'a'.repeat(199)}b  `)
		expect(compteur()).toContain('200 / 200')
		expect(annonce()).toContain('publiable')
	})

	test('le HTML collé ne compte pas', async () => {
		await ouvrir(faussementEnvoi().envoyer)
		await fenetre.saisir(champ(), `<b>${'a'.repeat(150)}</b>`)
		expect(compteur()).toContain('150 / 200')
	})
})

describe('U27 : 2 001 caractères refusés, HTML retiré', () => {
	test('au-delà de 2 000, un message sous le champ et aucune requête', async () => {
		const { appels, envoyer } = faussementEnvoi()
		await ouvrir(envoyer)

		await fenetre.saisir(champ(), 'a'.repeat(2001))
		expect(compteur()).toContain('trop long')
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))

		const erreur = await fenetre.attendre(() => fenetre.w.document.getElementById('description-erreur'))
		expect(erreur.textContent).toBe('Ta description ne doit pas dépasser 2000 caractères.')
		expect(champ().getAttribute('aria-invalid')).toBe('true')
		expect(appels).toHaveLength(0)
	})

	test('le HTML est retiré avant l’envoi, les sauts de ligne sont gardés', async () => {
		const { appels, envoyer } = faussementEnvoi()
		await ouvrir(envoyer)

		await fenetre.saisir(champ(), '<p>Bonjour</p>\n<script>alert(1)</script>Ligne 2')
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => dialogue() === null)

		expect(appels).toEqual([{ description: 'Bonjour\nLigne 2' }])
	})
})

describe('E31 : un échec du serveur', () => {
	test('le panneau reste ouvert avec la saisie, le message est en français, rien n’est annoncé', async () => {
		const { envoyer } = faussementEnvoi({ ok: false, message: FAILURE_MESSAGE })
		await ouvrir(envoyer)

		await fenetre.saisir(champ(), 'Nouveau texte')
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))

		const alerte = await fenetre.attendre(() => fenetre.w.document.querySelector('[role="alert"] p'))
		expect(alerte.textContent).toBe(FAILURE_MESSAGE)
		expect(champ().value).toBe('Nouveau texte')
		expect(dialogue()).not.toBeNull()
		expect(fenetre.w.document.body.textContent).not.toContain('Ta description est enregistrée.')
	})

	test('une fonction d’envoi qui lève donne le message du site', async () => {
		const envoyer: DescriptionUpload = async () => {
			throw new Error('Failed to fetch')
		}
		await ouvrir(envoyer)
		await fenetre.saisir(champ(), 'Autre')
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))

		const alerte = await fenetre.attendre(() => fenetre.w.document.querySelector('[role="alert"] p'))
		expect(alerte.textContent).toBe(FAILURE_MESSAGE)
	})

	test('le message du champ renvoyé par le serveur s’affiche sous le champ', async () => {
		const { envoyer } = faussementEnvoi({
			ok: false,
			message: 'Un champ n’est pas valide.',
			champs: { description: 'Trop long.' },
		})
		await ouvrir(envoyer)
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		const erreur = await fenetre.attendre(() => fenetre.w.document.getElementById('description-erreur'))
		expect(erreur.textContent).toBe('Trop long.')
	})

	test('un enregistrement réussi ferme, annonce et rend le focus', async () => {
		const { appels, envoyer } = faussementEnvoi()
		await ouvrir(envoyer)
		await fenetre.saisir(champ(), 'Texte neuf')
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => dialogue() === null)

		expect(appels).toEqual([{ description: 'Texte neuf' }])
		expect(fenetre.w.document.querySelector('[role="status"]')?.textContent).toBe('Ta description est enregistrée.')
		expect(fenetre.w.document.activeElement).toBe(fenetre.bouton('Modifier ma description'))
	})
})
