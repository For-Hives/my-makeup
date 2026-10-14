/**
 * The text of an article or of a talent, already turned into HTML by `markdownEnHtml`
 * (src/lib/markdown.ts), which sanitizes it and leaves no h1. The styles are written here, on the
 * elements the markdown can produce: the project has no typography plugin.
 */
export function ContenuMarkdown({ html }: { html: string }) {
	if (html === '') return null
	return (
		<div
			className={[
				'my-8 text-base text-gray-700 leading-7 xl:text-lg xl:leading-8',
				'[&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:font-bold [&_h2]:text-2xl [&_h2]:text-gray-900 [&_h2]:tracking-tight',
				'[&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:font-semibold [&_h3]:text-gray-900 [&_h3]:text-xl',
				'[&_h4]:mt-6 [&_h4]:mb-2 [&_h4]:font-semibold [&_h4]:text-gray-900 [&_h4]:text-lg',
				'[&_p]:my-4 [&_strong]:font-semibold [&_strong]:text-gray-900',
				'[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1',
				'[&_a]:text-indigo-700 [&_a]:underline [&_a:hover]:text-indigo-900',
				'[&_blockquote]:my-6 [&_blockquote]:border-gray-300 [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_blockquote]:text-gray-600 [&_blockquote]:italic',
				'[&_img]:my-6 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg',
				'[&_hr]:my-8 [&_hr]:border-gray-200',
				'[&_table]:my-6 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_td]:border [&_td]:border-gray-200 [&_td]:p-2 [&_th]:border [&_th]:border-gray-200 [&_th]:p-2 [&_th]:text-left',
				'[&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-gray-100 [&_pre]:p-4',
				'break-words',
			].join(' ')}
			// the HTML comes from markdownEnHtml, which sanitizes it (rehype-sanitize).
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	)
}
