import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Provisional migration of ticket 040: the list sections of a profile, offers with their options,
 * skills, languages, courses and experiences.
 *
 * Written by `bun run payload:migrate:create`, read, then tidied (unused arguments removed,
 * formatted by Biome). `up` only creates: one table per list, its rows keyed by the identifier
 * Payload gives them, ordered by `_order`, and removed with their profile (or, for an option, with
 * its offer). Only the pre-production plays it; it is replaced by the reviewed `init` migration
 * (ticket 049).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TABLE "profils_prestations_options" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"nom" varchar,
  	"description" varchar,
  	"prix_texte" varchar,
  	"prix_a_partir_de" numeric
  );
  
  CREATE TABLE "profils_prestations" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"nom" varchar,
  	"description" varchar,
  	"prix_texte" varchar,
  	"prix_a_partir_de" numeric
  );
  
  CREATE TABLE "profils_competences" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"nom" varchar,
  	"description" varchar
  );
  
  CREATE TABLE "profils_langues" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"nom" varchar
  );
  
  CREATE TABLE "profils_formations" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"diplome" varchar,
  	"ecole" varchar,
  	"obtenu_le" timestamp(3) with time zone,
  	"description" varchar
  );
  
  CREATE TABLE "profils_experiences" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"entreprise" varchar,
  	"poste" varchar,
  	"ville" varchar,
  	"debut" timestamp(3) with time zone,
  	"fin" timestamp(3) with time zone,
  	"description" varchar
  );
  
  ALTER TABLE "profils_prestations_options" ADD CONSTRAINT "profils_prestations_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."profils_prestations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "profils_prestations" ADD CONSTRAINT "profils_prestations_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."profils"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "profils_competences" ADD CONSTRAINT "profils_competences_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."profils"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "profils_langues" ADD CONSTRAINT "profils_langues_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."profils"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "profils_formations" ADD CONSTRAINT "profils_formations_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."profils"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "profils_experiences" ADD CONSTRAINT "profils_experiences_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."profils"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "profils_prestations_options_order_idx" ON "profils_prestations_options" USING btree ("_order");
  CREATE INDEX "profils_prestations_options_parent_id_idx" ON "profils_prestations_options" USING btree ("_parent_id");
  CREATE INDEX "profils_prestations_order_idx" ON "profils_prestations" USING btree ("_order");
  CREATE INDEX "profils_prestations_parent_id_idx" ON "profils_prestations" USING btree ("_parent_id");
  CREATE INDEX "profils_competences_order_idx" ON "profils_competences" USING btree ("_order");
  CREATE INDEX "profils_competences_parent_id_idx" ON "profils_competences" USING btree ("_parent_id");
  CREATE INDEX "profils_langues_order_idx" ON "profils_langues" USING btree ("_order");
  CREATE INDEX "profils_langues_parent_id_idx" ON "profils_langues" USING btree ("_parent_id");
  CREATE INDEX "profils_formations_order_idx" ON "profils_formations" USING btree ("_order");
  CREATE INDEX "profils_formations_parent_id_idx" ON "profils_formations" USING btree ("_parent_id");
  CREATE INDEX "profils_experiences_order_idx" ON "profils_experiences" USING btree ("_order");
  CREATE INDEX "profils_experiences_parent_id_idx" ON "profils_experiences" USING btree ("_parent_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   DROP TABLE "profils_prestations_options" CASCADE;
  DROP TABLE "profils_prestations" CASCADE;
  DROP TABLE "profils_competences" CASCADE;
  DROP TABLE "profils_langues" CASCADE;
  DROP TABLE "profils_formations" CASCADE;
  DROP TABLE "profils_experiences" CASCADE;`)
}
