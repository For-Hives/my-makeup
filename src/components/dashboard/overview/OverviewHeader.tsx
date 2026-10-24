import { ViewLink } from '@/components/dashboard/ViewLink'
import { PREVIEW_PATH } from '@/lib/dashboard/preview'
import { editPath } from '@/lib/direct-edit/edit-mode'
import { SECONDARY } from './card'

const PRIMARY =
	'inline-flex min-h-12 w-full items-center justify-center rounded-full border border-[#B0294A] bg-[#B0294A] px-8 font-semibold text-base text-white focus-visible:outline-2 focus-visible:outline-[#B0294A] focus-visible:outline-offset-2 sm:w-auto'
const SECOND =
	'inline-flex min-h-12 w-full items-center justify-center rounded-full border border-[#1A1417] bg-white px-8 font-semibold text-[#1A1417] text-base focus-visible:outline-2 focus-visible:outline-[#1A1417] focus-visible:outline-offset-2 sm:w-auto'

/**
 * The top of « Mon espace » (issue 1073): who she is greeted as, and the way to her profile, which is changed in the edit
 * mode and nowhere else. « Modifier mon profil » is the one lipstick button of the page; « Voir ma page » shows it as a
 * visitor sees it. Each link counts one `profile_visibility` (ticket 147).
 */
export function OverviewHeader({ greeting }: { greeting: string }) {
	return (
		<header className="flex flex-col gap-4">
			<div>
				<h1 className="font-display font-medium text-3xl text-[#1A1417] sm:text-4xl">Mon espace</h1>
				<p className={`mt-1 ${SECONDARY}`}>{greeting}</p>
			</div>
			<div className="flex flex-col gap-3 sm:flex-row">
				<ViewLink vue="edition" href={editPath()} data-testid="modifier-mon-profil" className={PRIMARY}>
					Modifier mon profil
				</ViewLink>
				<ViewLink vue="publique" href={PREVIEW_PATH} data-testid="voir-mon-profil-public" className={SECOND}>
					Voir ma page
				</ViewLink>
			</div>
		</header>
	)
}
