import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "talents" ADD COLUMN "titre_de_la_page" varchar;
  ALTER TABLE "_talents_v" ADD COLUMN "version_titre_de_la_page" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "talents" DROP COLUMN "titre_de_la_page";
  ALTER TABLE "_talents_v" DROP COLUMN "version_titre_de_la_page";`)
}
