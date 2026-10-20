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
export interface Revalidation {
	fonction: 'revalidatePath' | 'revalidateTag'
	cible: string
	option: unknown
}

let enregistrement: Revalidation[] | undefined

mock.module('next/cache.js', () => ({
	...NEXT,
	revalidatePath: (...[chemin, type]: Parameters<typeof NEXT.revalidatePath>) => {
		if (!enregistrement) return NEXT.revalidatePath(chemin, type)
		enregistrement.push({ fonction: 'revalidatePath', cible: chemin, option: type })
	},
	revalidateTag: (...[etiquette, profil]: Parameters<typeof NEXT.revalidateTag>) => {
		if (!enregistrement) return NEXT.revalidateTag(etiquette, profil)
		enregistrement.push({ fonction: 'revalidateTag', cible: etiquette, option: profil })
	},
}))

/** What the spied action asked Next to refresh. */
export interface Rafraichi {
	/** The paths given to `revalidatePath`, sorted, a path given twice twice. */
	chemins: string[]
	/** The tags given to `revalidateTag`, sorted, a tag given twice twice. */
	etiquettes: string[]
	/** Every call, in its order. */
	appels: Revalidation[]
}

const cibles = (appels: Revalidation[], fonction: Revalidation['fonction']) =>
	appels
		.filter(appel => appel.fonction === fonction)
		.map(({ cible }) => cible)
		.sort()

/** Runs the action, and gives what it asked Next's cache to refresh. */
export async function espionnerLeCache(action: () => Promise<unknown>): Promise<Rafraichi> {
	if (enregistrement) throw new Error('espionnerLeCache ne s’imbrique pas : une action à la fois.')
	const appels: Revalidation[] = []
	enregistrement = appels
	try {
		await action()
	} finally {
		enregistrement = undefined
	}
	return { chemins: cibles(appels, 'revalidatePath'), etiquettes: cibles(appels, 'revalidateTag'), appels }
}
