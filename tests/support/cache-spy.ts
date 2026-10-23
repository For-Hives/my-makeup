/**
 * A spy on the refresh of Next's cache (ticket 047, I21): what a write asks Next to render again.
 *
 *   const { chemins, etiquettes } = await espionnerLeCache(() => appelerRest('PATCH', chemin, options))
 *
 * `next/cache` is replaced as soon as this file is loaded, for the rest of the run: while
 * `espionnerLeCache` runs, `revalidatePath` and `revalidateTag` are recorded instead of being called;
 * the rest of the time they are Next's own, which refuse to run outside of one of its requests
 * (src/collections/revalidate.ts). Every other export of `next/cache` stays Next's own.
 *
 * A test calls the spy around the write it looks at, never around another spy.
 */

import { mock } from 'bun:test'
import * as cacheDeNext from 'next/cache.js'

/** Next's own functions, kept before the replacement. */
const NEXT = { ...cacheDeNext }

/** One call to Next's cache, with its second argument (the type of a path, the profile of a tag). */
export interface RevalidateCall {
	fonction: 'revalidatePath' | 'revalidateTag'
	cible: string
	option: unknown
}

let record: RevalidateCall[] | undefined

mock.module('next/cache.js', () => ({
	...NEXT,
	revalidatePath: (...[chemin, type]: Parameters<typeof NEXT.revalidatePath>) => {
		if (!record) return NEXT.revalidatePath(chemin, type)
		record.push({ fonction: 'revalidatePath', cible: chemin, option: type })
	},
	revalidateTag: (...[etiquette, profil]: Parameters<typeof NEXT.revalidateTag>) => {
		if (!record) return NEXT.revalidateTag(etiquette, profil)
		record.push({ fonction: 'revalidateTag', cible: etiquette, option: profil })
	},
}))

/** What the spied action asked Next to refresh. */
export interface Refreshed {
	/** The paths given to `revalidatePath`, sorted, a path given twice twice. */
	chemins: string[]
	/** The tags given to `revalidateTag`, sorted, a tag given twice twice. */
	etiquettes: string[]
	/** Every call, in its order. */
	appels: RevalidateCall[]
}

const targets = (appels: RevalidateCall[], fonction: RevalidateCall['fonction']) =>
	appels
		.filter(appel => appel.fonction === fonction)
		.map(({ cible }) => cible)
		.sort()

/** Runs the action, and gives what it asked Next's cache to refresh. */
export async function spyCache(action: () => Promise<unknown>): Promise<Refreshed> {
	if (record) throw new Error('espionnerLeCache ne s’imbrique pas : une action à la fois.')
	const calls: RevalidateCall[] = []
	record = calls
	try {
		await action()
	} finally {
		record = undefined
	}
	return { chemins: targets(calls, 'revalidatePath'), etiquettes: targets(calls, 'revalidateTag'), appels: calls }
}
