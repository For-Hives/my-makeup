/**
 * The accessibility check of the end-to-end tests: axe, run in the page Playwright has open.
 *
 *   expect(await violationsGraves(page)).toEqual([])
 *
 * Blocking on the two highest levels of axe, « serious » and « critical », against WCAG 2.0 and
 * 2.1, levels A and AA. The lower levels are not reported here: they are read at the manual
 * check, not in a test.
 *
 * An automatic check sees part of the faults only (a missing name, a contrast, a role). It
 * says nothing about the reading order, the focus or what a screen reader really says.
 */

import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

/** The rule sets of axe that are run. */
export const REFERENCES = ['wcag2a', 'wcag2aa', 'wcag21aa'] as const

/** The levels of axe that fail a test. */
export const SEVERE_LEVELS = ['serious', 'critical'] as const

export type SevereLevel = (typeof SEVERE_LEVELS)[number]

/** One rule that is broken, short enough to be read in the report of a failed test. */
export interface ViolationSevere {
	/** The name of the rule in axe, such as `image-alt` or `color-contrast`. */
	regle: string
	niveau: SevereLevel
	/** What the rule asks for, in the words of axe. */
	aide: string
	/** Where to read about the rule. */
	lien: string
	/** A selector for each element at fault. */
	elements: string[]
}

/** What the filter reads in a result of axe. */
export interface ViolationDAxe {
	id: string
	impact?: string | null
	help: string
	helpUrl: string
	nodes: readonly { target: readonly unknown[] }[]
}

const isSevere = (niveau: string | null | undefined): niveau is SevereLevel =>
	SEVERE_LEVELS.some(grave => grave === niveau)

/** Keeps the violations of the two highest levels, each in its short form. */
export function keepSevere(violations: readonly ViolationDAxe[]): ViolationSevere[] {
	return violations.flatMap(({ id, impact, help, helpUrl, nodes }) =>
		isSevere(impact)
			? [
					{
						regle: id,
						niveau: impact,
						aide: help,
						lien: helpUrl,
						// An element inside a frame or a shadow tree is given as a path of selectors.
						elements: nodes.map(({ target }) => target.flat().join(' ')),
					},
				]
			: []
	)
}

export interface OptionsDAxe {
	/** Selectors left out of the check: a third-party widget the site does not write, never a fault to hide. */
	sauf?: readonly string[]
}

/**
 * Runs axe on the page as it is now and gives back the « serious » and « critical » violations.
 * Empty when there is none. Wait for the state to check before calling: axe reads the page once.
 */
export async function violationsSevere(page: Page, { sauf = [] }: OptionsDAxe = {}): Promise<ViolationSevere[]> {
	// Axe judges the settled page: a block caught half way through its scroll-driven reveal (issue 1069) is not a contrast fault.
	await page.addStyleTag({ content: '.reveal{animation:none!important}' })
	let axe = new AxeBuilder({ page }).withTags([...REFERENCES])
	for (const selector of sauf) axe = axe.exclude(selector)
	const { violations } = await axe.analyze()
	return keepSevere(violations)
}
