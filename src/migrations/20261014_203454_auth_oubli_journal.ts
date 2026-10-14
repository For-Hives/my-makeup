import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   ALTER TYPE "public"."enum_auth_evenements_type" ADD VALUE 'mot-de-passe-oublie';
  ALTER TYPE "public"."enum_auth_evenements_type" ADD VALUE 'reinitialisation';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   DELETE FROM "auth_evenements" WHERE "type" IN ('mot-de-passe-oublie', 'reinitialisation');
  ALTER TABLE "auth_evenements" ALTER COLUMN "type" SET DATA TYPE text;
  DROP TYPE "public"."enum_auth_evenements_type";
  CREATE TYPE "public"."enum_auth_evenements_type" AS ENUM('connexion', 'deconnexion', 'deconnexion-partout', 'inscription', 'confirmation');
  ALTER TABLE "auth_evenements" ALTER COLUMN "type" SET DATA TYPE "public"."enum_auth_evenements_type" USING "type"::"public"."enum_auth_evenements_type";`)
}
