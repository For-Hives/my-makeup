import React, { useEffect, useState } from 'react'
import { isMeasureDisabled, setMeasureDisabled } from '@/lib/analytics'

function browserStorage() {
	try {
		return window.localStorage
	} catch {
		return undefined
	}
}

/**
 * Lets a visitor opt out of the Umami audience measurement on this browser
 * (the `umami.disabled` key Umami reads before sending anything).
 */
function MeasureOptOut() {
	const [ready, setReady] = useState(false)
	const [disabled, setDisabled] = useState(false)

	useEffect(() => {
		setDisabled(isMeasureDisabled(browserStorage()))
		setReady(true)
	}, [])

	if (!ready) return null

	return (
		<span className={'not-prose flex flex-col items-start gap-2'}>
			<span className={'text-sm text-gray-700'}>
				{disabled
					? "La mesure d'audience est désactivée sur ce navigateur."
					: "La mesure d'audience est active sur ce navigateur."}
			</span>
			<button
				type={'button'}
				className={'btn-alt-primary'}
				onClick={() =>
					setDisabled(setMeasureDisabled(browserStorage(), !disabled))
				}
			>
				{disabled
					? "Réactiver la mesure d'audience"
					: 'Ne plus mesurer mes visites'}
			</button>
		</span>
	)
}

export default MeasureOptOut
