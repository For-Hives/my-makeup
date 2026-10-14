/**
 * The fictional set on the pre-production (ticket 053, docs/preprod.md): when the application
 * starts there on an empty database, it loads the same set as the test bench (src/jeu-fictif/):
 * the twelve profile types, three talents and three articles. It replaces the import of the fake
 * Strapi source that the first slice ran at start (./tranche.ts, which stays for the import that
 * a later ticket will run on demand).
 *
 * - **The pre-production only.** `chargerLeJeuDeLaPreprod` refuses to run anywhere else, the site
 *   first, before it touches anything (`PreprodRefusee`), and the set itself asks its own guard
 *   (`JeuFictifRefuse`, src/jeu-fictif/garde.ts) for `APP_ENV=preprod` and the address of the
 *   pre-production. The database must be the one of the pre-production (`mymakeup_preprod`).
 * - **An empty database only.** Where one of the collections the set writes holds a document, the
 *   database is kept as it is and nothing is loaded: a second start creates nothing, and nothing
 *   fictional ever joins data somebody put there. A start that was cut short leaves a database
 *   the next start does not complete: a new token of PREPROD_REMISE_A_ZERO starts again.
 * - **No admin account.** The first admin is created by the person who opens `/admin`.
 * - **Numbers only in the log.** What is said is how many documents were loaded, never a name.
 * - **Photos need a storage.** Without S3_ENDPOINT the profiles are loaded without their photos,
 *   and the log says so (src/jeu-fictif/chargement.ts).
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Payload } from 'payload'
import { poserLeJeu } from '../jeu-fictif/jeu'
import type { PhotoDuJeu } from '../jeu-fictif/profils'
import type { PreprodEnv } from '../lib/env'
import { BASE_DE_LA_PREPROD, executerSur, exigerLaBaseDeLaPreprod, PreprodRefusee } from './remise'

/** The collections the set writes: the database is empty when none of them holds a document. */
export const COLLECTIONS_DU_JEU = ['pros', 'media', 'profils', 'talents', 'articles'] as const

/** Where the photos of the set are in the running application: the build copies them there (next.config.ts). */
export const DOSSIER_DES_PHOTOS = 'src/jeu-fictif/photos'

/** Reads a photo of the set from the folder the build kept next to the application. */
export const lirePhotoDeLApplication = (photo: PhotoDuJeu): Promise<Uint8Array> =>
	readFile(path.join(process.cwd(), DOSSIER_DES_PHOTOS, photo))

export interface OptionsDuJeuDeLaPreprod {
	/** What the checked environment says of the pre-production: nothing anywhere else. */
	preprod: PreprodEnv | undefined
	/** Receives each line of the log. Prefixed and printed by default. */
	journal?: (ligne: string) => void
	/** The database of the pre-production, the only one the task reads. Given by a test only: the one of the bench. */
	base?: string
	/** The environment the guard of the set reads; `process.env` by default. A test gives its own. */
	variables?: Readonly<Record<string, string | undefined>>
	/** Where a photo is read from. */
	lirePhoto?: (photo: PhotoDuJeu) => Promise<Uint8Array>
}

export type IssueDuChargement =
	| { etat: 'non-declaree' }
	| { etat: 'deja-remplie'; documents: Record<string, number> }
	| { etat: 'chargee'; documents: Record<string, number>; sansPhotos: boolean }

const journalParDefaut = (ligne: string): void => console.log(`[preprod] ${ligne}`)

/** How many documents each collection the set writes holds. */
async function compterLesDocuments(payload: Payload): Promise<Record<string, number>> {
	const comptes: Record<string, number> = {}
	for (const collection of COLLECTIONS_DU_JEU)
		comptes[collection] = (await payload.count({ collection, overrideAccess: true })).totalDocs
	return comptes
}

const decompte = (documents: Record<string, number>): string =>
	Object.entries(documents)
		.map(([collection, nombre]) => `${collection} ${nombre}`)
		.join(', ')

/**
 * The start of the pre-production, once Payload has played its migrations (and emptied the
 * database before them when a new reset token asked for it, ./remise.ts): on an empty database,
 * the set is loaded.
 *
 * Errors are thrown as they are: `auDemarrage` (./au-demarrage.ts) says them in the log by their
 * type and code, and the application keeps serving.
 */
export async function chargerLeJeuDeLaPreprod(
	payload: Payload,
	{
		preprod,
		journal = journalParDefaut,
		base = BASE_DE_LA_PREPROD,
		variables = process.env,
		lirePhoto = lirePhotoDeLApplication,
	}: OptionsDuJeuDeLaPreprod
): Promise<IssueDuChargement> {
	if (!preprod)
		throw new PreprodRefusee(
			'Refusé : le jeu fictif ne se charge au démarrage que sur la préprod. Rien n’est lu ni écrit.'
		)
	await exigerLaBaseDeLaPreprod(executerSur(payload.db.pool), base)

	if (!preprod.jeuFictif) {
		journal('APP_ENV n’est pas « preprod » : le jeu fictif n’est pas chargé. Pose APP_ENV=preprod dans Coolify.')
		return { etat: 'non-declaree' }
	}

	const avant = await compterLesDocuments(payload)
	if (Object.values(avant).some(nombre => nombre > 0)) {
		journal(`Base déjà remplie (${decompte(avant)}) : pas de jeu fictif au démarrage.`)
		return { etat: 'deja-remplie', documents: avant }
	}

	journal(`Base vide (${decompte(avant)}) : le jeu fictif est chargé.`)
	const { profils, redaction } = await poserLeJeu(payload, { variables, lirePhoto })
	if (profils.sansPhotos) journal('Aucun stockage d’objets (S3_ENDPOINT) : les profils sont chargés sans leurs photos.')
	const apres = await compterLesDocuments(payload)
	journal(
		`Jeu fictif chargé : ${profils.crees.length} profils types, ${redaction.talentsCrees.length} talents, ${redaction.articlesCrees.length} articles (${decompte(apres)}).`
	)
	return { etat: 'chargee', documents: apres, sansPhotos: profils.sansPhotos }
}
