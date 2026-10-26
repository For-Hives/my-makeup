/**
 * The class of a pill, in a file with no import: the navigation bar is a client component and may read it without
 * pulling the drawings with it (tests/unit/public-client-graph.test.ts).
 */
/** The looks of a pill button: ink outline, solid indigo, white (on a dark band), ghost (on a dark band), and the round « play » disc. */
export type PillVariant = 'outline' | 'filled' | 'light' | 'ghost-light' | 'play'

const BASE =
	'group inline-flex items-center justify-center gap-3.5 rounded-full border text-center font-medium whitespace-nowrap hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-4'

const SIZE = { md: 'min-h-13 px-7 text-base', sm: 'min-h-11 px-5 text-[15px]' } as const

const LOOK: Record<Exclude<PillVariant, 'play'>, string> = {
	outline: 'border-ink text-ink hover:bg-ink hover:text-white focus-visible:outline-indigo-700',
	filled:
		'border-indigo-700 bg-indigo-700 text-white hover:border-indigo-900 hover:bg-indigo-900 focus-visible:outline-indigo-700',
	light: 'border-white bg-white text-art-night hover:border-art-blush hover:bg-art-blush focus-visible:outline-white',
	'ghost-light': 'border-white/70 text-white hover:bg-white hover:text-art-night focus-visible:outline-white',
}

/**
 * The class of a pill: for a link that must stay another component (the tracked links of the call to action wear it).
 * Every size is 44 px high at least, and the keyboard ring is always drawn (white on a dark band).
 */
export function pillClassName({
	variant = 'outline',
	size = 'md',
}: {
	variant?: PillVariant
	size?: 'md' | 'sm'
} = {}) {
	if (variant === 'play')
		return 'group inline-flex min-h-14 items-center gap-3.5 rounded-full text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-700'
	return `${BASE} ${SIZE[size]} ${LOOK[variant]}`
}
