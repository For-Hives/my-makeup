import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TYPE "public"."enum_profiles_specialty_bullets" AS ENUM('wedding', 'event', 'photoFashion', 'screenStage', 'specialEffects', 'selfMakeupCourse');
  CREATE TABLE "profiles_specialty_bullets" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_profiles_specialty_bullets",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "profiles" ADD COLUMN "specialty_other" varchar;
  ALTER TABLE "profiles_specialty_bullets" ADD CONSTRAINT "profiles_specialty_bullets_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "profiles_specialty_bullets_order_idx" ON "profiles_specialty_bullets" USING btree ("order");
  CREATE INDEX "profiles_specialty_bullets_parent_idx" ON "profiles_specialty_bullets" USING btree ("parent_id");
  -- Ticket 1010: an existing free specialty is kept whole in « Autre » (nothing is lost, the column specialty is untouched).
  UPDATE "profiles" SET "specialty_other" = "specialty" WHERE "specialty" IS NOT NULL AND "specialty" <> '';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   DROP TABLE "profiles_specialty_bullets" CASCADE;
  ALTER TABLE "profiles" DROP COLUMN "specialty_other";
  DROP TYPE "public"."enum_profiles_specialty_bullets";`)
}
