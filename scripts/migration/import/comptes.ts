/**
 * The accounts of the makeup artists, `up_users` → `pros` (docs/migration/SCHEMA.md, §5.1;
 * plan 01 §2.4, M1).
 *
 * - The email is the login: edge spaces removed, lower case (§5.1, one of the two transformations
 *   that change no page). Accounts that share one email stop the import until the table of
 *   decisions says which one is kept (./decisions.ts); the others are set aside.
 * - The account arrives confirmed, without a session, with a password drawn at random that
 *   nobody knows, and without a profile: the profiles are taken from the source on their own.
 * - The bcrypt hash of the old site is copied from base to base (rule 4): read into memory,
 *   written into `pros.legacyBcrypt`, and never into a file, a log or the report. Only a complete
 *   bcrypt hash is copied; any other value gives nothing. The one-time tokens are never read.
 */

import { randomBytes } from 'node:crypto'
import { CONTEXTE_SANS_PROFIL } from '../../../src/collections/Profils'
import { type ApplicationDesDecisions, appliquerLesDecisions, type Decisions } from './decisions'
import { REFERENCES } from './ecarts'
import type { Adaptateur, Attendu, Ecart } from './moteur'
import { iso, type Requete } from './source'

/** A row of `up_users`, as the import reads it: never its tokens. */
export interface LigneCompte {
	id: number
	username: string | null
	email: string | null
	provider: string | null
	password: string | null
	confirmed: boolean | null
	blocked: boolean | null
	created_at: string
	updated_at: string
}

export const LECTURE_DES_COMPTES = `SELECT id, username, email, provider, password, confirmed, blocked,
	${iso('created_at')} AS created_at, ${iso('updated_at')} AS updated_at
	FROM up_users ORDER BY id`

export const lireLesComptes = (requete: Requete): Promise<LigneCompte[]> => requete<LigneCompte>(LECTURE_DES_COMPTES)

/** A complete bcrypt hash, the only one copied: version, cost, then 53 characters of salt and digest. */
export const HASH_BCRYPT_COMPLET = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/

/** The login of an account: edge spaces removed, lower case. */
export const emailNormalise = (email: string | null): string | null =>
	email === null ? null : email.trim().toLowerCase()

/** The password of a taken account: 32 random bytes, used by nobody, written nowhere but in Payload's hash. */
export const motDePasseAleatoire = (): string => randomBytes(32).toString('base64url')

export const ADAPTATEUR_COMPTES: Adaptateur = {
	collection: 'pros',
	champs: {
		email: 'texte',
		nom: 'texte',
		legacyProvider: 'texte',
		legacyBcrypt: 'texte',
		bloque: 'booleen',
		_verified: 'booleen',
		createdAt: 'date',
		updatedAt: 'date',
	},
	// No confirmation email, and no automatic empty profile: the profile comes from the source.
	options: () => ({ disableVerificationEmail: true, contexte: CONTEXTE_SANS_PROFIL }),
}

/** The account the target must hold. The password is given at the creation only. */
export function compteAttendu(ligne: LigneCompte, tirer: () => string = motDePasseAleatoire): Attendu {
	const email = emailNormalise(ligne.email)
	const legacyBcrypt = ligne.password !== null && HASH_BCRYPT_COMPLET.test(ligne.password) ? ligne.password : null
	const ecarts: Ecart[] = []
	if (email !== ligne.email) ecarts.push({ champ: 'email', reference: REFERENCES.emailEnMinuscules })
	if (legacyBcrypt !== ligne.password) ecarts.push({ champ: 'legacyBcrypt', reference: REFERENCES.hashIncomplet })
	if (ligne.confirmed !== true) ecarts.push({ champ: '_verified', reference: REFERENCES.compteConfirme })
	return {
		strapiId: ligne.id,
		valeurs: {
			strapiId: ligne.id,
			email,
			nom: ligne.username,
			legacyProvider: ligne.provider,
			legacyBcrypt,
			bloque: ligne.blocked,
			_verified: true,
			createdAt: ligne.created_at,
			updatedAt: ligne.updated_at,
		},
		aLaCreation: { password: tirer() },
		ecarts,
	}
}

