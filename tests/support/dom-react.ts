// First on purpose. bunfig.toml has already loaded this file before any test file; in a run that
// did not read bunfig.toml, it stops here with the reason, before React loads without a window.
import './preload-react-dom'

import { afterAll, afterEach, beforeAll } from 'bun:test'
import { JSDOM } from 'jsdom'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { setGlobals } from './globals'

/**
 * A React component, tested alone in a jsdom window: no browser, no server, no network.
 *
 *     const fenetre = ouvrirFenetre()
 *
 *     test('the counter adds one', async () => {
 *         const zone = await fenetre.monter(<Compteur />)
 *         await fenetre.cliquer(fenetre.bouton('Ajouter'))
 *         expect(zone.textContent).toContain('1')
 *     })
 *
 * `ouvrirFenetre()` is called at the top of a test file, or of a `describe`. It declares three
 * hooks there: the window opens before the first test, what a test mounted is unmounted after
 * it, and the window is given back after the last test. Outside these tests there is no
 * `window`: bun runs every file in one process, and the next file must find none.
 *
 * The window ends in one order, and nowhere else (`fermer`): unmount, give the globals back,
 * close. A cleanup that touches the DOM belongs in an `afterEach`: an `afterAll` declared after
 * `ouvrirFenetre()` runs once the window is gone.
 */

/**
 * What a test file sees of the window on `globalThis`, under the same names as in a browser.
 * Besides `window`, `document` and `navigator`, these are the classes whose objects come out of
 * the document: an `instanceof`, or a `new` handed back to the DOM, must meet the window's own
 * class, not bun's (React builds `new FormData(form)`, react-hook-form tests `instanceof Blob`).
 * `fetch`, `URL`, `AbortController` and the timers stay bun's.
 */
export const SET_NAMES = [
	'window',
	'document',
	'navigator',
	'Node',
	'Element',
	'HTMLElement',
	'EventTarget',
	'Event',
	'CustomEvent',
	'FormData',
	'Blob',
	'File',
	'FileList',
] as const

/** The ways out of the window that jsdom offers. Both are cut: a component test has no network. */
const OUTPUTS_NETWORK = ['XMLHttpRequest', 'WebSocket'] as const

export type WindowJsdom = JSDOM['window']

export type OptionsWindow = {
	/** The address the window believes it is at. Nothing is fetched from it. */
	url?: string
	/** More names of the window to set on `globalThis`, after NOMS_POSES (`'localStorage'`…). */
	noms?: readonly string[]
}

/** A field a person can type in, or choose a value in. */
export type InputField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

export type DomWindow = {
	/** The jsdom window, open while the tests run. */
	readonly w: WindowJsdom
	/** Renders the element in a new node of the page, and returns this node once React is done. */
	monter: (element: ReactNode) => Promise<HTMLElement>
	/** Unmounts what `monter` rendered. Done after each test: call it only to test an unmount. */
	demonter: () => Promise<void>
	/** Clicks as a person does: button down, focus, button up, click. */
	cliquer: (cible: Element) => Promise<void>
	/** Types a value in a field, or chooses it in a list: the field takes the focus, then changes. */
	saisir: (champ: Element, valeur: string) => Promise<void>
	/** The button with this name: its `aria-label`, or else its text. Exactly one, or it throws. */
	bouton: (nom: string | RegExp, dans?: ParentNode) => HTMLElement
	/** The field with this label: a `<label>`, or else an `aria-label`. Exactly one, or it throws. */
	champ: (etiquette: string | RegExp, dans?: ParentNode) => InputField
	/** Waits until the condition returns something, and returns it. Throws after `max` ms (1000). */
	attendre: <T>(condition: () => T, options?: { max?: number }) => Promise<NonNullable<T>>
}

type Open = { w: WindowJsdom; rendreGlobaux: () => void; racines: Map<HTMLElement, Root> }

/** Spaces as a reader sees them: one between words, none around. */
const readable = (texte: string | null | undefined): string => (texte ?? '').replace(/\s+/g, ' ').trim()

const matches = (texte: string, attendu: string | RegExp): boolean =>
	typeof attendu === 'string' ? texte === readable(attendu) : attendu.test(texte)

/** Exactly one match, or an error that lists what the page offers. */
function theOnly<T>(trouves: readonly T[], quoi: string, attendu: string | RegExp, offerts: readonly string[]): T {
	const [only] = trouves
	if (only !== undefined && trouves.length === 1) return only
	const list = offerts.length ? offerts.map(nom => `« ${nom} »`).join(', ') : 'aucun'
	throw new Error(
		`${trouves.length ? `${trouves.length} ${quoi}s répondent` : `Aucun ${quoi} ne répond`} à ${attendu}. Dans la page : ${list}.`
	)
}

const isField = (w: WindowJsdom, element: Element): element is InputField =>
	element instanceof w.HTMLInputElement ||
	element instanceof w.HTMLTextAreaElement ||
	element instanceof w.HTMLSelectElement

/** The words of a label, without those of the field it wraps (the options of a list). */
function labelText(label: HTMLLabelElement): string {
	const copy = label.cloneNode(true) as HTMLLabelElement
	for (const field of copy.querySelectorAll('input, textarea, select, button')) field.remove()
	return readable(copy.textContent)
}

function cutNetwork(w: WindowJsdom): void {
	for (const name of OUTPUTS_NETWORK) {
		const Cut = class {
			constructor() {
				throw new Error(
					`Le banc de composants n'a pas de réseau : ${name} est coupé. Le composant reçoit du test la fonction qui envoie, ou passe par fetch.`
				)
			}
		}
		Object.defineProperty(w, name, { configurable: true, value: Cut, writable: true })
	}
}

