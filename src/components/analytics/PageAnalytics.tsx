'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { recordSearch } from '@/app/(front)/(site)/search/actions'
import { formSubmission, LAST_REFINE_KEY, realBrowser, shouldEmit } from '@/lib/analytics/duplicate'
import type { MyMakeupEvents } from '@/lib/analytics/events'
import { installAnalytics } from '@/lib/analytics/loader'
import { analyticsRefused } from '@/lib/analytics/opt-out'
import { track } from '@/lib/analytics/track'
import { errorCode, notFoundKind, notFoundPath, routeOf } from '@/lib/analytics/values'

function optOutStorage(): Storage | undefined {
	try {
		return window.localStorage
	} catch {
		return undefined
	}
}

/**
 * The search page counted once (event `search_submit`, ticket 145). The server gives two facts and
 * nothing else: whether a city was typed, and the slice of the results. `fingerprint` tells two
 * searches apart (it is a hash made on the server, the words never reach the browser's storage).
 * Renders nothing.
 *
 * The same decision also adds one to the count of the day (issue 1002): three facts and a code of the
 * list of the départements, no text, no identifier. A browser that opted out of the measure, or an automated
 * one (`navigator.webdriver`), does not count.
 */
export function SearchAnalytics({
	aUneVille,
	hasWord,
	resultats,
	empreinte,
	departement,
	refinement,
}: {
	aUneVille: boolean
	/** Some words were typed (never which). */
	hasWord: boolean
	resultats: MyMakeupEvents['search_submit']['results']
	empreinte: string
	departement: string
	/**
	 * The filters of the address when the search is narrowed (a speciality, a price, a sort), with the slice of the
	 * results they leave and a key that tells two sets of filters apart; none for the search of before.
	 */
	refinement: (MyMakeupEvents['search_refine'] & { key: string }) | null
}) {
	useEffect(() => {
		const browser = realBrowser()
		const form = formSubmission(browser)
		if (shouldEmit('search_submit', empreinte, 'meme-vue', browser) || form) {
			track('search_submit', {
				has_city: aUneVille,
				results: resultats,
				from: form ? 'formulaire' : 'lien',
				has_word: hasWord,
				zone: departement,
			})
			// An automated browser (a crawler, a test) counts nothing, like the Umami event (src/lib/analytics/track.ts).
			if (!navigator.webdriver && !analyticsRefused(optOutStorage()))
				void recordSearch({ withCity: aUneVille, noResult: resultats === '0', department: departement })
		}
		// A narrowed search is the same search for `search_submit` (above): its filters are told once for each set.
		if (
			refinement !== null &&
			shouldEmit('search_refine', `${empreinte}|${refinement.key}`, 'meme-vue', browser, LAST_REFINE_KEY)
		) {
			const { key: _key, ...properties } = refinement
			track('search_refine', properties)
		}
	}, [aUneVille, hasWord, resultats, empreinte, departement, refinement])
	return null
}

/**
 * The 404 page counted once, with the kind of address it was and the address itself, so that a broken link can be found
 * (event `not_found`): no query, no hash, the name of a profile left out (`notFoundPath`). Renders nothing.
 */
export function NotFoundAnalytics() {
	const path = usePathname()
	useEffect(() => {
		installAnalytics()
		if (shouldEmit('not_found', path, 'rechargement', realBrowser()))
			track('not_found', { kind: notFoundKind(path), path: notFoundPath(path) })
	}, [path])
	return null
}

/** An error page counted once (event `app_error`), with the route it happened on, never the address. Renders nothing. */
export function ErrorAnalytics({
	scope,
	erreur,
}: {
	scope: MyMakeupEvents['app_error']['scope']
	erreur: Error & { digest?: string }
}) {
	useEffect(() => {
		// The digest names the error of the server; a client error has none, its message is not read.
		installAnalytics()
		const view = `${scope}:${erreur.digest ?? ''}:${window.location.pathname}`
		if (shouldEmit('app_error', view, 'rechargement', realBrowser()))
			track('app_error', { scope, code: errorCode(erreur), route: routeOf(window.location.pathname) })
	}, [scope, erreur])
	return null
}
