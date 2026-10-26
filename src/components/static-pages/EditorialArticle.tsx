import type { ReactNode } from 'react'
import { body, display } from '@/components/direct-edit/fonts'

/**
 * The building blocks of the public content pages (issue 1102): one page shell, one eyebrow, one article layout, one
 * way to set a title that ends with an emoji. The pages (guides, fixed pages for makeup artists, À propos, legal
 * pages) are made of these, so that the type scale, the measure and the rhythm are the same everywhere.
 *
 * The two faces of the art direction are loaded by these pages only (the variables are set on the page, not on the
 * layout of the site): the home page, the navigation and the blog are not touched by them.
 */

/** The page: the faces of the art direction, and the scope of the `content-page` rules of globals.css. */
export function ContentPage({ children }: { children: ReactNode }) {
	return <main className={`content-page relative ${display.variable} ${body.variable} font-body`}>{children}</main>
}

/** A short line over a title: where the page sits (a label of the menu), never a sentence. */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
	return (
		<p className={`font-semibold text-indigo-800 text-xs uppercase tracking-[0.2em] ${className}`.trim()}>{children}</p>
	)
}

const TRAILING_EMOJI = /^(.*?)\s*(\p{Extended_Pictographic}(?:\p{Extended_Pictographic}|️|‍)*)$/u

/**
 * A title whose text ends with an emoji (« Notre histoire 📜 »): the words are the title, the emoji is a small
 * accent that a screen reader skips. The text is the same, word for word.
 */
export function TitleWithAccent({ text }: { text: string }) {
	const found = TRAILING_EMOJI.exec(text)
	if (!found) return <>{text}</>
	return (
		<>
			{found[1]}{' '}
			<span aria-hidden="true" className="ml-0.5 inline-block text-[0.75em] align-middle">
				{found[2]}
			</span>
		</>
	)
}

/** The closing line of an article: a rule and the team. */
export function TeamSignature() {
	return (
		<p className="reveal mt-14 flex items-center gap-4 text-gray-700 text-sm">
			<span aria-hidden="true" className="h-px w-12 bg-indigo-900" />
			<span>L&apos;équipe My-Makeup</span>
		</p>
	)
}

/**
 * The article of a page: on a wide screen the title stays on the left (eyebrow, h2), the text runs on the right at a
 * reading measure; on a phone they stack. `layout="single"` is one column, for long legal text.
 */
export function ArticleShell({
	eyebrow,
	title,
	layout = 'split',
	children,
}: {
	eyebrow?: string
	title: string
	layout?: 'split' | 'single'
	children: ReactNode
}) {
	const split = layout === 'split'
	return (
		<article className="px-4 py-20 sm:px-6 md:py-28 lg:px-8">
			<div className={`mx-auto ${split ? 'grid max-w-6xl gap-10 lg:grid-cols-12 lg:gap-16' : 'max-w-3xl'}`}>
				<header className={`reveal ${split ? 'lg:sticky lg:top-28 lg:col-span-5 lg:self-start' : 'mb-10'}`}>
					{eyebrow !== undefined && <Eyebrow>{eyebrow}</Eyebrow>}
					<h2
						className={`font-display font-medium text-3xl text-balance text-gray-900 leading-tight tracking-tight sm:text-4xl ${eyebrow === undefined ? '' : 'mt-4'}`}
					>
						{title}
					</h2>
					<span aria-hidden="true" className="mt-6 block h-0.5 w-12 bg-indigo-900" />
				</header>
				<div className={split ? 'lg:col-span-7' : ''}>{children}</div>
			</div>
		</article>
	)
}

/** The first paragraph under an article title: larger than the text, still at the reading measure. */
export function Lead({ children }: { children: ReactNode }) {
	return <p className="reveal max-w-[62ch] text-gray-900 text-lg leading-8 sm:text-xl sm:leading-9">{children}</p>
}
