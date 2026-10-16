/**
 * The guard of a target that is already in service (docs/migration/IMPORT.md, « Jusqu'à la bascule
 * seulement »; ticket 227).
 *
 * The import follows the source: every run puts back into the target what the old site holds. That
 * is what is wanted while the old site is the one in service. Once makeup artists sign in to the v3,
 * a new run would put back the legacy hash that their first sign-in (ticket 087) or a reset of the
 * password erased, so that an old password opens the account again, and the email of the old site over
 * one changed in the v3. So the run refuses, before any write, a target that carries such a trace:
 *
 * - a sign-in or a new password that succeeded in the v3, read in the journal of authentication
 *   (`auth-evenements`), which the import never writes;
 * - an account with a last sign-in date (`pros.derniereConnexion`, ticket 077): the journal is purged
 *   after 90 days, this date is not, and a Google or Facebook account never had a legacy hash to lose;
 * - an account that holds no legacy hash where the source gives one: a sign-in or a reset erased it.
 *
 * `--cible-en-service` lifts the guard on purpose, and then the import leaves every account it
 * already took exactly as it is (`ADAPTATEUR_COMPTES_EN_SERVICE`, ./comptes.ts): it only creates the
 * missing ones. The message names counts and identifiers of the old base, never a value.
 */

import type { Payload } from 'payload'
import { COLLECTION_JOURNAL } from '../../../src/lib/auth/journal'
import { DRAPEAU_CIBLE_EN_SERVICE, ImportRefuse } from './cible'
import { ADAPTATEUR_COMPTES } from './comptes'
import { type Attendu, lireLaCible } from './moteur'

/** What the target shows of its use by the v3. */
export interface TracesDeLaBascule {
	/** Sign-ins and new passwords that succeeded in the v3, read in the journal. */
	connexions: number
	/** Accounts that hold a date of last sign-in: set by the v3 only, and kept after the journal is purged. */
	comptesConnectes: number
	/** `strapiId` of the accounts that hold no legacy hash where the source gives one. */
	hashEfface: number[]
}

/** Reads the traces of the use of the v3 on the target. Writes nothing. */
export async function tracesDeLaBascule(payload: Payload, comptes: readonly Attendu[]): Promise<TracesDeLaBascule> {
	const { totalDocs } = await payload.count({
		collection: COLLECTION_JOURNAL,
		where: { and: [{ type: { in: ['connexion', 'reinitialisation'] } }, { code: { in: ['ok', 'heritee'] } }] },
		overrideAccess: true,
	})
	const { totalDocs: comptesConnectes } = await payload.count({
		collection: 'pros',
		where: { derniereConnexion: { exists: true } },
		overrideAccess: true,
	})
	const dansLaCible = new Map(
		(await lireLaCible(payload, ADAPTATEUR_COMPTES)).map(({ valeurs }) => [Number(valeurs.strapiId), valeurs])
	)
	const vide = (valeur: unknown) => valeur === null || valeur === undefined || valeur === ''
	const hashEfface = comptes
		.filter(({ strapiId, valeurs }) => {
			const present = dansLaCible.get(strapiId)
			return present !== undefined && !vide(valeurs.legacyBcrypt) && vide(present.legacyBcrypt)
		})
		.map(({ strapiId }) => strapiId)
		.sort((a, b) => a - b)
	return { connexions: totalDocs, comptesConnectes, hashEfface }
}

/** Why the run refuses the target, or `null` when it shows no trace of the v3 in use. */
export function messageDeLaBascule({ connexions, comptesConnectes, hashEfface }: TracesDeLaBascule): string | null {
	if (connexions === 0 && comptesConnectes === 0 && hashEfface.length === 0) return null
	const s = (nombre: number) => (nombre > 1 ? 's' : '')
	const traces = [
		connexions > 0 &&
			`${connexions} connexion${s(connexions)} ou nouveau${connexions > 1 ? 'x' : ''} mot${s(connexions)} de passe réussi${s(connexions)} dans la v3 (journal d’authentification)`,
		comptesConnectes > 0 &&
			`${comptesConnectes} compte${s(comptesConnectes)} avec une date de dernière connexion dans la v3`,
		hashEfface.length > 0 &&
			`${hashEfface.length} compte${s(hashEfface.length)} dont le hash hérité a déjà été effacé (anciens identifiants : ${hashEfface.join(', ')})`,
	].filter(Boolean)
	return [
		`La cible est déjà utilisée par la v3 : ${traces.join(' ; ')}.`,
		'Un nouveau passage remettrait le hash et l’email de l’ancien site sur des comptes que leurs propriétaires ont changés.',
		`Rien n’est écrit. Pour rejouer l’import quand même, sans toucher aux comptes déjà repris, ajoute ${DRAPEAU_CIBLE_EN_SERVICE} (docs/migration/IMPORT.md).`,
	].join(' ')
}

/** Refuses a target the v3 already uses (`ImportRefuse`, exit code 1), before any write. */
export async function refuserUneCibleEnService(payload: Payload, comptes: readonly Attendu[]): Promise<void> {
	const message = messageDeLaBascule(await tracesDeLaBascule(payload, comptes))
	if (message !== null) throw new ImportRefuse(message)
}
