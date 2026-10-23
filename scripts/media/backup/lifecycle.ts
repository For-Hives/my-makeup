/**
 * The lifecycle rule that empties the bin of the photos (ticket 278; docs/migration/SCHEMA.md §8).
 *
 * The application moves a photo that no longer serves under `deleted/` (src/lib/trash.ts) and never
 * erases it: the storage does, 30 days later, by one rule on that prefix. The API sets the whole
 * list of rules at once, so the plan keeps every rule it read as it came and adds or corrects its
 * own, and `onlyTrashRuleDiffers` is the check made on the list read back afterwards.
 */

// Relative imports on purpose: this script runs outside of Next.
import { PHOTO_ERASURE_DAYS } from '../../../src/lib/providers'
import { TRASH_PREFIX } from '../../../src/lib/trash'
import type { LifecycleRule } from './r2'

export const TRASH_RULE_ID = 'Erase the bin after 30 days'

const SECONDS_PER_DAY = 86_400

/** The rule: objects under `deleted/` older than 30 days are deleted; nothing else is in its scope. */
export const trashRule = (days: number = PHOTO_ERASURE_DAYS): LifecycleRule => ({
	id: TRASH_RULE_ID,
	enabled: true,
	conditions: { prefix: `${TRASH_PREFIX}/` },
	deleteObjectsTransition: { condition: { maxAge: days * SECONDS_PER_DAY, type: 'Age' } },
})

/** True for a rule that deletes objects. */
const deletes = (rule: LifecycleRule): boolean => rule.deleteObjectsTransition !== undefined

export interface LifecyclePlan {
	/** `add`: no rule of ours yet; `update`: ours differs; `none`: already as wanted. */
	action: 'add' | 'update' | 'none'
	/** The list to send: every rule read, untouched, plus ours. */
	rules: LifecycleRule[]
	/** Rules (other than ours) that delete objects: they are left alone, but listed, since one without the prefix would reach the live photos. */
	otherDeletingRules: string[]
	/** The rules that would reach an object outside of `deleted/`. Not empty: do not apply. */
	dangerousRules: string[]
}

const prefixOf = (rule: LifecycleRule): string => rule.conditions?.prefix ?? ''

/** What to send so that the bin empties after `days` days and no other rule changes. */
export function planLifecycle(existing: readonly LifecycleRule[], days: number = PHOTO_ERASURE_DAYS): LifecyclePlan {
	const wanted = trashRule(days)
	const ours = existing.find(rule => rule.id === TRASH_RULE_ID)
	const others = existing.filter(rule => rule.id !== TRASH_RULE_ID)
	const otherDeletingRules = others.filter(deletes).map(rule => rule.id)
	const dangerousRules = others
		.filter(rule => rule.enabled && deletes(rule) && !prefixOf(rule).startsWith(`${TRASH_PREFIX}/`))
		.map(rule => rule.id)
	const same = ours !== undefined && JSON.stringify(sortKeys(ours)) === JSON.stringify(sortKeys(wanted))
	return {
		action: ours === undefined ? 'add' : same ? 'none' : 'update',
		rules:
			ours === undefined ? [...existing, wanted] : existing.map(rule => (rule.id === TRASH_RULE_ID ? wanted : rule)),
		otherDeletingRules,
		dangerousRules,
	}
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys)
	if (typeof value === 'object' && value !== null)
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, inner]) => [key, sortKeys(inner)])
		)
	return value
}

/** True when `after` is `before` plus (or with a corrected) rule of ours, every other rule identical. */
export function onlyTrashRuleDiffers(before: readonly LifecycleRule[], after: readonly LifecycleRule[]): boolean {
	const strip = (rules: readonly LifecycleRule[]) =>
		JSON.stringify(sortKeys(rules.filter(rule => rule.id !== TRASH_RULE_ID)))
	return strip(before) === strip(after)
}

/** True when the rule read back is the one wanted, scoped to the bin. */
export function trashRuleIsSet(rules: readonly LifecycleRule[], days: number = PHOTO_ERASURE_DAYS): boolean {
	const found = rules.find(rule => rule.id === TRASH_RULE_ID)
	return found !== undefined && JSON.stringify(sortKeys(found)) === JSON.stringify(sortKeys(trashRule(days)))
}
