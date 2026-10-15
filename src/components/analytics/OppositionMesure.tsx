'use client'

import { useEffect, useState } from 'react'
import { mesureRefusee, refuserLaMesure } from '@/lib/analytics/opposition'

function stockageDuNavigateur(): Storage | undefined {
	try {
		return window.localStorage
	} catch {
		return undefined
	}
}

/**
 * The button of the privacy policy that lets a visitor oppose the audience measure on this browser
 * (ticket 112). One click stops what the page sends to Umami, a second one brings it back. Nothing is
 * drawn on the server: the state lives in the browser.
 */
export function OppositionMesure() {
	const [pret, setPret] = useState(false)
	const [refusee, setRefusee] = useState(false)

	useEffect(() => {
		setRefusee(mesureRefusee(stockageDuNavigateur()))
		setPret(true)
	}, [])

	if (!pret) return null

	return (
		<span className="flex flex-col items-start gap-2">
			<span className="text-gray-700 text-sm" role="status">
				{refusee
					? "La mesure d'audience est désactivée sur ce navigateur."
					: "La mesure d'audience est active sur ce navigateur."}
			</span>
			<button
				type="button"
				className="btn-alt-primary"
				onClick={() => setRefusee(refuserLaMesure(stockageDuNavigateur(), !refusee))}
			>
				{refusee ? "Réactiver la mesure d'audience" : 'Ne plus mesurer mes visites'}
			</button>
		</span>
	)
}
