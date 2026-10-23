import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * The moderation journal (issue 1005): one new table, `moderation_events`, the word a hidden profile keeps
 * (`profiles.moderation_action`), and the lock-table column of the new collection. The way back drops them.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TYPE "public"."enum_profiles_moderation_action" AS ENUM('hide', 'suspend');
  CREATE TYPE "public"."enum_moderation_events_action" AS ENUM('hide', 'suspend', 'restore');
  CREATE TABLE "moderation_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"profile" numeric NOT NULL,
  	"admin" numeric,
  	"action" "enum_moderation_events_action" NOT NULL,
  	"reason" varchar NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL
  );
  
  ALTER TABLE "profiles" ADD COLUMN "moderation_action" "enum_profiles_moderation_action";
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "moderation_events_id" integer;
  CREATE INDEX "moderation_events_profile_idx" ON "moderation_events" USING btree ("profile");
  CREATE INDEX "moderation_events_admin_idx" ON "moderation_events" USING btree ("admin");
  CREATE INDEX "moderation_events_action_idx" ON "moderation_events" USING btree ("action");
  CREATE INDEX "moderation_events_date_idx" ON "moderation_events" USING btree ("date");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_moderation_events_fk" FOREIGN KEY ("moderation_events_id") REFERENCES "public"."moderation_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_moderation_events_id_idx" ON "payload_locked_documents_rels" USING btree ("moderation_events_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	// The constraint and the column of the lock table go first: dropping the table would take the constraint away.
	await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_moderation_events_fk";
  DROP INDEX "payload_locked_documents_rels_moderation_events_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "moderation_events_id";
  ALTER TABLE "profiles" DROP COLUMN "moderation_action";
  ALTER TABLE "moderation_events" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "moderation_events" CASCADE;
  DROP TYPE "public"."enum_profiles_moderation_action";
  DROP TYPE "public"."enum_moderation_events_action";`)
}
