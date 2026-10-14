/**
 * The canary of the CI: four faults planted on purpose, one per tool, to prove on a real
 * pull request that the required check can fail (docs/qualite.md, « Canari »).
 *
 *   bun run ci:canari             writes the four faulty files
 *   bun run ci:canari --retirer   removes them
 *
 * It only writes on a branch whose name starts with `canari-`: the faults never land on a
 * working branch by accident. The four files live under tests/, outside the Docker image:
 * the `build` job stays green, and each red step names one tool.
 *
 * It only writes these four files: it never commits, pushes or opens a pull request.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dir, '../..')

/** The prefix a branch must have to receive the faults. */
export const CANARY_BRANCH_PREFIX = 'canari-'

export interface CanaryFault {
	/** Where the faulty file is written, from the root of the repository. */
	file: string
	/** The command that must fail on it. */
	command: string
	/** The job and the step of the CI that must turn red. */
	red: string
	content: string
}

const HEADER = '// Canary of the CI (docs/qualite.md): this file is wrong on purpose and is never merged.\n'

export const CANARY_FAULTS: readonly CanaryFault[] = [
	{
		file: 'tests/unit/canari.test.ts',
		command: 'bun run test:unit',
		red: 'unit › Unit tests',
		content: `${HEADER}import { expect, test } from 'bun:test'\n\ntest('canary: a false test', () => {\n\texpect(1 + 1).toBe(3)\n})\n`,
	},
	{
		file: 'tests/ci/canari-types.ts',
		command: 'bun run typecheck',
		red: 'qualite › Types',
		content: `${HEADER}export const canaryOfTypes: number = 'not a number'\n`,
	},
	{
		file: 'tests/ci/canari-biome.ts',
		command: 'bun run ci:biome',
		red: 'qualite › Biome',
		content: `${HEADER}const neverRead = 'canary'\n\nexport const canaryOfBiome = 1\n`,
	},
	// No page is opened: the fault is the same in every shard, and it is replayed without a browser.
	{
		file: 'tests/e2e/canari.spec.ts',
		command: 'bun run test:e2e',
		red: 'e2e, one of the two shards › End-to-end tests',
		content: `${HEADER}import { expect, test } from '@playwright/test'\n\ntest('canary: a false end-to-end test', () => {\n\texpect(1 + 1).toBe(3)\n})\n`,
	},
]

/** Why the faults are not written on this branch, in French, or nothing when they may be. */
export function refusal(branch: string): string | undefined {
	if (branch.startsWith(CANARY_BRANCH_PREFIX) && branch.length > CANARY_BRANCH_PREFIX.length) return undefined
	return [
		`Branche « ${branch || 'inconnue'} » : le canari ne s’écrit que sur une branche dont le nom commence par « ${CANARY_BRANCH_PREFIX} ».`,
		`Par exemple : git switch -c ${CANARY_BRANCH_PREFIX}2026-10 origin/v3`,
	].join('\n')
}

function currentBranch(): string {
	const ran = Bun.spawnSync(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT })
	return ran.exitCode === 0 ? ran.stdout.toString().trim() : ''
}

function main(): void {
	const remove = process.argv.includes('--retirer')
	if (remove) {
		for (const { file } of CANARY_FAULTS) rmSync(path.join(ROOT, file), { force: true })
		console.log('Canari retiré : les quatre fichiers fautifs sont supprimés.')
		return
	}

	const refused = refusal(currentBranch())
	if (refused !== undefined) {
		console.error(refused)
		process.exit(1)
	}
	for (const { file, content } of CANARY_FAULTS) {
		const target = path.join(ROOT, file)
		if (existsSync(target)) continue
		mkdirSync(path.dirname(target), { recursive: true })
		writeFileSync(target, content)
	}
	console.log('Canari écrit. Quatre fautes, une par outil :')
	for (const { file, command, red } of CANARY_FAULTS) console.log(`  ${file} : « ${command} » échoue (CI : ${red})`)
	console.log('La suite est dans docs/qualite.md, « Canari ».')
}

if (import.meta.main) main()
