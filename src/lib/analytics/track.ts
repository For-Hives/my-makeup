/**
 * The only path from a page to Umami (ticket 143): `track(name, properties)`.
 *
 * The event is checked against the closed catalogue (events.ts) and handed to `window.umami.track`.
 * It is dropped, silently, when:
 * - the build is not a production one (nothing is measured in development, nor in the tests);
 * - there is no `window.umami` and no waiting room: the script did not load, or a blocker removed it;
 * - the browser is automated (`navigator.webdriver`).
 * While the Umami script is still loading, the event waits for it in `window.mmAttenteUmami`
 * (the inline script of the head, umami.ts).
 *
 * It never throws: a measure must not break a page.
 */

import { donneesDEvenement, type EvenementsMyMakeup, type NomEvenement } from './events'
import { WAITING_ROOM_NAME } from './umami'

/** What of the browser `track` uses. */
export interface FenetreMesuree {
	navigator?: { webdriver?: boolean | undefined } | undefined
	umami?: { track?: (nom: string, donnees: Record<string, string | number | boolean>) => unknown } | undefined
	[salle: string]: unknown
}

export interface Execution {
	/** Nothing without a window: the server renders the pages and measures nothing. */
	fenetre: FenetreMesuree | undefined
	/** True for a production build. */
	production: boolean
}

/** The arguments after the name: the properties, optional for an event that has none. */
export type ArgumentsDe<N extends NomEvenement> =
	EvenementsMyMakeup[N] extends Record<string, never>
		? [proprietes?: EvenementsMyMakeup[N]]
		: [proprietes: EvenementsMyMakeup[N]]

export type Suivre = <N extends NomEvenement>(nom: N, ...proprietes: ArgumentsDe<N>) => boolean

function passerAUmami(nom: string, donnees: Record<string, string | number | boolean>, execution: Execution): boolean {
	const { fenetre, production } = execution
	if (!production || !fenetre) return false
	if (fenetre.navigator?.webdriver) return false
	if (fenetre.umami && typeof fenetre.umami.track === 'function') {
		fenetre.umami.track(nom, donnees)
		return true
	}
	const salle = fenetre[WAITING_ROOM_NAME]
	return typeof salle === 'function' && salle(nom, donnees) === true
}

/** `track` for a given browser: the tests give their own, the pages use `track` below. */
export function creerTrack(execution: () => Execution): Suivre {
	return (nom, ...[proprietes]) => {
		try {
			const donnees = donneesDEvenement(nom, proprietes ?? {})
			return donnees !== null && passerAUmami(nom, donnees, execution())
		} catch {
			return false
		}
	}
}

/**
 * Sends an event. True when it was handed to Umami, or waits for its script.
 *
 *   track('contact_click', { pid: 12, channel: 'phone' })
 */
export const track: Suivre = creerTrack(() => ({
	fenetre: typeof window === 'undefined' ? undefined : (window as unknown as FenetreMesuree),
	production: process.env.NODE_ENV === 'production',
}))
