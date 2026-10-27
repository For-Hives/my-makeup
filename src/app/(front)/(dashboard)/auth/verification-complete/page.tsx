import config from '@payload-config'
import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import Link from 'next/link'
import { getPayload } from 'payload'
import { EmailConfirmedEvent } from '@/components/analytics/AccountFunnel'
import { ART_LINK, ART_LINK_BUTTON } from '@/components/art/form-classes'
import { AuthShell } from '@/components/auth/AuthShell'
import { authLog } from '@/lib/auth/auth-log'
import { ipClient } from '@/lib/auth/client-ip'
import { type ConfirmationResult, confirmWithRateLimit } from '@/lib/auth/confirmation'
import { CONFIRMATION_COOKIE } from '@/lib/auth/confirmation-link'
import { ACCOUNT_ONBOARDING_PAGE } from '@/lib/auth/return-to'
import { confirmationRateLimit } from '@/lib/auth/sign-up-rate-limits'
import { continueAfterConfirmation } from './actions'

// Read per request: it confirms an account, and the build has no database.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
	title: 'Confirmation de ton adresse email',
	description: 'Ton adresse email est confirmée : tu peux te connecter à My Makeup.',
	// Neither the Referer nor a cache carries anything of the link.
	referrer: 'no-referrer',
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
export default async function EmailConfirmation() {
	// The proxy moved the code of the link into a cookie of this page and sent the visitor here, to the bare address.
	const code = (await cookies()).get(CONFIRMATION_COOKIE)?.value
	const payload = await getPayload({ config })
	const { result, sessionOffered } = await confirmWithRateLimit(
		payload,
		code,
		confirmationRateLimit,
		ipClient(await headers()),
		authLog(payload)
	)
	const signIn = `/auth/signin?callbackUrl=${encodeURIComponent(ACCOUNT_ONBOARDING_PAGE)}`

	return (
		<AuthShell title={TITLES[result]} titleClassName="max-w-2xl">
			{result === 'ok' && <EmailConfirmedEvent />}
			<p className="max-w-sm text-mute">{TEXTS[result]}</p>
			{sessionOffered ? (
				<form action={continueAfterConfirmation} className="flex flex-col items-center gap-3">
					<button type="submit" className={ART_LINK_BUTTON} data-testid="continuer-apres-confirmation">
						Continuer vers mon profil
					</button>
					<Link className={ART_LINK} href={signIn}>
						Se connecter
					</Link>
				</form>
			) : (
				<p>
					<Link className={ART_LINK_BUTTON} href={result === 'lien-invalide' ? '/auth/signin' : signIn}>
						Se connecter
					</Link>
				</p>
			)}
		</AuthShell>
	)
}
