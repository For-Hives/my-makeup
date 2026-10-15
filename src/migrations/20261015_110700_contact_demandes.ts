import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TYPE "public"."enum_demandes_type" AS ENUM('contact');
  CREATE TYPE "public"."enum_demandes_statut" AS ENUM('nouvelle', 'transmise');
  CREATE TYPE "public"."enum_demandes_etat_mail" AS ENUM('en-attente', 'envoye', 'echec');
  CREATE TABLE "demandes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"type" "enum_demandes_type" DEFAULT 'contact' NOT NULL,
  	"statut" "enum_demandes_statut" DEFAULT 'nouvelle' NOT NULL,
  	"etat_mail" "enum_demandes_etat_mail" DEFAULT 'en-attente' NOT NULL,
  	"prenom" varchar NOT NULL,
  	"nom" varchar NOT NULL,
  	"email" varchar NOT NULL,
  	"telephone" varchar NOT NULL,
  	"message" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "demandes_id" integer;
  CREATE INDEX "demandes_type_idx" ON "demandes" USING btree ("type");
  CREATE INDEX "demandes_statut_idx" ON "demandes" USING btree ("statut");
  CREATE INDEX "demandes_etat_mail_idx" ON "demandes" USING btree ("etat_mail");
  CREATE INDEX "demandes_updated_at_idx" ON "demandes" USING btree ("updated_at");
  CREATE INDEX "demandes_created_at_idx" ON "demandes" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_demandes_fk" FOREIGN KEY ("demandes_id") REFERENCES "public"."demandes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_demandes_id_idx" ON "payload_locked_documents_rels" USING btree ("demandes_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	// The link to the table goes first: dropping the table with CASCADE would drop the constraint, and the
	// generated order (table first) then fails on a constraint that no longer exists.
	await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_demandes_fk";
  DROP INDEX "payload_locked_documents_rels_demandes_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "demandes_id";
  ALTER TABLE "demandes" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "demandes" CASCADE;
  DROP TYPE "public"."enum_demandes_type";
  DROP TYPE "public"."enum_demandes_statut";
  DROP TYPE "public"."enum_demandes_etat_mail";`)
}
