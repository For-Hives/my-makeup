import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Provisional migration of ticket 018: the role of an `admins` account.
 *
 * Written by `bun run payload:migrate:create`, read, then changed in one place: the accounts that
 * already exist become `admin`, then the default becomes `redaction`, as in the collection. They
 * were created before the roles, when every account could do everything; the first account of the
 * pre-production, created by hand, must keep the right to create the others. Only the pre-production
 * plays this migration; it is replaced by the reviewed `init` migration (ticket 049).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TYPE "public"."enum_admins_role" AS ENUM('admin', 'redaction');
  ALTER TABLE "admins" ADD COLUMN "role" "enum_admins_role" DEFAULT 'admin' NOT NULL;
  ALTER TABLE "admins" ALTER COLUMN "role" SET DEFAULT 'redaction';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "admins" DROP COLUMN "role";
  DROP TYPE "public"."enum_admins_role";`)
}
