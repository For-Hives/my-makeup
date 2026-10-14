import bcrypt from 'bcryptjs'
import type { Payload } from 'payload'

/**
 * The sign-in of an account that comes from the old site (ticket 087; plan 01 §2.3 and §2.4).
 *
 * The import copies the bcrypt hash of the old site into `pros.legacyBcrypt`, and gives the account
 * a random Payload password that nobody knows. The first sign-in with the usual password therefore
 * fails in Payload; the check below then compares the password to the old hash. If it matches, the
 * password is written in Payload's own format and the old hash is erased, so a second sign-in goes
 * the normal way and the old hash is gone for good.
 *
 * The hash is read straight from the database: the field is hidden and no API reads it. It never
 * goes into a log, an error or an answer.
 */

/** A bcrypt hash as the old site wrote it: `$2a$10$` and 53 characters (`$2b$` and `$2y$` too). */
const FORME_D_UN_HASH_BCRYPT = /^\$2[aby]\$(?:0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/

/**
 * A well-formed bcrypt hash (cost 10, like those of the old site) of a random text nobody kept.
 * An account with no old hash is compared to it, so that it costs the same work as an account that
 * has one (ticket 088).
 */
export const HASH_FICTIF = '$2b$10$GtL8cKf4O3LN8FvwUJTIWecJzNA/PqgmdrmTuI5tRDMfVAMI5tjIO'

export const estUnHashBcrypt = (valeur: unknown): valeur is string =>
	typeof valeur === 'string' && FORME_D_UN_HASH_BCRYPT.test(valeur)

/**
 * Does the password match the hash? Always does one bcrypt comparison, to the dummy hash when there
 * is no usable hash (none, or one that is badly formed), and never throws.
 */
export async function motDePasseDuHash(motDePasse: string, hash: unknown): Promise<boolean> {
	const utilisable = estUnHashBcrypt(hash)
	try {
		const accepte = await bcrypt.compare(motDePasse, utilisable ? hash : HASH_FICTIF)
		return utilisable && accepte
	} catch {
		return false
	}
}

interface LigneDuCompte {
	id: number | string
	legacyBcrypt?: string | null
}

/**
 * The work of the old-hash path, for an account whose sign-in Payload refused.
 *
 * - Finds the account by its address (trimmed, lower case), reads its old hash, compares the
 *   password to it. An unknown address, an account with no hash, a badly formed hash: the same
 *   comparison, to the dummy hash, and a refusal.
 * - On a match only: writes the password in Payload's format and sets `legacyBcrypt` to null, in
 *   one update. A wrong password touches nothing.
 *
 * Gives back `true` when the account now holds the password, so that the caller signs it in.
 * A failure of the database is the caller's to treat: it raises.
 */
export async function remplacerLeHashHerite(
	payload: Pick<Payload, 'db' | 'update'>,
	{ email, password }: { email: string; password: string }
): Promise<boolean> {
	const ligne = await payload.db.findOne<LigneDuCompte>({
		collection: 'pros',
		where: { email: { equals: email.trim().toLowerCase() } },
	})
	const hash = ligne?.legacyBcrypt
	const accepte = await motDePasseDuHash(password, hash)
	if (!accepte || !ligne) return false

	await payload.update({
		collection: 'pros',
		id: ligne.id,
		data: { password, legacyBcrypt: null },
		depth: 0,
		overrideAccess: true,
	})
	return true
}
