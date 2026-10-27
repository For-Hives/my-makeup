import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'
import { parsePrice } from '../lib/price'
import { type ProfileDocument, stateAfterSave } from '../lib/profile/state'

/**
 * Lightened publication (decision of 27/10/2026, docs/migration/CHANGEMENTS-VOULUS.md): `publishable` now means a
 * main photo, a usable city, a speciality and a contact channel, and a new flag `indexable` says that Google may
 * index the page (description of 100 characters and a priced offer or a gallery photo).
 *
 * The flags are computed at every save, so the rows already stored would keep the old values until their owner
 * saves again, and the new rule would change nothing the day it is deployed. This migration therefore:
 *
 * 1. adds the two columns;
 * 2. reads again the amount of every offer and option that has a text price, by the single price rule
 *    (« 2 h : 150 € » is 150, not nothing; « 45 min, 60 € » is 60, not 45);
 * 3. recomputes the flags, their dates and the status of every profile by the single rule
 *    (`stateAfterSave`, the function a save calls), and writes them with plain SQL: no hook runs (no refresh of the
 *    pages, no IndexNow) and `updated_at` is not touched (it drives the reminders, the 24 months of inactivity and
 *    the order of the directory).
 *
 * On an empty table (a new database, the test bench) steps 2 and 3 have nothing to do and read nothing: a later
 * migration may add a column that this one would not find. The `down` drops the columns; the old flags are
 * recomputed by the next save of each profile.
 */

type PriceRow = { id: string; price_text: string | null; price_from: string | number | null }

async function readAmounts({ db }: Pick<MigrateUpArgs, 'db'>): Promise<void> {
	for (const table of ['profiles_service_offers', 'profiles_service_offers_options'] as const) {
		const rows = (
			await db.execute(
				sql`SELECT "id", "price_text", "price_from" FROM ${sql.identifier(table)} WHERE "price_text" IS NOT NULL`
			)
		).rows as PriceRow[]
		for (const row of rows) {
			const amount = parsePrice(row.price_text).priceFrom
			const stored = row.price_from === null ? null : Number(row.price_from)
			if (amount !== stored) {
				await db.execute(sql`UPDATE ${sql.identifier(table)} SET "price_from" = ${amount} WHERE "id" = ${row.id}`)
			}
		}
	}
}

/** The fields the single rule reads of a profile, and the state it writes. */
const READ_FIELDS = {
	status: true,
	chosenStatus: true,
	active: true,
	activeSince: true,
	publishable: true,
	publishableSince: true,
	indexable: true,
	indexableSince: true,
	fullyEmpty: true,
	fullyEmptySince: true,
	firstName: true,
	lastName: true,
	artistName: true,
	specialty: true,
	description: true,
	city: true,
	zoneKind: true,
	countries: true,
	mainPicture: true,
	gallery: true,
	skills: true,
	experiences: true,
	courses: true,
	languages: true,
	serviceOffers: true,
	networks: true,
	contactDetails: true,
	publicContact: true,
} as const

async function recomputeFlags({ db, payload, req }: Pick<MigrateUpArgs, 'db' | 'payload' | 'req'>): Promise<void> {
	const now = new Date()
	const profiles = await payload.find({
		collection: 'profiles',
		select: READ_FIELDS,
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		req,
	})
	for (const profile of profiles.docs) {
		const write = stateAfterSave({ avant: profile, apres: profile as ProfileDocument, maintenant: now })
		await db.execute(sql`
			UPDATE "profiles" SET
				"publishable" = ${write.publishable},
				"publishable_since" = ${write.publishableSince},
				"indexable" = ${write.indexable},
				"indexable_since" = ${write.indexableSince},
				"fully_empty" = ${write.fullyEmpty},
				"fully_empty_since" = ${write.fullyEmptySince},
				"status" = ${write.status}
			WHERE "id" = ${profile.id}`)
	}
}

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "profiles" ADD COLUMN "indexable" boolean;
  ALTER TABLE "profiles" ADD COLUMN "indexable_since" timestamp(3) with time zone;`)
	const count = (await db.execute(sql`SELECT count(*)::int AS "total" FROM "profiles"`)).rows[0]?.total
	if (!count) return
	await readAmounts({ db })
	await recomputeFlags({ db, payload, req })
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "profiles" DROP COLUMN "indexable";
  ALTER TABLE "profiles" DROP COLUMN "indexable_since";`)
}
