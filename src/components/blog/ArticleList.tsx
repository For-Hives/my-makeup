import { BlogCard } from '@/components/art/BlogCard'
import { Pill } from '@/components/art/Pill'
import { SectionHead } from '@/components/art/SectionHead'
import type { ListedArticle } from '@/services/public/article-list'

export { articleDate } from './article-date'

/**
 * The blog (issue 1103, in the look of the kit): the most recent article large, then a section head and the others in
 * a grid of cards. Server component. Without an article, a framed message and the way to the search, never an
 * empty grid.
 */
export function ArticleList({ articles }: { articles: readonly ListedArticle[] }) {
	const [first, ...others] = articles
	if (!first)
		return (
			<div className="reveal rounded-art-frame border border-hairline bg-white p-8 md:p-12">
				<p className="max-w-[40ch] font-display font-medium text-2xl text-ink leading-snug md:text-3xl">
					Aucun article n&apos;est publié pour le moment. Revenez bientôt !
				</p>
				<Pill href="/search" arrow className="mt-8">
					Trouver ma maquilleuse
				</Pill>
			</div>
		)
	return (
		<div className="flex flex-col gap-16 md:gap-24">
			<div className="reveal">
				<BlogCard article={first} variant="feature" headingLevel={2} label="Dernier article" />
			</div>
			{others.length > 0 && (
				<section aria-labelledby="tous-les-articles" className="grid gap-10 md:gap-14">
					<SectionHead variant="left" number="02" eyebrow="Le blog" title="Tous les articles" id="tous-les-articles">
						Conseils, tendances et nouveautés, du plus récent au plus ancien.
					</SectionHead>
					<ul className="grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
						{others.map(article => (
							<li key={article.slug} className="reveal">
								<BlogCard article={article} headingLevel={2} />
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	)
}
