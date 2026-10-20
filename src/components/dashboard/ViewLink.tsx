'use client'

import Link from 'next/link'
import { type ComponentProps, useRef } from 'react'
import { mesurerLeChangementDeVue } from '@/lib/dashboard/analytics'

/** Under this delay a second click on the same link is the same gesture (a double click, a held key). */
export const DELAI_D_UN_MEME_GESTE_MS = 1500

/**
 * A link between her space and her public view (ticket 147). Following it counts one
 * `profile_visibility`: `vue="publique"` for « Voir mon profil public », `vue="edition"` for
 * « Modifier mon profil ». It is the click that counts, so loading the page, reloading it or going
 * back and forward counts nothing; a double click or a held Enter counts once, and a click
 * with a modifier key counts nothing (it opens another tab, the view of this one does not change).
 */
export function LienDeVue({
	vue,
	...proprietes
}: { vue: 'publique' | 'edition' } & Omit<ComponentProps<typeof Link>, 'onClick'>) {
	const dernier = useRef(Number.NEGATIVE_INFINITY)
	return (
		<Link
			{...proprietes}
			onClick={evenement => {
				if (evenement.button !== 0 || evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey)
					return
				const maintenant = Date.now()
				if (maintenant - dernier.current < DELAI_D_UN_MEME_GESTE_MS) return
				dernier.current = maintenant
				mesurerLeChangementDeVue(vue === 'publique')
			}}
		/>
	)
}
