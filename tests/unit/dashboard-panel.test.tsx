import { describe, expect, test } from 'bun:test'
import { act } from 'react'
import { IdentityEditor, type IdentityUpload } from '@/components/dashboard/IdentityEditor'
import type { DraftStorage } from '@/lib/dashboard/guarded-input'
import type { IdentityValues } from '@/lib/dashboard/identity'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { openWindow } from '../support/dom-react'

/**
 * The panel of the identity (tickets 119 and 120; plan 02 E30, E31, E68): bounds, a failure that
 * keeps the old value, the confirmation on closing, a single save for a double click or a held
 * Enter, and the keyboard inside the dialog. The send function is a fake: no network.
 */

const jsdomWindow = openWindow()

const VALUES: IdentityValues = { prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialite: 'Teint' }

/** A send function that records its calls and answers like the server stores. */
function falselyUpload(reponse?: Awaited<ReturnType<IdentityUpload>>) {
	const calls: IdentityValues[] = []
	const send: IdentityUpload = async valeurs => {
		calls.push(valeurs)
		return reponse ?? { ok: true, valeurs }
	}
	return { appels: calls, envoyer: send }
}

async function open(envoyer: IdentityUpload) {
	const zone = await jsdomWindow.monter(
		<IdentityEditor valeurs={VALUES} envoyer={envoyer} proprietaire="7" stockage={() => null} />
	)
	await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier mon identité'))
	return zone
}

async function key(cible: Element, key: string, options: { repeat?: boolean; shiftKey?: boolean } = {}) {
	let event: Event | undefined
	await act(async () => {
		event = new jsdomWindow.w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })
		cible.dispatchEvent(event)
	})
	return event?.defaultPrevented ?? false
}

const dialogue = (): HTMLElement | null => jsdomWindow.w.document.querySelector('[role="dialog"]')
const status = (): string => jsdomWindow.w.document.querySelector('[role="status"]')?.textContent ?? ''

describe('le panneau s’ouvre, avec les valeurs enregistrées', () => {
	test('un clic ouvre un dialogue nommé, le focus est dans le premier champ', async () => {
		const { envoyer: send } = falselyUpload()
		await open(send)

		const d = dialogue()
		expect(d?.getAttribute('aria-modal')).toBe('true')
		const title = jsdomWindow.w.document.getElementById(d?.getAttribute('aria-labelledby') ?? '')
		expect(title?.textContent).toBe('Modifier mon identité')
		expect(jsdomWindow.champ('Prénom')).toBe(jsdomWindow.w.document.activeElement as never)
		expect((jsdomWindow.champ('Prénom') as HTMLInputElement).value).toBe('Léa')
		expect((jsdomWindow.champ('Spécialité') as HTMLInputElement).value).toBe('Teint')
	})
})

describe('E30 : hors bornes, un message sous le champ et aucune requête', () => {
	test('un nom trop court et un prénom vide', async () => {
		const { appels: calls, envoyer: send } = falselyUpload()
		await open(send)

		await jsdomWindow.saisir(jsdomWindow.champ('Prénom'), '')
		await jsdomWindow.saisir(jsdomWindow.champ('Nom'), 'A')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))

		const alert = await jsdomWindow.attendre(() => jsdomWindow.w.document.getElementById('identite-nom-erreur'))
		expect(alert.textContent).toBe('Ton nom doit contenir au moins 2 caractères.')
		expect(jsdomWindow.w.document.getElementById('identite-prenom-erreur')?.textContent).toBe('Indique ton prénom.')
		expect(jsdomWindow.champ('Nom').getAttribute('aria-invalid')).toBe('true')
		expect(jsdomWindow.champ('Nom').getAttribute('aria-describedby')).toBe('identite-nom-erreur')
		expect(calls).toHaveLength(0)
		expect(dialogue()).not.toBeNull()
	})
})

describe('un enregistrement réussi', () => {
	test('envoie les valeurs rognées, ferme le panneau, annonce le résultat et rend le focus', async () => {
		const { appels: calls, envoyer: send } = falselyUpload()
		await open(send)

		await jsdomWindow.saisir(jsdomWindow.champ('Prénom'), '  Inès  ')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => dialogue() === null)

		expect(calls).toEqual([{ ...VALUES, prenom: 'Inès' }])
		expect(status()).toBe('Ton identité est enregistrée.')
		expect(jsdomWindow.w.document.activeElement).toBe(jsdomWindow.bouton('Modifier mon identité'))
	})
})

