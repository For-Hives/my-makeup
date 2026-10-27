import { existsSync } from 'node:fs'
import path from 'node:path'
import Image from 'next/image'

/** The generated illustrations of the Solutions pages (issue 1136, docs/illustrations-solutions.md). */
export const SOLUTION_IMAGE_FOLDER = '/assets/solutions'

/** Wide illustrations are 3:2, 1200 x 800 (arches are 4:5, 1000 x 1250). */
export const SOLUTION_WIDE = { width: 1200, height: 800 } as const

/**
 * The public address of a generated illustration (`name` without extension), or `null` when its file is not
 * there: the page then keeps what it showed before (the former arch picture, no picture in a step). A server-side
 * check, made once when the page is built; no page breaks on a missing file.
 */
export function solutionImage(name: string): string | null {
	const address = `${SOLUTION_IMAGE_FOLDER}/${name}.webp`
	return existsSync(path.join(process.cwd(), 'public', address)) ? address : null
}

/**
 * A wide illustration under a step or a part of a Solutions page. Decoration: the text carries the meaning, so
 * `alt=""`. The width and height are the file's own (no layout shift); it loads lazily, below the head of the page.
 */
export function SolutionPicture({ src, className = '' }: { src: string; className?: string }) {
	return (
		<Image
			src={src}
			alt=""
			width={SOLUTION_WIDE.width}
			height={SOLUTION_WIDE.height}
			sizes="(min-width: 1024px) 560px, (min-width: 768px) 45vw, 90vw"
			className={`aspect-3/2 w-full rounded-3xl border border-nude-200 object-cover ${className}`.trim()}
		/>
	)
}
