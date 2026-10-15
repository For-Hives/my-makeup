/**
 * Checks the freeze of the old site (ticket 172). Read-only: runs `git log` in the old repository.
 *
 *   bun --no-env-file scripts/migration/gel.ts --debut 2026-12-01T09:00:00Z --depot <old repo> \
 *     [--ref origin/main] [--capture <ISO date>] [--inventaire <ISO date>]
 *
 * Exit 0: nothing but security, banner, read-only and contents since the start of the freeze, and
 * the reference captures (when given) are newer than it. Exit 1 otherwise. See docs/migration/GEL.md.
 */

import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { lireLeJournalGit, verifierLesReferences, verifierLHistorique } from './gel-regles'

const { values } = parseArgs({
	options: {
		capture: { type: 'string' },
		debut: { type: 'string' },
		depot: { type: 'string' },
		inventaire: { type: 'string' },
		ref: { default: 'origin/main', type: 'string' },
	},
	strict: true,
})

if (!values.debut || !values.depot) {
	console.error(
		'Usage : bun --no-env-file scripts/migration/gel.ts --debut <ISO> --depot <dépôt> [--ref origin/main] [--capture <ISO>] [--inventaire <ISO>]'
	)
	process.exit(2)
}

const git = spawnSync(
	'git',
	['-C', values.depot, 'log', `--since=${values.debut}`, '--format=%H%x1f%cI%x1f%P%x1f%s%x1f%b%x1e', values.ref],
	{ encoding: 'utf8' }
)
if (git.status !== 0) {
	console.error(`git log a échoué : ${git.stderr.trim()}`)
	process.exit(2)
}

const rapport = verifierLHistorique(lireLeJournalGit(git.stdout), values.debut)
const references = verifierLesReferences(values.debut, [
	{ nom: 'capture de référence', prisLe: values.capture },
	{ nom: 'inventaire des adresses', prisLe: values.inventaire },
])

console.log(
	`Gel commencé le ${rapport.debut} : ${rapport.apresLeGel.length} commit(s) depuis, ${rapport.interdits.length} interdit(s).`
)
for (const verdict of rapport.interdits) console.log(`  INTERDIT ${verdict.sha.slice(0, 9)} ${verdict.subject}`)
for (const ligne of references) console.log(`  RÉFÉRENCE ${ligne}`)
process.exit(rapport.interdits.length + references.length === 0 ? 0 : 1)
