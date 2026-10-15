import type { ReactNode } from 'react'
import { Hero } from '@/components/blocs/Hero'

interface PropsPageJuridique {
	/** The only h1 of the page. */
	titre: ReactNode
	/** The line under the h1. */
	description: string
	/** The h2 that opens the text. */
	titreDuTexte: string
	/** The picture of the head of the page. */
	image?: string
	children: ReactNode
}

/**
 * The shell of the three legal pages (ticket 112): the head of the page, then the text. The project
 * has no typography plugin, so the styles of the text are written here, on the elements the pages use.
 */
export function PageJuridique({ titre, description, titreDuTexte, image, children }: PropsPageJuridique) {
	return (
		<main className="relative">
			<Hero titre={titre} description={description} recherche={false} {...(image ? { image } : {})} />
			<div className="relative mx-auto my-24 max-w-7xl px-4 md:my-48 md:px-0">
				<div className="mx-auto max-w-2xl">
					<article>
						<header className="flex flex-col">
							<h2 className="mt-6 font-bold text-3xl text-gray-800 tracking-tight sm:text-4xl">{titreDuTexte}</h2>
						</header>
						<div
							className={[
								'my-8 text-base text-gray-700 leading-7 xl:text-lg xl:leading-8',
								'[&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:font-bold [&_h2]:text-2xl [&_h2]:text-gray-900 [&_h2]:tracking-tight',
								'[&_p]:my-4 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:my-1',
								'[&_a]:text-indigo-700 [&_a]:underline [&_a:hover]:text-indigo-900',
								'break-words',
							].join(' ')}
						>
							{children}
						</div>
					</article>
				</div>
			</div>
		</main>
	)
}
