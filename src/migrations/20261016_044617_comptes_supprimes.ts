import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TABLE "comptes_supprimes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"strapi_id" numeric NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "comptes_supprimes_id" integer;
  CREATE UNIQUE INDEX "comptes_supprimes_strapi_id_idx" ON "comptes_supprimes" USING btree ("strapi_id");
  CREATE INDEX "comptes_supprimes_date_idx" ON "comptes_supprimes" USING btree ("date");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_comptes_supprimes_fk" FOREIGN KEY ("comptes_supprimes_id") REFERENCES "public"."comptes_supprimes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_comptes_supprimes_id_idx" ON "payload_locked_documents_rels" USING btree ("comptes_supprimes_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	// The link to the table goes first: dropping the table with CASCADE would drop the constraint, and the
	// generated order (table first) then fails on a constraint that no longer exists.
	await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_comptes_supprimes_fk";
  DROP INDEX "payload_locked_documents_rels_comptes_supprimes_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "comptes_supprimes_id";
  ALTER TABLE "comptes_supprimes" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "comptes_supprimes" CASCADE;`)
}
