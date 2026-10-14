import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Integration of wave 4. The lots of tickets 083 to 091 each wrote their own migration of the journal
 * enums from the same earlier snapshot, so none of the snapshots described the sum, and the values were
 * appended in the order of the migrations, not in the order of the collection. This one records the merged
 * snapshot and puts the values of `enum_auth_evenements_type` in the order of the collection (no row changes).
 * The down migration brings the rows into the earliest lists, so that the downs of the lots below can run.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "auth_evenements" ALTER COLUMN "type" SET DATA TYPE text;
  DROP TYPE "public"."enum_auth_evenements_type";
  CREATE TYPE "public"."enum_auth_evenements_type" AS ENUM('connexion', 'deconnexion', 'deconnexion-partout', 'inscription', 'confirmation', 'renvoi', 'mot-de-passe-oublie', 'reinitialisation', 'blocage', 'deblocage');
  ALTER TABLE "auth_evenements" ALTER COLUMN "type" SET DATA TYPE "public"."enum_auth_evenements_type" USING "type"::"public"."enum_auth_evenements_type";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	// The downs of the lots below each rebuild the journal enums from the list that preceded all of them, and
	// would fail on a row of a value they do not know: this one, which runs first, brings the rows into that list.
	await db.execute(sql`
   DELETE FROM "auth_evenements" WHERE "type"::text NOT IN ('connexion', 'deconnexion', 'deconnexion-partout', 'inscription', 'confirmation');
  UPDATE "auth_evenements" SET "code" = 'inconnu' WHERE "code"::text NOT IN ('ok', 'identifiants-invalides', 'trop-de-tentatives', 'service-indisponible', 'email-non-confirme', 'donnees-invalides', 'email-deja-pris', 'deja-confirme', 'lien-invalide', 'inconnu');`)
}
