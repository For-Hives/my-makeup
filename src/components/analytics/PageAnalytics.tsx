'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { recordSearch } from '@/app/(front)/(site)/search/actions'
import { formSubmission, realBrowser, shouldEmit } from '@/lib/analytics/duplicate'
import type { MyMakeupEvents } from '@/lib/analytics/events'
import { installAnalytics } from '@/lib/analytics/loader'
import { analyticsRefused } from '@/lib/analytics/opt-out'
import { track } from '@/lib/analytics/track'
import { errorCode, notFoundKind } from '@/lib/analytics/values'

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
 * list of the départements, no text, no identifier. A browser that opted out of the measure does not count.
 */
export function SearchAnalytics({
	aUneVille,
	resultats,
	empreinte,
	departement,
}: {
	aUneVille: boolean
	resultats: MyMakeupEvents['search_submit']['results']
	empreinte: string
	departement: string
}) {
	useEffect(() => {
		const browser = realBrowser()
		const form = formSubmission(browser)
		if (!shouldEmit('search_submit', empreinte, 'meme-vue', browser) && !form) return
		track('search_submit', { has_city: aUneVille, results: resultats, from: form ? 'formulaire' : 'lien' })
		if (!analyticsRefused(optOutStorage()))
			void recordSearch({ withCity: aUneVille, noResult: resultats === '0', department: departement })
	}, [aUneVille, resultats, empreinte, departement])
	return null
}

/** The 404 page counted once, with the kind of address it was (event `not_found`). Renders nothing. */
export function NotFoundAnalytics() {
	const path = usePathname()
	useEffect(() => {
		installAnalytics()
		if (shouldEmit('not_found', path, 'rechargement', realBrowser())) track('not_found', { kind: notFoundKind(path) })
	}, [path])
	return null
}

/** An error page counted once (event `app_error`). Renders nothing. */
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
			track('app_error', { scope, code: errorCode(erreur) })
	}, [scope, erreur])
	return null
}