describe('E31 : un échec du serveur', () => {
	test('le panneau reste ouvert avec la saisie, le message est en français', async () => {
		const { envoyer: send } = falselyUpload({ ok: false, message: FAILURE_MESSAGE })
		await open(send)

		await jsdomWindow.saisir(jsdomWindow.champ('Prénom'), 'Inès')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))

		const alert = await jsdomWindow.attendre(() => jsdomWindow.w.document.querySelector('[role="alert"] p'))
		expect(alert.textContent).toBe(FAILURE_MESSAGE)
		expect((jsdomWindow.champ('Prénom') as HTMLInputElement).value).toBe('Inès')
		expect(status()).toBe('')
		expect(dialogue()).not.toBeNull()
	})

	test('le message d’un champ s’affiche sous ce champ', async () => {
		const { envoyer: send } = falselyUpload({
			ok: false,
			message: 'Un champ n’est pas valide.',
			champs: { specialite: 'Ce champ est trop long.' },
		})
		await open(send)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))

		const error = await jsdomWindow.attendre(() => jsdomWindow.w.document.getElementById('identite-specialite-erreur'))
		expect(error.textContent).toBe('Ce champ est trop long.')
	})

	test('une fonction d’envoi qui lève donne le message du site, pas le sien', async () => {
		const send: IdentityUpload = async () => {
			throw new Error('Failed to fetch')
		}
		await open(send)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))

		const alert = await jsdomWindow.attendre(() => jsdomWindow.w.document.querySelector('[role="alert"] p'))
		expect(alert.textContent).toBe(FAILURE_MESSAGE)
	})

	test('fermer sans rien changer ferme tout de suite ; avec une saisie, la confirmation passe d’abord', async () => {
		const { appels: calls, envoyer: send } = falselyUpload()
		await open(send)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Fermer'))
		expect(dialogue()).toBeNull()

		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier mon identité'))
		await jsdomWindow.saisir(jsdomWindow.champ('Nom'), 'Autre')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Fermer'))
		expect(dialogue()).not.toBeNull()
		expect(jsdomWindow.w.document.querySelector('[role="alert"]')?.textContent).toContain('non enregistrées')
		expect(jsdomWindow.w.document.activeElement).toBe(jsdomWindow.bouton('Continuer à modifier'))

		await jsdomWindow.cliquer(jsdomWindow.bouton('Continuer à modifier'))
		expect((jsdomWindow.champ('Nom') as HTMLInputElement).value).toBe('Autre')

		await jsdomWindow.cliquer(jsdomWindow.bouton('Fermer'))
		await jsdomWindow.cliquer(jsdomWindow.bouton('Abandonner mes modifications'))
		expect(dialogue()).toBeNull()
		expect(calls).toHaveLength(0)

		// Opened again, the panel starts from the stored values, not from what was abandoned.
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier mon identité'))
		expect((jsdomWindow.champ('Nom') as HTMLInputElement).value).toBe('Fictive')
	})
})

describe('un double clic, une touche Entrée maintenue : un seul enregistrement', () => {
	test('deux clics avant la réponse', async () => {
		let respond: (() => void) | undefined
		const calls: IdentityValues[] = []
		const send: IdentityUpload = valeurs => {
			calls.push(valeurs)
			return new Promise(resolve => {
				respond = () => resolve({ ok: true, valeurs })
			})
		}
		await open(send)
		await jsdomWindow.saisir(jsdomWindow.champ('Prénom'), 'Inès')

		const button = jsdomWindow.bouton('Enregistrer')
		await jsdomWindow.cliquer(button)
		await jsdomWindow.cliquer(button)
		await act(async () => {
			button.closest('form')?.requestSubmit()
		})
		expect(calls).toHaveLength(1)
		expect((button as HTMLButtonElement).disabled).toBe(true)

		await act(async () => respond?.())
		await jsdomWindow.attendre(() => dialogue() === null)
		expect(calls).toHaveLength(1)
	})

	test('les répétitions d’Entrée sont ignorées dans le champ, sur « Modifier », et rien ne rouvre le panneau', async () => {
		const { appels: calls, envoyer: send } = falselyUpload()
		await open(send)
		await jsdomWindow.saisir(jsdomWindow.champ('Prénom'), 'Inès')

		const field = jsdomWindow.champ('Prénom')
		expect(await key(field, 'Enter', { repeat: true })).toBe(true)
		expect(calls).toHaveLength(0)

		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => dialogue() === null)
		const update = jsdomWindow.bouton('Modifier mon identité')
		expect(jsdomWindow.w.document.activeElement).toBe(update)
		// The key is still held: its repeats reach the button that has the focus again.
		expect(await key(update, 'Enter', { repeat: true })).toBe(true)
		expect(await key(update, 'Enter', { repeat: false })).toBe(false)
		expect(calls).toHaveLength(1)
	})
})

