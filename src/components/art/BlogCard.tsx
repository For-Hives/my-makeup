import Link from 'next/link'
import { articleDate } from '@/components/blog/article-date'
import type { ListedArticle } from '@/services/public/article-list'
import { blogArt } from './blog-art'
import { GlowBlob, Icon, LineDrawing, MakeupObject, PrintMark } from './graphics'

/** Where the arch, the object and the second object sit, by side: they swap sides so a row of cards is not a row of copies. */
const LAYOUT = {
	left: {
		arch: 'left-[8%]',
		object: 'left-[13%] w-[38%]',
		second: 'right-[9%] bottom-[11%]',
		drawing: 'right-[6%] top-[8%]',
		marks: ['top-4 right-5', 'bottom-5 left-5'],
	},
	right: {
		arch: 'right-[8%]',
		object: 'right-[13%] w-[38%]',
		second: 'left-[9%] bottom-[11%]',
		drawing: 'left-[6%] top-[8%]',
		marks: ['top-4 left-5', 'bottom-5 right-5'],
	},
} as const

const PANEL_SHAPE = {
	card: 'aspect-[5/4] rounded-[22px] after:rounded-[14px]',
	feature: 'aspect-[4/3] rounded-[28px] after:rounded-[20px]',
	cover: 'aspect-[16/7] rounded-[28px] after:rounded-[20px]',
} as const

/**
 * The drawn panel of an article (articles have no picture today, so the panel is honest about it: a drawing, never a
 * fake photo). A soft tint, a hairline inside, an arch, a makeup object with a smaller one beside it, two print marks
 * and a diffuse glow; the large ones (`feature`, and `cover` at the head of an article) add a one-line drawing. Everything is chosen from the slug (`blogArt`) and is
 * hidden from screen readers.
 */
export function BlogPanel({ slug, shape = 'card' }: { slug: string; shape?: 'card' | 'feature' | 'cover' }) {
	const art = blogArt(slug)
	const layout = LAYOUT[art.side]
	return (
		<div
			aria-hidden="true"
			data-tint={art.tint}
			data-panel
			className={`relative isolate overflow-hidden bg-(--tint) after:pointer-events-none after:absolute after:inset-2.5 after:z-10 after:border after:border-white/70 ${PANEL_SHAPE[shape]}`}
		>
			<GlowBlob
				size="sm"
				tone={art.tint === 'indigo' || art.tint === 'lavender' ? 'indigo' : 'rose'}
				className="-top-24 -right-20 opacity-60"
			/>
			{shape !== 'card' && (
				<span className={`absolute h-[34%] w-[34%] text-white/70 ${layout.drawing}`}>
					<LineDrawing name={art.drawing} />
				</span>
			)}
			<span
				className={`absolute bottom-0 h-[78%] w-[46%] rounded-t-full border border-white/80 border-b-0 bg-white/30 ${layout.arch}`}
			/>
			<span
				className={`card-zoom absolute inset-y-[14%] block text-indigo-900 opacity-90 ${layout.object}`}
				style={{ rotate: `${art.tilt}deg` }}
			>
				<MakeupObject name={art.object} />
			</span>
			<span
				className={`absolute block h-[34%] w-[16%] text-indigo-900/55 ${layout.second}`}
				style={{ rotate: `${art.secondTilt}deg` }}
			>
				<MakeupObject name={art.second} />
			</span>
			<span className={`absolute text-indigo-900/60 ${layout.marks[0]}`}>
				<PrintMark kind={art.marks[0]} className="h-4 w-4" />
			</span>
			<span className={`absolute text-indigo-900/60 ${layout.marks[1]}`}>
				<PrintMark kind={art.marks[1]} className="h-3.5 w-3.5" />
			</span>
		</div>
	)
}

/** « Lire l'article » and its arrow: decoration, the link is the title (its name is the title alone). */
function ReadMore() {
	return (
		<span aria-hidden="true" className="mt-1 inline-flex items-center gap-2.5 font-medium text-[15px] text-indigo-800">
			<span className="read-more-label relative">Lire l&apos;article</span>
			<Icon name="arrow-right" className="read-more-arrow h-5 w-5" />
		</span>
	)
}

/**
 * A blog card of the kit: the drawn panel (`BlogPanel`), the date, the title in Bodoni, the excerpt, « Lire l'article ».
 * Takes the data of the blog list. The title is the one link and stretches over the card; the date is a `<time>`.
 * `variant="feature"` lays it out in two columns for the first article, with `label` (« Dernier article ») above the
 * date. A list wraps it in `<li className="reveal">`.
 */
export function BlogCard({
	article,
	variant = 'card',
	headingLevel = 3,
	label,
}: {
	article: ListedArticle
	variant?: 'card' | 'feature'
	headingLevel?: 2 | 3
	label?: string
}) {
	const Heading = headingLevel === 2 ? 'h2' : 'h3'
	const feature = variant === 'feature'
	const date = articleDate(article.publieLe)
	const hook = feature ? { 'data-featured': '' } : { 'data-article-card': '' }
	return (
		<article
			{...hook}
			data-blog-card
			className={`card-hover group relative grid content-start gap-4 ${feature ? 'items-center gap-6 md:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] md:gap-14' : ''}`}
		>
			<BlogPanel slug={article.slug} shape={feature ? 'feature' : 'card'} />
			<div className={`grid gap-3 ${feature ? '' : 'content-start'}`}>
				{(date || label) && (
					<p className="flex flex-wrap items-center gap-x-3.5 gap-y-2 text-[14px] text-mute">
						{label && (
							<span className="rounded-full bg-art-blush px-3.5 py-1 font-medium text-[13px] text-art-blush-ink">
								{label}
							</span>
						)}
						{date && <time dateTime={article.publieLe ?? undefined}>{date}</time>}
					</p>
				)}
				<Heading
					className={`text-balance font-display font-medium text-ink ${feature ? 'text-3xl leading-[1.06] md:text-5xl' : 'text-[25px] leading-[1.14]'}`}
				>
					<Link
						href={`/blog/${article.slug}`}
						className="after:absolute after:inset-0 hover:text-indigo-700 hover:no-underline focus-visible:outline-2 focus-visible:outline-indigo-700 focus-visible:outline-offset-4"
					>
						{article.titre}
					</Link>
				</Heading>
				{article.extrait && (
					<p className={`line-clamp-4 text-mute ${feature ? 'max-w-[48ch] text-lg' : ''}`}>{article.extrait}</p>
				)}
				<ReadMore />
			</div>
		</article>
	)
}
