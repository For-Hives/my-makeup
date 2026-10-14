import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Provisional migration of ticket 019: the `pros` collection, the accounts of the makeup artists.
 *
 * Written by `bun run payload:migrate:create`, read, then tidied (unused arguments removed,
 * formatted by Biome). `up` only creates: two tables, and a column for the new collection in the
 * two link tables of Payload. Only the pre-production plays it; it is replaced by the reviewed
 * `init` migration (ticket 049).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TABLE "pros_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "pros" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nom" varchar,
  	"bloque" boolean DEFAULT false,
  	"legacy_provider" varchar,
  	"strapi_id" numeric,
  	"legacy_bcrypt" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"_verified" boolean,
  	"_verificationtoken" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "pros_id" integer;
  ALTER TABLE "payload_preferences_rels" ADD COLUMN "pros_id" integer;
  ALTER TABLE "pros_sessions" ADD CONSTRAINT "pros_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pros"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pros_sessions_order_idx" ON "pros_sessions" USING btree ("_order");
  CREATE INDEX "pros_sessions_parent_id_idx" ON "pros_sessions" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pros_strapi_id_idx" ON "pros" USING btree ("strapi_id");
  CREATE INDEX "pros_updated_at_idx" ON "pros" USING btree ("updated_at");
  CREATE INDEX "pros_created_at_idx" ON "pros" USING btree ("created_at");
  CREATE UNIQUE INDEX "pros_email_idx" ON "pros" USING btree ("email");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pros_fk" FOREIGN KEY ("pros_id") REFERENCES "public"."pros"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_pros_fk" FOREIGN KEY ("pros_id") REFERENCES "public"."pros"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_pros_id_idx" ON "payload_locked_documents_rels" USING btree ("pros_id");
  CREATE INDEX "payload_preferences_rels_pros_id_idx" ON "payload_preferences_rels" USING btree ("pros_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "pros_sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pros" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "pros_sessions" CASCADE;
  DROP TABLE "pros" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_pros_fk";
  
  ALTER TABLE "payload_preferences_rels" DROP CONSTRAINT "payload_preferences_rels_pros_fk";
  
  DROP INDEX "payload_locked_documents_rels_pros_id_idx";
  DROP INDEX "payload_preferences_rels_pros_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "pros_id";
  ALTER TABLE "payload_preferences_rels" DROP COLUMN "pros_id";`)
}
