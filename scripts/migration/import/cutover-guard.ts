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
 *   (`auth-events`), which the import never writes;
 * - an account with a last sign-in date (`pros.lastSignInAt`, ticket 077): the journal is purged
 *   after 90 days, this date is not, and a Google or Facebook account never had a legacy hash to lose;
 * - an account that holds no legacy hash where the source gives one: a sign-in or a reset erased it;
 * - an account of the source that was deleted in the v3 (collection `deleted-accounts`, written by the
 *   deletion itself and never purged): the source still holds it, and a run would bring it back with its
 *   public profile.
 *
 * `--cible-en-service` lifts the guard on purpose, and then the import leaves every account it
 * already took exactly as it is (`ADAPTATEUR_COMPTES_EN_SERVICE`, ./comptes.ts) and the profiles it holds
 * as they are (`ADAPTATEUR_PROFILS_EN_SERVICE`, ./profils.ts): it only creates the missing ones, and never an
 * account deleted in the v3 nor its profile (`sansLesComptesSupprimes`). The message names counts and identifiers of the old base, never a value.
 */

import type { Payload } from 'payload'
import { AUTH_LOG_COLLECTION } from '../../../src/lib/auth/auth-log'
import { DRAPEAU_CIBLE_EN_SERVICE, ImportRefuse } from './target'
import { ADAPTATEUR_COMPTES } from './accounts'
import { type Attendu, lireLaCible } from './engine'

/** What the target shows of its use by the v3. */
export interface TracesDeLaBascule {
	/** Sign-ins and new passwords that succeeded in the v3, read in the journal. */
	connexions: number
	/** Accounts that hold a date of last sign-in: set by the v3 only, and kept after the journal is purged. */
	comptesConnectes: number
	/** `strapiId` of the accounts that hold no legacy hash where the source gives one. */
	hashEfface: number[]
	/** `strapiId` of the accounts of the source that were deleted in the v3. */
	supprimes: number[]
}

/** The identifiers on the old site of the accounts deleted in the v3: all that is left of them. */
export async function comptesSupprimesDansLaV3(payload: Payload): Promise<Set<number>> {
	const { docs } = await payload.find({
		collection: 'deleted-accounts',
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
		select: { strapiId: true },
	})
	return new Set(docs.map(({ strapiId }) => Number(strapiId)))
}

/** Reads the traces of the use of the v3 on the target. Writes nothing. */
export async function tracesDeLaBascule(
	payload: Payload,
	comptes: readonly Attendu[],
	idsDeLaSource: readonly number[] = comptes.map(({ strapiId }) => strapiId)
): Promise<TracesDeLaBascule> {
	const { totalDocs } = await payload.count({
		collection: AUTH_LOG_COLLECTION,
		where: { and: [{ type: { in: ['sign-in', 'password-reset'] } }, { code: { in: ['ok', 'heritee'] } }] },
		overrideAccess: true,
	})
	const { totalDocs: comptesConnectes } = await payload.count({
		collection: 'pros',
		where: { lastSignInAt: { exists: true } },
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
	const retires = await comptesSupprimesDansLaV3(payload)
	const supprimes = idsDeLaSource.filter(id => retires.has(id)).sort((a, b) => a - b)
	return { connexions: totalDocs, comptesConnectes, hashEfface, supprimes }
}

/** Why the run refuses the target, or `null` when it shows no trace of the v3 in use. */
export function messageDeLaBascule({
	connexions,
	comptesConnectes,
	hashEfface,
	supprimes,
}: TracesDeLaBascule): string | null {
	if (connexions === 0 && comptesConnectes === 0 && hashEfface.length === 0 && supprimes.length === 0) return null
	const s = (nombre: number) => (nombre > 1 ? 's' : '')
	const traces = [
		connexions > 0 &&
			`${connexions} connexion${s(connexions)} ou nouveau${connexions > 1 ? 'x' : ''} mot${s(connexions)} de passe réussi${s(connexions)} dans la v3 (journal d’authentification)`,
		comptesConnectes > 0 &&
			`${comptesConnectes} compte${s(comptesConnectes)} avec une date de dernière connexion dans la v3`,
		hashEfface.length > 0 &&
			`${hashEfface.length} compte${s(hashEfface.length)} dont le hash hérité a déjà été effacé (anciens identifiants : ${hashEfface.join(', ')})`,
		supprimes.length > 0 &&
			`${supprimes.length} compte${s(supprimes.length)} de l’ancien site supprimé${s(supprimes.length)} dans la v3 (anciens identifiants : ${supprimes.join(', ')})`,
	].filter(Boolean)
	return [
		`La cible est déjà utilisée par la v3 : ${traces.join(' ; ')}.`,
		'Un nouveau passage remettrait le hash et l’email de l’ancien site sur des comptes que leurs propriétaires ont changés, et ramènerait les comptes qu’elles ont supprimés.',
		`Rien n’est écrit. Pour rejouer l’import quand même, sans toucher aux comptes ni aux profils déjà repris, et sans ramener un compte supprimé, ajoute ${DRAPEAU_CIBLE_EN_SERVICE} (docs/migration/IMPORT.md).`,
	].join(' ')
}

/** Refuses a target the v3 already uses (`ImportRefuse`, exit code 1), before any write. */
export async function refuserUneCibleEnService(
	payload: Payload,
	comptes: readonly Attendu[],
	idsDeLaSource?: readonly number[]
): Promise<void> {
	const message = messageDeLaBascule(await tracesDeLaBascule(payload, comptes, idsDeLaSource))
	if (message !== null) throw new ImportRefuse(message)
}

/**
 * What the source gives, less the accounts deleted in the v3 and their profiles: the run with
 * `--cible-en-service` never brings them back. The photos stay in the list of the files, and are
 * counted as those of a profile that is not taken.
 */
export function sansLesComptesSupprimes<T extends { comptes: { id: number }[]; profils: { compte: number | null }[] }>(
	lu: T,
	supprimes: ReadonlySet<number>
): T {
	if (supprimes.size === 0) return lu
	return {
		...lu,
		comptes: lu.comptes.filter(({ id }) => !supprimes.has(id)),
		profils: lu.profils.filter(({ compte }) => compte === null || !supprimes.has(compte)),
	}
}
