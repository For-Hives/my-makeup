/** The frame of an arch is 4:5 (width over height). */
const ARCH_ASPECT = 4 / 5

const rem = (value: number): string => `${Number(value.toFixed(2))}rem`

/**
 * The `sizes` of a photo in an arch. The photo covers the frame (`object-cover`): a portrait photo is as wide as the
 * frame, but a landscape one is as TALL as the frame, so its copy must be wider than the frame by the ratio of the
 * photo to the frame (a 3:2 photo in a 4:5 frame: 1.875 times). Asking for the frame's width only gave a copy that
 * the browser stretched 1.7 times on a 2x screen (issue 1138). `desktop` and `mobile` are the widths of the frame in
 * rem, `sourceAspect` the width over the height of the file.
 */
export function archSizes({
	desktop,
	mobile,
	sourceAspect = ARCH_ASPECT,
}: {
	desktop: number
	mobile: number
	sourceAspect?: number
}): string {
	const factor = Math.max(1, sourceAspect / ARCH_ASPECT)
	return `(min-width: 768px) ${rem(desktop * factor)}, ${rem(mobile * factor)}`
}
