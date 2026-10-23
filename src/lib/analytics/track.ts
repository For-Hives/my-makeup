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

import { type EventName, eventData, type MyMakeupEvents } from './events'
import { WAITING_ROOM_NAME } from './umami'

/** What of the browser `track` uses. */
export interface MeasuredWindow {
	navigator?: { webdriver?: boolean | undefined } | undefined
	umami?: { track?: (nom: string, donnees: Record<string, string | number | boolean>) => unknown } | undefined
	[salle: string]: unknown
}

export interface Execution {
	/** Nothing without a window: the server renders the pages and measures nothing. */
	fenetre: MeasuredWindow | undefined
	/** True for a production build. */
	production: boolean
}

/** The arguments after the name: the properties, optional for an event that has none. */
export type ArgumentsOf<N extends EventName> =
	MyMakeupEvents[N] extends Record<string, never> ? [proprietes?: MyMakeupEvents[N]] : [proprietes: MyMakeupEvents[N]]

export type Track = <N extends EventName>(nom: N, ...proprietes: ArgumentsOf<N>) => boolean

function passToUmami(nom: string, donnees: Record<string, string | number | boolean>, execution: Execution): boolean {
	const { fenetre: browserWindow, production } = execution
	if (!production || !browserWindow) return false
	if (browserWindow.navigator?.webdriver) return false
	if (browserWindow.umami && typeof browserWindow.umami.track === 'function') {
		browserWindow.umami.track(nom, donnees)
		return true
	}
	const waitingRoom = browserWindow[WAITING_ROOM_NAME]
	return typeof waitingRoom === 'function' && waitingRoom(nom, donnees) === true
}

/** `track` for a given browser: the tests give their own, the pages use `track` below. */
export function createTrack(execution: () => Execution): Track {
	return (nom, ...[proprietes]) => {
		try {
			const data = eventData(nom, proprietes ?? {})
			return data !== null && passToUmami(nom, data, execution())
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
export const track: Track = createTrack(() => ({
	fenetre: typeof window === 'undefined' ? undefined : (window as unknown as MeasuredWindow),
	production: process.env.NODE_ENV === 'production',
}))
