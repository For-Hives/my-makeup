/** The entry of `bun run cutover:ui-crawl` (ticket 177): see scripts/cutover/ui-crawl.ts. */
import { run } from './ui-crawl'

process.exit(
	await run({
		UI_CRAWL_ACCESS_PASSWORD: process.env.UI_CRAWL_ACCESS_PASSWORD,
		UI_CRAWL_ACCESS_USER: process.env.UI_CRAWL_ACCESS_USER,
		UI_CRAWL_TARGET: process.env.UI_CRAWL_TARGET,
		UI_CRAWL_OUTPUT: process.env.UI_CRAWL_OUTPUT,
	})
)
