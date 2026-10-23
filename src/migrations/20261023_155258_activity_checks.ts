import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TYPE "public"."enum_activity_checks_outcome" AS ENUM('pending', 'active', 'ceased', 'not-found');
  CREATE TABLE "activity_checks" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"profile_id" integer,
  	"outcome" "enum_activity_checks_outcome" DEFAULT 'pending' NOT NULL,
  	"checked_at" timestamp(3) with time zone,
  	"attempted_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "activity_checks_id" integer;
  ALTER TABLE "activity_checks" ADD CONSTRAINT "activity_checks_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "activity_checks_profile_idx" ON "activity_checks" USING btree ("profile_id");
  CREATE INDEX "activity_checks_outcome_idx" ON "activity_checks" USING btree ("outcome");
  CREATE INDEX "activity_checks_updated_at_idx" ON "activity_checks" USING btree ("updated_at");
  CREATE INDEX "activity_checks_created_at_idx" ON "activity_checks" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_activity_checks_fk" FOREIGN KEY ("activity_checks_id") REFERENCES "public"."activity_checks"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_activity_checks_id_idx" ON "payload_locked_documents_rels" USING btree ("activity_checks_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "activity_checks" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "activity_checks" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_activity_checks_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_activity_checks_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "activity_checks_id";
  DROP TYPE "public"."enum_activity_checks_outcome";`)
}
