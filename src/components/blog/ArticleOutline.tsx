import type { ArticleHeading } from '@/lib/article-reading'

/** « Dans cet article »: the second-level titles of a long article, as links to their place in the text. */
export function ArticleOutline({ headings }: { headings: readonly ArticleHeading[] }) {
	if (headings.length === 0) return null
	return (
		<nav aria-labelledby="dans-cet-article" data-testid="sommaire" className="my-10 border-hairline border-y py-6">
			<p id="dans-cet-article" className="text-mute text-xs uppercase tracking-[0.14em]">
				Dans cet article
			</p>
			<ol className="mt-4 grid gap-2 text-base text-ink leading-6">
				{headings.map((heading, index) => (
					<li key={heading.id} className="flex gap-3">
						<span aria-hidden="true" className="w-7 shrink-0 font-display text-indigo-800 italic">
							{String(index + 1).padStart(2, '0')}
						</span>
						<a
							href={`#${heading.id}`}
							className="underline decoration-art-line underline-offset-4 hover:decoration-indigo-700"
						>
							{heading.text}
						</a>
					</li>
				))}
			</ol>
		</nav>
	)
}
