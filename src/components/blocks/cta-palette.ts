/**
 * The colors of the animated background of the call to action: the indigo of the public site, from its
 * darkest (the frame) to a lighter one. Each of them stays under white text at 4.5:1 or better
 * (indigo-900 11.5:1, indigo-700 7.9:1, indigo-500 4.57:1), so the text reads on the worst pixel of the
 * animation as well as on the static layer. A test keeps it so (tests/unit/call-to-action-backdrop.test.tsx).
 */
export const BACKDROP_COLORS = {
	back: '#312c85',
	mid: '#4338ca',
	front: '#625fff',
} as const
