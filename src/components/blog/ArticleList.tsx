import Link from 'next/link'
import type { ListedArticle } from '@/services/public/article-list'
import { ArticleCard, FeaturedArticle } from './ArticleCard'

export { articleDate } from './article-date'

/**
 * The blog (issue 1103): the most recent article large, the others in a grid of cards. Server component.
 * Without an article, a framed message and the way to the search, never an empty grid.
 */
export function ArticleList({ articles }: { articles: readonly ListedArticle[] }) {
	const [first, ...others] = articles
	if (!first)
		return (
			<div className="reveal border border-gray-300 border-t-2 border-t-indigo-900 bg-white p-8 md:p-12">
				<p className="max-w-[40ch] font-display font-medium text-2xl text-gray-900 leading-snug md:text-3xl">
					Aucun article n&apos;est publié pour le moment. Revenez bientôt !
				</p>
				<Link href="/search" className="btn-primary mt-8 inline-flex min-h-11 items-center">
					Trouver ma maquilleuse
				</Link>
			</div>
		)
	return (
		<div className="flex flex-col gap-6 md:gap-8">
			<FeaturedArticle article={first} />
			{others.length > 0 && (
				<ul className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8 lg:grid-cols-3">
					{others.map(article => (
						<ArticleCard key={article.slug} article={article} />
					))}
				</ul>
			)}
		</div>
	)
}
