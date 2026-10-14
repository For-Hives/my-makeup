import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * The `init` migration (ticket 049): the whole schema of P3, from an empty database, in one
 * migration. It replaces the twelve provisional migrations of tickets 010 to 047.
 *
 * Written by `bun run payload:migrate:create init` with no migration before it, so against an
 * empty schema; read, then tidied (unused arguments removed, formatted by Biome). `up` only
 * creates: types, tables, foreign keys and indexes, nothing dropped, altered or deleted
 * (tests/unit/migration-init.test.ts). `down` drops everything `up` created, the table of the
 * migrations included.
 *
 * From here on, every change of a collection comes with its own migration, in the same commit:
 * `bun run schema:derive` is a step of the CI (docs/qualite.md, « La dérive de schéma »).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TYPE "public"."enum_admins_role" AS ENUM('admin', 'redaction');
  CREATE TYPE "public"."enum_profils_source_consentement" AS ENUM('maquilleuse', 'admin', 'import');
  CREATE TYPE "public"."enum_profils_statut" AS ENUM('brouillon', 'publie', 'masque');
  CREATE TYPE "public"."enum_profils_statut_choisi" AS ENUM('automatique', 'brouillon', 'publie', 'masque');
  CREATE TYPE "public"."enum_talents_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__talents_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_articles_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__articles_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "admins_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "admins" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"role" "enum_admins_role" DEFAULT 'redaction' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
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
  
  CREATE TABLE "profils" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"pro_id" integer NOT NULL,
  	"slug" varchar NOT NULL,
  	"prenom" varchar,
  	"nom" varchar,
  	"nom_artiste" varchar,
  	"specialite" varchar,
  	"commune_nom" varchar,
  	"commune_code_insee" varchar,
  	"commune_departement" varchar,
  	"commune_latitude" numeric,
  	"commune_longitude" numeric,
  	"rayon_km" numeric,
  	"a_domicile" boolean,
  	"description" varchar,
  	"disponible" boolean DEFAULT true,
  	"photo_principale_id" integer,
  	"reseaux_youtube" varchar,
  	"reseaux_facebook" varchar,
  	"reseaux_instagram" varchar,
  	"reseaux_site_web" varchar,
  	"reseaux_linkedin" varchar,
  	"coordonnees_telephone" varchar,
  	"coordonnees_email" varchar,
  	"contact_public" boolean DEFAULT false,
  	"consenti_le" timestamp(3) with time zone,
  	"source_consentement" "enum_profils_source_consentement",
  	"legacy_username" varchar,
  	"strapi_id" numeric,
  	"statut" "enum_profils_statut" DEFAULT 'brouillon',
  	"statut_choisi" "enum_profils_statut_choisi" DEFAULT 'automatique',
  	"motif" varchar,
  	"verifie" boolean DEFAULT false,
  	"verifie_le" timestamp(3) with time zone,
  	"siret" varchar,
  	"note_interne" varchar,
  	"score" numeric,
  	"super_maquilleuse" boolean DEFAULT false,
  	"completude" numeric,
  	"actif" boolean,
  	"actif_depuis" timestamp(3) with time zone,
  	"publiable" boolean,
  	"publiable_depuis" timestamp(3) with time zone,
  	"entierement_vide" boolean,
  	"entierement_vide_depuis" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "profils_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar,
  	"owner_id" integer,
  	"strapi_id" numeric,
  	"strapi_formats" jsonb,
  	"prefix" varchar DEFAULT 'media',
  	"_objectkey" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "talents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"seo_title" varchar,
  	"description" varchar,
  	"seo_description" varchar,
  	"content" varchar,
  	"published_at" timestamp(3) with time zone,
  	"strapi_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_talents_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_talents_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_seo_title" varchar,
  	"version_description" varchar,
  	"version_seo_description" varchar,
  	"version_content" varchar,
  	"version_published_at" timestamp(3) with time zone,
  	"version_strapi_id" numeric,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__talents_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "articles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"author" varchar,
  	"excerpt" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"content" varchar,
  	"published_at" timestamp(3) with time zone,
  	"strapi_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_articles_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "articles_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "_articles_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_author" varchar,
  	"version_excerpt" varchar,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_content" varchar,
  	"version_published_at" timestamp(3) with time zone,
  	"version_strapi_id" numeric,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__articles_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_articles_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" integer
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" integer,
  	"pros_id" integer,
  	"profils_id" integer,
  	"media_id" integer,
  	"talents_id" integer,
  	"articles_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" integer,
  	"pros_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "admins_sessions" ADD CONSTRAINT "admins_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pros_sessions" ADD CONSTRAINT "pros_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pros"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "profils_prestations_options" ADD CONSTRAINT "profils_prestations_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."profils_prestations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "profils_prestations" ADD CONSTRAINT "profils_prestations_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."profils"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "profils_competences" ADD CONSTRAINT "profils_competences_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."profils"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "profils_langues" ADD CONSTRAINT "profils_langues_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."profils"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "profils_formations" ADD CONSTRAINT "profils_formations_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."profils"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "profils_experiences" ADD CONSTRAINT "profils_experiences_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."profils"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "profils" ADD CONSTRAINT "profils_pro_id_pros_id_fk" FOREIGN KEY ("pro_id") REFERENCES "public"."pros"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "profils" ADD CONSTRAINT "profils_photo_principale_id_media_id_fk" FOREIGN KEY ("photo_principale_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "profils_rels" ADD CONSTRAINT "profils_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."profils"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "profils_rels" ADD CONSTRAINT "profils_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_owner_id_pros_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."pros"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_talents_v" ADD CONSTRAINT "_talents_v_parent_id_talents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."talents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_parent_id_articles_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pros_fk" FOREIGN KEY ("pros_id") REFERENCES "public"."pros"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_profils_fk" FOREIGN KEY ("profils_id") REFERENCES "public"."profils"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_talents_fk" FOREIGN KEY ("talents_id") REFERENCES "public"."talents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_pros_fk" FOREIGN KEY ("pros_id") REFERENCES "public"."pros"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "admins_sessions_order_idx" ON "admins_sessions" USING btree ("_order");
  CREATE INDEX "admins_sessions_parent_id_idx" ON "admins_sessions" USING btree ("_parent_id");
  CREATE INDEX "admins_updated_at_idx" ON "admins" USING btree ("updated_at");
  CREATE INDEX "admins_created_at_idx" ON "admins" USING btree ("created_at");
  CREATE UNIQUE INDEX "admins_email_idx" ON "admins" USING btree ("email");
  CREATE INDEX "pros_sessions_order_idx" ON "pros_sessions" USING btree ("_order");
  CREATE INDEX "pros_sessions_parent_id_idx" ON "pros_sessions" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pros_strapi_id_idx" ON "pros" USING btree ("strapi_id");
  CREATE INDEX "pros_updated_at_idx" ON "pros" USING btree ("updated_at");
  CREATE INDEX "pros_created_at_idx" ON "pros" USING btree ("created_at");
  CREATE UNIQUE INDEX "pros_email_idx" ON "pros" USING btree ("email");
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
  CREATE INDEX "profils_experiences_parent_id_idx" ON "profils_experiences" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "profils_pro_idx" ON "profils" USING btree ("pro_id");
  CREATE UNIQUE INDEX "profils_slug_idx" ON "profils" USING btree ("slug");
  CREATE INDEX "profils_photo_principale_idx" ON "profils" USING btree ("photo_principale_id");
  CREATE UNIQUE INDEX "profils_strapi_id_idx" ON "profils" USING btree ("strapi_id");
  CREATE INDEX "profils_statut_idx" ON "profils" USING btree ("statut");
  CREATE INDEX "profils_updated_at_idx" ON "profils" USING btree ("updated_at");
  CREATE INDEX "profils_created_at_idx" ON "profils" USING btree ("created_at");
  CREATE INDEX "profils_rels_order_idx" ON "profils_rels" USING btree ("order");
  CREATE INDEX "profils_rels_parent_idx" ON "profils_rels" USING btree ("parent_id");
  CREATE INDEX "profils_rels_path_idx" ON "profils_rels" USING btree ("path");
  CREATE INDEX "profils_rels_media_id_idx" ON "profils_rels" USING btree ("media_id");
  CREATE INDEX "media_owner_idx" ON "media" USING btree ("owner_id");
  CREATE UNIQUE INDEX "media_strapi_id_idx" ON "media" USING btree ("strapi_id");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE UNIQUE INDEX "talents_slug_idx" ON "talents" USING btree ("slug");
  CREATE UNIQUE INDEX "talents_strapi_id_idx" ON "talents" USING btree ("strapi_id");
  CREATE INDEX "talents_updated_at_idx" ON "talents" USING btree ("updated_at");
  CREATE INDEX "talents_created_at_idx" ON "talents" USING btree ("created_at");
  CREATE INDEX "talents__status_idx" ON "talents" USING btree ("_status");
  CREATE INDEX "_talents_v_parent_idx" ON "_talents_v" USING btree ("parent_id");
  CREATE INDEX "_talents_v_version_version_slug_idx" ON "_talents_v" USING btree ("version_slug");
  CREATE INDEX "_talents_v_version_version_strapi_id_idx" ON "_talents_v" USING btree ("version_strapi_id");
  CREATE INDEX "_talents_v_version_version_updated_at_idx" ON "_talents_v" USING btree ("version_updated_at");
  CREATE INDEX "_talents_v_version_version_created_at_idx" ON "_talents_v" USING btree ("version_created_at");
  CREATE INDEX "_talents_v_version_version__status_idx" ON "_talents_v" USING btree ("version__status");
  CREATE INDEX "_talents_v_created_at_idx" ON "_talents_v" USING btree ("created_at");
  CREATE INDEX "_talents_v_updated_at_idx" ON "_talents_v" USING btree ("updated_at");
  CREATE INDEX "_talents_v_latest_idx" ON "_talents_v" USING btree ("latest");
  CREATE UNIQUE INDEX "articles_slug_idx" ON "articles" USING btree ("slug");
  CREATE UNIQUE INDEX "articles_strapi_id_idx" ON "articles" USING btree ("strapi_id");
  CREATE INDEX "articles_updated_at_idx" ON "articles" USING btree ("updated_at");
  CREATE INDEX "articles_created_at_idx" ON "articles" USING btree ("created_at");
  CREATE INDEX "articles__status_idx" ON "articles" USING btree ("_status");
  CREATE INDEX "articles_rels_order_idx" ON "articles_rels" USING btree ("order");
  CREATE INDEX "articles_rels_parent_idx" ON "articles_rels" USING btree ("parent_id");
  CREATE INDEX "articles_rels_path_idx" ON "articles_rels" USING btree ("path");
  CREATE INDEX "articles_rels_media_id_idx" ON "articles_rels" USING btree ("media_id");
  CREATE INDEX "_articles_v_parent_idx" ON "_articles_v" USING btree ("parent_id");
  CREATE INDEX "_articles_v_version_version_slug_idx" ON "_articles_v" USING btree ("version_slug");
  CREATE INDEX "_articles_v_version_version_strapi_id_idx" ON "_articles_v" USING btree ("version_strapi_id");
  CREATE INDEX "_articles_v_version_version_updated_at_idx" ON "_articles_v" USING btree ("version_updated_at");
  CREATE INDEX "_articles_v_version_version_created_at_idx" ON "_articles_v" USING btree ("version_created_at");
  CREATE INDEX "_articles_v_version_version__status_idx" ON "_articles_v" USING btree ("version__status");
  CREATE INDEX "_articles_v_created_at_idx" ON "_articles_v" USING btree ("created_at");
  CREATE INDEX "_articles_v_updated_at_idx" ON "_articles_v" USING btree ("updated_at");
  CREATE INDEX "_articles_v_latest_idx" ON "_articles_v" USING btree ("latest");
  CREATE INDEX "_articles_v_rels_order_idx" ON "_articles_v_rels" USING btree ("order");
  CREATE INDEX "_articles_v_rels_parent_idx" ON "_articles_v_rels" USING btree ("parent_id");
  CREATE INDEX "_articles_v_rels_path_idx" ON "_articles_v_rels" USING btree ("path");
  CREATE INDEX "_articles_v_rels_media_id_idx" ON "_articles_v_rels" USING btree ("media_id");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_admins_id_idx" ON "payload_locked_documents_rels" USING btree ("admins_id");
  CREATE INDEX "payload_locked_documents_rels_pros_id_idx" ON "payload_locked_documents_rels" USING btree ("pros_id");
  CREATE INDEX "payload_locked_documents_rels_profils_id_idx" ON "payload_locked_documents_rels" USING btree ("profils_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_talents_id_idx" ON "payload_locked_documents_rels" USING btree ("talents_id");
  CREATE INDEX "payload_locked_documents_rels_articles_id_idx" ON "payload_locked_documents_rels" USING btree ("articles_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_admins_id_idx" ON "payload_preferences_rels" USING btree ("admins_id");
  CREATE INDEX "payload_preferences_rels_pros_id_idx" ON "payload_preferences_rels" USING btree ("pros_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   DROP TABLE "admins_sessions" CASCADE;
  DROP TABLE "admins" CASCADE;
  DROP TABLE "pros_sessions" CASCADE;
  DROP TABLE "pros" CASCADE;
  DROP TABLE "profils_prestations_options" CASCADE;
  DROP TABLE "profils_prestations" CASCADE;
  DROP TABLE "profils_competences" CASCADE;
  DROP TABLE "profils_langues" CASCADE;
  DROP TABLE "profils_formations" CASCADE;
  DROP TABLE "profils_experiences" CASCADE;
  DROP TABLE "profils" CASCADE;
  DROP TABLE "profils_rels" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "talents" CASCADE;
  DROP TABLE "_talents_v" CASCADE;
  DROP TABLE "articles" CASCADE;
  DROP TABLE "articles_rels" CASCADE;
  DROP TABLE "_articles_v" CASCADE;
  DROP TABLE "_articles_v_rels" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_admins_role";
  DROP TYPE "public"."enum_profils_source_consentement";
  DROP TYPE "public"."enum_profils_statut";
  DROP TYPE "public"."enum_profils_statut_choisi";
  DROP TYPE "public"."enum_talents_status";
  DROP TYPE "public"."enum__talents_v_version_status";
  DROP TYPE "public"."enum_articles_status";
  DROP TYPE "public"."enum__articles_v_version_status";`)
}
