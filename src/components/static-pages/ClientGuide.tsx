import type { ReactNode } from 'react'
import type { ArchBand } from '@/components/art/ArchImage'
import type { Tint } from '@/components/art/CapsuleImage'
import { Cta } from '@/components/blocks/Cta'
import { GuideSearch } from '@/components/search/GuideSearch'
import { ArticleHeading, ArtLead, ArtPage, ArtSignature } from './ArtPage'
import { PageHead } from './PageHead'

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
	/** The tint behind the arch picture and the colour of its band. */
	tint?: Tint
	band?: ArchBand
	/** The long title of the article: a h2, under the h1 of the head block. */
	titreDeLArticle: string
	introduction: string
	etapes: readonly GuideStep[]
}

const TINTS: readonly Tint[] = ['blush', 'lavender', 'sand', 'rose']

/**
 * A guide page, layout E of the kit (steps in numbered capsules) under a head with the arch picture on the right
 * (layout A): the head block (its title is the only h1), the search, the article, then the call to action that closes
 * the pages. The article title that was a second h1 on the site online is a h2. The steps are a numbered list: the
 * figure is a capsule on a hairline (the list itself numbers them for a screen reader).
 */
export function ClientGuide({ contenu }: { contenu: GuideContent }) {
	return (
		<ArtPage>
			<PageHead
				title={contenu.titre}
				description={contenu.description}
				image={contenu.image}
				tint={contenu.tint ?? 'blush'}
				band={contenu.band ?? 'band'}
			/>
			<div className="relative z-10 mx-auto max-w-5xl px-6 pb-10 md:pb-14">
				<GuideSearch />
			</div>
			<article className="page-frame pb-16 md:pb-24">
				<div className="rounded-art-frame border border-nude-200 bg-white px-6 py-14 md:px-16 md:py-20">
					<ArticleHeading eyebrow="Particulier" title={contenu.titreDeLArticle} />
					<div className="reveal mt-8">
						<ArtLead>{contenu.introduction}</ArtLead>
					</div>
					<ol className="mt-20 grid list-none gap-x-16 gap-y-20 p-0 md:grid-cols-2">
						{contenu.etapes.map((etape, index) => (
							<li
								key={etape.titre}
								data-step={index + 1}
								className="reveal relative flex flex-col gap-4 border-ink/35 border-t"
							>
								<div
									aria-hidden="true"
									data-tint={TINTS[index % TINTS.length]}
									className="relative -mt-7 mb-2 grid h-14 w-28 place-items-center rounded-full bg-(--tint) font-display font-medium text-3xl text-indigo-900 italic shadow-[0_0_0_3px_#fff,5px_6px_0_3px_var(--color-indigo-200)] after:absolute after:inset-[5px] after:rounded-full after:border after:border-white/90"
								>
									{index + 1}
								</div>
								<h3 className="font-display font-medium text-2xl leading-tight tracking-tight">{etape.titre}</h3>
								<p className="max-w-[56ch] text-base text-mute leading-7">{etape.texte}</p>
							</li>
						))}
					</ol>
					<ArtSignature />
				</div>
			</article>
			<Cta />
		</ArtPage>
	)
}
