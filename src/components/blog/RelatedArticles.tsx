import { BlogCard } from '@/components/art/BlogCard'
import { SectionHead } from '@/components/art/SectionHead'
import type { ListedArticle } from '@/services/public/article-list'

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
			<SectionHead variant="left" eyebrow="Le blog" title="À lire aussi" id="a-lire-aussi" />
			<ul className="mt-10 grid grid-cols-1 gap-x-12 gap-y-14 md:grid-cols-3 lg:gap-x-14">
				{articles.map(article => (
					<li key={article.slug} className="reveal">
						<BlogCard article={article} headingLevel={3} />
					</li>
				))}
			</ul>
		</section>
	)
}
