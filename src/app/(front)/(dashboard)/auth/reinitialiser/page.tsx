import config from '@payload-config'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { getPayload } from 'payload'
import { ART_LINK_BUTTON, ART_NOTICE } from '@/components/art/form-classes'
import { AuthShell } from '@/components/auth/AuthShell'
import { PasswordResetForm } from '@/components/auth/PasswordResetForm'
import { FORGOT_PASSWORD_PAGE, PASSWORD_MESSAGES, PASSWORD_RESET_COOKIE } from '@/lib/auth/forgot-password'
import { linkStillValid } from '@/lib/auth/password-reset-payload'
import { choosePassword } from './actions'

// Read per request: it depends on the cookie of the link, and the build has no database.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
	title: 'Nouveau mot de passe',
	description: 'Choisis un nouveau mot de passe pour ton espace maquilleuse My Makeup.',
	// The link carries a secret until the proxy has moved it into a cookie: no Referer, ever.
	referrer: 'no-referrer',
}

/**
 * The second step of the forgotten password (ticket 085). The link of the mail is moved into a cookie
 * by the proxy and this page is reached without its code. A link that is past its hour, spent, or
 * from the old site says so here, before any form (ticket 086), and never ends in an error page.
 */
export default async function PasswordResetPage() {
	const token = (await cookies()).get(PASSWORD_RESET_COOKIE)?.value
	const payload = await getPayload({ config })
	const state = !token ? 'code-absent' : (await linkStillValid(payload, token)) ? 'valable' : 'code-invalide'

	return (
		<AuthShell title="Nouveau mot de passe">
			{state === 'valable' ? (
				<PasswordResetForm action={choosePassword} />
			) : (
				<>
					<p role="alert" data-testid="lien-perime" className={`max-w-sm ${ART_NOTICE.error}`}>
						{PASSWORD_MESSAGES[state]}
					</p>
					<Link className={ART_LINK_BUTTON} href={FORGOT_PASSWORD_PAGE}>
						Demander un nouveau lien
					</Link>
				</>
			)}
		</AuthShell>
	)
}
