import { describe, expect, test } from 'bun:test'
import { DescriptionEditor, type DescriptionUpload } from '@/components/dashboard/DescriptionEditor'
import type { DescriptionValues } from '@/lib/dashboard/description'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { openWindow } from '../support/dom-react'

/**
 * The panel of the description (ticket 122; plan 02 U05, U27, E31): the counter, the bound, the
 * HTML removed before anything is sent, a failure that keeps the old text. The send function is a
 * fake: no network.
 */

const jsdomWindow = openWindow()
const VALUES: DescriptionValues = { description: 'Maquilleuse mariée.\nJe me déplace.' }

function falselyUpload(reponse?: Awaited<ReturnType<DescriptionUpload>>) {
	const calls: DescriptionValues[] = []
	const send: DescriptionUpload = async valeurs => {
		calls.push(valeurs)
		return reponse ?? { ok: true, valeurs }
	}
	return { appels: calls, envoyer: send }
}

async function open(envoyer: DescriptionUpload) {
	await jsdomWindow.monter(<DescriptionEditor valeurs={VALUES} envoyer={envoyer} />)
	await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier ma description'))
}

const counter = (): string =>
	jsdomWindow.w.document.querySelector('[data-testid="compteur-description"]')?.textContent ?? ''
const dialogue = (): HTMLElement | null => jsdomWindow.w.document.querySelector('[role="dialog"]')
const field = () => jsdomWindow.champ('Ta description') as HTMLTextAreaElement

describe('le panneau s’ouvre avec le texte enregistré et son compteur', () => {
	test('le texte garde ses sauts de ligne, le compteur donne le compte et le seuil', async () => {
		await open(falselyUpload().envoyer)

		expect(field().value).toBe(VALUES.description)
		expect(field().getAttribute('aria-describedby')).toBe('description-compteur')
		expect(counter()).toContain(`${VALUES.description.replace(/\s+/g, ' ').length} / 200 caractères`)
		expect(counter()).toContain('/ 2000 au plus')
	})
})

describe('U05 : le compteur suit la saisie', () => {
	test('199 puis 200 caractères : l’annonce du seuil apparaît une fois atteint', async () => {
		await open(falselyUpload().envoyer)
		const announcement = () =>
			jsdomWindow.w.document.querySelector('[role="dialog"] [role="status"]')?.textContent ?? ''

		await jsdomWindow.saisir(field(), 'a'.repeat(199))
		expect(counter()).toContain('199 / 200')
		expect(announcement()).toBe('')

		await jsdomWindow.saisir(field(), `  ${'a'.repeat(199)}b  `)
		expect(counter()).toContain('200 / 200')
		expect(announcement()).toContain('publiable')
	})

	test('le HTML collé ne compte pas', async () => {
		await open(falselyUpload().envoyer)
		await jsdomWindow.saisir(field(), `<b>${'a'.repeat(150)}</b>`)
		expect(counter()).toContain('150 / 200')
	})
})

describe('U27 : 2 001 caractères refusés, HTML retiré', () => {
	test('au-delà de 2 000, un message sous le champ et aucune requête', async () => {
		const { appels: calls, envoyer: send } = falselyUpload()
		await open(send)

		await jsdomWindow.saisir(field(), 'a'.repeat(2001))
		expect(counter()).toContain('trop long')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))

		const error = await jsdomWindow.attendre(() => jsdomWindow.w.document.getElementById('description-erreur'))
		expect(error.textContent).toBe('Ta description ne doit pas dépasser 2000 caractères.')
		expect(field().getAttribute('aria-invalid')).toBe('true')
		expect(calls).toHaveLength(0)
	})

	test('le HTML est retiré avant l’envoi, les sauts de ligne sont gardés', async () => {
		const { appels: calls, envoyer: send } = falselyUpload()
		await open(send)

		await jsdomWindow.saisir(field(), '<p>Bonjour</p>\n<script>alert(1)</script>Ligne 2')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => dialogue() === null)

		expect(calls).toEqual([{ description: 'Bonjour\nLigne 2' }])
	})
})

describe('E31 : un échec du serveur', () => {
	test('le panneau reste ouvert avec la saisie, le message est en français, rien n’est annoncé', async () => {
		const { envoyer: send } = falselyUpload({ ok: false, message: FAILURE_MESSAGE })
		await open(send)

		await jsdomWindow.saisir(field(), 'Nouveau texte')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))

		const alert = await jsdomWindow.attendre(() => jsdomWindow.w.document.querySelector('[role="alert"] p'))
		expect(alert.textContent).toBe(FAILURE_MESSAGE)
		expect(field().value).toBe('Nouveau texte')
		expect(dialogue()).not.toBeNull()
		expect(jsdomWindow.w.document.body.textContent).not.toContain('Ta description est enregistrée.')
	})

	test('une fonction d’envoi qui lève donne le message du site', async () => {
		const send: DescriptionUpload = async () => {
			throw new Error('Failed to fetch')
		}
		await open(send)
		await jsdomWindow.saisir(field(), 'Autre')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))

		const alert = await jsdomWindow.attendre(() => jsdomWindow.w.document.querySelector('[role="alert"] p'))
		expect(alert.textContent).toBe(FAILURE_MESSAGE)
	})

	test('le message du champ renvoyé par le serveur s’affiche sous le champ', async () => {
		const { envoyer: send } = falselyUpload({
			ok: false,
			message: 'Un champ n’est pas valide.',
			champs: { description: 'Trop long.' },
		})
		await open(send)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		const error = await jsdomWindow.attendre(() => jsdomWindow.w.document.getElementById('description-erreur'))
		expect(error.textContent).toBe('Trop long.')
	})

	test('un enregistrement réussi ferme, annonce et rend le focus', async () => {
		const { appels: calls, envoyer: send } = falselyUpload()
		await open(send)
		await jsdomWindow.saisir(field(), 'Texte neuf')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => dialogue() === null)

		expect(calls).toEqual([{ description: 'Texte neuf' }])
		expect(jsdomWindow.w.document.querySelector('[role="status"]')?.textContent).toBe('Ta description est enregistrée.')
		expect(jsdomWindow.w.document.activeElement).toBe(jsdomWindow.bouton('Modifier ma description'))
	})
})