describe('E68 : le clavier dans le dialogue', () => {
	test('Tab et Maj+Tab tournent dans le panneau', async () => {
		const { envoyer: send } = falselyUpload()
		await open(send)
		const d = dialogue() as HTMLElement
		const elements = [...d.querySelectorAll<HTMLElement>('button, input')]
		const first = elements[0]
		const last = elements[elements.length - 1]
		if (!first || !last) throw new Error('pas d’éléments')

		last.focus()
		expect(await key(last, 'Tab')).toBe(true)
		expect(jsdomWindow.w.document.activeElement).toBe(first)

		expect(await key(first, 'Tab', { shiftKey: true })).toBe(true)
		expect(jsdomWindow.w.document.activeElement).toBe(last)
	})

	test('Échap ferme le panneau et rend le focus au bouton qui l’a ouvert', async () => {
		const { envoyer: send } = falselyUpload()
		await open(send)

		await key(jsdomWindow.champ('Prénom'), 'Escape')

		expect(dialogue()).toBeNull()
		expect(jsdomWindow.w.document.activeElement).toBe(jsdomWindow.bouton('Modifier mon identité'))
	})

	test('Échap avec une saisie demande la confirmation, un second Échap revient à la saisie', async () => {
		const { envoyer: send } = falselyUpload()
		await open(send)
		await jsdomWindow.saisir(jsdomWindow.champ('Nom'), 'Autre')

		await key(jsdomWindow.champ('Nom'), 'Escape')
		expect(dialogue()).not.toBeNull()
		expect(jsdomWindow.w.document.querySelector('[role="alert"]')?.textContent).toContain('non enregistrées')

		await key(jsdomWindow.bouton('Continuer à modifier'), 'Escape')
		expect(jsdomWindow.w.document.querySelector('[role="alert"]')?.textContent ?? '').not.toContain('non enregistrées')
		expect(dialogue()).not.toBeNull()
	})
})

