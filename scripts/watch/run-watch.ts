/** The entry of `bun run watch:site` (ticket 277): see scripts/watch/watch.ts. */
import { run } from './watch'

process.exit(await run({ env: process.env }))
