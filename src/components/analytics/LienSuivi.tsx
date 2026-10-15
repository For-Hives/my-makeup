'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'
import type { EvenementsMyMakeup } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/track'

/** The clicks a link reports: serializable, so a server page can give it. */
export type ClicSuivi =
	| { nom: 'cta_click'; proprietes: EvenementsMyMakeup['cta_click'] }
	/** The search button of the navigation: one markup for both widths, told apart at the click. */
	| { nom: 'nav_recherche' }
	| { nom: 'search_result_click'; proprietes: EvenementsMyMakeup['search_result_click'] }

/** The menu is a row from 1024 px (Tailwind `lg`), a drawer under it. */
function ouEstLeBouton(): EvenementsMyMakeup['cta_click']['where'] {
	return window.matchMedia('(min-width: 1024px)').matches ? 'nav_recherche' : 'nav_recherche_mobile'
}

/** A `Link` that reports its click (ticket 145). The link works as any other without the script. */
export function LienSuivi({ suivi, onClick, ...reste }: ComponentProps<typeof Link> & { suivi: ClicSuivi }) {
	return (
		<Link
			{...reste}
			onClick={evenement => {
				onClick?.(evenement)
				if (suivi.nom === 'cta_click') track('cta_click', suivi.proprietes)
				else if (suivi.nom === 'nav_recherche') track('cta_click', { where: ouEstLeBouton() })
				else track('search_result_click', suivi.proprietes)
			}}
		/>
	)
}
