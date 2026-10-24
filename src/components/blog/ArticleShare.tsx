import Link from 'next/link'

const LINK =
	'inline-flex min-h-11 items-center font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-indigo-900'

/**
 * The foot of an article: back to the blog, and three ways to pass it on. Plain links, no script and no
 * widget of a network (nothing is loaded from them): the address of the article is all that leaves the page.
 */
export function ArticleShare({ title, url }: { title: string; url: string }) {
	const address = encodeURIComponent(url)
	return (
		<div
			data-testid="partage"
			className="mt-12 flex flex-col gap-4 border-gray-300 border-t pt-6 sm:flex-row sm:items-center sm:justify-between"
		>
			<Link href="/blog" className={LINK}>
				← Tous les articles
			</Link>
			<div className="flex flex-wrap items-center gap-x-6">
				<p className="text-gray-700 text-xs uppercase tracking-[0.14em]">Partager</p>
				<a href={`mailto:?subject=${encodeURIComponent(title)}&body=${address}`} className={LINK}>
					Par e-mail
				</a>
				<a
					href={`https://www.linkedin.com/sharing/share-offsite/?url=${address}`}
					target="_blank"
					rel="noopener noreferrer"
					className={LINK}
				>
					LinkedIn
					<span className="sr-only"> (nouvelle fenêtre)</span>
				</a>
				<a
					href={`https://www.facebook.com/sharer/sharer.php?u=${address}`}
					target="_blank"
					rel="noopener noreferrer"
					className={LINK}
				>
					Facebook
					<span className="sr-only"> (nouvelle fenêtre)</span>
				</a>
			</div>
		</div>
	)
}
