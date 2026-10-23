'use client'

import { useRouter } from 'next/navigation'
import { Onboarding } from './Onboarding'

type Props = Omit<Parameters<typeof Onboarding>[0], 'refresh' | 'navigate'>

/**
 * The onboarding on its page: the refresh reads the page again from the server, the navigation is a
 * full load of the next address (the end page is read by the server, never guessed by the browser).
 */
export function OnboardingRoute(props: Props) {
	const router = useRouter()
	return <Onboarding {...props} refresh={() => router.refresh()} navigate={url => window.location.assign(url)} />
}
