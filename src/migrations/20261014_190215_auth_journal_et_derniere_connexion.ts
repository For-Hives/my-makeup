import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TYPE "public"."enum_auth_evenements_type" AS ENUM('connexion', 'deconnexion', 'deconnexion-partout', 'inscription', 'confirmation');
  CREATE TYPE "public"."enum_auth_evenements_code" AS ENUM('ok', 'identifiants-invalides', 'trop-de-tentatives', 'service-indisponible', 'email-non-confirme', 'donnees-invalides', 'email-deja-pris', 'deja-confirme', 'lien-invalide', 'inconnu');
  CREATE TABLE "auth_evenements" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"type" "enum_auth_evenements_type" NOT NULL,
  	"code" "enum_auth_evenements_code" NOT NULL,
  	"duree_ms" numeric,
  	"date" timestamp(3) with time zone NOT NULL
  );
  
  ALTER TABLE "pros" ADD COLUMN "derniere_connexion" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "auth_evenements_id" integer;
  CREATE INDEX "auth_evenements_type_idx" ON "auth_evenements" USING btree ("type");
  CREATE INDEX "auth_evenements_code_idx" ON "auth_evenements" USING btree ("code");
  CREATE INDEX "auth_evenements_date_idx" ON "auth_evenements" USING btree ("date");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_auth_evenements_fk" FOREIGN KEY ("auth_evenements_id") REFERENCES "public"."auth_evenements"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_auth_evenements_id_idx" ON "payload_locked_documents_rels" USING btree ("auth_evenements_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "auth_evenements" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "auth_evenements" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_auth_evenements_fk";
  
  DROP INDEX "payload_locked_documents_rels_auth_evenements_id_idx";
  ALTER TABLE "pros" DROP COLUMN "derniere_connexion";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "auth_evenements_id";
  DROP TYPE "public"."enum_auth_evenements_type";
  DROP TYPE "public"."enum_auth_evenements_code";`)
}
