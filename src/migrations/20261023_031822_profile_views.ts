import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TABLE "profile_views" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"profile_id" integer,
  	"day" varchar NOT NULL,
  	"count" numeric NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "profile_views_id" integer;
  ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "profile_views_profile_idx" ON "profile_views" USING btree ("profile_id");
  CREATE INDEX "profile_views_day_idx" ON "profile_views" USING btree ("day");
  CREATE INDEX "profile_views_updated_at_idx" ON "profile_views" USING btree ("updated_at");
  CREATE INDEX "profile_views_created_at_idx" ON "profile_views" USING btree ("created_at");
  CREATE UNIQUE INDEX "profile_day_idx" ON "profile_views" USING btree ("profile_id","day");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_profile_views_fk" FOREIGN KEY ("profile_views_id") REFERENCES "public"."profile_views"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_profile_views_id_idx" ON "payload_locked_documents_rels" USING btree ("profile_views_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "profile_views" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "profile_views" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_profile_views_fk";
  
  DROP INDEX "payload_locked_documents_rels_profile_views_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "profile_views_id";`)
}
