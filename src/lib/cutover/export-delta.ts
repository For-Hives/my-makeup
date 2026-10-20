import type { Payload } from 'payload'

/**
 * The private export of what was written in the v3 since the switch (ticket 234; PLAN-PROD-DIRECT §4.5,
 * docs/migration/RETOUR-ARRIERE.md). If the old site is put back, the accounts, profiles, photos and contact
 * messages that makeup artists created or changed on the v3 in the meantime are replayed by hand from this file.
 *
 * - **An allow-list for the accounts and the photos** (`select`): a field that is added later is not exported
 *   until it is named here. The profiles and the messages are exported whole, and every record goes through
 *   `retirerLesSecrets`, which drops any key that looks like a password, a hash, a salt or a token.
 * - **Deterministic**: no clock, no random value. The same database and the same `since` give the same text.
 * - **What a deletion leaves**: an account of the old site deleted on the v3 leaves its old identifier in
 *   `deleted-accounts`. A photo or an account that came from the v3 alone and was deleted leaves nothing, and
 *   the old site never knew it.
 * - An imported record keeps the dates of the old site (the import writes them back), so an imported record
 *   nobody touched is older than the day of the switch and is not exported.
 */

/** The name of the format, so that the reader knows what it holds. */
export const DELTA_FORMAT = 'my-makeup-delta-2'

/** Why a record is in the export: made after the date, or made before and changed after. */
export type RecordReason = 'created' | 'updated'

export type DeltaRecord = Record<string, unknown> & { id: number; sinceCutover: RecordReason }

export interface DeltaExport {
	format: typeof DELTA_FORMAT
	since: string
	counts: Record<DeltaSection, number>
	accounts: DeltaRecord[]
	profiles: DeltaRecord[]
	photos: DeltaRecord[]
	messages: DeltaRecord[]
	deletedAccounts: { strapiId: number; date: string }[]
}

export type DeltaSection = 'accounts' | 'profiles' | 'photos' | 'messages' | 'deletedAccounts'

/** A key that names a password, a hash, a salt, a token, a secret or a session: never exported, at any depth. */
const SECRET_KEY =
	/hash|salt|token|password|passwd|motdepasse|secret|bcrypt|session|apikey|cookie|lockuntil|loginattempts/i

/** The same value without any secret key, at any depth. */
export function removeSecrets(valeur: unknown): unknown {
	if (Array.isArray(valeur)) return valeur.map(removeSecrets)
	if (valeur !== null && typeof valeur === 'object')
		return Object.fromEntries(
			Object.entries(valeur)
				.filter(([cle]) => !SECRET_KEY.test(cle))
				.map(([cle, contenu]) => [cle, removeSecrets(contenu)])
		)
	return valeur
}

/** The fields of an account that are exported: what is needed to make it again on the old site, nothing of its credentials. */
const ACCOUNT_FIELDS = {
	email: true,
	name: true,
	blocked: true,
	_verified: true,
	lastSignInAt: true,
	legacyProvider: true,
	strapiId: true,
	createdAt: true,
	updatedAt: true,
} as const

/** The fields of a photo that are exported. */
const PHOTO_FIELDS = {
	filename: true,
	mimeType: true,
	filesize: true,
	width: true,
	height: true,
	alt: true,
	owner: true,
	prefix: true,
	strapiId: true,
	createdAt: true,
	updatedAt: true,
} as const

const reasonOf = (doc: { createdAt?: string | null }, depuis: Date): RecordReason =>
	doc.createdAt && new Date(doc.createdAt).getTime() >= depuis.getTime() ? 'created' : 'updated'

function toRecord(doc: { id: number; createdAt?: string | null }, depuis: Date): DeltaRecord {
	const { id, collection: _collection, ...rest } = removeSecrets(doc) as Record<string, unknown> & { id: number }
	// `sinceCutover` is last on purpose: no field of a collection may take its place.
	return { id, ...rest, sinceCutover: reasonOf(doc, depuis) }
}

/** Reads what was created or changed since `depuis`, oldest identifier first. */
export async function readDelta(payload: Payload, depuis: Date): Promise<DeltaExport> {
	const instant = depuis.toISOString()
	const recent = { updatedAt: { greater_than_equal: instant } }
	const reading = { depth: 0, limit: 0, pagination: false, overrideAccess: true, sort: 'id' } as const
	const [accounts, profiles, photos, messages, deleted] = await Promise.all([
		payload.find({ ...reading, collection: 'pros', select: ACCOUNT_FIELDS, where: recent }),
		payload.find({ ...reading, collection: 'profiles', where: recent }),
		payload.find({ ...reading, collection: 'media', select: PHOTO_FIELDS, where: recent }),
		payload.find({ ...reading, collection: 'contact-requests', where: recent }),
		payload.find({
			...reading,
			collection: 'deleted-accounts',
			select: { strapiId: true, date: true },
			where: { date: { greater_than_equal: instant } },
		}),
	])
	const toRecords = (docs: { id: number; createdAt?: string | null }[]) => docs.map(doc => toRecord(doc, depuis))
	const output = {
		accounts: toRecords(accounts.docs),
		profiles: toRecords(profiles.docs),
		photos: toRecords(photos.docs),
		messages: toRecords(messages.docs),
		deletedAccounts: deleted.docs.map(({ strapiId, date }) => ({ strapiId, date })),
	}
	return {
		format: DELTA_FORMAT,
		since: instant,
		counts: {
			accounts: output.accounts.length,
			profiles: output.profiles.length,
			photos: output.photos.length,
			messages: output.messages.length,
			deletedAccounts: output.deletedAccounts.length,
		},
		...output,
	}
}

/** The lines of the log: counts and numeric identifiers only, never a name, an address or a text. */
export function deltaLog(delta: DeltaExport): string[] {
	const ids = (liste: { id: number }[]) => liste.map(({ id }) => id).join(', ')
	return [
		`[bascule] export du delta depuis ${delta.since}`,
		`[bascule] comptes : ${delta.counts.accounts} (identifiants ${ids(delta.accounts)})`,
		`[bascule] profils : ${delta.counts.profiles} (identifiants ${ids(delta.profiles)})`,
		`[bascule] photos : ${delta.counts.photos} (identifiants ${ids(delta.photos)})`,
		`[bascule] messages : ${delta.counts.messages} (identifiants ${ids(delta.messages)})`,
		`[bascule] comptes de l’ancien site supprimés : ${delta.counts.deletedAccounts} (identifiants ${delta.deletedAccounts.map(({ strapiId }) => strapiId).join(', ')})`,
	]
}

/** The text of the file. */
export const deltaAsText = (delta: DeltaExport): string => `${JSON.stringify(delta, null, 2)}\n`
