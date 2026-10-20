/**
 * Checks the freeze of the old site (ticket 172). Read-only: runs `git log` in the old repository.
 *
 *   bun --no-env-file scripts/migration/freeze.ts --start 2026-12-01T09:00:00Z --repository <old repo> \
 *     [--ref origin/main] [--capture <ISO date>] [--inventory <ISO date>]
 *
 * Exit 0: nothing but security, banner, read-only and contents since the start of the freeze, and
 * the reference captures (when given) are newer than it. Exit 1 otherwise. See docs/migration/GEL.md.
 */

import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { readGitLog, verifyHistory, verifyReferences } from './freeze-rules'

const { values } = parseArgs({
	options: {
		capture: { type: 'string' },
		start: { type: 'string' },
		repository: { type: 'string' },
		inventory: { type: 'string' },
		ref: { default: 'origin/main', type: 'string' },
	},
	strict: true,
})

if (!values.start || !values.repository) {
	console.error(
		'Usage : bun --no-env-file scripts/migration/freeze.ts --start <ISO> --repository <dépôt> [--ref origin/main] [--capture <ISO>] [--inventory <ISO>]'
	)
	process.exit(2)
}

const git = spawnSync(
	'git',
	['-C', values.repository, 'log', `--since=${values.start}`, '--format=%H%x1f%cI%x1f%P%x1f%s%x1f%b%x1e', values.ref],
	{ encoding: 'utf8' }
)
if (git.status !== 0) {
	console.error(`git log a échoué : ${git.stderr.trim()}`)
	process.exit(2)
}

const report = verifyHistory(readGitLog(git.stdout), values.start)
const references = verifyReferences(values.start, [
	{ name: 'capture de référence', takenAt: values.capture },
	{ name: 'inventaire des adresses', takenAt: values.inventory },
])

console.log(
	`Gel commencé le ${report.start} : ${report.afterFreeze.length} commit(s) depuis, ${report.forbidden.length} interdit(s).`
)
for (const verdict of report.forbidden) console.log(`  INTERDIT ${verdict.sha.slice(0, 9)} ${verdict.subject}`)
for (const row of references) console.log(`  RÉFÉRENCE ${row}`)
process.exit(report.forbidden.length + references.length === 0 ? 0 : 1)
