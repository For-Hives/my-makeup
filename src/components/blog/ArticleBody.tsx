/**
 * The text of an article, already turned into HTML by `markdownToDocument` (src/lib/markdown.ts), which
 * sanitizes it and leaves no h1. The reading column and its titles, quotes, lists, links and images are
 * styled by `.article-prose` (src/app/(front)/globals.css, « Blog article prose »): about 65 characters wide,
 * 18 px (20 px from 1024 px), a line height of 1.7. `MarkdownContent` stays the one of the talents.
 */
export function ArticleBody({ html }: { html: string }) {
	if (html === '') return null
	return (
		<div
			data-testid="article-body"
			className="article-prose"
			// the HTML comes from markdownToDocument, which sanitizes it (rehype-sanitize).
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	)
}
