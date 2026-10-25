import type { Tint } from '@/components/art/CapsuleImage'
import { CapsuleImage } from '@/components/art/CapsuleImage'
import type { MakeupObjectName } from '@/components/art/drawings'
import { ArticleHeading, ArtLead, ArtSignature } from './ArtPage'
import { TitleWithAccent } from './EditorialArticle'

export interface PageSection {
	titre: string
	texte: string
}

export interface PageContent {
	/** The title of the article, under the head of the page: the head holds the only h1. */
	titre: string
	introduction: string
	parties: readonly PageSection[]
}

const TRAILING_EMOJI = /\s*\p{Extended_Pictographic}(?:\p{Extended_Pictographic}|\u{FE0F}|\u{200D})*$/u

/** The titles of the parts without their closing emoji: the phrases a banner can carry (the page's own words, nothing new). */
export function partTitles(contenu: PageContent): string[] {
	return contenu.parties.map(({ titre }) => titre.replace(TRAILING_EMOJI, ''))
}

const OBJECTS: readonly MakeupObjectName[] = ['brush', 'lipstick', 'compact', 'mirror', 'mascara', 'perfume']
const TINTS: readonly Tint[] = ['blush', 'lavender', 'sand', 'rose']

/**
 * The text of a fixed page for makeup artists: the heading and the lead on the left of a wide screen (the heading
 * stays in view), then the parts one under the other, each a row (a round capsule that holds a drawn object, its title,
 * its text, a hairline between). It sits under the head of the page, which carries the only h1; the old pages had a
 * second h1 here (« 1 h1 par page »). `eyebrow` is the label of the menu the page belongs to. The capsules are
 * decoration: the words carry the meaning.
 */
export function PageArticle({ contenu, eyebrow }: { contenu: PageContent; eyebrow: string }) {
	return (
		<article className="px-4 pb-16 sm:px-6 md:pb-24 lg:px-8">
			<div className="mx-auto grid max-w-7xl gap-12 rounded-art-frame border border-nude-200 bg-white px-6 py-14 md:px-16 md:py-20 lg:grid-cols-12 lg:gap-20">
				<div className="lg:sticky lg:top-28 lg:col-span-5 lg:self-start">
					<ArticleHeading eyebrow={eyebrow} title={contenu.titre} />
					<div className="reveal mt-8">
						<ArtLead>{contenu.introduction}</ArtLead>
					</div>
				</div>
				<div className="lg:col-span-7">
					<div className="border-ink/20 border-t">
						{contenu.parties.map((partie, index) => (
							<section
								key={partie.titre}
								className="reveal grid grid-cols-[3.5rem_1fr] gap-x-5 gap-y-3 border-ink/20 border-b py-9 sm:grid-cols-[4.5rem_1fr] sm:gap-x-7"
							>
								<span aria-hidden="true" className="pt-1 text-[2.6rem] text-indigo-900 sm:text-[3.4rem]">
									<CapsuleImage
										shape="round"
										tint={TINTS[index % TINTS.length] ?? 'blush'}
										object={OBJECTS[index % OBJECTS.length] ?? 'brush'}
										className="-ml-0.5"
									/>
								</span>
								<div>
									<h3 className="font-display font-medium text-2xl leading-snug tracking-tight">
										<TitleWithAccent text={partie.titre} />
									</h3>
									<p className="mt-3 max-w-[56ch] text-base text-mute leading-7">{partie.texte}</p>
								</div>
							</section>
						))}
					</div>
					<ArtSignature />
				</div>
			</div>
		</article>
	)
}
