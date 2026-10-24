import type { ReactNode } from 'react'
import { Cta } from '@/components/blocks/Cta'
import { Hero } from '@/components/blocks/Hero'
import { ArticleShell, ContentPage, Lead, TeamSignature, TitleWithAccent } from './EditorialArticle'

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
 * to action that closes the pages. The article title that was a second h1 on the site online is a h2. The steps are
 * a numbered list: the figure is a drawing (the list itself numbers them for a screen reader).
 */
export function ClientGuide({ contenu }: { contenu: GuideContent }) {
	return (
		<ContentPage>
			<Hero image={contenu.image} titre={contenu.titre} description={contenu.description} />
			<ArticleShell eyebrow="Particulier" title={contenu.titreDeLArticle}>
				<Lead>{contenu.introduction}</Lead>
				<ol className="mt-12 flex list-none flex-col border-gray-200 border-t p-0">
					{contenu.etapes.map((etape, index) => (
						<li
							key={etape.titre}
							data-step={index + 1}
							className="reveal grid gap-3 border-gray-200 border-b py-9 sm:grid-cols-[4.5rem_1fr] sm:gap-6"
						>
							<div
								aria-hidden="true"
								className="font-display font-medium text-4xl text-indigo-900 leading-none tabular-nums sm:text-5xl"
							>
								{String(index + 1).padStart(2, '0')}
							</div>
							<div>
								<h3 className="font-display font-medium text-2xl text-gray-900 leading-snug tracking-tight">
									<TitleWithAccent text={etape.titre} />
								</h3>
								<p className="mt-3 max-w-[66ch] text-base text-gray-700 leading-7">{etape.texte}</p>
							</div>
						</li>
					))}
				</ol>
				<TeamSignature />
			</ArticleShell>
			<Cta />
		</ContentPage>
	)
}
