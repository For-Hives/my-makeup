/**
 * The look of a card of « Mon espace » (issue 1073): white on the very light page background, 22 px corners, the near-black
 * text of the art direction (`#1A1417`, 18:1 on white) and a secondary text at 7:1 at least (`#554950`: 8.6:1 on white, 7.7:1
 * on the page background). Whole class names, so that Tailwind finds them. The lipstick red is for the links that lead to
 * the edit mode: nothing on these cards is changed in place.
 */
export const CARD = 'reveal w-full min-w-0 rounded-[22px] border border-[#E6DCD5] bg-white p-5 text-[#1A1417] sm:p-6'
export const SECONDARY = 'text-[#554950]'
export const TITLE = 'font-display font-medium text-[#1A1417] text-xl'
export const EDIT_LINK =
	'inline-flex min-h-11 items-center rounded-full px-1 font-semibold text-[#B0294A] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[#B0294A] focus-visible:outline-offset-2'
