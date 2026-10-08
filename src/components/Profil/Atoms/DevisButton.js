import React, { useEffect, useState } from 'react'
import { buildDevisHref } from '@/lib/devis'
import { umamiAttributes } from '@/lib/analytics'

/**
 * « Demander un devis » (F3a): opens the external quote form in a new tab with
 * the profile, the source, the utm parameters of the page and the referrer
 * domain as hidden fields.
 *
 * `formUrl` comes from the page props (getStaticProps), never from a
 * NEXT_PUBLIC_ value inlined in the client bundle: the server HTML and the
 * browser always agree, even when the variable is only set at runtime.
 * @param {{formUrl: string|null, slug: string, pid: number}} props
 */
export function DevisButton({ formUrl, slug, pid }) {
	const [href, setHref] = useState(() =>
		buildDevisHref({ formUrl, slug, pid })
	)

	useEffect(() => {
		setHref(
			buildDevisHref({
				formUrl,
				slug,
				pid,
				search: window.location.search,
				referrer: document.referrer,
			})
		)
	}, [formUrl, slug, pid])

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
