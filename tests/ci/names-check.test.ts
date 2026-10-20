import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { evaluate, loadConfig, loadWords, type NamingConfig, namesOfPaths } from '../../scripts/naming/check'
import { readWorkflow } from '../support/ci-guardrails'

/**
 * The check of the French names (docs/noms.md) is a step of the job `qualite`, so `ci-ok` is red
 * as soon as it is (ticket 254). Two things are kept here: the step stays in the workflow, alone
 * and under no condition that could skip it; and, with the committed configuration, a French name
 * added to the code is a failure while a named exception is not.
 */

const ROOT = path.resolve(import.meta.dir, '../..')
const STEP = { name: 'English names', run: 'bun run names:check' }

function stepsOf(job: string): { name?: string; run?: string; if?: string }[] {
	const workflow = readWorkflow('ci.yml', readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8'))
	const jobs = (workflow.document as { jobs?: Record<string, { steps?: unknown[] }> }).jobs ?? {}
	return (jobs[job]?.steps ?? []) as { name?: string; run?: string; if?: string }[]
}

describe('the names check in the CI', () => {
	test('the job qualite runs « bun run names:check », alone in its step, even after another check failed', () => {
		const steps = stepsOf('qualite').filter(step => step.run === STEP.run)
		expect(steps).toHaveLength(1)
		expect(steps[0]?.name).toBe(STEP.name)
		expect(steps[0]?.if).toBe('${{ !cancelled() }}')
	})

	test('no new job and no new required check: the step lives in qualite', () => {
		const required = JSON.parse(readFileSync(path.join(ROOT, 'ci/required-checks.json'), 'utf8')) as unknown
		expect(JSON.stringify(required)).not.toMatch(/names|noms/i)
	})
})

describe('the waiting list of the names check', () => {
	test('every entry has an owner ticket, and an owner names no entry that is not waiting', () => {
		const config = loadConfig()
		const entries = config.waiting.filter(entry => !entry.startsWith('!'))
		const owners = config.owners ?? {}
		expect(entries.filter(entry => !Number.isInteger(owners[entry]))).toEqual([])
		expect(Object.keys(owners).filter(entry => !entries.includes(entry))).toEqual([])
	})
})

describe('the names check with the committed configuration', () => {
	const words = loadWords()
	const config = loadConfig()
	const frenchFile = 'src/lib/zz-trial/lire-le-profil.ts'
	const names = (extra: Record<string, string>) =>
		namesOfPaths(Object.keys(extra), file => extra[file] ?? '', ['src', 'scripts', 'tests'])

	test('a French name added to a folder outside the waiting list fails the check', () => {
		const report = evaluate(names({ [frenchFile]: 'export const lireLeProfil = 1\n' }), config, words, {
			useWaiting: true,
		})
		expect(report.failures.length).toBeGreaterThan(0)
	})

	test('the same name under a named exception does not', () => {
		const excused: NamingConfig = {
			...config,
			exceptions: {
				...config.exceptions,
				paths: [
					...config.exceptions.paths,
					{ path: 'src/lib/zz-trial/lire-le-profil.ts', reason: 'Trial: a named exception is not a failure.' },
				],
				words: [
					...config.exceptions.words,
					{ word: 'lire', in: ['src/lib/zz-trial/lire-le-profil.ts'], reason: 'Trial: a scoped word.' },
					{ word: 'le', in: ['src/lib/zz-trial/lire-le-profil.ts'], reason: 'Trial: a scoped word.' },
					{ word: 'profil', in: ['src/lib/zz-trial/lire-le-profil.ts'], reason: 'Trial: a scoped word.' },
				],
			},
		}
		const report = evaluate(names({ [frenchFile]: 'export const lireLeProfil = 1\n' }), excused, words, {
			useWaiting: true,
		})
		expect(report.failures).toEqual([])
	})
})
