import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * The session a link of a mail opens leaves a row in the authentication journal (ticket 302): its method
 * says which link, `confirmation` or `password-reset`. Two values join the enumeration; every row stored
 * keeps its method. The way back rebuilds the enumeration without them, and fails if a row has one of the
 * two since.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   ALTER TYPE "public"."enum_auth_events_method" ADD VALUE 'confirmation';
  ALTER TYPE "public"."enum_auth_events_method" ADD VALUE 'password-reset';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "auth_events" ALTER COLUMN "method" SET DATA TYPE text;
  DROP TYPE "public"."enum_auth_events_method";
  CREATE TYPE "public"."enum_auth_events_method" AS ENUM('password', 'google');
  ALTER TABLE "auth_events" ALTER COLUMN "method" SET DATA TYPE "public"."enum_auth_events_method" USING "method"::"public"."enum_auth_events_method";`)
}
