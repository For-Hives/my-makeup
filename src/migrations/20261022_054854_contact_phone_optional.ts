import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * The phone number of a contact message becomes optional (ticket 305): the column of `contact_requests`
 * accepts no value. Every row already stored keeps its number. The way back puts the constraint back, and
 * fails if a message without a number was stored since.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "contact_requests" ALTER COLUMN "phone" DROP NOT NULL;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "contact_requests" ALTER COLUMN "phone" SET NOT NULL;`)
}
