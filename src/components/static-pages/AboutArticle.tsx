import { ArchImage } from '@/components/art/ArchImage'
import type { Tint } from '@/components/art/CapsuleImage'
import { GlowBlob, PrintMark } from '@/components/art/graphics'
import { ArtEyebrow, ArtSignature } from './ArtPage'
import { TitleWithAccent } from './EditorialArticle'
import type { PageContent } from './PageArticle'

const TINTS: readonly Tint[] = ['lavender', 'blush', 'sand', 'rose']

/**
 * The text of « À propos », layout D of the kit (a statement beside two arches) then its four parts in a grid of
 * tinted cards. The first paragraph is the mission of the team, set large in Bodoni: it is the page's own text, not a
 * quotation, so it carries no quotation marks and no `blockquote`. The two arches hold painted illustrations (the
 * slots a future AI portrait can fill, change the two `src`); the second sits lower than the first. Layout D
 * is used on this page only.
 */
export function AboutArticle({ contenu, eyebrow }: { contenu: PageContent; eyebrow: string }) {
	return (
		<article>
			<div className="relative isolate overflow-hidden px-4 py-16 sm:px-6 md:py-28 lg:px-8">
				<GlowBlob size="md" tone="indigo" className="top-1/2 -right-60 -translate-y-1/2" />
				<div className="relative mx-auto grid max-w-7xl items-center gap-12 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)] md:gap-24">
					<div className="mx-auto grid w-full max-w-[320px] grid-cols-2 gap-6 pr-3 md:mx-0 md:max-w-none">
						<ArchImage
							src="/assets/back/maquilleuse_italienne_white.webp"
							alt=""
							tint="blush"
							band="band"
							size="sm"
							mark="ring"
							sizes="(min-width: 768px) 180px, 140px"
						/>
						<div className="mt-12">
							<ArchImage
								src="/assets/back/maquilleuse_africaine_white.webp"
								alt=""
								tint="lavender"
								band="rose"
								size="sm"
								mark={false}
								sizes="(min-width: 768px) 180px, 140px"
							/>
						</div>
					</div>
					<div>
						<ArtEyebrow className="mb-5">{eyebrow}</ArtEyebrow>
						<h2 className="reveal text-balance font-display font-medium text-3xl leading-[1.1] tracking-tight md:text-4xl lg:text-[2.6rem]">
							{contenu.titre}
						</h2>
						<p className="reveal mt-8 max-w-[44ch] text-pretty font-display text-2xl text-ink leading-[1.3] md:text-[1.75rem]">
							{contenu.introduction}
						</p>
					</div>
				</div>
			</div>
			<div className="px-4 pb-16 sm:px-6 md:pb-24 lg:px-8">
				<div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-2">
					{contenu.parties.map((partie, index) => (
						<section
							key={partie.titre}
							data-tint={TINTS[index % TINTS.length]}
							className="reveal relative overflow-hidden rounded-art-frame bg-(--tint) px-7 py-10 text-art-blush-ink md:px-10 md:py-12"
						>
							<h3 className="font-display font-medium text-2xl text-ink leading-snug tracking-tight md:text-3xl">
								<TitleWithAccent text={partie.titre} />
							</h3>
							<p className="mt-4 max-w-[48ch] text-base text-ink/80 leading-7">{partie.texte}</p>
							{index === 0 && (
								<span aria-hidden="true" className="absolute top-6 right-7 text-indigo-700">
									<PrintMark kind="plus" className="h-5 w-5" />
								</span>
							)}
						</section>
					))}
				</div>
				<div className="mx-auto max-w-7xl px-2">
					<ArtSignature />
				</div>
			</div>
		</article>
	)
}
