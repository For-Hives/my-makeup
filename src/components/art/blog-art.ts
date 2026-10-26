import type { Tint } from './CapsuleImage'
import { LINE_DRAWINGS, type LineDrawingName, MAKEUP_OBJECTS, type MakeupObjectName } from './drawings'
import type { PrintMarkKind } from './graphics'

const TINTS: readonly Tint[] = ['blush', 'lavender', 'sand', 'rose', 'indigo']
const OBJECTS = Object.keys(MAKEUP_OBJECTS) as MakeupObjectName[]
const DRAWINGS = Object.keys(LINE_DRAWINGS) as LineDrawingName[]
const MARKS: readonly PrintMarkKind[] = ['plus', 'ring', 'dot', 'dash']

/** A stable pick from the slug: the same article always gets the same choice. `salt` makes each choice independent. */
export function pick<T>(slug: string, list: readonly T[], salt: number): T {
	let hash = salt
	for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
	return list[hash % list.length] as T
}

/**
 * What the drawn panel of an article is made of. Articles have no picture: the panel is a tint, an arch, a makeup
 * object, a smaller second one, a line drawing and print marks, all chosen from the slug so the list is varied and
 * an article keeps its look from the list to its own page. Nothing here is a photo, nothing says anything the title
 * does not.
 */
export function blogArt(slug: string) {
	const object = pick(slug, OBJECTS, 3)
	const rest = OBJECTS.filter(name => name !== object)
	return {
		tint: pick(slug, TINTS, 7),
		object,
		second: pick(slug, rest, 11),
		drawing: pick(slug, DRAWINGS, 19),
		tilt: pick(slug, [-9, -4, 3, 7, 11], 5),
		secondTilt: pick(slug, [-16, -8, 10, 18], 23),
		side: pick(slug, ['left', 'right'] as const, 13),
		marks: [pick(slug, MARKS, 29), pick(slug, MARKS, 31)] as const,
	}
}
