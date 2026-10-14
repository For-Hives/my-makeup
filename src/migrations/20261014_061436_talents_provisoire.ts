import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Provisional migration of ticket 022: the `talents` collection, with its drafts.
 *
 * Written by `bun run payload:migrate:create`, read, then tidied (unused arguments removed,
 * formatted by Biome). `up` only creates: the table and its versions table (drafts), their two
 * status types, their indexes (the slug and the identifier of the old site are unique), and a
 * column for the new collection in the link table of the document locks. Only the pre-production
 * plays it; it is replaced by the reviewed `init` migration (ticket 049).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TYPE "public"."enum_talents_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__talents_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "talents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"seo_title" varchar,
  	"description" varchar,
  	"seo_description" varchar,
  	"content" varchar,
  	"published_at" timestamp(3) with time zone,
  	"strapi_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_talents_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_talents_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_seo_title" varchar,
  	"version_description" varchar,
  	"version_seo_description" varchar,
  	"version_content" varchar,
  	"version_published_at" timestamp(3) with time zone,
  	"version_strapi_id" numeric,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__talents_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "talents_id" integer;
  ALTER TABLE "_talents_v" ADD CONSTRAINT "_talents_v_parent_id_talents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."talents"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "talents_slug_idx" ON "talents" USING btree ("slug");
  CREATE UNIQUE INDEX "talents_strapi_id_idx" ON "talents" USING btree ("strapi_id");
  CREATE INDEX "talents_updated_at_idx" ON "talents" USING btree ("updated_at");
  CREATE INDEX "talents_created_at_idx" ON "talents" USING btree ("created_at");
  CREATE INDEX "talents__status_idx" ON "talents" USING btree ("_status");
  CREATE INDEX "_talents_v_parent_idx" ON "_talents_v" USING btree ("parent_id");
  CREATE INDEX "_talents_v_version_version_slug_idx" ON "_talents_v" USING btree ("version_slug");
  CREATE INDEX "_talents_v_version_version_strapi_id_idx" ON "_talents_v" USING btree ("version_strapi_id");
  CREATE INDEX "_talents_v_version_version_updated_at_idx" ON "_talents_v" USING btree ("version_updated_at");
  CREATE INDEX "_talents_v_version_version_created_at_idx" ON "_talents_v" USING btree ("version_created_at");
  CREATE INDEX "_talents_v_version_version__status_idx" ON "_talents_v" USING btree ("version__status");
  CREATE INDEX "_talents_v_created_at_idx" ON "_talents_v" USING btree ("created_at");
  CREATE INDEX "_talents_v_updated_at_idx" ON "_talents_v" USING btree ("updated_at");
  CREATE INDEX "_talents_v_latest_idx" ON "_talents_v" USING btree ("latest");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_talents_fk" FOREIGN KEY ("talents_id") REFERENCES "public"."talents"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_talents_id_idx" ON "payload_locked_documents_rels" USING btree ("talents_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "talents" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_talents_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "talents" CASCADE;
  DROP TABLE "_talents_v" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_talents_fk";
  
  DROP INDEX "payload_locked_documents_rels_talents_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "talents_id";
  DROP TYPE "public"."enum_talents_status";
  DROP TYPE "public"."enum__talents_v_version_status";`)
}
