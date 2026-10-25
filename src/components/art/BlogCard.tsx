import Link from 'next/link'
import { articleDate } from '@/components/blog/article-date'
import type { ListedArticle } from '@/services/public/article-list'
import type { Tint } from './CapsuleImage'
import { MAKEUP_OBJECTS, type MakeupObjectName } from './generated-art'
import { MakeupObject } from './graphics'

const TINTS: readonly Tint[] = ['blush', 'lavender', 'sand', 'rose', 'indigo']
const OBJECTS = Object.keys(MAKEUP_OBJECTS) as MakeupObjectName[]

/** A stable pick from the slug: the same article always gets the same tint and the same drawing. */
function pick<T>(slug: string, list: readonly T[], salt: number): T {
	let hash = salt
	for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
	return list[hash % list.length] as T
}

/**
 * A blog card of the kit: a rounded panel in a soft tint with a hairline inside and a drawn makeup object (articles have
 * no picture today, so the panel is honest about it: a drawing, never a fake photo), the date, the title in Bodoni, the
 * excerpt. Takes the data of the blog list. The title is the one link and stretches over the card; the date is a `<time>`.
 * `variant="feature"` lays it out in two columns for the first article. A list wraps it in `<li className="reveal">`.
 */
export function BlogCard({
	article,
	variant = 'card',
	headingLevel = 3,
}: {
	article: ListedArticle
	variant?: 'card' | 'feature'
	headingLevel?: 2 | 3
}) {
	const Heading = headingLevel === 2 ? 'h2' : 'h3'
	const feature = variant === 'feature'
	const date = articleDate(article.publieLe)
	return (
		<article
			data-blog-card
			className={`card-hover group relative grid content-start gap-4 ${feature ? 'items-center gap-6 md:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] md:gap-14' : ''}`}
		>
			<div
				aria-hidden="true"
				data-tint={pick(article.slug, TINTS, 7)}
				className={`relative isolate overflow-hidden bg-(--tint) after:pointer-events-none after:absolute after:inset-2.5 after:border after:border-white/70 ${feature ? 'aspect-[4/3] rounded-[28px] after:rounded-[20px]' : 'aspect-[5/4] rounded-[22px] after:rounded-[14px]'}`}
			>
				<span className="card-zoom absolute inset-[18%_30%] block text-indigo-900 opacity-90">
					<MakeupObject name={pick(article.slug, OBJECTS, 3)} />
				</span>
			</div>
			<div className="grid gap-3">
				{date && (
					<p className="flex flex-wrap items-center gap-x-3.5 text-[14px] text-mute">
						<time dateTime={article.publieLe ?? undefined}>{date}</time>
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
			</div>
		</article>
	)
}
