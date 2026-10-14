import Image from 'next/image'
import { IconeCoeur, IconeEtoile } from '@/components/blocs/icones'

/** A card drawn for the home page: grey bars where a real card has its texts, never a real profile. */
export function CarteDeDemonstration({ src, coeur }: { src: string; coeur: boolean }) {
	return (
		<div
			className="relative flex h-auto w-40 flex-col gap-2 rounded-xl bg-white pb-4 shadow-2xl sm:w-[200px]"
			aria-hidden="true"
		>
			<div className="relative h-[120px] sm:h-[150px]">
				<Image src={src} fill sizes="200px" className="rounded-t-xl object-cover" alt="" />
			</div>
			{coeur && (
				<div className="absolute top-0 right-0 flex items-center justify-center">
					<IconeCoeur className="mt-2 mr-2 h-6 w-6 text-red-600" />
				</div>
			)}
			<div className="mt-2 flex w-full items-center justify-center gap-1 px-4">
				<div className="h-4 w-full rounded bg-gray-100 px-4" />
			</div>
			<div className="flex w-full items-center justify-center gap-1 px-4">
				<div className="h-4 w-full rounded bg-gray-100 px-4" />
				<div className="h-4 w-full rounded bg-gray-100 px-4" />
				<div className="h-4 w-full rounded bg-gray-100 px-4" />
			</div>
			<div className="flex w-full items-center justify-center gap-1 px-4">
				<div className="h-4 w-full rounded bg-gray-100 px-4" />
				<div className="flex h-4 w-full items-center justify-end rounded">
					{[0, 1, 2, 3, 4].map(rang => (
						<IconeEtoile key={rang} className="h-4 w-4 text-yellow-500/90" />
					))}
				</div>
			</div>
		</div>
	)
}
