import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "pros" DROP COLUMN "login_attempts";
  ALTER TABLE "pros" DROP COLUMN "lock_until";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "pros" ADD COLUMN "login_attempts" numeric DEFAULT 0;
  ALTER TABLE "pros" ADD COLUMN "lock_until" timestamp(3) with time zone;`)
}
