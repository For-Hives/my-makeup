import { pillClassName } from './pill-class'

/**
 * The classes of the forms and the small texts of the public pages that are not content pages (sign-in, sign-up,
 * forgotten password, verification), in the look of the kit: rounded fields on paper, a pill for the button, rounded
 * notices, links in indigo. One file, with no import but `pill-class`, so that the client forms read it without
 * pulling the drawings (tests/unit/public-client-graph.test.ts). The contact form wears the same field.
 */

/** A text field: 28 px radius (`--radius-art-field`), a 1 px line, an indigo ring on focus, red when invalid. */
export const ART_FIELD =
	'block min-h-13 w-full rounded-art-field border-0 bg-art-paper px-5 py-3 text-base text-ink ring-1 ring-inset ring-art-line placeholder:text-mute hover:ring-indigo-300 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-indigo-700 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-red-600'

/** The label over a field. */
export const ART_LABEL = 'flex flex-col gap-2 font-semibold text-ink text-sm'

/** The submit button: the indigo pill, full width, dimmed while it waits. */
export const ART_SUBMIT = `${pillClassName({ variant: 'filled' })} w-full disabled:cursor-wait disabled:opacity-60`

/** A link that is a button (a pill, full width on a phone). */
export const ART_LINK_BUTTON = `${pillClassName({ variant: 'filled' })}`

/** A plain link in a text: indigo, underlined, a 44 px target. */
export const ART_LINK =
	'inline-flex min-h-11 items-center font-medium text-indigo-800 underline underline-offset-4 hover:text-indigo-950'

/** The notices: one radius, one tone each (the text colours keep 4.5:1 on their fill). */
export const ART_NOTICE = {
	error: 'rounded-art-field bg-red-50 px-5 py-3 text-red-800 text-sm ring-1 ring-inset ring-red-200',
	info: 'rounded-art-field bg-indigo-50 px-5 py-3 text-indigo-900 text-sm ring-1 ring-inset ring-indigo-200',
	success: 'rounded-art-field bg-green-50 px-5 py-3 text-green-900 text-sm ring-1 ring-inset ring-green-200',
	soft: 'rounded-art-field bg-art-blush-50 px-5 py-3 text-art-blush-ink text-sm ring-1 ring-inset ring-art-rose',
} as const
