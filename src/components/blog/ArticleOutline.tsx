import type { ArticleHeading } from '@/lib/article-reading'

/** « Dans cet article »: the second-level titles of a long article, as links to their place in the text. */
export function ArticleOutline({ headings }: { headings: readonly ArticleHeading[] }) {
	if (headings.length === 0) return null
	return (
		<nav aria-labelledby="dans-cet-article" data-testid="sommaire" className="my-10 border-gray-300 border-y py-6">
			<p id="dans-cet-article" className="text-gray-700 text-xs uppercase tracking-[0.14em]">
				Dans cet article
			</p>
			<ol className="mt-4 grid gap-2 text-base text-gray-900 leading-6">
				{headings.map((heading, index) => (
					<li key={heading.id} className="flex gap-3">
						<span aria-hidden="true" className="w-6 shrink-0 font-display text-indigo-900">
							{String(index + 1).padStart(2, '0')}
						</span>
						<a href={`#${heading.id}`} className="underline decoration-gray-300 underline-offset-4">
							{heading.text}
						</a>
					</li>
				))}
			</ol>
		</nav>
	)
}
