import type { ReactNode } from 'react'
import { ArticleHeading, ArtPage } from '@/components/static-pages/ArtPage'
import { PageHead } from '@/components/static-pages/PageHead'

interface LegalPageProps {
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
 * The shell of the three legal pages (ticket 112, laid out again in issue 1102): the head of the page (the kit's `PageHead`, on the paper: the white `Hero` made a band, 25/10/2026), then the text in
 * one column at a reading measure. The project has no typography plugin, so the styles of the text are written here,
 * on the elements the pages use. No word is added around the text: the legal pages are held to the character
 * (tests/fixtures/legal-pages-text.json).
 */
export function LegalPage({ titre, description, titreDuTexte, image, children }: LegalPageProps) {
	return (
		<ArtPage>
			<PageHead title={titre} description={description} {...(image ? { image } : {})} />
			<div className="relative mx-auto max-w-4xl px-6 pb-24">
				<article className="rounded-art-frame bg-white px-6 py-10 sm:px-12 sm:py-14">
					<ArticleHeading title={titreDuTexte} />
					<div
						className={[
							'mt-8 text-base text-mute leading-7 xl:text-lg xl:leading-8',
							'[&_h2]:mt-14 [&_h2]:mb-4 [&_h2]:border-art-line [&_h2]:border-t [&_h2]:pt-8 [&_h2]:font-display [&_h2]:font-medium [&_h2]:text-2xl [&_h2]:text-ink [&_h2]:tracking-tight',
							'[&_p]:my-4 [&_p]:max-w-[68ch] [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:my-1.5 [&_li]:max-w-[68ch] [&_li]:marker:text-indigo-900',
							'[&_a]:text-indigo-800 [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-indigo-950',
							'break-words',
						].join(' ')}
					>
						{children}
					</div>
				</article>
			</div>
		</ArtPage>
	)
}
