import type { Payload } from 'payload'
import { GMAIL_DOMAINS, canonicalGmailLocal } from './canonical-email'

/**
 * Finds the account of an address, or of a Gmail variant of it (ticket 084): the dots and the
 * `+tag` of a Gmail address do not make another mailbox.
 *
 * A single read of the table `pros` through the connection pool: the comparison on the local part
 * of a Gmail address needs string functions that Payload's query language does not have. No value is
 * concatenated into the SQL, every one is a parameter. The scan is bounded by the Gmail accounts
 * (the exact address is found by the index of the email).
 *
 * What it gives back is what the callers need and no more: the stored address (the mail goes
 * there, never to what was typed), whether the account is confirmed, and its confirmation token
 * while the link has not been used. The token is for the server alone: it never reaches a response.
 *
 * No `next` import.
 */

export interface AccountFound {
	/** The address as stored (lower case). */
	email: string
	verifie: boolean
	/** The token of the link of the mail while it has not been followed; `null` after. */
	jeton: string | null
	/** True when the account was found by a Gmail variant and not by the very address. */
	parVariante: boolean
}

type Row = { email: string; verifie: boolean | null; jeton: string | null }

const USED_PREFIX = 'utilise:'

export async function findAccount(payload: Pick<Payload, 'db'>, email: string): Promise<AccountFound | undefined> {
	const address = email.trim().toLowerCase()
	const local = canonicalGmailLocal(address)
	const { rows } = await payload.db.pool.query<Row>(
		`SELECT lower("email") AS "email", "_verified" AS "verifie", "_verificationtoken" AS "jeton"
		   FROM "pros"
		  WHERE "email" = $1
		     OR ($2::text IS NOT NULL
		         AND split_part(lower("email"), '@', 2) = ANY ($3::text[])
		         AND replace(split_part(split_part(lower("email"), '@', 1), '+', 1), '.', '') = $2)
		  ORDER BY ("email" = $1) DESC, "id"
		  LIMIT 1`,
		[address, local, [...GMAIL_DOMAINS]]
	)
	const row = rows[0]
	if (!row) return undefined
	const token = row.jeton && !row.jeton.startsWith(USED_PREFIX) ? row.jeton : null
	return { email: row.email, verifie: row.verifie === true, jeton: token, parVariante: row.email !== address }
}
