/**
 * jsdom ships no types, and `@types/jsdom` is not installed: the test bench uses three members
 * of the package, declared here and nothing more.
 *
 * Delete this file the day `@types/jsdom` is installed: an ambient `declare module` next to real
 * types is a duplicate declaration, not a merge.
 */
declare module 'jsdom' {
	export class JSDOM {
		constructor(
			html?: string,
			options?: {
				/** The address the window believes it is at. Nothing is fetched from it. */
				url?: string
				/** `requestAnimationFrame` and a `visible` document, as in a browser that paints. */
				pretendToBeVisual?: boolean
			}
		)
		readonly window: Window & typeof globalThis
	}
}
