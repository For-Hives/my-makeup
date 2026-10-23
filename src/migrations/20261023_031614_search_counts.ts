import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * The searches counted by day (issue 1002): one new table, `search_counts` (day, département, three numbers),
 * and the column the lock table of Payload keeps for each collection. Nothing else changes; the way back drops them.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   CREATE TYPE "public"."enum_search_counts_department" AS ENUM('10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49', '50', '51', '52', '53', '54', '55', '56', '57', '58', '59', '60', '61', '62', '63', '64', '65', '66', '67', '68', '69', '70', '71', '72', '73', '74', '75', '76', '77', '78', '79', '80', '81', '82', '83', '84', '85', '86', '87', '88', '89', '90', '91', '92', '93', '94', '95', '971', '972', '973', '974', '976', '01', '02', '03', '04', '05', '06', '07', '08', '09', '2A', '2B', 'unknown');
  CREATE TABLE "search_counts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"day" timestamp(3) with time zone NOT NULL,
  	"department" "enum_search_counts_department" NOT NULL,
  	"total" numeric DEFAULT 0 NOT NULL,
  	"with_city" numeric DEFAULT 0 NOT NULL,
  	"no_result" numeric DEFAULT 0 NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "search_counts_id" integer;
  CREATE INDEX "search_counts_day_idx" ON "search_counts" USING btree ("day");
  CREATE INDEX "search_counts_department_idx" ON "search_counts" USING btree ("department");
  CREATE UNIQUE INDEX "day_department_idx" ON "search_counts" USING btree ("day","department");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_search_counts_fk" FOREIGN KEY ("search_counts_id") REFERENCES "public"."search_counts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_search_counts_id_idx" ON "payload_locked_documents_rels" USING btree ("search_counts_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	// The constraint and the column of the lock table go first: dropping the table would take the constraint away.
	await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_search_counts_fk";
  DROP INDEX "payload_locked_documents_rels_search_counts_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "search_counts_id";
  ALTER TABLE "search_counts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "search_counts" CASCADE;
  DROP TYPE "public"."enum_search_counts_department";`)
}
