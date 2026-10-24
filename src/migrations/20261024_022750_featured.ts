import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   ALTER TYPE "public"."enum_moderation_events_action" ADD VALUE 'feature';
  ALTER TYPE "public"."enum_moderation_events_action" ADD VALUE 'unfeature';
  ALTER TABLE "moderation_events" ALTER COLUMN "reason" DROP NOT NULL;
  ALTER TABLE "profiles" ADD COLUMN "featured" boolean DEFAULT false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "moderation_events" ALTER COLUMN "action" SET DATA TYPE text;
  DROP TYPE "public"."enum_moderation_events_action";
  CREATE TYPE "public"."enum_moderation_events_action" AS ENUM('hide', 'suspend', 'restore');
  ALTER TABLE "moderation_events" ALTER COLUMN "action" SET DATA TYPE "public"."enum_moderation_events_action" USING "action"::"public"."enum_moderation_events_action";
  ALTER TABLE "moderation_events" ALTER COLUMN "reason" SET NOT NULL;
  ALTER TABLE "profiles" DROP COLUMN "featured";`)
}
