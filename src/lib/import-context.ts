import type { RequestContext } from 'payload'

/**
 * What every write of the import hands to Payload (`context`): the import of the data of the old
 * site (scripts/migration/import.ts, docs/migration/IMPORT.md).
 *
 * The import writes the data as they are, and tells nobody: a hook that would send an email,
 * refresh the cache of a page or move a photo to the bin reads it and does nothing
 * (`isImport`). The confirmation email of a new account is turned off by the import itself, at
 * each creation (`disableVerificationEmail`); the refresh of the pages and the bin of the photos
 * read this context in their own tickets (047 and 045).
 *
 * No `next` import: this file is loaded by the import, outside of Next, and by the collections.
 */
export const IMPORT_CONTEXT = { import: true } as const satisfies RequestContext

/** True when the write comes from the import: a hook then does nothing beyond the data itself. */
export const isImport = (context: RequestContext | undefined): boolean => context?.import === true

let importsInProgress = 0

/**
 * Marks an import as running in this process; gives the function that ends the mark. The daily
 * tasks (src/lib/tasks/) read it and wait for the next day rather than delete under the import.
 */
export function markImportInProgress(): () => void {
	importsInProgress++
	let finished = false
	return () => {
		if (finished) return
		finished = true
		importsInProgress--
	}
}

/** True while an import runs in this process. */
export const importInProgress = (): boolean => importsInProgress > 0
