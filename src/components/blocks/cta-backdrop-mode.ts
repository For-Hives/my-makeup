export type BackdropMode = 'static' | 'shader'

/**
 * What the background of the call to action is: the shader only when the block can be seen, the visitor has
 * not asked for less motion, and the shader is loaded (which needs WebGL). Everything else is the static layer,
 * which is always there.
 */
export function backdropMode({
	reducedMotion,
	visible,
	webgl,
}: {
	reducedMotion: boolean
	visible: boolean
	webgl: boolean
}): BackdropMode {
	return !reducedMotion && visible && webgl ? 'shader' : 'static'
}
