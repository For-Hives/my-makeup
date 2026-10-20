/**
 * The session of an account of the bench, for an agent that needs to be logged in (ticket 052):
 * `bun run banc:session <compte>` writes the session to files and prints where they are.
 *
 *   admin                       an account of the fixed set (tests/fixtures/comptes.ts), by its type
 *   profil-reference            the makeup artist of a profile type (src/demo-data/profiles.ts)
 *   jeu-admin@example.test      any account of the bench, by its address
 *
 * The session is a real one, opened the way a login opens it (tests/outils/session.ts). Nothing
 * secret is printed: the token goes into two files in `.banc/` that git ignores, which an agent
 * hands to its browser or to curl. No password is ever asked, drawn for the occasion or shown.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AuthCollectionSlug, Payload } from 'payload'
import { DEMO_PROFILES, profileUrl } from '../../src/demo-data/profiles'
import { adresseDuJeu, TYPES_DU_JEU } from '../fixtures/comptes'
import { BancRefuse, RACINE } from './banc'
import { TYPES_DE_COMPTE } from './fabrique-comptes'
import { exigerBanc, exigerConnexionDuBanc } from './payload-test'
import { ouvrirSessionSansMotDePasse, type Session } from './session'

/** Where the sessions are written: git ignores it (.gitignore), and the CI uploads nothing from it. */
export const DOSSIER_DES_SESSIONS = '.banc/sessions'

/** The accounts a name can designate, for the message that refuses another one. */
export const NOMS_DES_COMPTES = [...TYPES_DU_JEU, ...DEMO_PROFILES.map(({ cle }) => `profil-${cle}`)]

/** Where to look for an account, from the name the person gave. */
export interface Recherche {
	email: string
	/** Absent for an address: the account is looked for in both collections. */
	collection?: AuthCollectionSlug
	/** The name the files are called after. */
	nom: string
}

const ADRESSE = /^[^\s@]+@[^\s@]+$/

/** What a name stands for, or nothing when the bench knows no such account. */
export function rechercheDuCompte(demande: string): Recherche | undefined {
	const nom = demande.trim()
	const type = TYPES_DU_JEU.find(cle => cle === nom)
	if (type) return { email: adresseDuJeu(type), collection: TYPES_DE_COMPTE[type].collection, nom }
	const cle = nom.startsWith('profil-') ? nom.slice('profil-'.length) : undefined
	if (cle !== undefined && DEMO_PROFILES.some(profil => profil.cle === cle))
		return { email: profileUrl(cle), collection: 'pros', nom }
	if (ADRESSE.test(nom)) return { email: nom.toLowerCase(), nom: nom.replace(/[^a-z0-9.-]+/gi, '_') }
	return undefined
}

export const messageCompteInconnu = (demande: string): string =>
	[
		`Le banc ne connaît pas de compte « ${demande} ».`,
		`Un type du jeu fixe ou un profil type : ${NOMS_DES_COMPTES.join(', ')}.`,
		'Ou l’adresse d’un compte du banc, par exemple jeu-admin@example.test.',
	].join('\n')

/** The state of a browser context holding the session: `browser.newContext({ storageState })`. */
export function etatDeNavigateur(session: Session) {
	return {
		cookies: session.cookies.map(({ url, ...cookie }) => ({
			...cookie,
			domain: new URL(url).hostname,
			path: '/',
		})),
		origins: [],
	}
}

/** The headers of an HTTP client, one per line, as `curl -H @fichier` reads them. */
export const entetesDeClient = (session: Session): string =>
	`${Object.entries(session.enTetes)
		.map(([nom, valeur]) => `${nom}: ${valeur}`)
		.join('\n')}\n`

export interface SessionEcrite {
	compte: string
	collection: AuthCollectionSlug
	etatDeNavigateur: string
	entetes: string
	expire: Date
}

/**
 * Opens a session for the account the name stands for and writes it into the two files. The
 * account must exist on the bench: the fixed set is loaded by `bun run banc:complet`.
 */
export async function ecrireLaSession(
	payload: Payload,
	demande: string,
	{ dossier = path.join(RACINE, DOSSIER_DES_SESSIONS), instance = 'banc' }: { dossier?: string; instance?: string } = {}
): Promise<SessionEcrite> {
	exigerBanc()
	exigerConnexionDuBanc(payload)
	const recherche = rechercheDuCompte(demande)
	if (!recherche) throw new BancRefuse(messageCompteInconnu(demande))
	const collections: AuthCollectionSlug[] = recherche.collection ? [recherche.collection] : ['admins', 'pros']
	for (const collection of collections) {
		const { docs } = await payload.find({
			collection,
			depth: 0,
			limit: 1,
			pagination: false,
			select: {},
			where: { email: { equals: recherche.email } },
		})
		const compte = docs[0]
		if (!compte) continue
		const session = await ouvrirSessionSansMotDePasse(payload, { collection, id: compte.id })
		const repertoire = path.join(dossier, instance)
		await mkdir(repertoire, { recursive: true })
		const fichierNavigateur = path.join(repertoire, `${recherche.nom}.etat.json`)
		const fichierEntetes = path.join(repertoire, `${recherche.nom}.entetes`)
		await writeFile(fichierNavigateur, `${JSON.stringify(etatDeNavigateur(session), null, '\t')}\n`, { mode: 0o600 })
		await writeFile(fichierEntetes, entetesDeClient(session), { mode: 0o600 })
		return {
			compte: recherche.email,
			collection,
			etatDeNavigateur: fichierNavigateur,
			entetes: fichierEntetes,
			expire: session.expire,
		}
	}
	throw new BancRefuse(
		`Le banc n’a pas de compte à l’adresse de « ${demande} ». Le jeu se charge par : bun run banc:complet (ou banc:reinitialiser).`
	)
}
