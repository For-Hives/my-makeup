import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CANARY_FAULTS, refusal } from '../../scripts/ci/canari'

/**
 * The canary kit (docs/qualite.md, « Canari »). The three faulty files are written in a
 * temporary folder, never in the repository, and each tool is run on them: a canary whose
 * faults are no longer faults would prove nothing on the day it is pushed.
 */

const ROOT = path.resolve(import.meta.dir, '../..')
const fault = (file: string) => {
	const found = CANARY_FAULTS.find(candidate => candidate.file === file)
	if (!found) throw new Error(`no canary fault for ${file}`)
	return found
}
const FALSE_TEST = fault('tests/unit/canari.test.ts')
const TYPE_ERROR = fault('tests/ci/canari-types.ts')
const BIOME_ERROR = fault('tests/ci/canari-biome.ts')

let folder = ''

/** Runs a script of node_modules, or bun itself, in the temporary folder. */
function run(args: string[]): { code: number; output: string } {
	const ran = Bun.spawnSync([process.execPath, ...args], { cwd: folder, env: { PATH: process.env.PATH ?? '' } })
	return { code: ran.exitCode, output: ran.stdout.toString() + ran.stderr.toString() }
}

beforeAll(() => {
	folder = mkdtempSync(path.join(os.tmpdir(), 'canari-'))
	for (const { file, content } of CANARY_FAULTS) {
		mkdirSync(path.dirname(path.join(folder, file)), { recursive: true })
		writeFileSync(path.join(folder, file), content)
	}
	// The rules of the repository, applied to this folder: same linter, same formatter.
	const biome = JSON.parse(readFileSync(path.join(ROOT, 'biome.json'), 'utf8')) as Record<string, unknown>
	writeFileSync(
		path.join(folder, 'biome.json'),
		JSON.stringify({ ...biome, vcs: { enabled: false }, files: { includes: ['**/*.ts'] } })
	)
})

afterAll(() => {
	rmSync(folder, { recursive: true, force: true })
})

describe('the canary plants three faults, one per tool', () => {
	test('three files, under tests/ only: nothing of the canary enters the Docker image', () => {
		expect(CANARY_FAULTS.map(({ file, command, red }) => [file, command, red])).toEqual([
			['tests/unit/canari.test.ts', 'bun run test:unit', 'unit › Unit tests'],
			['tests/ci/canari-types.ts', 'bun run typecheck', 'qualite › Types'],
			['tests/ci/canari-biome.ts', 'bun run ci:biome', 'qualite › Biome'],
		])
	})

	test('the false test fails under bun test', () => {
		const { code, output } = run(['--no-env-file', 'test', `./${FALSE_TEST.file}`])

		expect(output).toContain('canary: a false test')
		expect(output).toContain('1 fail')
		expect(code).toBe(1)
	})

	test('the type error is refused by tsc, and it is the only one', () => {
		const tsc = path.join(ROOT, 'node_modules/typescript/bin/tsc')
		const { code, output } = run([tsc, '--noEmit', '--strict', '--skipLibCheck', TYPE_ERROR.file, BIOME_ERROR.file])

		expect(output).toContain(`${TYPE_ERROR.file}(2,14): error TS2322`)
		expect(output).not.toContain(BIOME_ERROR.file)
		expect(code).not.toBe(0)
	})

	test('the lint error is refused by Biome under the rules of the repository, and it is the only one', () => {
		const biome = path.join(ROOT, 'node_modules/@biomejs/biome/bin/biome')
		const { code, output } = run([biome, 'ci', '--colors=off', 'tests'])

		expect(output).toContain('lint/correctness/noUnusedVariables')
		expect(output).toContain(BIOME_ERROR.file)
		expect(output).not.toContain(TYPE_ERROR.file)
		expect(output).not.toContain(FALSE_TEST.file)
		expect(output).toContain('Found 1 error.')
		expect(code).toBe(1)
	})
})

describe('the canary is only written on a canary branch', () => {
	test.each(['canari-2026-10', 'canari-p1'])('accepted: %s', branch => {
		expect(refusal(branch)).toBeUndefined()
	})

	test.each([
		'v3',
		'main',
		'v3-010-012-029',
		'canari',
		'canari-',
		'mon-canari-2026',
		'HEAD',
		'',
	])('refused: « %s »', branch => {
		expect(refusal(branch)).toContain('le canari ne s’écrit que sur une branche dont le nom commence par « canari- »')
	})
})
