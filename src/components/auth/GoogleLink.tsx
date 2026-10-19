'use client'

import type { ReactNode } from 'react'
import { type Suivre, track } from '@/lib/analytics/track'

/**
 * The link of the Google button. On the sign-up page, a click is the start of a sign-up
 * (`signup_start`, method `google`, ticket 146); the navigation itself is the browser's own.
 */
export function GoogleLink({
	adresse,
	debutDInscription,
	className,
	children,
	suivre = track,
}: {
	adresse: string
	debutDInscription: boolean
	className: string
	children: ReactNode
	suivre?: Suivre
}) {
	return (
		<a
			href={adresse}
			data-testid="bouton-google"
			className={className}
			onClick={() => {
				if (debutDInscription) suivre('signup_start', { method: 'google' })
			}}
		>
			{children}
		</a>
	)
}
