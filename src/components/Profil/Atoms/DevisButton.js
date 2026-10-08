import React, { useEffect, useState } from 'react'
import { buildDevisHref } from '@/lib/devis'
import { umamiAttributes } from '@/lib/analytics'

// inlined at build time; the button only exists when it is a valid https URL
const DEVIS_FORM_URL = process.env.NEXT_PUBLIC_DEVIS_FORM_URL

/**
 * « Demander un devis » (F3a): opens the external quote form in a new tab with
 * the profile, the source, the utm parameters of the page and the referrer
 * domain as hidden fields.
 * @param {{slug: string, pid: number}} props
 */
export function DevisButton({ slug, pid }) {
	const [href, setHref] = useState(() =>
		buildDevisHref({ formUrl: DEVIS_FORM_URL, slug, pid })
	)

	useEffect(() => {
		setHref(
			buildDevisHref({
				formUrl: DEVIS_FORM_URL,
				slug,
				pid,
				search: window.location.search,
				referrer: document.referrer,
			})
		)
	}, [slug, pid])

	if (href === null) return null

	return (
		<a
			href={href}
			target={'_blank'}
			rel={'noopener'}
			data-cy={'devis-button'}
			className={'btn-primary inline-flex items-center gap-2'}
			{...umamiAttributes('devis_click', { pid, from: 'profil' })}
		>
			<span className="material-icons-round" aria-hidden="true">
				request_quote
			</span>
			Demander un devis
		</a>
	)
}
