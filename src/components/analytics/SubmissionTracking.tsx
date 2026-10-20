'use client'

import { useEffect, useRef } from 'react'
import { noteSubmission, realBrowser } from '@/lib/analytics/duplicate'

/**
 * Put inside the search form: notes that the visitor submitted it, so the page of results can tell a
 * search typed in the form from one reached by a link (`from` of `search_submit`). The form still
 * works without the script. Renders an empty hidden mark.
 */
export function SubmissionTracking() {
	const marker = useRef<HTMLSpanElement>(null)
	useEffect(() => {
		const form = marker.current?.closest('form')
		if (!form) return
		const note = () => noteSubmission(realBrowser())
		form.addEventListener('submit', note)
		return () => form.removeEventListener('submit', note)
	}, [])
	return <span ref={marker} hidden />
}
