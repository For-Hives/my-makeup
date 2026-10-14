import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TYPE "public"."enum_auth_evenements_methode" AS ENUM('mot-de-passe', 'google');
  ALTER TYPE "public"."enum_auth_evenements_code" ADD VALUE 'email-non-verifie' BEFORE 'inconnu';
  ALTER TYPE "public"."enum_auth_evenements_code" ADD VALUE 'compte-refuse' BEFORE 'inconnu';
  ALTER TYPE "public"."enum_auth_evenements_code" ADD VALUE 'annule' BEFORE 'inconnu';
  ALTER TYPE "public"."enum_auth_evenements_code" ADD VALUE 'retour-invalide' BEFORE 'inconnu';
  ALTER TABLE "auth_evenements" ADD COLUMN "methode" "enum_auth_evenements_methode";
  CREATE INDEX "auth_evenements_methode_idx" ON "auth_evenements" USING btree ("methode");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "auth_evenements" ALTER COLUMN "code" SET DATA TYPE text;
  DROP TYPE "public"."enum_auth_evenements_code";
  CREATE TYPE "public"."enum_auth_evenements_code" AS ENUM('ok', 'identifiants-invalides', 'trop-de-tentatives', 'service-indisponible', 'email-non-confirme', 'donnees-invalides', 'email-deja-pris', 'deja-confirme', 'lien-invalide', 'inconnu');
  ALTER TABLE "auth_evenements" ALTER COLUMN "code" SET DATA TYPE "public"."enum_auth_evenements_code" USING "code"::"public"."enum_auth_evenements_code";
  DROP INDEX "auth_evenements_methode_idx";
  ALTER TABLE "auth_evenements" DROP COLUMN "methode";
  DROP TYPE "public"."enum_auth_evenements_methode";`)
}
