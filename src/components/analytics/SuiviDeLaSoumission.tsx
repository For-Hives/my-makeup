'use client'

import { useEffect, useRef } from 'react'
import { navigateurReel, noterLaSoumission } from '@/lib/analytics/doublon'

/**
 * Put inside the search form: notes that the visitor submitted it, so the page of results can tell a
 * search typed in the form from one reached by a link (`from` of `search_submit`). The form still
 * works without the script. Renders an empty hidden mark.
 */
export function SuiviDeLaSoumission() {
	const repere = useRef<HTMLSpanElement>(null)
	useEffect(() => {
		const formulaire = repere.current?.closest('form')
		if (!formulaire) return
		const noter = () => noterLaSoumission(navigateurReel())
		formulaire.addEventListener('submit', noter)
		return () => formulaire.removeEventListener('submit', noter)
	}, [])
	return <span ref={repere} hidden />
}
