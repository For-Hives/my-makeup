/** The entry of `bun run cutover:check` (ticket 173): see scripts/cutover/host-check.ts. */
import { run } from './host-check'

process.exit(
	await run({
		HOST_CHECK_ACCESS_PASSWORD: process.env.HOST_CHECK_ACCESS_PASSWORD,
		HOST_CHECK_ACCESS_USER: process.env.HOST_CHECK_ACCESS_USER,
		HOST_CHECK_TARGET: process.env.HOST_CHECK_TARGET,
		HOST_CHECK_OUTPUT: process.env.HOST_CHECK_OUTPUT,
	})
)