/** The groups of accounts that share one email, each one sorted, in the order of their first account. */
export function groupesDEmailPartage(lignes: readonly LigneCompte[]): number[][] {
	const parEmail = new Map<string, number[]>()
	for (const ligne of [...lignes].sort((a, b) => a.id - b.id)) {
		const email = emailNormalise(ligne.email)
		if (email === null) continue
		parEmail.set(email, [...(parEmail.get(email) ?? []), ligne.id])
	}
	return [...parEmail.values()].filter(groupe => groupe.length > 1)
}

export interface ComptesAttendus extends ApplicationDesDecisions {
	attendus: Attendu[]
	/** Kept accounts that received the legacy hash of an account set aside (ticket 066). */
	hashRattaches: number[]
	/** Legacy hashes of accounts set aside that no kept account could take. */
	hashNonRattaches: number
	/** Accounts not confirmed at the source: taken confirmed, and listed. */
	nonConfirmes: number[]
}

/** The accounts the import takes, those the decisions set aside, and the groups that stop it. */
export function comptesAttendus(
	lignes: readonly LigneCompte[],
	decisions: Pick<Decisions, 'emailsPartages'>,
	tirer: () => string = motDePasseAleatoire
): ComptesAttendus {
	const application = appliquerLesDecisions(groupesDEmailPartage(lignes), decisions)
	const enAttente = new Set([...application.ecartes, ...application.sansDecision.flat()])
	const pris = lignes.filter(({ id }) => !enAttente.has(id))
	const parId = new Map(lignes.map(ligne => [ligne.id, ligne]))
	// The kept account that has no hash of its own takes the one of the first account set aside (lowest identifier) that has one.
	const empruntes = new Map<number, string>()
	let hashNonRattaches = 0
	for (const { retenu, ecartes, pretDuHash } of application.rattaches) {
		const hashDesEcartes = ecartes.flatMap(id => {
			const mot = parId.get(id)?.password
			return mot != null && HASH_BCRYPT_COMPLET.test(mot) ? [mot] : []
		})
		const motRetenu = parId.get(retenu)?.password
		const aDejaLeSien = motRetenu != null && HASH_BCRYPT_COMPLET.test(motRetenu)
		// Without an explicit decision, only a local kept account takes a loan: a Google or Facebook one never had a password.
		const prete = pretDuHash ?? (parId.get(retenu)?.provider ?? 'local') === 'local'
		const [premier, ...reste] = hashDesEcartes
		if (premier !== undefined && !aDejaLeSien && prete) {
			empruntes.set(retenu, premier)
			hashNonRattaches += reste.length
		} else hashNonRattaches += hashDesEcartes.length
	}
	return {
		...application,
		hashRattaches: [...empruntes.keys()].sort((a, b) => a - b),
		hashNonRattaches,
		attendus: pris.map(ligne => {
			const attendu = compteAttendu(ligne, tirer)
			const emprunte = empruntes.get(ligne.id)
			if (emprunte === undefined) return attendu
			return {
				...attendu,
				valeurs: { ...attendu.valeurs, legacyBcrypt: emprunte },
				ecarts: [...attendu.ecarts, { champ: 'legacyBcrypt', reference: REFERENCES.comptesEmailPartage }],
			}
		}),
		nonConfirmes: pris.filter(({ confirmed }) => confirmed !== true).map(({ id }) => id),
	}
}

/** How many accounts per provider of the old site, and how many legacy hashes, among these values. */
export function repartitionDesComptes(documents: readonly { valeurs: Readonly<Record<string, unknown>> }[]): {
	fournisseurs: Record<string, number>
	hashHerites: number
} {
	const fournisseurs: Record<string, number> = {}
	let hashHerites = 0
	for (const { valeurs } of documents) {
		const fournisseur = String(valeurs.legacyProvider ?? 'aucun')
		fournisseurs[fournisseur] = (fournisseurs[fournisseur] ?? 0) + 1
		if (typeof valeurs.legacyBcrypt === 'string' && HASH_BCRYPT_COMPLET.test(valeurs.legacyBcrypt)) hashHerites++
	}
	return { fournisseurs, hashHerites }
}
