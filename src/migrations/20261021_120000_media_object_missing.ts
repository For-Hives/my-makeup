import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * The photos of the old site adopted without an object (ticket 275): one boolean column of `media`,
 * posed by the import on a photo whose file the storage did not hold, so that the pages leave it
 * out instead of drawing a broken image. Addition only: every media already stored reads `false`
 * until the next import marks the one that needs it. No DROP, no rewrite of a column.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "media" ADD COLUMN "object_missing" boolean DEFAULT false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "media" DROP COLUMN "object_missing";`)
}
