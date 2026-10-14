import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Snapshot-only migration (integration of wave 4). The lots of tickets 083 to 091 each wrote their own
 * migration of the journal enums from the same earlier snapshot, so none of the snapshots described the sum.
 * The SQL is already carried by `inscription_antispam`, `auth_blocage`, `auth_evenements_heritee`,
 * `auth_oubli_journal` and `google_methode_du_journal`; this file only records the merged schema so that
 * `bun run schema:derive` and the next `payload:migrate:create` start from the right place.
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
