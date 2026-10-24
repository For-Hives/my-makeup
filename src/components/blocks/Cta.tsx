import { TrackedLink } from '@/components/analytics/TrackedLink'
import { CtaBackdrop } from './CtaBackdrop'
import { ArrowUpRightIcon } from './icons'

const BUTTON =
	'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border-2 border-white px-6 py-3 text-center font-bold text-base leading-6 focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-4 sm:w-auto'

/**
 * The call to action that closes the pages: look for a makeup artist, or be one (issue 1067). A frame in the
 * indigo of the public site, over a background that moves only when it can (CtaBackdrop); the text and the two
 * buttons do not depend on it. The lipstick red is not used: it is for what a makeup artist can change.
 */
export function Cta() {
	return (
		<section className="px-4 py-12 md:px-8 md:py-20">
			<div className="relative isolate mx-auto max-w-5xl overflow-hidden rounded-2xl bg-indigo-900 px-6 py-12 shadow-lg sm:px-14 sm:py-16">
				<CtaBackdrop />
				<div className="relative flex flex-col items-start gap-8">
					<div className="flex max-w-2xl flex-col gap-4">
						<h2 className="text-balance font-bold text-3xl text-white tracking-tight sm:text-4xl md:text-5xl md:leading-tight">
							Rejoignez&nbsp;<span className="whitespace-nowrap">My-Makeup</span>, la communauté qui fait la différence.
						</h2>
						<p className="text-balance text-lg text-white leading-8 sm:text-xl">
							Que vous cherchiez une maquilleuse ou que vous le soyez : la recherche est gratuite, et la page
							professionnelle l&apos;est aussi.
						</p>
					</div>
					<div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:gap-4">
						<TrackedLink
							suivi={{ nom: 'cta_click', proprietes: { where: 'cta_recherche' } }}
							href="/search"
							className={`${BUTTON} bg-white text-indigo-900 hover:bg-indigo-50`}
						>
							Trouver ma maquilleuse
							<ArrowUpRightIcon className="h-5 w-5" />
						</TrackedLink>
						<TrackedLink
							suivi={{ nom: 'cta_click', proprietes: { where: 'cta_inscription' } }}
							href="/auth/signup"
							className={`${BUTTON} bg-transparent text-white hover:bg-white/10`}
						>
							Je suis maquilleuse
						</TrackedLink>
					</div>
				</div>
			</div>
		</section>
	)
}
