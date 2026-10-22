/**
 * The speed gate of the CI (issue 984): `bun run perf:ci`, run by the `perf` job of .github/workflows/ci.yml after
 * `bun run bench:full` has the application up on the bench.
 *
 * It measures the four reference pages (3 runs each, median; plan 02 §7.5) with scripts/perf/lighthouse.ts, judges
 * them with the budgets of the plan (scripts/perf/ci-gate.ts) and writes the result as annotations of the run and as
 * a report in its summary. Before BLOCKING_FROM a missed budget, or a measure that could not be made, is a warning
 * (exit code 0); from that day it is an error (exit code 1).
 *
 * A CI runner is never « at rest » in the sense of docs/mesure/lighthouse.md: the measure is taken with
 * `--indicative`, and the report says so. The gate watches for a regression, it does not freeze a number.
 */

import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { annotations, BLOCKING_FROM, type Evaluation, evaluate, exitCode } from './ci-gate'
import { run } from './lighthouse'
import type { Measure } from './lighthouse-measure'

/** Runs per page in the CI: the plan asks for the median of 3. */
export const CI_RUNS = 3

/** Runs the measure and judges it; a measure that cannot be made is an evaluation with a failure, never a throw. */
async function measureAndJudge(
	args: readonly string[],
	env: Record<string, string | undefined>,
	now: Date,
	report: string
): Promise<Evaluation> {
	let code: number
	try {
		code = await run(['--runs', String(CI_RUNS), '--indicative', ...args, '--out', report], env)
	} catch (error) {
		return evaluate(undefined, now, error instanceof Error ? error.message.slice(0, 300) : 'erreur')
	}
	if (code !== 0) return evaluate(undefined, now, `la mesure s’est arrêtée avec le code ${code}`)
	const measure = JSON.parse(readFileSync(report.replace(/\.md$/, '.json'), 'utf8')) as Measure
	const summary = env.GITHUB_STEP_SUMMARY
	if (summary) appendFileSync(summary, `${readFileSync(report, 'utf8')}\n`)
	return evaluate(measure.pages, now)
}

export async function main(
	args: readonly string[],
	env: Record<string, string | undefined>,
	now: Date = new Date()
): Promise<number> {
	const folder = mkdtempSync(path.join(tmpdir(), 'my-makeup-perf-ci-'))
	let evaluation: Evaluation
	try {
		evaluation = await measureAndJudge(args, env, now, path.join(folder, 'lighthouse.md'))
	} finally {
		rmSync(folder, { recursive: true, force: true })
	}
	for (const line of annotations(evaluation)) console.log(line)
	const verdict = evaluation.findings.length === 0 && !evaluation.failure ? 'dans les budgets' : 'budgets manqués'
	console.log(
		`Vitesse des quatre pages : ${verdict} (mode ${evaluation.mode === 'error' ? 'blocage' : `avertissement, blocage à partir du ${BLOCKING_FROM}`}).`
	)
	return exitCode(evaluation)
}

if (import.meta.main) process.exit(await main(process.argv.slice(2), process.env))
