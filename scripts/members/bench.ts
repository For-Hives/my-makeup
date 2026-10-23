/**
 * `bun run bench:members-mail [options]`: `members:mail` against the bench of this instance (docs/membres-courriel.md).
 * The bench database and its mail catcher are the ones it sees; the options are those of `members:mail`.
 * Started with `--no-env-file`: a working `.env` never reaches the bench.
 */

import { RefusedBench } from '../../tests/support/bench'
import { currentBench, requireRunningBench } from '../bench'

try {
	const bench = currentBench()
	await requireRunningBench(bench)
	Object.assign(process.env, bench.environnement)
} catch (error) {
	if (!(error instanceof RefusedBench)) throw error
	console.error(error.message)
	process.exit(1)
}

await import('./mail')
