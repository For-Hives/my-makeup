import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { SearchBlock } from './SearchBlock'

interface PropsHero {
	/** The only h1 of the page. */
	titre: ReactNode
	description: ReactNode
	/** The picture on the right, under `public/`. */
	image?: string
	/** The search block, over the foot of the picture. */
	recherche?: boolean
	/** A button to the sign-up page under the text. */
	inscription?: boolean
	/**
	 * A form of its own under the text, in the flow of the page (the guided search of the home page): the
	 * floating search block is not shown, and the room it needed is not kept.
	 */
	formulaire?: ReactNode
	/**
	 * Components in place of the picture on the right (the drawing of the home page, issue 1066): they are not
	 * an image to fetch, so the text of the page is what the browser paints first. Their panel has its own diagonal
	 * edge (clip-path): the white one of the text side would cut the drawing.
	 */
	visuel?: ReactNode
}

/**
 * The head of a page: the h1, a line under it, and a picture. The block is shared by the home page
 * and by the fixed pages that open the same way.
 */
export function Hero({
	titre,
	description,
	image = '/assets/back.webp',
	recherche = true,
	inscription = false,
	formulaire,
	visuel,
}: PropsHero) {
	return (
		<div className="relative bg-white 2xl:pt-[90px]">
			{recherche && formulaire === undefined && (
				<div className="absolute bottom-0 left-1/2 z-20 flex w-full -translate-x-1/2 transform items-end justify-center px-4">
					<SearchBlock />
				</div>
			)}
			<div className="mx-auto max-w-7xl">
				<div className="relative z-10 lg:w-full lg:max-w-2xl">
					<svg
						className="absolute inset-y-0 right-8 hidden h-full w-full translate-x-1/2 transform fill-white lg:block"
						viewBox="0 0 100 100"
						preserveAspectRatio="none"
						aria-hidden="true"
					>
						<polygon points="0,0 90,0 50,100 0,100" />
					</svg>
					<div
						className={`relative z-10 px-6 py-12 pb-8 sm:py-24 sm:pb-24 lg:px-8 lg:pt-36 lg:pr-0 ${formulaire === undefined ? 'lg:pb-80' : 'lg:pb-24'}`}
					>
						<div className="mx-auto flex max-w-2xl flex-col gap-8 lg:mx-0 lg:max-w-xl">
							<div className="flex flex-col gap-4">
								<h1 className="font-bold text-2xl text-gray-900 tracking-tight sm:text-4xl md:text-5xl">{titre}</h1>
								<p className="text-gray-700 text-lg leading-8">{description}</p>
							</div>
							{formulaire}
							{inscription && (
								<div>
									<Link href="/auth/signin" className="btn-primary">
										S&apos;inscrire sur My-Makeup
									</Link>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
			{visuel === undefined ? (
				<div
					className={`bg-white ${formulaire === undefined ? 'pb-24 md:pb-8' : 'pb-8'} lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2 lg:pb-0`}
				>
					<Image
						className="aspect-[3/2] object-contain md:object-center lg:aspect-auto lg:h-full lg:w-full xl:object-top"
						width={1000}
						height={1000}
						priority
						// `priority` preloads the picture but does not raise its priority, and without `sizes` a phone of 1.75 dppx asked
						// the 2048 px copy of a picture drawn 412 px wide (issue 1033). The picture fills the width of the screen, then
						// the right half of it from 1024 px.
						fetchPriority="high"
						sizes="(min-width: 1024px) 50vw, 100vw"
						src={image}
						alt="trouver une maquilleuse professionnelle freelance"
					/>
				</div>
			) : (
				<div className="relative z-20 bg-indigo-50 px-4 py-10 lg:absolute lg:inset-y-0 lg:right-0 lg:flex lg:w-1/2 lg:items-center lg:justify-center lg:py-0 lg:pr-8 lg:pl-28 lg:[clip-path:polygon(18%_0,100%_0,100%_100%,0_100%)]">
					{visuel}
				</div>
			)}
		</div>
	)
}