describe('121 (E32) : la session expire pendant la saisie', () => {
	const EXPIRED: Awaited<ReturnType<IdentityUpload>> = {
		ok: false,
		message: 'Ta session a expiré : ta modification n’a pas été enregistrée. Reconnecte-toi, puis recommence.',
		session: 'expiree',
	}

	function falselyStorage(): DraftStorage & { contenu: Map<string, string> } {
		const content = new Map<string, string>()
		return {
			contenu: content,
			getItem: cle => content.get(cle) ?? null,
			setItem: (cle, valeur) => void content.set(cle, valeur),
			removeItem: cle => void content.delete(cle),
		}
	}

	async function mount(envoyer: IdentityUpload, stockage: DraftStorage | null, naviguer: (url: string) => void) {
		await jsdomWindow.monter(
			<IdentityEditor
				valeurs={VALUES}
				envoyer={envoyer}
				proprietaire="7"
				stockage={() => stockage}
				naviguer={naviguer}
			/>
		)
	}

	test('le message, rien d’enregistré, la saisie gardée, un seul renvoi vers la connexion', async () => {
		const storage = falselyStorage()
		const to: string[] = []
		const { appels: calls, envoyer: send } = falselyUpload(EXPIRED)
		await mount(send, storage, url => to.push(url))
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier mon identité'))

		await jsdomWindow.saisir(jsdomWindow.champ('Prénom'), 'Inès')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => to.length > 0 || null)

		expect(to).toEqual(['/auth/signin?callbackUrl=%2Fauth%2Fprofil&error=session-expiree'])
		expect(calls).toHaveLength(1)
		const guarded = JSON.parse([...storage.contenu.values()][0] ?? 'null')
		expect(guarded.valeurs).toEqual({ ...VALUES, prenom: 'Inès' })
		expect(guarded.redirigeLe).toBeNumber()
		// Still locked while the page leaves: a second click sends nothing.
		await jsdomWindow.cliquer(jsdomWindow.bouton(/Enregistrement/))
		expect(calls).toHaveLength(1)
	})

	test('de retour : le même panneau s’ouvre avec la saisie, un message, puis un enregistrement réussi efface tout', async () => {
		const storage = falselyStorage()
		storage.setItem(
			'mm:saisie:identite:7',
			JSON.stringify({ valeurs: { ...VALUES, prenom: 'Inès' }, le: Date.now(), redirigeLe: Date.now() - 20_000 })
		)
		const { appels: calls, envoyer: send } = falselyUpload()
		await mount(send, storage, () => {})

		await jsdomWindow.attendre(() => dialogue())
		expect((jsdomWindow.champ('Prénom') as HTMLInputElement).value).toBe('Inès')
		expect(dialogue()?.textContent).toContain('on a retrouvé ce que tu avais saisi')

		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => (dialogue() === null ? true : null))
		expect(calls).toEqual([{ ...VALUES, prenom: 'Inès' }])
		expect(storage.contenu.size).toBe(0)
	})

	test('de retour, une deuxième expiration aussitôt : pas de nouveau renvoi, le message reste dans le panneau, la saisie aussi', async () => {
		const storage = falselyStorage()
		storage.setItem(
			'mm:saisie:identite:7',
			JSON.stringify({ valeurs: { ...VALUES, prenom: 'Inès' }, le: Date.now(), redirigeLe: Date.now() - 20_000 })
		)
		const to: string[] = []
		const { envoyer: send } = falselyUpload(EXPIRED)
		await mount(send, storage, url => to.push(url))
		await jsdomWindow.attendre(() => dialogue())

		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		const alert = await jsdomWindow.attendre(() => jsdomWindow.w.document.querySelector('[role="alert"] p'))

		expect(to).toEqual([])
		expect(alert.textContent).toContain('Ta session a expiré')
		expect(alert.querySelector('a')?.getAttribute('href')).toBe(
			'/auth/signin?callbackUrl=%2Fauth%2Fprofil&error=session-expiree'
		)
		expect((jsdomWindow.champ('Prénom') as HTMLInputElement).value).toBe('Inès')
		expect(storage.contenu.size).toBe(1)
	})

	test('abandonner efface la saisie gardée', async () => {
		const storage = falselyStorage()
		storage.setItem(
			'mm:saisie:identite:7',
			JSON.stringify({ valeurs: { ...VALUES, prenom: 'Inès' }, le: Date.now(), redirigeLe: null })
		)
		const { envoyer: send } = falselyUpload()
		await mount(send, storage, () => {})
		await jsdomWindow.attendre(() => dialogue())

		await jsdomWindow.cliquer(jsdomWindow.bouton('Fermer'))
		await jsdomWindow.cliquer(jsdomWindow.bouton('Abandonner mes modifications'))

		expect(dialogue()).toBeNull()
		expect(storage.contenu.size).toBe(0)
	})

	test('la saisie d’un autre compte, ou identique aux valeurs enregistrées, n’ouvre rien', async () => {
		const storage = falselyStorage()
		storage.setItem(
			'mm:saisie:identite:8',
			JSON.stringify({ valeurs: { ...VALUES, prenom: 'Autre' }, le: Date.now(), redirigeLe: null })
		)
		storage.setItem('mm:saisie:identite:7', JSON.stringify({ valeurs: VALUES, le: Date.now(), redirigeLe: null }))
		const { envoyer: send } = falselyUpload()
		await mount(send, storage, () => {})

		expect(dialogue()).toBeNull()
		expect([...storage.contenu.keys()]).toEqual(['mm:saisie:identite:8'])
	})

	test('un navigateur sans stockage : pas de renvoi qui perdrait la saisie, le message et le lien en nouvel onglet', async () => {
		const to: string[] = []
		const { envoyer: send } = falselyUpload(EXPIRED)
		await mount(send, null, url => to.push(url))
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier mon identité'))
		await jsdomWindow.saisir(jsdomWindow.champ('Prénom'), 'Inès')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))

		const alert = await jsdomWindow.attendre(() => jsdomWindow.w.document.querySelector('[role="alert"] a'))
		expect(to).toEqual([])
		expect(alert.getAttribute('target')).toBe('_blank')
		expect((jsdomWindow.champ('Prénom') as HTMLInputElement).value).toBe('Inès')
	})
})
