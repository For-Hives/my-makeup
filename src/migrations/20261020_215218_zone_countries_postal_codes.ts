import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * The zone outside of France and the postal codes of a commune (ticket 259; PLAN-ZONES.md §3.2):
 * the first migration after `init`, which the production of the v3 has played. Additions only, so
 * a profile already stored keeps what it holds and reads as a commune (`zone_kind` defaults to
 * 'city' for every row, without rewriting the table):
 *
 * - two enumerated types, the type of zone and the reason of a review;
 * - four nullable columns of `profiles` (`zone_kind`, `town`, `zone_review_*`);
 * - the table of the multiple texts of Payload (`profiles_texts`), which holds `countries` and
 *   `city.postalCodes` by their `path`.
 *
 * No DROP, no ALTER of an existing column. `down` removes these objects and nothing else.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TYPE "public"."enum_profiles_zone_kind" AS ENUM('city', 'countries');
  CREATE TYPE "public"."enum_profiles_zone_review_reason" AS ENUM('sharedPostalCode', 'homonyms', 'notFound', 'notACity');
  CREATE TABLE "profiles_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  ALTER TABLE "profiles" ADD COLUMN "zone_kind" "enum_profiles_zone_kind" DEFAULT 'city';
  ALTER TABLE "profiles" ADD COLUMN "town" varchar;
  ALTER TABLE "profiles" ADD COLUMN "zone_review_reason" "enum_profiles_zone_review_reason";
  ALTER TABLE "profiles" ADD COLUMN "zone_review_postal_code" varchar;
  ALTER TABLE "profiles" ADD COLUMN "zone_review_candidates" jsonb;
  ALTER TABLE "profiles_texts" ADD CONSTRAINT "profiles_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "profiles_texts_order_parent" ON "profiles_texts" USING btree ("order","parent_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   DROP TABLE "profiles_texts" CASCADE;
  ALTER TABLE "profiles" DROP COLUMN "zone_kind";
  ALTER TABLE "profiles" DROP COLUMN "town";
  ALTER TABLE "profiles" DROP COLUMN "zone_review_reason";
  ALTER TABLE "profiles" DROP COLUMN "zone_review_postal_code";
  ALTER TABLE "profiles" DROP COLUMN "zone_review_candidates";
  DROP TYPE "public"."enum_profiles_zone_kind";
  DROP TYPE "public"."enum_profiles_zone_review_reason";`)
}
