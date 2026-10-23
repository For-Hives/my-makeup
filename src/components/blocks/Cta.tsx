import Image from 'next/image'
import { TrackedLink } from '@/components/analytics/TrackedLink'

/** The call to action that closes the pages: look for a makeup artist, or be one. */
export function Cta() {
	return (
		<div className="relative isolate w-full overflow-x-clip bg-indigo-900 py-10 md:py-20">
			<div
				aria-hidden="true"
				className="absolute top-0 left-0 -z-10 h-full w-full scale-125 transform md:scale-150 xl:scale-125 2xl:scale-100"
			>
				<div className="flex h-full w-full scale-125 scale-y-150 transform items-center justify-center md:scale-100">
					<Image className="-z-10 scale-150 transform object-cover md:scale-100" alt="" fill src="/assets/blob.svg" />
				</div>
			</div>
			<div className="relative mx-auto max-w-7xl px-4 py-40 md:px-0 md:py-64">
				<div className="z-20 mx-auto flex w-full flex-col gap-8 md:w-2/3 md:gap-16 xl:w-1/2">
					<h2 className="text-center font-bold text-2xl text-white tracking-tight sm:text-4xl sm:leading-snug md:text-4xl">
						Rejoignez&nbsp;My-Makeup, la communauté qui fait la différence.
					</h2>
					<div className="flex flex-col items-center justify-center gap-6 px-8 md:flex-row md:items-start md:gap-8">
						<TrackedLink
							suivi={{ nom: 'cta_click', proprietes: { where: 'cta_recherche' } }}
							href="/search"
							className="btn-secondary-white flex w-full items-center justify-center text-center sm:w-2/3 md:w-auto"
						>
							Je cherche des maquilleuses
						</TrackedLink>
						<TrackedLink
							suivi={{ nom: 'cta_click', proprietes: { where: 'cta_inscription' } }}
							href="/auth/signup"
							className="btn-secondary-white-bordered flex w-full items-center justify-center text-center sm:w-2/3 md:w-auto"
						>
							Je suis maquilleuse
						</TrackedLink>
					</div>
				</div>
			</div>
		</div>
	)
}
