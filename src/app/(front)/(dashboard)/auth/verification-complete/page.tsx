import config from '@payload-config'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { getPayload } from 'payload'
import { authLog } from '@/lib/auth/auth-log'
import { ipClient } from '@/lib/auth/client-ip'
import { type ConfirmationResult, confirmWithRateLimit } from '@/lib/auth/confirmation'
import { ACCOUNT_ONBOARDING_PAGE } from '@/lib/auth/return-to'
import { confirmationRateLimit } from '@/lib/auth/sign-up-rate-limits'

// Read per request: it confirms an account, and the build has no database.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
	title: 'Confirmation de ton adresse email',
	description: 'Ton adresse email est confirmée : tu peux te connecter à My Makeup.',
}

const TITLES: Record<ConfirmationResult, string> = {
	ok: 'Félicitations ! Ton compte My Makeup est maintenant activé !',
	'deja-confirme': 'Ton adresse email est déjà confirmée.',
	'lien-invalide': 'Ce lien de confirmation n’est pas valide.',
}

const TEXTS: Record<ConfirmationResult, string> = {
	ok: 'Tu peux désormais te connecter.',
	'deja-confirme': 'Ton compte est actif : tu peux te connecter.',
	'lien-invalide': 'Il est peut-être incomplet. Reprends le lien depuis le mail de confirmation.',
}

// Following the link of the mail confirms the account (ticket 082). The same link followed again says
// it is already done.
export default async function EmailConfirmation({
	searchParams,
}: {
	searchParams: Promise<{ code?: string | string[] }>
}) {
	const { code } = await searchParams
	const payload = await getPayload({ config })
	const result = await confirmWithRateLimit(
		payload,
		code,
		confirmationRateLimit,
		ipClient(await headers()),
		authLog(payload)
	)
	const signIn = `/auth/signin?callbackUrl=${encodeURIComponent(ACCOUNT_ONBOARDING_PAGE)}`

	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
			<h1 className="max-w-md font-semibold text-3xl">{TITLES[result]}</h1>
			<p className="max-w-sm text-neutral-700">{TEXTS[result]}</p>
			<p>
				<Link
					className="min-h-11 rounded-md bg-neutral-900 px-4 py-2 font-medium text-white"
					href={result === 'lien-invalide' ? '/auth/signin' : signIn}
				>
					Se connecter
				</Link>
			</p>
		</main>
	)
}
