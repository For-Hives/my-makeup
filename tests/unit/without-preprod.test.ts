import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Ticket 232: the v3 has no pre-production, only the site and the local bench. This test fails when
 * something of it comes back: a folder, a workflow, a script of package.json, a mention in the code,
 * the scripts, the CI, the image or the list of variables. The application also refuses the value
 * `preprod` of APP_ENV (tests/unit/env.test.ts). What this file proves is the removal itself.
 */

const RACINE = path.resolve(import.meta.dir, '../..')

/** The tracked files of these places that mention the pre-production, in any case, with or without the accent. */
function mentions(...chemins: string[]): string[] {
	const ran = Bun.spawnSync(['git', 'grep', '-il', '-e', 'preprod', '-e', 'préprod', '--', ...chemins], {
		cwd: RACINE,
	})
	// Exit code 1: nothing found. Anything above is a failure of git itself.
	if (ran.exitCode > 1) throw new Error(`git grep a échoué : ${ran.stderr.toString()}`)
	return ran.stdout.toString().split('\n').filter(Boolean)
}

describe('la préprod n’existe plus (ticket 232)', () => {
	test.each([
		'src/preprod',
		'scripts/preprod',
		'docs/preprod.md',
		'.github/workflows/preprod.yml',
		'.github/workflows/preprod-controles.yml',
		'tests/fixtures/demarrage-preprod.ts',
	])('%s est supprimé', chemin => {
		expect(existsSync(path.join(RACINE, chemin))).toBe(false)
	})

	test('rien n’en parle dans le code, les scripts, la CI, l’image, package.json et la liste des variables', () => {
		expect(
			mentions(
				'src',
				'scripts',
				'.github',
				'Dockerfile',
				'package.json',
				'.env.exemple',
				'.dockerignore',
				'next.config.ts'
			)
		).toEqual([])
	})
})
