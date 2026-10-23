import type { ReactNode } from 'react'
import { Cta } from '@/components/blocks/Cta'
import { Hero } from '@/components/blocks/Hero'

/** One step of a guide: a heading, then its text. */
export interface GuideStep {
	titre: string
	texte: string
}

/** The text of a guide page for the people looking for a makeup artist (plan 01 §3.1). */
export interface GuideContent {
	/** The only h1 of the page, in the head block. */
	titre: ReactNode
	description: ReactNode
	/** The picture of the head block, under `public/`. */
	image: string
	/** The long title of the article: a h2, under the h1 of the head block. */
	titreDeLArticle: string
	introduction: string
	etapes: readonly GuideStep[]
}

/**
 * A guide page: the head block of the home page (its title is the only h1), the article, then the call
 * to action that closes the pages. The article title that was a second h1 on the site online is a h2.
 */
export function ClientGuide({ contenu }: { contenu: GuideContent }) {
	return (
		<main className="relative">
			<Hero image={contenu.image} titre={contenu.titre} description={contenu.description} />
			<div className="relative mx-auto my-24 max-w-7xl px-4 md:my-48 md:px-0">
				<div className="mx-auto max-w-2xl">
					<article>
						<header className="flex flex-col">
							<h2 className="mt-6 font-bold text-3xl text-gray-800 tracking-tight sm:text-4xl">
								{contenu.titreDeLArticle}
							</h2>
						</header>
						<div className="my-8 text-base text-gray-700 leading-7 xl:text-lg xl:leading-8">
							<p>{contenu.introduction}</p>
							<ul className="mt-8 flex list-none flex-col gap-8 p-0">
								{contenu.etapes.map(etape => (
									<li key={etape.titre}>
										<h3 className="font-semibold text-gray-900 text-xl">{etape.titre}</h3>
										<p className="mt-2">{etape.texte}</p>
									</li>
								))}
							</ul>
						</div>
						<p className="flex items-center text-base text-gray-600">
							<span className="h-4 w-0.5 rounded-full bg-gray-200" />
							<span className="ml-3">L&apos;équipe My-Makeup</span>
						</p>
					</article>
				</div>
			</div>
			<Cta />
		</main>
	)
}
