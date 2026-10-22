/**
 * The speed gate of the CI (issue 984; plan 02 §7.5): the four reference pages are measured by Lighthouse on the bench
 * (`bun run perf:ci`) and judged with the budgets of the plan, in WARNING for two weeks, then in ERROR.
 *
 * The switch is a date, not a setting: before `BLOCKING_FROM` a missed budget (or a measure that could not be made)
 * is a `::warning` annotation and the exit code is 0; from that day it is an `::error` annotation and the exit code
 * is 1. Two weeks later, `STRICT_PERFORMANCE_FROM`, the performance score asked goes from 85 to 90. Nothing in the
 * workflow softens a failure (the CI guard rails forbid `continue-on-error` and `|| true`): the softness is here.
 *
 * This file is the decision and its text, with no process and no network (tests/unit/perf-ci-gate.test.ts). The
 * command that runs Lighthouse and reads the result is scripts/perf/ci.ts.
 */

import { BUDGETS, type Budgets, judge, type PageResult, type PlanPage, type Verdict } from './lighthouse-measure'

/** The first day of the error mode: two weeks after the gate was set up (23/10/2026). */
export const BLOCKING_FROM = '2026-11-06'

/** The first day the performance score asked is 90 instead of 85: two weeks after the blocking starts. */
export const STRICT_PERFORMANCE_FROM = '2026-11-20'

export type Mode = 'warn' | 'error'

export const modeAt = (now: Date): Mode =>
	now.getTime() >= Date.parse(`${BLOCKING_FROM}T00:00:00Z`) ? 'error' : 'warn'

export const budgetsAt = (now: Date): Budgets => ({
	...BUDGETS,
	performance: now.getTime() >= Date.parse(`${STRICT_PERFORMANCE_FROM}T00:00:00Z`) ? 0.9 : BUDGETS.performance,
})

export interface Finding {
	page: PlanPage
	name: string
	value: string
	limit: string
}

export interface Evaluation {
	mode: Mode
	/** The budgets that were missed, on the median of the runs. */
	findings: Finding[]
	/** Set when the measure could not be made at all. */
	failure?: string
}

/** Judges the medians of the pages, or records that the measure could not be made. */
export function evaluate(pages: readonly PageResult[] | undefined, now: Date, failure?: string): Evaluation {
	const mode = modeAt(now)
	if (!pages || failure) return { mode, findings: [], failure: failure ?? 'aucune mesure' }
	const budgets = budgetsAt(now)
	const findings = pages.flatMap(({ page, runs }) =>
		judge(page, runs, budgets)
			.filter((verdict: Verdict) => !verdict.held)
			.map(({ name, value, limit }) => ({ page, name, value, limit }))
	)
	return { mode, findings }
}

/** The annotation lines GitHub shows on the run: `::warning` or `::error`, one per missed budget. */
export function annotations({ mode, findings, failure }: Evaluation): string[] {
	const level = mode === 'error' ? 'error' : 'warning'
	if (failure) return [`::${level} title=Vitesse::La mesure n’a pas pu se faire : ${failure}`]
	return findings.map(
		f =>
			`::${level} title=Vitesse ${f.page}::${f.page} ${f.name} : ${f.value} (demandé ${f.limit}, médiane des passages)`
	)
}

/** 1 in error mode when a budget is missed or the measure failed; always 0 in warning mode. */
export const exitCode = ({ mode, findings, failure }: Evaluation): 0 | 1 =>
	mode === 'error' && (findings.length > 0 || failure !== undefined) ? 1 : 0
