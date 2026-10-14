import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "profils" ADD COLUMN "statut_fixe" boolean DEFAULT false;
  ALTER TABLE "profils" ADD COLUMN "completude" numeric;
  ALTER TABLE "profils" ADD COLUMN "actif" boolean;
  ALTER TABLE "profils" ADD COLUMN "actif_depuis" timestamp(3) with time zone;
  ALTER TABLE "profils" ADD COLUMN "publiable" boolean;
  ALTER TABLE "profils" ADD COLUMN "publiable_depuis" timestamp(3) with time zone;
  ALTER TABLE "profils" ADD COLUMN "entierement_vide" boolean;
  ALTER TABLE "profils" ADD COLUMN "entierement_vide_depuis" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "profils" DROP COLUMN "statut_fixe";
  ALTER TABLE "profils" DROP COLUMN "completude";
  ALTER TABLE "profils" DROP COLUMN "actif";
  ALTER TABLE "profils" DROP COLUMN "actif_depuis";
  ALTER TABLE "profils" DROP COLUMN "publiable";
  ALTER TABLE "profils" DROP COLUMN "publiable_depuis";
  ALTER TABLE "profils" DROP COLUMN "entierement_vide";
  ALTER TABLE "profils" DROP COLUMN "entierement_vide_depuis";`)
}
