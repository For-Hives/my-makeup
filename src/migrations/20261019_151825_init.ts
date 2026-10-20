import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * The `init` migration: the whole schema, from an empty database, in one migration. The site
 * is not in production, so the schema is not changed by a chain of migrations: this file is
 * written again from the collections each time they change (PLAN-ANGLAIS.md §7, tickets 249 to
 * 252). It replaced the fifteen migrations (the first `init` and the fourteen after it, ticket 249).
 *
 * Written by `bun run payload:migrate:create init` with no migration before it, so against an
 * empty schema; read, then tidied (unused arguments removed, formatted by Biome). `up` only
 * creates: types, tables, foreign keys and indexes, nothing dropped, altered or deleted
 * (tests/unit/migration-init.test.ts). `down` drops everything `up` created, the table of the
 * migrations included. How to write it again: docs/tests/banc.md, « Réécrire la migration init ».
 *
 * Once a production database has played it, this stops: every change of a collection then comes
 * with its own migration, in the same commit. `bun run schema:drift` is a step of the CI
 * (docs/qualite.md, « La dérive de schéma »).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TYPE "public"."enum_admins_role" AS ENUM('admin', 'editor');
  CREATE TYPE "public"."enum_profiles_consent_source" AS ENUM('artist', 'admin', 'import');
  CREATE TYPE "public"."enum_profiles_status" AS ENUM('draft', 'published', 'hidden');
  CREATE TYPE "public"."enum_profiles_chosen_status" AS ENUM('automatic', 'draft', 'published', 'hidden');
  CREATE TYPE "public"."enum_talents_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__talents_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_articles_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__articles_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_auth_events_type" AS ENUM('sign-in', 'sign-out', 'sign-out-everywhere', 'sign-up', 'confirmation', 'resend', 'forgot-password', 'password-reset', 'block', 'unblock');
  CREATE TYPE "public"."enum_auth_events_code" AS ENUM('ok', 'heritee', 'identifiants-invalides', 'trop-de-tentatives', 'service-indisponible', 'email-non-confirme', 'compte-bloque', 'donnees-invalides', 'email-deja-pris', 'deja-confirme', 'lien-invalide', 'email-non-verifie', 'compte-refuse', 'annule', 'retour-invalide', 'inconnu', 'champ-piege');
  CREATE TYPE "public"."enum_auth_events_method" AS ENUM('password', 'google');
  CREATE TYPE "public"."enum_contact_requests_type" AS ENUM('contact');
  CREATE TYPE "public"."enum_contact_requests_status" AS ENUM('new', 'forwarded', 'answered', 'spam');
  CREATE TYPE "public"."enum_contact_requests_mail_status" AS ENUM('pending', 'sent', 'failed');
  CREATE TABLE "admins_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "admins" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"role" "enum_admins_role" DEFAULT 'editor' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone
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
  	"name" varchar,
  	"blocked" boolean DEFAULT false,
  	"last_sign_in_at" timestamp(3) with time zone,
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
  	"_verificationtoken" varchar
  );
  
  CREATE TABLE "profiles_service_offers_options" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"description" varchar,
  	"price_text" varchar,
  	"price_from" numeric
  );
  
  CREATE TABLE "profiles_service_offers" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"description" varchar,
  	"price_text" varchar,
  	"price_from" numeric
  );
  
  CREATE TABLE "profiles_skills" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"description" varchar
  );
  
  CREATE TABLE "profiles_languages" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar
  );
  
  CREATE TABLE "profiles_courses" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"diploma" varchar,
  	"school" varchar,
  	"graduated_at" timestamp(3) with time zone,
  	"description" varchar
  );
  
  CREATE TABLE "profiles_experiences" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"company" varchar,
  	"job_title" varchar,
  	"city" varchar,
  	"start_date" timestamp(3) with time zone,
  	"end_date" timestamp(3) with time zone,
  	"description" varchar
  );
  
  CREATE TABLE "profiles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"pro_id" integer NOT NULL,
  	"slug" varchar NOT NULL,
  	"first_name" varchar,
  	"last_name" varchar,
  	"artist_name" varchar,
  	"specialty" varchar,
  	"city_name" varchar,
  	"city_insee_code" varchar,
  	"city_department" varchar,
  	"city_latitude" numeric,
  	"city_longitude" numeric,
  	"radius_km" numeric,
  	"home_service" boolean,
  	"description" varchar,
  	"available" boolean DEFAULT true,
  	"main_picture_id" integer,
  	"networks_youtube" varchar,
  	"networks_facebook" varchar,
  	"networks_instagram" varchar,
  	"networks_website" varchar,
  	"networks_linkedin" varchar,
  	"contact_details_phone" varchar,
  	"contact_details_email" varchar,
  	"public_contact" boolean DEFAULT false,
  	"consented_at" timestamp(3) with time zone,
  	"consent_source" "enum_profiles_consent_source",
  	"legacy_username" varchar,
  	"strapi_id" numeric,
  	"status" "enum_profiles_status" DEFAULT 'draft',
  	"chosen_status" "enum_profiles_chosen_status" DEFAULT 'automatic',
  	"reason" varchar,
  	"verified" boolean DEFAULT false,
  	"verified_at" timestamp(3) with time zone,
  	"siret" varchar,
  	"internal_note" varchar,
  	"score" numeric,
  	"super_artist" boolean DEFAULT false,
  	"completeness" numeric,
  	"active" boolean,
  	"active_since" timestamp(3) with time zone,
  	"publishable" boolean,
  	"publishable_since" timestamp(3) with time zone,
  	"fully_empty" boolean,
  	"fully_empty_since" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "profiles_rels" (
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
  	"focal_y" numeric,
  	"sizes_thumbnail_url" varchar,
  	"sizes_thumbnail_width" numeric,
  	"sizes_thumbnail_height" numeric,
  	"sizes_thumbnail_mime_type" varchar,
  	"sizes_thumbnail_filesize" numeric,
  	"sizes_thumbnail_filename" varchar,
  	"sizes_small_url" varchar,
  	"sizes_small_width" numeric,
  	"sizes_small_height" numeric,
  	"sizes_small_mime_type" varchar,
  	"sizes_small_filesize" numeric,
  	"sizes_small_filename" varchar,
  	"sizes_medium_url" varchar,
  	"sizes_medium_width" numeric,
  	"sizes_medium_height" numeric,
  	"sizes_medium_mime_type" varchar,
  	"sizes_medium_filesize" numeric,
  	"sizes_medium_filename" varchar,
  	"sizes_large_url" varchar,
  	"sizes_large_width" numeric,
  	"sizes_large_height" numeric,
  	"sizes_large_mime_type" varchar,
  	"sizes_large_filesize" numeric,
  	"sizes_large_filename" varchar
  );
  
  CREATE TABLE "talents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"seo_title" varchar,
  	"page_title" varchar,
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
  	"version_page_title" varchar,
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
  
  CREATE TABLE "auth_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"type" "enum_auth_events_type" NOT NULL,
  	"code" "enum_auth_events_code" NOT NULL,
  	"method" "enum_auth_events_method",
  	"duration_ms" numeric,
  	"date" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "contact_requests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"type" "enum_contact_requests_type" DEFAULT 'contact' NOT NULL,
  	"status" "enum_contact_requests_status" DEFAULT 'new' NOT NULL,
  	"mail_status" "enum_contact_requests_mail_status" DEFAULT 'pending' NOT NULL,
  	"first_name" varchar NOT NULL,
  	"last_name" varchar NOT NULL,
  	"email" varchar NOT NULL,
  	"phone" varchar NOT NULL,
  	"message" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "deleted_accounts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"strapi_id" numeric NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL
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
  	"profiles_id" integer,
  	"media_id" integer,
  	"talents_id" integer,
  	"articles_id" integer,
  	"auth_events_id" integer,
  	"contact_requests_id" integer,
  	"deleted_accounts_id" integer
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
  ALTER TABLE "profiles_service_offers_options" ADD CONSTRAINT "profiles_service_offers_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."profiles_service_offers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "profiles_service_offers" ADD CONSTRAINT "profiles_service_offers_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "profiles_skills" ADD CONSTRAINT "profiles_skills_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "profiles_languages" ADD CONSTRAINT "profiles_languages_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "profiles_courses" ADD CONSTRAINT "profiles_courses_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "profiles_experiences" ADD CONSTRAINT "profiles_experiences_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "profiles" ADD CONSTRAINT "profiles_pro_id_pros_id_fk" FOREIGN KEY ("pro_id") REFERENCES "public"."pros"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "profiles" ADD CONSTRAINT "profiles_main_picture_id_media_id_fk" FOREIGN KEY ("main_picture_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "profiles_rels" ADD CONSTRAINT "profiles_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "profiles_rels" ADD CONSTRAINT "profiles_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
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
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_profiles_fk" FOREIGN KEY ("profiles_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_talents_fk" FOREIGN KEY ("talents_id") REFERENCES "public"."talents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_auth_events_fk" FOREIGN KEY ("auth_events_id") REFERENCES "public"."auth_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_contact_requests_fk" FOREIGN KEY ("contact_requests_id") REFERENCES "public"."contact_requests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_deleted_accounts_fk" FOREIGN KEY ("deleted_accounts_id") REFERENCES "public"."deleted_accounts"("id") ON DELETE cascade ON UPDATE no action;
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
  CREATE INDEX "profiles_service_offers_options_order_idx" ON "profiles_service_offers_options" USING btree ("_order");
  CREATE INDEX "profiles_service_offers_options_parent_id_idx" ON "profiles_service_offers_options" USING btree ("_parent_id");
  CREATE INDEX "profiles_service_offers_order_idx" ON "profiles_service_offers" USING btree ("_order");
  CREATE INDEX "profiles_service_offers_parent_id_idx" ON "profiles_service_offers" USING btree ("_parent_id");
  CREATE INDEX "profiles_skills_order_idx" ON "profiles_skills" USING btree ("_order");
  CREATE INDEX "profiles_skills_parent_id_idx" ON "profiles_skills" USING btree ("_parent_id");
  CREATE INDEX "profiles_languages_order_idx" ON "profiles_languages" USING btree ("_order");
  CREATE INDEX "profiles_languages_parent_id_idx" ON "profiles_languages" USING btree ("_parent_id");
  CREATE INDEX "profiles_courses_order_idx" ON "profiles_courses" USING btree ("_order");
  CREATE INDEX "profiles_courses_parent_id_idx" ON "profiles_courses" USING btree ("_parent_id");
  CREATE INDEX "profiles_experiences_order_idx" ON "profiles_experiences" USING btree ("_order");
  CREATE INDEX "profiles_experiences_parent_id_idx" ON "profiles_experiences" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "profiles_pro_idx" ON "profiles" USING btree ("pro_id");
  CREATE UNIQUE INDEX "profiles_slug_idx" ON "profiles" USING btree ("slug");
  CREATE INDEX "profiles_main_picture_idx" ON "profiles" USING btree ("main_picture_id");
  CREATE UNIQUE INDEX "profiles_strapi_id_idx" ON "profiles" USING btree ("strapi_id");
  CREATE INDEX "profiles_status_idx" ON "profiles" USING btree ("status");
  CREATE INDEX "profiles_updated_at_idx" ON "profiles" USING btree ("updated_at");
  CREATE INDEX "profiles_created_at_idx" ON "profiles" USING btree ("created_at");
  CREATE INDEX "profiles_rels_order_idx" ON "profiles_rels" USING btree ("order");
  CREATE INDEX "profiles_rels_parent_idx" ON "profiles_rels" USING btree ("parent_id");
  CREATE INDEX "profiles_rels_path_idx" ON "profiles_rels" USING btree ("path");
  CREATE INDEX "profiles_rels_media_id_idx" ON "profiles_rels" USING btree ("media_id");
  CREATE INDEX "media_owner_idx" ON "media" USING btree ("owner_id");
  CREATE UNIQUE INDEX "media_strapi_id_idx" ON "media" USING btree ("strapi_id");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "media_sizes_small_sizes_small_filename_idx" ON "media" USING btree ("sizes_small_filename");
  CREATE INDEX "media_sizes_medium_sizes_medium_filename_idx" ON "media" USING btree ("sizes_medium_filename");
  CREATE INDEX "media_sizes_large_sizes_large_filename_idx" ON "media" USING btree ("sizes_large_filename");
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
  CREATE INDEX "auth_events_type_idx" ON "auth_events" USING btree ("type");
  CREATE INDEX "auth_events_code_idx" ON "auth_events" USING btree ("code");
  CREATE INDEX "auth_events_method_idx" ON "auth_events" USING btree ("method");
  CREATE INDEX "auth_events_date_idx" ON "auth_events" USING btree ("date");
  CREATE INDEX "contact_requests_type_idx" ON "contact_requests" USING btree ("type");
  CREATE INDEX "contact_requests_status_idx" ON "contact_requests" USING btree ("status");
  CREATE INDEX "contact_requests_mail_status_idx" ON "contact_requests" USING btree ("mail_status");
  CREATE INDEX "contact_requests_updated_at_idx" ON "contact_requests" USING btree ("updated_at");
  CREATE INDEX "contact_requests_created_at_idx" ON "contact_requests" USING btree ("created_at");
  CREATE UNIQUE INDEX "deleted_accounts_strapi_id_idx" ON "deleted_accounts" USING btree ("strapi_id");
  CREATE INDEX "deleted_accounts_date_idx" ON "deleted_accounts" USING btree ("date");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_admins_id_idx" ON "payload_locked_documents_rels" USING btree ("admins_id");
  CREATE INDEX "payload_locked_documents_rels_pros_id_idx" ON "payload_locked_documents_rels" USING btree ("pros_id");
  CREATE INDEX "payload_locked_documents_rels_profiles_id_idx" ON "payload_locked_documents_rels" USING btree ("profiles_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_talents_id_idx" ON "payload_locked_documents_rels" USING btree ("talents_id");
  CREATE INDEX "payload_locked_documents_rels_articles_id_idx" ON "payload_locked_documents_rels" USING btree ("articles_id");
  CREATE INDEX "payload_locked_documents_rels_auth_events_id_idx" ON "payload_locked_documents_rels" USING btree ("auth_events_id");
  CREATE INDEX "payload_locked_documents_rels_contact_requests_id_idx" ON "payload_locked_documents_rels" USING btree ("contact_requests_id");
  CREATE INDEX "payload_locked_documents_rels_deleted_accounts_id_idx" ON "payload_locked_documents_rels" USING btree ("deleted_accounts_id");
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
  DROP TABLE "profiles_service_offers_options" CASCADE;
  DROP TABLE "profiles_service_offers" CASCADE;
  DROP TABLE "profiles_skills" CASCADE;
  DROP TABLE "profiles_languages" CASCADE;
  DROP TABLE "profiles_courses" CASCADE;
  DROP TABLE "profiles_experiences" CASCADE;
  DROP TABLE "profiles" CASCADE;
  DROP TABLE "profiles_rels" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "talents" CASCADE;
  DROP TABLE "_talents_v" CASCADE;
  DROP TABLE "articles" CASCADE;
  DROP TABLE "articles_rels" CASCADE;
  DROP TABLE "_articles_v" CASCADE;
  DROP TABLE "_articles_v_rels" CASCADE;
  DROP TABLE "auth_events" CASCADE;
  DROP TABLE "contact_requests" CASCADE;
  DROP TABLE "deleted_accounts" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_admins_role";
  DROP TYPE "public"."enum_profiles_consent_source";
  DROP TYPE "public"."enum_profiles_status";
  DROP TYPE "public"."enum_profiles_chosen_status";
  DROP TYPE "public"."enum_talents_status";
  DROP TYPE "public"."enum__talents_v_version_status";
  DROP TYPE "public"."enum_articles_status";
  DROP TYPE "public"."enum__articles_v_version_status";
  DROP TYPE "public"."enum_auth_events_type";
  DROP TYPE "public"."enum_auth_events_code";
  DROP TYPE "public"."enum_auth_events_method";
  DROP TYPE "public"."enum_contact_requests_type";
  DROP TYPE "public"."enum_contact_requests_status";
  DROP TYPE "public"."enum_contact_requests_mail_status";`)
}
