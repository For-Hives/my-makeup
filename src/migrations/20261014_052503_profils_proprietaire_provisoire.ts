import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Provisional migration of ticket 020: the `profils` collection, one profile per account.
 *
 * Written by `bun run payload:migrate:create`, read, then tidied (unused arguments removed,
 * formatted by Biome). `up` only creates: the table, its unique indexes (account, slug, identifier
 * of the old site), and a column for the new collection in the link table of the document locks.
 * Only the pre-production plays it; it is replaced by the reviewed `init` migration (ticket 049).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TABLE "profils" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"pro_id" integer NOT NULL,
  	"slug" varchar NOT NULL,
  	"prenom" varchar,
  	"nom" varchar,
  	"nom_artiste" varchar,
  	"specialite" varchar,
  	"description" varchar,
  	"disponible" boolean DEFAULT true,
  	"legacy_username" varchar,
  	"strapi_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "profils_id" integer;
  ALTER TABLE "profils" ADD CONSTRAINT "profils_pro_id_pros_id_fk" FOREIGN KEY ("pro_id") REFERENCES "public"."pros"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "profils_pro_idx" ON "profils" USING btree ("pro_id");
  CREATE UNIQUE INDEX "profils_slug_idx" ON "profils" USING btree ("slug");
  CREATE UNIQUE INDEX "profils_strapi_id_idx" ON "profils" USING btree ("strapi_id");
  CREATE INDEX "profils_updated_at_idx" ON "profils" USING btree ("updated_at");
  CREATE INDEX "profils_created_at_idx" ON "profils" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_profils_fk" FOREIGN KEY ("profils_id") REFERENCES "public"."profils"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_profils_id_idx" ON "payload_locked_documents_rels" USING btree ("profils_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "profils" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "profils" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_profils_fk";
  
  DROP INDEX "payload_locked_documents_rels_profils_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "profils_id";`)
}
