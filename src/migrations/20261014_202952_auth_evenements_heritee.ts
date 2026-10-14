import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   ALTER TYPE "public"."enum_auth_evenements_code" ADD VALUE 'heritee' BEFORE 'identifiants-invalides';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   -- Written by hand: a row « heritee » was a successful sign-in, and the old list does not know the word.
  UPDATE "auth_evenements" SET "code" = 'ok' WHERE "code" = 'heritee';
  ALTER TABLE "auth_evenements" ALTER COLUMN "code" SET DATA TYPE text;
  DROP TYPE "public"."enum_auth_evenements_code";
  CREATE TYPE "public"."enum_auth_evenements_code" AS ENUM('ok', 'identifiants-invalides', 'trop-de-tentatives', 'service-indisponible', 'email-non-confirme', 'donnees-invalides', 'email-deja-pris', 'deja-confirme', 'lien-invalide', 'inconnu');
  ALTER TABLE "auth_evenements" ALTER COLUMN "code" SET DATA TYPE "public"."enum_auth_evenements_code" USING "code"::"public"."enum_auth_evenements_code";`)
}
