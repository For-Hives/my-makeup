import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Provisional migration of ticket 043: the `media` collection and the photos of a profile.
 *
 * Written by `bun run payload:migrate:create`, read, then tidied (unused arguments removed,
 * formatted by Biome). `up` only creates: the table of the media (its owner, the identifier and
 * the formats of the old site, the prefix of its object, `media` by default, and the fields of an
 * upload, the file name unique), the main photo of a profile, the link table of its gallery (in
 * order), and a column for the new collection in the link table of the document locks. Only the
 * pre-production plays it; it is replaced by the reviewed `init` migration (ticket 049).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TABLE "profils_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar,
  	"owner_id" integer,
  	"strapi_id" numeric,
  	"strapi_formats" jsonb,
  	"prefix" varchar DEFAULT 'media',
  	"_objectkey" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  ALTER TABLE "profils" ADD COLUMN "photo_principale_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "media_id" integer;
  ALTER TABLE "profils_rels" ADD CONSTRAINT "profils_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."profils"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "profils_rels" ADD CONSTRAINT "profils_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_owner_id_pros_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."pros"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "profils_rels_order_idx" ON "profils_rels" USING btree ("order");
  CREATE INDEX "profils_rels_parent_idx" ON "profils_rels" USING btree ("parent_id");
  CREATE INDEX "profils_rels_path_idx" ON "profils_rels" USING btree ("path");
  CREATE INDEX "profils_rels_media_id_idx" ON "profils_rels" USING btree ("media_id");
  CREATE INDEX "media_owner_idx" ON "media" USING btree ("owner_id");
  CREATE UNIQUE INDEX "media_strapi_id_idx" ON "media" USING btree ("strapi_id");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  ALTER TABLE "profils" ADD CONSTRAINT "profils_photo_principale_id_media_id_fk" FOREIGN KEY ("photo_principale_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "profils_photo_principale_idx" ON "profils" USING btree ("photo_principale_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "profils_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "media" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "profils_rels" CASCADE;
  DROP TABLE "media" CASCADE;
  ALTER TABLE "profils" DROP CONSTRAINT "profils_photo_principale_id_media_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_media_fk";
  
  DROP INDEX "profils_photo_principale_idx";
  DROP INDEX "payload_locked_documents_rels_media_id_idx";
  ALTER TABLE "profils" DROP COLUMN "photo_principale_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "media_id";`)
}
