'use client'

import { usePathname } from 'next/navigation'
import { useReportWebVitals } from 'next/web-vitals'
import { useRef } from 'react'
import { webVitalProperties } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/track'

/**
 * The field Web Vitals of every page load, sent as the `web-vitals` event (ticket 143): one event
 * per metric, on every visit, with its name, its rounded value, its rating and the page that was
 * loaded. Renders nothing.
 *
 * The page is the one the visit started on: a metric such as the layout shift is reported when the
 * visitor leaves, after any number of navigations inside the site.
 */
export function WebVitals() {
	const loadedPage = useRef(usePathname())
	useReportWebVitals(metrique => {
		const properties = webVitalProperties(metrique, loadedPage.current)
		if (properties !== null) track('web-vitals', properties)
	})
	return null
}
