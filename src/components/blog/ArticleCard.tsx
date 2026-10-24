import Link from 'next/link'
import { ArrowUpRightIcon } from '@/components/blocks/icons'
import type { ListedArticle } from '@/services/public/article-list'
import { articleDate } from './article-date'

/** The eyebrow of a card: its date, when the article has one. Small capitals, never a made-up category. */
function Eyebrow({ article, label }: { article: ListedArticle; label?: string }) {
	const date = articleDate(article.publieLe)
	if (!date && !label) return null
	return (
		<p className="flex flex-wrap items-center gap-x-3 text-gray-700 text-xs uppercase tracking-[0.14em]">
			{label && <span className="font-semibold text-indigo-900">{label}</span>}
			{label && date && <span aria-hidden="true" className="h-3 w-px bg-gray-300" />}
			{date && <time dateTime={article.publieLe ?? undefined}>{date}</time>}
		</p>
	)
}

/** « Lire l'article » and its arrow: decorative, the link is the title (its name is the title alone). */
function ReadMore() {
	return (
		<span
			aria-hidden="true"
			className="mt-auto inline-flex items-center gap-1.5 pt-6 font-semibold text-indigo-900 text-sm"
		>
			Lire l&apos;article
			<ArrowUpRightIcon className="motion-arrow h-4 w-4" />
		</span>
	)
}

/**
 * A card of the grid: a thin indigo rule on top, the date, the title in the display type, the excerpt.
 * The title is the one link; it stretches over the card, so the whole card is a target and a screen
 * reader hears the title only. `level` is the heading level (h2 on the list, h3 under « À lire aussi »).
 */
export function ArticleCard({ article, level = 2 }: { article: ListedArticle; level?: 2 | 3 }) {
	const Heading = level === 2 ? 'h2' : 'h3'
	return (
		<li className="reveal">
			<article
				data-article-card
				className="card-hover group relative flex h-full flex-col border border-gray-200 border-t-2 border-t-indigo-900 bg-white p-6 md:p-7"
			>
				<Eyebrow article={article} />
				<Heading className="mt-4 text-balance font-display font-medium text-2xl text-gray-900 leading-snug">
					<Link
						href={`/blog/${article.slug}`}
						className="after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-indigo-700 focus-visible:outline-offset-4"
					>
						{article.titre}
					</Link>
				</Heading>
				{article.extrait && <p className="mt-3 line-clamp-4 text-gray-700 leading-7">{article.extrait}</p>}
				<ReadMore />
			</article>
		</li>
	)
}

/**
 * The first article of the list, large: a panel with the first letter of its title (the articles have
 * no picture today, and a letter is all the title can honestly give), then the date, the title, the
 * excerpt. The same link rules as a card.
 */
export function FeaturedArticle({ article }: { article: ListedArticle }) {
	const initial = Array.from(article.titre)[0]?.toLocaleUpperCase('fr-FR') ?? ''
	return (
		<article
			data-featured
			className="reveal card-hover group relative grid overflow-hidden border border-gray-200 bg-white lg:grid-cols-5"
		>
			<div
				aria-hidden="true"
				className="relative flex aspect-[16/9] items-center justify-center overflow-hidden bg-indigo-900 lg:col-span-2 lg:aspect-auto lg:min-h-80"
			>
				<span className="absolute inset-4 border border-white/25" />
				<span className="card-zoom select-none font-display font-medium text-8xl text-white/90 leading-none md:text-9xl">
					{initial}
				</span>
			</div>
			<div className="flex flex-col gap-4 p-6 md:p-10 lg:col-span-3 lg:p-12">
				<Eyebrow article={article} label="Dernier article" />
				<h2 className="text-balance font-display font-medium text-3xl text-gray-900 leading-tight md:text-5xl">
					<Link
						href={`/blog/${article.slug}`}
						className="after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-indigo-700 focus-visible:outline-offset-4"
					>
						{article.titre}
					</Link>
				</h2>
				{article.extrait && <p className="max-w-[60ch] text-gray-700 text-lg leading-8">{article.extrait}</p>}
				<ReadMore />
			</div>
		</article>
	)
}
