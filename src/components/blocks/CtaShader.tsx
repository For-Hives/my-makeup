'use client'

import { NeuroNoise } from '@paper-design/shaders-react'
import { BACKDROP_COLORS } from './cta-palette'

/**
 * The moving background of the call to action. The only file that imports the shader library, and only
 * CtaBackdrop loads it, by `import()` once the block is on screen: it is a separate piece, never in the
 * JavaScript of the first load. The pixel count is capped so a large screen does not draw more than it needs.
 */
export function CtaShader() {
	return (
		<NeuroNoise
			brightness={0}
			className="cta-backdrop-mask absolute inset-0"
			colorBack={BACKDROP_COLORS.back}
			colorFront={BACKDROP_COLORS.front}
			colorMid={BACKDROP_COLORS.mid}
			contrast={1}
			height="100%"
			maxPixelCount={600_000}
			scale={0.55}
			speed={1}
			width="100%"
		/>
	)
}
