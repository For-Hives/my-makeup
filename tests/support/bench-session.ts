/**
 * The session of an account of the bench, for an agent that needs to be logged in (ticket 052):
 * `bun run bench:session <compte>` writes the session to files and prints where they are.
 *
 *   admin                       an account of the fixed set (tests/fixtures/accounts.ts), by its type
 *   profil-reference            the makeup artist of a profile type (src/demo-data/profiles.ts)
 *   jeu-admin@example.test      any account of the bench, by its address
 *
 * The session is a real one, opened the way a login opens it (tests/support/session.ts). Nothing
 * secret is printed: the token goes into two files in `.banc/` that git ignores, which an agent
 * hands to its browser or to curl. No password is ever asked, drawn for the occasion or shown.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AuthCollectionSlug, Payload } from 'payload'
import { DEMO_PROFILES, profileUrl } from '../../src/demo-data/profiles'
import { DATASET_TYPES, datasetUrl } from '../fixtures/accounts'
import { ACCOUNT_TYPES } from './account-factory'
import { RefusedBench, ROOT } from './bench'
import { requireBench, requireBenchSignIn } from './payload-test'
import { openSessionWithoutPassword, type Session } from './session'

/** Where the sessions are written: git ignores it (.gitignore), and the CI uploads nothing from it. */
export const SESSION_FOLDER = '.banc/sessions'

/** The accounts a name can designate, for the message that refuses another one. */
export const ACCOUNT_NAMES = [...DATASET_TYPES, ...DEMO_PROFILES.map(({ cle: key }) => `profil-${key}`)]

/** Where to look for an account, from the name the person gave. */
export interface Search {
	email: string
	/** Absent for an address: the account is looked for in both collections. */
	collection?: AuthCollectionSlug
	/** The name the files are called after. */
	nom: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/

/** What a name stands for, or nothing when the bench knows no such account. */
export function accountSearch(demande: string): Search | undefined {
	const name = demande.trim()
	const type = DATASET_TYPES.find(cle => cle === name)
	if (type) return { email: datasetUrl(type), collection: ACCOUNT_TYPES[type].collection, nom: name }
	const key = name.startsWith('profil-') ? name.slice('profil-'.length) : undefined
	if (key !== undefined && DEMO_PROFILES.some(profil => profil.cle === key))
		return { email: profileUrl(key), collection: 'pros', nom: name }
	if (EMAIL_PATTERN.test(name)) return { email: name.toLowerCase(), nom: name.replace(/[^a-z0-9.-]+/gi, '_') }
	return undefined
}

export const unknownAccountMessage = (demande: string): string =>
	[
		`Le banc ne connaît pas de compte « ${demande} ».`,
		`Un type du jeu fixe ou un profil type : ${ACCOUNT_NAMES.join(', ')}.`,
		'Ou l’adresse d’un compte du banc, par exemple jeu-admin@example.test.',
	].join('\n')

/** The state of a browser context holding the session: `browser.newContext({ storageState })`. */
export function browserState(session: Session) {
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
export const clientHeaders = (session: Session): string =>
	`${Object.entries(session.enTetes)
		.map(([name, valeur]) => `${name}: ${valeur}`)
		.join('\n')}\n`

export interface SessionWritten {
	compte: string
	collection: AuthCollectionSlug
	etatDeNavigateur: string
	entetes: string
	expire: Date
}

/**
 * Opens a session for the account the name stands for and writes it into the two files. The
 * account must exist on the bench: the fixed set is loaded by `bun run bench:full`.
 */
export async function writeSession(
	payload: Payload,
	demande: string,
	{ dossier = path.join(ROOT, SESSION_FOLDER), instance = 'banc' }: { dossier?: string; instance?: string } = {}
): Promise<SessionWritten> {
	requireBench()
	requireBenchSignIn(payload)
	const search = accountSearch(demande)
	if (!search) throw new RefusedBench(unknownAccountMessage(demande))
	const collections: AuthCollectionSlug[] = search.collection ? [search.collection] : ['admins', 'pros']
	for (const collection of collections) {
		const { docs } = await payload.find({
			collection,
			depth: 0,
			limit: 1,
			pagination: false,
			select: {},
			where: { email: { equals: search.email } },
		})
		const account = docs[0]
		if (!account) continue
		const session = await openSessionWithoutPassword(payload, { collection, id: account.id })
		const directory = path.join(dossier, instance)
		await mkdir(directory, { recursive: true })
		const fileBrowser = path.join(directory, `${search.nom}.etat.json`)
		const fileHeaders = path.join(directory, `${search.nom}.entetes`)
		await writeFile(fileBrowser, `${JSON.stringify(browserState(session), null, '\t')}\n`, { mode: 0o600 })
		await writeFile(fileHeaders, clientHeaders(session), { mode: 0o600 })
		return {
			compte: search.email,
			collection,
			etatDeNavigateur: fileBrowser,
			entetes: fileHeaders,
			expire: session.expire,
		}
	}
	throw new RefusedBench(
		`Le banc n’a pas de compte à l’adresse de « ${demande} ». Le jeu se charge par : bun run bench:full (ou bench:reset).`
	)
}
