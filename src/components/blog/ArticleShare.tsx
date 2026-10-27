import { Chip } from '@/components/art/Chip'
import { Pill } from '@/components/art/Pill'

/**
 * The foot of an article: back to the blog, and three ways to pass it on. Plain links (a pill and three chips), no
 * script and no widget of a network (nothing is loaded from them): the address of the article is all that leaves the page.
 */
export function ArticleShare({ title, url }: { title: string; url: string }) {
	const address = encodeURIComponent(url)
	return (
		<div
			data-testid="partage"
			className="mt-12 flex flex-col gap-5 border-hairline border-t pt-6 sm:flex-row sm:items-center sm:justify-between"
		>
			<Pill href="/blog" size="sm" data-cta="article_retour_blog">
				← Tous les articles
			</Pill>
			<div className="flex flex-wrap items-center gap-3">
				<p className="mr-1 text-mute text-xs uppercase tracking-[0.14em]">Partager</p>
				<Chip href={`mailto:?subject=${encodeURIComponent(title)}&body=${address}`} data-share="email">
					Par e-mail
				</Chip>
				<Chip
					href={`https://www.linkedin.com/sharing/share-offsite/?url=${address}`}
					data-share="linkedin"
					target="_blank"
					rel="noopener noreferrer"
				>
					LinkedIn
					<span className="sr-only"> (nouvelle fenêtre)</span>
				</Chip>
				<Chip
					href={`https://www.facebook.com/sharer/sharer.php?u=${address}`}
					data-share="facebook"
					target="_blank"
					rel="noopener noreferrer"
				>
					Facebook
					<span className="sr-only"> (nouvelle fenêtre)</span>
				</Chip>
			</div>
		</div>
	)
}
