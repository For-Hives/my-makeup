import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   ALTER TYPE "public"."enum_demandes_statut" ADD VALUE 'repondue';
  ALTER TYPE "public"."enum_demandes_statut" ADD VALUE 'spam';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "demandes" ALTER COLUMN "statut" SET DATA TYPE text;
  ALTER TABLE "demandes" ALTER COLUMN "statut" SET DEFAULT 'nouvelle'::text;
  DROP TYPE "public"."enum_demandes_statut";
  CREATE TYPE "public"."enum_demandes_statut" AS ENUM('nouvelle', 'transmise');
  ALTER TABLE "demandes" ALTER COLUMN "statut" SET DEFAULT 'nouvelle'::"public"."enum_demandes_statut";
  ALTER TABLE "demandes" ALTER COLUMN "statut" SET DATA TYPE "public"."enum_demandes_statut" USING "statut"::"public"."enum_demandes_statut";`)
}
