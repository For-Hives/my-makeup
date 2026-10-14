import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Provisional migration of ticket 021: the fields of a profile reserved to the role `admin`.
 *
 * Written by `bun run payload:migrate:create`, read, then tidied (unused arguments removed,
 * formatted by Biome). `up` only adds: the type and the column of the status (a draft by default,
 * indexed: every public read filters on it), the reason, the verification and its date, the
 * SIRET, the internal note, the score and the « Super maquilleuse » badge. Only the
 * pre-production plays it; it is replaced by the reviewed `init` migration (ticket 049).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TYPE "public"."enum_profils_statut" AS ENUM('brouillon', 'publie', 'masque');
  ALTER TABLE "profils" ADD COLUMN "statut" "enum_profils_statut" DEFAULT 'brouillon';
  ALTER TABLE "profils" ADD COLUMN "motif" varchar;
  ALTER TABLE "profils" ADD COLUMN "verifie" boolean DEFAULT false;
  ALTER TABLE "profils" ADD COLUMN "verifie_le" timestamp(3) with time zone;
  ALTER TABLE "profils" ADD COLUMN "siret" varchar;
  ALTER TABLE "profils" ADD COLUMN "note_interne" varchar;
  ALTER TABLE "profils" ADD COLUMN "score" numeric;
  ALTER TABLE "profils" ADD COLUMN "super_maquilleuse" boolean DEFAULT false;
  CREATE INDEX "profils_statut_idx" ON "profils" USING btree ("statut");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   DROP INDEX "profils_statut_idx";
  ALTER TABLE "profils" DROP COLUMN "statut";
  ALTER TABLE "profils" DROP COLUMN "motif";
  ALTER TABLE "profils" DROP COLUMN "verifie";
  ALTER TABLE "profils" DROP COLUMN "verifie_le";
  ALTER TABLE "profils" DROP COLUMN "siret";
  ALTER TABLE "profils" DROP COLUMN "note_interne";
  ALTER TABLE "profils" DROP COLUMN "score";
  ALTER TABLE "profils" DROP COLUMN "super_maquilleuse";
  DROP TYPE "public"."enum_profils_statut";`)
}
