import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TYPE "public"."enum_quote_requests_status" AS ENUM('new', 'answered');
  CREATE TYPE "public"."enum_quote_requests_mail_status" AS ENUM('pending', 'sent', 'failed');
  CREATE TYPE "public"."enum_quote_requests_service_type" AS ENUM('wedding', 'event', 'shoot', 'lesson', 'other');
  CREATE TABLE "quote_requests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"profile_id" integer,
  	"status" "enum_quote_requests_status" DEFAULT 'new' NOT NULL,
  	"mail_status" "enum_quote_requests_mail_status" DEFAULT 'pending' NOT NULL,
  	"event_date" varchar NOT NULL,
  	"place" varchar NOT NULL,
  	"service_type" "enum_quote_requests_service_type" NOT NULL,
  	"message" varchar NOT NULL,
  	"client_first_name" varchar NOT NULL,
  	"client_email" varchar NOT NULL,
  	"client_phone" varchar,
  	"consent_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "quote_requests_id" integer;
  ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "quote_requests_profile_idx" ON "quote_requests" USING btree ("profile_id");
  CREATE INDEX "quote_requests_status_idx" ON "quote_requests" USING btree ("status");
  CREATE INDEX "quote_requests_mail_status_idx" ON "quote_requests" USING btree ("mail_status");
  CREATE INDEX "quote_requests_updated_at_idx" ON "quote_requests" USING btree ("updated_at");
  CREATE INDEX "quote_requests_created_at_idx" ON "quote_requests" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_quote_requests_fk" FOREIGN KEY ("quote_requests_id") REFERENCES "public"."quote_requests"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_quote_requests_id_idx" ON "payload_locked_documents_rels" USING btree ("quote_requests_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "quote_requests" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "quote_requests" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_quote_requests_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_quote_requests_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "quote_requests_id";
  DROP TYPE "public"."enum_quote_requests_status";
  DROP TYPE "public"."enum_quote_requests_mail_status";
  DROP TYPE "public"."enum_quote_requests_service_type";`)
}
