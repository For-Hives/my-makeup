/**
 * Puts the tracker on a page that came without it (ticket 145).
 *
 * The inline script of the head (umami.ts) runs on every page the server draws with its layout. It
 * does not run on a page the browser draws itself after the server gave up: React creates the
 * scripts it renders inert. Two pages are in that case, and they are the ones that report a
 * problem: the 404 of an address no route matches (it brings its own shell, global-not-found.tsx)
 * or of a profile, an article or a talent that does not exist, and the page of an error.
 *
 * The page that reports gives the tracker itself: the same script, built from what the browser
 * holds of the build (the version and the domains are frozen into the bundles). Nothing is done
 * when the tracker is there already, nor outside a production build.
 */

import type { FenetreMesuree } from './track'
import { umamiLoaderScript, umamiScriptAttributes, WAITING_ROOM_NAME } from './umami'

/** What of the browser the installation uses; the tests give their own. */
export interface FenetreInstallable extends FenetreMesuree {
	document?: { head?: { appendChild(noeud: unknown): unknown } | null; createElement(nom: string): { text: string } }
}

/** The script of the head, as the layout builds it. NEXT_PUBLIC_* and BUILD_SOURCE_COMMIT are read by their full names: Next freezes them into the bundles. */
export function scriptDeMesure(): string {
	return umamiLoaderScript(
		umamiScriptAttributes({
			domains: process.env.NEXT_PUBLIC_UMAMI_DOMAINS,
			version: { buildVersion: process.env.NEXT_PUBLIC_APP_VERSION, commit: process.env.BUILD_SOURCE_COMMIT },
		})
	)
}

/** True when the script was added. */
export function installerLaMesure(
	fenetre: FenetreInstallable | undefined = typeof window === 'undefined'
		? undefined
		: (window as unknown as FenetreInstallable),
	production: boolean = process.env.NODE_ENV === 'production'
): boolean {
	try {
		if (!production || !fenetre?.document?.head) return false
		if (fenetre.umami || typeof fenetre[WAITING_ROOM_NAME] === 'function') return false
		const balise = fenetre.document.createElement('script')
		balise.text = scriptDeMesure()
		fenetre.document.head.appendChild(balise)
		return true
	} catch {
		return false
	}
}
