import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SignOutButtons } from '@/components/auth/SignOutButtons'
import { AccountDeletion } from '@/components/dashboard/AccountDeletion'
import { PasswordChange } from '@/components/dashboard/PasswordChange'
import { RefreshSession } from '@/components/dashboard/RefreshSession'
import { body, display } from '@/components/direct-edit/fonts'
import { ACCOUNT_ONBOARDING_PAGE } from '@/lib/auth/return-to'
import { requireArtist } from '@/lib/auth/session'
import { readPasswordChangeMode } from '@/lib/dashboard/change-password'
import { confirmationMode } from '@/lib/dashboard/deletion-confirmation'
import { requestUser } from '@/lib/dashboard/request'
import { ACCOUNT_PATH, editPath } from '@/lib/direct-edit/edit-mode'
import { deleteMyAccountAction } from '../profil/deletion-actions'
import { changeMyPasswordAction, requestSetPasswordLinkAction } from '../profil/password-actions'

// Read per request: it depends on the session, and the build has no database.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Mon compte', robots: { index: false, follow: false } }

/**
 * Her account (issue 1022): what concerns her and not her page. The two ways out of the space, the password
 * and the deletion of the account, moved from the cards of the old space. Private and `no-store` like the whole
 * space (`/auth/profil` and its sub-paths): the page reads her session and nothing of her profile.
 */
export default async function AccountPage() {
	const artist = await requireArtist(ACCOUNT_PATH)
	const context = await requestUser()
	if (context === null) return redirect(ACCOUNT_ONBOARDING_PAGE)
	return (
		<main
			className={`${display.variable} ${body.variable} mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 font-body text-ink`}
		>
			<RefreshSession expire={artist.expire} />
			<Link
				href={editPath()}
				data-testid="retour-profil"
				className="inline-flex min-h-11 w-fit items-center font-semibold text-sm underline focus-visible:outline-2 focus-visible:outline-lipstick focus-visible:outline-offset-2"
			>
				Retour à mon profil
			</Link>
			<h1 className="font-display font-medium text-3xl sm:text-4xl">Mon compte</h1>
			<section aria-labelledby="mon-compte-sortie" data-testid="mon-compte" className="flex flex-col gap-4">
				<h2 id="mon-compte-sortie" className="font-semibold text-lg">
					Me déconnecter
				</h2>
				<SignOutButtons />
			</section>
			<PasswordChange
				mode={await readPasswordChangeMode(context.payload, artist.id)}
				envoyer={changeMyPasswordAction}
				demanderLien={requestSetPasswordLinkAction}
			/>
			<AccountDeletion mode={confirmationMode(context.utilisateur)} envoyer={deleteMyAccountAction} />
		</main>
	)
}
