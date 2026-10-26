import { mock } from 'bun:test'

/**
 * `next/font/google` and `next/font/local` are build-time transforms of Next: under `bun test` the first has no named
 * exports and the second cannot read its files, and a page that sets its faces (the content pages, issue 1102; the
 * home hero, docs/accueil.md) could not even be imported. The faces are replaced by objects with the same fields the
 * pages read (`variable`, `className`). Loaded by bunfig.toml before any test file; what the real faces do (swap,
 * size-adjusted fallback, no shift, the cut that draws each text) is measured in a browser, tests/e2e/content-pages.spec.ts
 * and tests/e2e/home-hero.spec.ts.
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

/** A local face is named by its `variable` option, as the page sets it: `--font-hero-serif` gives `font-hero-serif`. */
mock.module('next/font/local', () => ({
	default: ({ variable }: { variable?: string }) => face((variable ?? '--font-local').replace(/^--font-/, ''))(),
}))
