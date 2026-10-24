import type { PreviewState } from '@/lib/dashboard/preview'
import { editPath } from '@/lib/direct-edit/edit-mode'
import { ViewLink } from './ViewLink'

/**
 * The banner above the preview of her own page (ticket 139): what a visitor sees below, where her
 * profile stands, and the way back to her page in edit mode (issue 1022: her space is her profile).
 * A server component: it shows what it is given.
 */
export function PreviewBanner({ etat }: { etat: PreviewState }) {
	const alert = etat.code !== 'complet'
	return (
		<section
			aria-label="Aperçu de ton profil"
			data-testid="bandeau-apercu"
			data-etat={etat.code}
			className={`border-b ${alert ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-indigo-200 bg-indigo-50 text-indigo-900'}`}
		>
			<div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 md:px-8">
				<p className="min-w-0 flex-1 basis-64">
					<strong className="font-semibold">{etat.titre}</strong> {etat.texte}
				</p>
				<ViewLink
					vue="edition"
					href={editPath()}
					data-testid="modifier-sur-ma-page"
					className="flex min-h-[44px] items-center rounded-lg px-2 font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
				>
					Modifier ma page
				</ViewLink>
			</div>
		</section>
	)
}
