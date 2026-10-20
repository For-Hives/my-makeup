// First on purpose. bunfig.toml has already loaded this file before any test file; in a run that
// did not read bunfig.toml, it stops here with the reason, before React loads without a window.
import './preload-react-dom'

import { afterAll, afterEach, beforeAll } from 'bun:test'
import { JSDOM } from 'jsdom'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { poserGlobaux } from './globals'

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
export const NOMS_POSES = [
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
const SORTIES_RESEAU = ['XMLHttpRequest', 'WebSocket'] as const

export type FenetreJsdom = JSDOM['window']

export type OptionsFenetre = {
	/** The address the window believes it is at. Nothing is fetched from it. */
	url?: string
	/** More names of the window to set on `globalThis`, after NOMS_POSES (`'localStorage'`…). */
	noms?: readonly string[]
}

/** A field a person can type in, or choose a value in. */
export type ChampDeSaisie = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

export type Fenetre = {
	/** The jsdom window, open while the tests run. */
	readonly w: FenetreJsdom
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
	champ: (etiquette: string | RegExp, dans?: ParentNode) => ChampDeSaisie
	/** Waits until the condition returns something, and returns it. Throws after `max` ms (1000). */
	attendre: <T>(condition: () => T, options?: { max?: number }) => Promise<NonNullable<T>>
}

type Ouverte = { w: FenetreJsdom; rendreGlobaux: () => void; racines: Map<HTMLElement, Root> }

/** Spaces as a reader sees them: one between words, none around. */
const lisible = (texte: string | null | undefined): string => (texte ?? '').replace(/\s+/g, ' ').trim()

const correspond = (texte: string, attendu: string | RegExp): boolean =>
	typeof attendu === 'string' ? texte === lisible(attendu) : attendu.test(texte)

/** Exactly one match, or an error that lists what the page offers. */
function leSeul<T>(trouves: readonly T[], quoi: string, attendu: string | RegExp, offerts: readonly string[]): T {
	const [seul] = trouves
	if (seul !== undefined && trouves.length === 1) return seul
	const liste = offerts.length ? offerts.map(nom => `« ${nom} »`).join(', ') : 'aucun'
	throw new Error(
		`${trouves.length ? `${trouves.length} ${quoi}s répondent` : `Aucun ${quoi} ne répond`} à ${attendu}. Dans la page : ${liste}.`
	)
}

const estUnChamp = (w: FenetreJsdom, element: Element): element is ChampDeSaisie =>
	element instanceof w.HTMLInputElement ||
	element instanceof w.HTMLTextAreaElement ||
	element instanceof w.HTMLSelectElement

/** The words of a label, without those of the field it wraps (the options of a list). */
function texteDeLEtiquette(label: HTMLLabelElement): string {
	const copie = label.cloneNode(true) as HTMLLabelElement
	for (const champ of copie.querySelectorAll('input, textarea, select, button')) champ.remove()
	return lisible(copie.textContent)
}

function couperLeReseau(w: FenetreJsdom): void {
	for (const nom of SORTIES_RESEAU) {
		const Coupe = class {
			constructor() {
				throw new Error(
					`Le banc de composants n'a pas de réseau : ${nom} est coupé. Le composant reçoit du test la fonction qui envoie, ou passe par fetch.`
				)
			}
		}
		Object.defineProperty(w, nom, { configurable: true, value: Coupe, writable: true })
	}
}

/**
 * Opens a jsdom window for the tests of the file, or of the `describe`, that calls it.
 * The window exists from the first of these tests to the last, and for them only.
 */
export function ouvrirFenetre({ url = 'http://localhost/', noms = [] }: OptionsFenetre = {}): Fenetre {
	let ouverte: Ouverte | undefined

	const fenetre = (): Ouverte => {
		if (ouverte) return ouverte
		throw new Error(
			"La fenêtre n'est ouverte que pendant les tests : monter, cliquer et les autres s'appellent dans un test, pas au chargement du fichier."
		)
	}

	const demonter = async (): Promise<void> => {
		if (!ouverte) return
		const racines = [...ouverte.racines]
		ouverte.racines.clear()
		await act(async () => {
			for (const [, racine] of racines) racine.unmount()
		})
		for (const [zone] of racines) zone.remove()
	}

	// Every render and unmount of the bench goes through `act`: once the page is empty, React has
	// nothing left to do in this window, and it can leave.
	const fermer = async (): Promise<void> => {
		if (!ouverte) return
		const { rendreGlobaux, w } = ouverte
		try {
			await demonter()
		} finally {
			ouverte = undefined
			rendreGlobaux()
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
		couperLeReseau(w)
		const valeurs: Record<string, unknown> = { IS_REACT_ACT_ENVIRONMENT: true }
		for (const nom of [...NOMS_POSES, ...noms]) {
			if (!(nom in w)) throw new Error(`La fenêtre de test n'a pas de « ${nom} » à poser sur globalThis.`)
			valeurs[nom] = Reflect.get(w, nom)
		}
		ouverte = { racines: new Map(), rendreGlobaux: poserGlobaux(valeurs), w }
	})
	afterEach(demonter)
	afterAll(fermer)

	return {
		get w() {
			return fenetre().w
		},
		monter: async element => {
			const { racines, w } = fenetre()
			const zone = w.document.createElement('div')
			w.document.body.append(zone)
			const racine = createRoot(zone)
			racines.set(zone, racine)
			await act(async () => {
				racine.render(element)
			})
			return zone
		},
		demonter,
		cliquer: async cible => {
			const { w } = fenetre()
			const souris = (type: string) => new w.MouseEvent(type, { bubbles: true, button: 0, cancelable: true })
			await act(async () => {
				cible.dispatchEvent(souris('mousedown'))
				if (cible instanceof w.HTMLElement) cible.focus()
				cible.dispatchEvent(souris('mouseup'))
				cible.dispatchEvent(souris('click'))
			})
		},
		saisir: async (champ, valeur) => {
			const { w } = fenetre()
			if (!estUnChamp(w, champ)) {
				throw new Error(
					`On ne saisit que dans un champ (input, textarea, select), pas dans <${champ.tagName.toLowerCase()}>.`
				)
			}
			// React follows the value of a field through a property it sets on the field itself:
			// only the setter of the class changes the value behind its back, as typing does.
			const poseur = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(champ), 'value')?.set
			await act(async () => {
				champ.focus()
				poseur?.call(champ, valeur)
				champ.dispatchEvent(new w.Event('input', { bubbles: true }))
				champ.dispatchEvent(new w.Event('change', { bubbles: true }))
			})
		},
		bouton: (nom, dans) => {
			const { w } = fenetre()
			const tous = [
				...(dans ?? w.document.body).querySelectorAll<HTMLElement>(
					'button, [role="button"], input[type="submit"], input[type="button"]'
				),
			].map(element => ({
				element,
				nom: lisible(
					element.getAttribute('aria-label') ??
						(element instanceof w.HTMLInputElement ? element.value : element.textContent)
				),
			}))
			const trouves = tous.filter(bouton => correspond(bouton.nom, nom))
			return leSeul(
				trouves,
				'bouton',
				nom,
				tous.map(bouton => bouton.nom)
			).element
		},
		champ: (etiquette, dans) => {
			const { w } = fenetre()
			const racine = dans ?? w.document.body
			const tous: { element: Element | null; nom: string }[] = [
				...[...racine.querySelectorAll('label')].map(label => ({
					element: label.control,
					nom: texteDeLEtiquette(label),
				})),
				...[...racine.querySelectorAll('input[aria-label], textarea[aria-label], select[aria-label]')].map(element => ({
					element,
					nom: lisible(element.getAttribute('aria-label')),
				})),
			]
			const trouves = tous.filter(champ => champ.element && correspond(champ.nom, etiquette))
			return leSeul(
				trouves,
				'champ',
				etiquette,
				tous.map(champ => champ.nom)
			).element as ChampDeSaisie
		},
		attendre: async (condition, { max = 1000 } = {}) => {
			fenetre()
			const fin = performance.now() + max
			for (;;) {
				const valeur = condition()
				if (valeur) return valeur as NonNullable<ReturnType<typeof condition>>
				if (performance.now() >= fin) throw new Error(`Attente dépassée : rien au bout de ${max} ms.`)
				// One turn of the timers inside `act`: what a resolved promise sets in the state is rendered.
				await act(async () => {
					await new Promise(resolve => setTimeout(resolve, 5))
				})
			}
		},
	}
}