/**
 * Opens a jsdom window for the tests of the file, or of the `describe`, that calls it.
 * The window exists from the first of these tests to the last, and for them only.
 */
export function openWindow({ url = 'http://localhost/', noms = [] }: OptionsWindow = {}): DomWindow {
	let open: Open | undefined

	const window = (): Open => {
		if (open) return open
		throw new Error(
			"La fenêtre n'est ouverte que pendant les tests : monter, cliquer et les autres s'appellent dans un test, pas au chargement du fichier."
		)
	}

	const unmount = async (): Promise<void> => {
		if (!open) return
		const roots = [...open.racines]
		open.racines.clear()
		await act(async () => {
			for (const [, root] of roots) root.unmount()
		})
		for (const [zone] of roots) zone.remove()
	}

	// Every render and unmount of the bench goes through `act`: once the page is empty, React has
	// nothing left to do in this window, and it can leave.
	const close = async (): Promise<void> => {
		if (!open) return
		const { rendreGlobaux: renderGlobals, w } = open
		try {
			await unmount()
		} finally {
			open = undefined
			renderGlobals()
			w.close()
		}
	}

	beforeAll(() => {
		if ('window' in globalThis || 'document' in globalThis) {
			throw new Error('Une fenêtre est déjà ouverte : un seul ouvrirFenetre() par fichier de test, ou un par describe.')
		}
		const { window: w } = new JSDOM('<!doctype html><html lang="fr"><body></body></html>', {
			pretendToBeVisual: true,
			url,
		})
		cutNetwork(w)
		const values: Record<string, unknown> = { IS_REACT_ACT_ENVIRONMENT: true }
		for (const name of [...SET_NAMES, ...noms]) {
			if (!(name in w)) throw new Error(`La fenêtre de test n'a pas de « ${name} » à poser sur globalThis.`)
			values[name] = Reflect.get(w, name)
		}
		open = { racines: new Map(), rendreGlobaux: setGlobals(values), w }
	})
	afterEach(unmount)
	afterAll(close)

	return {
		get w() {
			return window().w
		},
		monter: async element => {
			const { racines: roots, w } = window()
			const zone = w.document.createElement('div')
			w.document.body.append(zone)
			const root = createRoot(zone)
			roots.set(zone, root)
			await act(async () => {
				root.render(element)
			})
			return zone
		},
		demonter: unmount,
		cliquer: async cible => {
			const { w } = window()
			const mouse = (type: string) => new w.MouseEvent(type, { bubbles: true, button: 0, cancelable: true })
			await act(async () => {
				cible.dispatchEvent(mouse('mousedown'))
				if (cible instanceof w.HTMLElement) cible.focus()
				cible.dispatchEvent(mouse('mouseup'))
				cible.dispatchEvent(mouse('click'))
			})
		},
		saisir: async (champ, valeur) => {
			const { w } = window()
			if (!isField(w, champ)) {
				throw new Error(
					`On ne saisit que dans un champ (input, textarea, select), pas dans <${champ.tagName.toLowerCase()}>.`
				)
			}
			// React follows the value of a field through a property it sets on the field itself:
			// only the setter of the class changes the value behind its back, as typing does.
			const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(champ), 'value')?.set
			await act(async () => {
				champ.focus()
				setter?.call(champ, valeur)
				champ.dispatchEvent(new w.Event('input', { bubbles: true }))
				champ.dispatchEvent(new w.Event('change', { bubbles: true }))
			})
		},
		bouton: (nom, dans) => {
			const { w } = window()
			const everyone = [
				...(dans ?? w.document.body).querySelectorAll<HTMLElement>(
					'button, [role="button"], input[type="submit"], input[type="button"]'
				),
			].map(element => ({
				element,
				nom: readable(
					element.getAttribute('aria-label') ??
						(element instanceof w.HTMLInputElement ? element.value : element.textContent)
				),
			}))
			const found = everyone.filter(bouton => matches(bouton.nom, nom))
			return theOnly(
				found,
				'bouton',
				nom,
				everyone.map(bouton => bouton.nom)
			).element
		},
		champ: (etiquette, dans) => {
			const { w } = window()
			const root = dans ?? w.document.body
			const everyone: { element: Element | null; nom: string }[] = [
				...[...root.querySelectorAll('label')].map(label => ({
					element: label.control,
					nom: labelText(label),
				})),
				...[...root.querySelectorAll('input[aria-label], textarea[aria-label], select[aria-label]')].map(element => ({
					element,
					nom: readable(element.getAttribute('aria-label')),
				})),
			]
			const found = everyone.filter(champ => champ.element && matches(champ.nom, etiquette))
			return theOnly(
				found,
				'champ',
				etiquette,
				everyone.map(champ => champ.nom)
			).element as InputField
		},
		attendre: async (condition, { max = 1000 } = {}) => {
			window()
			const end = performance.now() + max
			for (;;) {
				const value = condition()
				if (value) return value as NonNullable<ReturnType<typeof condition>>
				if (performance.now() >= end) throw new Error(`Attente dépassée : rien au bout de ${max} ms.`)
				// One turn of the timers inside `act`: what a resolved promise sets in the state is rendered.
				await act(async () => {
					await new Promise(resolve => setTimeout(resolve, 5))
				})
			}
		},
	}
}
