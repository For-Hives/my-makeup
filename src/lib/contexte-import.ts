import type { RequestContext } from 'payload'

/**
 * What every write of the import hands to Payload (`context`): the import of the data of the old
 * site (scripts/migration/import.ts, docs/migration/IMPORT.md).
 *
 * The import writes the data as they are, and tells nobody: a hook that would send an email,
 * refresh the cache of a page or move a photo to the bin reads it and does nothing
 * (`estUnImport`). The confirmation email of a new account is turned off by the import itself, at
 * each creation (`disableVerificationEmail`); the refresh of the pages and the bin of the photos
 * read this context in their own tickets (047 and 045).
 *
 * No `next` import: this file is loaded by the import, outside of Next, and by the collections.
 */
export const CONTEXTE_IMPORT = { import: true } as const satisfies RequestContext

/** True when the write comes from the import: a hook then does nothing beyond the data itself. */
export const estUnImport = (context: RequestContext | undefined): boolean => context?.import === true
