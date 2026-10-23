import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TABLE "reminder_reports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"day" varchar NOT NULL,
  	"incomplete_count" numeric NOT NULL,
  	"incomplete_ids" jsonb,
  	"inactive_count" numeric NOT NULL,
  	"inactive_ids" jsonb,
  	"sent_count" numeric NOT NULL,
  	"send_enabled" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "reminder_states" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"profile_id" integer,
  	"last_sent_at" timestamp(3) with time zone,
  	"unsubscribed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "reminder_reports_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "reminder_states_id" integer;
  ALTER TABLE "reminder_states" ADD CONSTRAINT "reminder_states_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "reminder_reports_day_idx" ON "reminder_reports" USING btree ("day");
  CREATE INDEX "reminder_reports_updated_at_idx" ON "reminder_reports" USING btree ("updated_at");
  CREATE INDEX "reminder_reports_created_at_idx" ON "reminder_reports" USING btree ("created_at");
  CREATE UNIQUE INDEX "reminder_states_profile_idx" ON "reminder_states" USING btree ("profile_id");
  CREATE INDEX "reminder_states_updated_at_idx" ON "reminder_states" USING btree ("updated_at");
  CREATE INDEX "reminder_states_created_at_idx" ON "reminder_states" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reminder_reports_fk" FOREIGN KEY ("reminder_reports_id") REFERENCES "public"."reminder_reports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reminder_states_fk" FOREIGN KEY ("reminder_states_id") REFERENCES "public"."reminder_states"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_reminder_reports_id_idx" ON "payload_locked_documents_rels" USING btree ("reminder_reports_id");
  CREATE INDEX "payload_locked_documents_rels_reminder_states_id_idx" ON "payload_locked_documents_rels" USING btree ("reminder_states_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "reminder_reports" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "reminder_states" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "reminder_reports" CASCADE;
  DROP TABLE "reminder_states" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_reminder_reports_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_reminder_states_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_reminder_reports_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_reminder_states_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "reminder_reports_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "reminder_states_id";`)
}
