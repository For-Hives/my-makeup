import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Provisional migration of ticket 042: the networks and the contact details of a profile.
 *
 * Written by `bun run payload:migrate:create`, read, then tidied (unused arguments removed,
 * formatted by Biome). `up` only adds: the five links of the networks, the phone and email of
 * contact, the choice to show them (false by default), and the trace of the consent: its date,
 * and the type and column of its source. Only the pre-production plays it; it is replaced by the
 * reviewed `init` migration (ticket 049).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TYPE "public"."enum_profils_source_consentement" AS ENUM('maquilleuse', 'admin', 'import');
  ALTER TABLE "profils" ADD COLUMN "reseaux_youtube" varchar;
  ALTER TABLE "profils" ADD COLUMN "reseaux_facebook" varchar;
  ALTER TABLE "profils" ADD COLUMN "reseaux_instagram" varchar;
  ALTER TABLE "profils" ADD COLUMN "reseaux_site_web" varchar;
  ALTER TABLE "profils" ADD COLUMN "reseaux_linkedin" varchar;
  ALTER TABLE "profils" ADD COLUMN "coordonnees_telephone" varchar;
  ALTER TABLE "profils" ADD COLUMN "coordonnees_email" varchar;
  ALTER TABLE "profils" ADD COLUMN "contact_public" boolean DEFAULT false;
  ALTER TABLE "profils" ADD COLUMN "consenti_le" timestamp(3) with time zone;
  ALTER TABLE "profils" ADD COLUMN "source_consentement" "enum_profils_source_consentement";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "profils" DROP COLUMN "reseaux_youtube";
  ALTER TABLE "profils" DROP COLUMN "reseaux_facebook";
  ALTER TABLE "profils" DROP COLUMN "reseaux_instagram";
  ALTER TABLE "profils" DROP COLUMN "reseaux_site_web";
  ALTER TABLE "profils" DROP COLUMN "reseaux_linkedin";
  ALTER TABLE "profils" DROP COLUMN "coordonnees_telephone";
  ALTER TABLE "profils" DROP COLUMN "coordonnees_email";
  ALTER TABLE "profils" DROP COLUMN "contact_public";
  ALTER TABLE "profils" DROP COLUMN "consenti_le";
  ALTER TABLE "profils" DROP COLUMN "source_consentement";
  DROP TYPE "public"."enum_profils_source_consentement";`)
}
