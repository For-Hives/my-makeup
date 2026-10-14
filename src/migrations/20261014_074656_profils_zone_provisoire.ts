import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "profils" ADD COLUMN "commune_nom" varchar;
  ALTER TABLE "profils" ADD COLUMN "commune_code_insee" varchar;
  ALTER TABLE "profils" ADD COLUMN "commune_departement" varchar;
  ALTER TABLE "profils" ADD COLUMN "commune_latitude" numeric;
  ALTER TABLE "profils" ADD COLUMN "commune_longitude" numeric;
  ALTER TABLE "profils" ADD COLUMN "rayon_km" numeric;
  ALTER TABLE "profils" ADD COLUMN "a_domicile" boolean;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "profils" DROP COLUMN "commune_nom";
  ALTER TABLE "profils" DROP COLUMN "commune_code_insee";
  ALTER TABLE "profils" DROP COLUMN "commune_departement";
  ALTER TABLE "profils" DROP COLUMN "commune_latitude";
  ALTER TABLE "profils" DROP COLUMN "commune_longitude";
  ALTER TABLE "profils" DROP COLUMN "rayon_km";
  ALTER TABLE "profils" DROP COLUMN "a_domicile";`)
}
