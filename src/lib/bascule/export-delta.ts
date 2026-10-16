import type { Payload } from 'payload'

/**
 * The private export of what was written in the v3 since the switch (ticket 234; PLAN-PROD-DIRECT §4.5,
 * docs/migration/RETOUR-ARRIERE.md). If the old site is put back, the accounts, profiles, photos and contact
 * messages that makeup artists created or changed on the v3 in the meantime are replayed by hand from this file.
 *
 * - **An allow-list for the accounts and the photos** (`select`): a field that is added later is not exported
 *   until it is named here. The profiles and the messages are exported whole, and every record goes through
 *   `retirerLesSecrets`, which drops any key that looks like a password, a hash, a salt or a token.
 * - **Deterministic**: no clock, no random value. The same database and the same `depuis` give the same text.
 * - **What a deletion leaves**: an account of the old site deleted on the v3 leaves its old identifier in
 *   `comptes-supprimes`. A photo or an account that came from the v3 alone and was deleted leaves nothing, and
 *   the old site never knew it.
 * - An imported record keeps the dates of the old site (the import writes them back), so an imported record
 *   nobody touched is older than the day of the switch and is not exported.
 */

/** The name of the format, so that the reader knows what it holds. */
export const FORMAT_DU_DELTA = 'my-makeup-delta-1'

/** Why a record is in the export: made after the date, or made before and changed after. */
export type Motif = 'cree' | 'modifie'

export type Enregistrement = Record<string, unknown> & { id: number; depuisLaBascule: Motif }

export interface ExportDuDelta {
	format: typeof FORMAT_DU_DELTA
	depuis: string
	nombres: Record<RubriqueDuDelta, number>
	comptes: Enregistrement[]
	profils: Enregistrement[]
	photos: Enregistrement[]
	messages: Enregistrement[]
	comptesSupprimes: { strapiId: number; date: string }[]
}

export type RubriqueDuDelta = 'comptes' | 'profils' | 'photos' | 'messages' | 'comptesSupprimes'

/** A key that names a password, a hash, a salt, a token, a secret or a session: never exported, at any depth. */
const CLE_SECRETE =
	/hash|salt|token|password|passwd|motdepasse|secret|bcrypt|session|apikey|cookie|lockuntil|loginattempts/i

/** The same value without any secret key, at any depth. */
export function retirerLesSecrets(valeur: unknown): unknown {
	if (Array.isArray(valeur)) return valeur.map(retirerLesSecrets)
	if (valeur !== null && typeof valeur === 'object')
		return Object.fromEntries(
			Object.entries(valeur)
				.filter(([cle]) => !CLE_SECRETE.test(cle))
				.map(([cle, contenu]) => [cle, retirerLesSecrets(contenu)])
		)
	return valeur
}

/** The fields of an account that are exported: what is needed to make it again on the old site, nothing of its credentials. */
const CHAMPS_DU_COMPTE = {
	email: true,
	nom: true,
	bloque: true,
	_verified: true,
	derniereConnexion: true,
	legacyProvider: true,
	strapiId: true,
	createdAt: true,
	updatedAt: true,
} as const

/** The fields of a photo that are exported. */
const CHAMPS_DE_LA_PHOTO = {
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

const motifDe = (doc: { createdAt?: string | null }, depuis: Date): Motif =>
	doc.createdAt && new Date(doc.createdAt).getTime() >= depuis.getTime() ? 'cree' : 'modifie'

function enregistrement(doc: { id: number; createdAt?: string | null }, depuis: Date): Enregistrement {
	const { id, collection: _collection, ...reste } = retirerLesSecrets(doc) as Record<string, unknown> & { id: number }
	// `depuisLaBascule` is last on purpose: no field of a collection may take its place.
	return { id, ...reste, depuisLaBascule: motifDe(doc, depuis) }
}

/** Reads what was created or changed since `depuis`, oldest identifier first. */
export async function lireLeDelta(payload: Payload, depuis: Date): Promise<ExportDuDelta> {
	const instant = depuis.toISOString()
	const recent = { updatedAt: { greater_than_equal: instant } }
	const lecture = { depth: 0, limit: 0, pagination: false, overrideAccess: true, sort: 'id' } as const
	const [comptes, profils, photos, messages, supprimes] = await Promise.all([
		payload.find({ ...lecture, collection: 'pros', select: CHAMPS_DU_COMPTE, where: recent }),
		payload.find({ ...lecture, collection: 'profils', where: recent }),
		payload.find({ ...lecture, collection: 'media', select: CHAMPS_DE_LA_PHOTO, where: recent }),
		payload.find({ ...lecture, collection: 'demandes', where: recent }),
		payload.find({
			...lecture,
			collection: 'comptes-supprimes',
			select: { strapiId: true, date: true },
			where: { date: { greater_than_equal: instant } },
		}),
	])
	const mettre = (docs: { id: number; createdAt?: string | null }[]) => docs.map(doc => enregistrement(doc, depuis))
	const sortie = {
		comptes: mettre(comptes.docs),
		profils: mettre(profils.docs),
		photos: mettre(photos.docs),
		messages: mettre(messages.docs),
		comptesSupprimes: supprimes.docs.map(({ strapiId, date }) => ({ strapiId, date })),
	}
	return {
		format: FORMAT_DU_DELTA,
		depuis: instant,
		nombres: {
			comptes: sortie.comptes.length,
			profils: sortie.profils.length,
			photos: sortie.photos.length,
			messages: sortie.messages.length,
			comptesSupprimes: sortie.comptesSupprimes.length,
		},
		...sortie,
	}
}

/** The lines of the log: counts and numeric identifiers only, never a name, an address or a text. */
export function journalDuDelta(delta: ExportDuDelta): string[] {
	const ids = (liste: { id: number }[]) => liste.map(({ id }) => id).join(', ')
	return [
		`[bascule] export du delta depuis ${delta.depuis}`,
		`[bascule] comptes : ${delta.nombres.comptes} (identifiants ${ids(delta.comptes)})`,
		`[bascule] profils : ${delta.nombres.profils} (identifiants ${ids(delta.profils)})`,
		`[bascule] photos : ${delta.nombres.photos} (identifiants ${ids(delta.photos)})`,
		`[bascule] messages : ${delta.nombres.messages} (identifiants ${ids(delta.messages)})`,
		`[bascule] comptes de l’ancien site supprimés : ${delta.nombres.comptesSupprimes} (identifiants ${delta.comptesSupprimes.map(({ strapiId }) => strapiId).join(', ')})`,
	]
}

/** The text of the file. */
export const deltaEnTexte = (delta: ExportDuDelta): string => `${JSON.stringify(delta, null, 2)}\n`
