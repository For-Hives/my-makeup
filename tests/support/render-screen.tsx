/**
 * Prints the markup of a screen that an end-to-end test cannot reach through the application without breaking
 * what the other tests share (ticket 299): the plan of the site with no page to list, and the error page.
 * Run by bun, which resolves the imports of `src/` as the application does (Playwright runs under Node, which
 * does not): `bun tests/support/render-screen.tsx <screen>`.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { ErrorPage } from '../../src/components/layout/ErrorPage'
import { SiteMapBody } from '../../src/components/site-map/SiteMapBody'

export const SCREENS_TO_RENDER = ['site-map-empty', 'error-page'] as const

const screen = process.argv[2]
if (screen === 'site-map-empty')
	process.stdout.write(renderToStaticMarkup(SiteMapBody({ profils: [], zones: [], talents: [], articles: [] })))
else if (screen === 'error-page') process.stdout.write(renderToStaticMarkup(ErrorPage({ reessayer: () => undefined })))
else {
	process.stderr.write(`Écran inconnu : ${screen}. Écrans : ${SCREENS_TO_RENDER.join(', ')}\n`)
	process.exit(1)
}
