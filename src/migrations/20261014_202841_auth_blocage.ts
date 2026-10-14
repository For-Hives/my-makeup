import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   ALTER TYPE "public"."enum_auth_evenements_type" ADD VALUE 'blocage';
  ALTER TYPE "public"."enum_auth_evenements_type" ADD VALUE 'deblocage';
  ALTER TYPE "public"."enum_auth_evenements_code" ADD VALUE 'compte-bloque' BEFORE 'donnees-invalides';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "auth_evenements" ALTER COLUMN "type" SET DATA TYPE text;
  DROP TYPE "public"."enum_auth_evenements_type";
  CREATE TYPE "public"."enum_auth_evenements_type" AS ENUM('connexion', 'deconnexion', 'deconnexion-partout', 'inscription', 'confirmation');
  ALTER TABLE "auth_evenements" ALTER COLUMN "type" SET DATA TYPE "public"."enum_auth_evenements_type" USING "type"::"public"."enum_auth_evenements_type";
  ALTER TABLE "auth_evenements" ALTER COLUMN "code" SET DATA TYPE text;
  DROP TYPE "public"."enum_auth_evenements_code";
  CREATE TYPE "public"."enum_auth_evenements_code" AS ENUM('ok', 'identifiants-invalides', 'trop-de-tentatives', 'service-indisponible', 'email-non-confirme', 'donnees-invalides', 'email-deja-pris', 'deja-confirme', 'lien-invalide', 'inconnu');
  ALTER TABLE "auth_evenements" ALTER COLUMN "code" SET DATA TYPE "public"."enum_auth_evenements_code" USING "code"::"public"."enum_auth_evenements_code";`)
}
