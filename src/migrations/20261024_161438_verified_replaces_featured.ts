import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Issue 1066: the home page « Mise en avant » draws among the profiles ticked « Vérifiée » (`verified`, which already
 * exists), so the box `featured` of issue 1066 goes. The journal gets the two lines of the new box (`verify`,
 * `unverify`). The old values `feature` and `unfeature` stay in the enum: rows already written use them, and a value
 * of an enum is never removed (the history of the journal keeps reading).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   ALTER TYPE "public"."enum_moderation_events_action" ADD VALUE 'verify';
  ALTER TYPE "public"."enum_moderation_events_action" ADD VALUE 'unverify';
  ALTER TABLE "profiles" DROP COLUMN "featured";`)
}

/**
 * Puts the column back. The two values added to the enum stay: removing them would rewrite the table of the journal,
 * and fail on a row that uses them; a value nothing writes any more does no harm.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "profiles" ADD COLUMN "featured" boolean DEFAULT false;`)
}
