import Link from 'next/link'
import type { ListedArticle } from '@/services/public/article-list'

/** « 14 octobre 2026 », in the Paris time zone; '' for a missing or unreadable date. */
export function dateDeLArticle(date: string | null): string {
	if (!date) return ''
	const instant = new Date(date)
	if (Number.isNaN(instant.getTime())) return ''
	return instant.toLocaleDateString('fr-FR', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'Europe/Paris',
	})
}

/** The cards of the blog: date, title, excerpt and a link to the article. Server component. */
export function ListeDesArticles({ articles }: { articles: readonly ListedArticle[] }) {
	if (articles.length === 0)
		return <p className="text-gray-700">Aucun article n&apos;est publié pour le moment. Reviens bientôt !</p>
	return (
		<ul className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-4">
			{articles.map(article => {
				const date = dateDeLArticle(article.publieLe)
				return (
					<li key={article.slug} className="flex flex-col gap-2">
						{date && (
							<p className="relative pl-2 text-base text-gray-700">
								<time dateTime={article.publieLe ?? undefined}>{date}</time>
								<span aria-hidden="true" className="absolute top-0 left-0 h-full w-0.5 bg-gray-300" />
							</p>
						)}
						<h2 className="font-semibold text-gray-900 text-lg">{article.titre}</h2>
						{article.extrait && <p className="text-gray-700 text-sm">{article.extrait}</p>}
						<Link
							href={`/blog/${article.slug}`}
							className="flex items-center font-medium text-indigo-900 focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"
						>
							Lire l&apos;article
							<span className="sr-only"> : {article.titre}</span>
						</Link>
					</li>
				)
			})}
		</ul>
	)
}
