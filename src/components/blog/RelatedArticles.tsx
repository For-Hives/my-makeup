import type { ListedArticle } from '@/services/public/article-list'
import { ArticleCard } from './ArticleCard'

/** How many other articles the foot of an article suggests. */
export const RELATED_COUNT = 3

/**
 * The other articles of the blog, most recent first, the one being read left out. The data is the list
 * of the blog itself: there is no category or tag to match on, so « related » means « the latest others ».
 */
export function relatedArticles(articles: readonly ListedArticle[], slug: string): ListedArticle[] {
	return articles.filter(article => article.slug !== slug).slice(0, RELATED_COUNT)
}

/** « À lire aussi »: up to three cards, nothing at all when there is no other article. Server component. */
export function RelatedArticles({ articles }: { articles: readonly ListedArticle[] }) {
	if (articles.length === 0) return null
	return (
		<section aria-labelledby="a-lire-aussi" data-testid="articles-lies" className="mt-20 md:mt-28">
			<h2 id="a-lire-aussi" className="font-display font-medium text-3xl text-gray-900 tracking-tight">
				À lire aussi
			</h2>
			<ul className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
				{articles.map(article => (
					<ArticleCard key={article.slug} article={article} level={3} />
				))}
			</ul>
		</section>
	)
}
