import { mock } from 'bun:test'

/**
 * `next/font/google` is a build-time transform of Next: under `bun test` the module has no named exports, and a page
 * that sets the faces of the art direction (the content pages, issue 1102) could not even be imported. The faces are
 * replaced by objects with the same fields the pages read (`variable`, `className`). Loaded by bunfig.toml before any
 * test file; what the real faces do (swap, size-adjusted fallback, no shift) is measured in a browser, tests/e2e/content-pages.spec.ts.
 */
const face = (name: string) => () => ({
	className: `font-${name}`,
	variable: `--font-${name}`,
	style: { fontFamily: name },
})

mock.module('next/font/google', () => ({
	Bodoni_Moda: face('bodoni-moda'),
	Instrument_Sans: face('instrument-sans'),
}))
