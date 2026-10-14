/**
 * The account factory of the bench: one call creates a made-up account in the bench database
 * and gives back a session that is ready to use, by an HTTP client as by a browser.
 *
 *   const compte = await creerCompte('admin')
 *   await fetch(`${adresse}/api/admins/me`, { headers: compte.session.enTetes })
 *
 * Nobody types a password: the factory draws one at random, uses it once to open the session,
 * and forgets it. It is neither returned nor printed.
 *
 * It knows every kind of account the site holds (ticket 050): the two roles of the admin panel,
 * makeup artists with or without a profile, not confirmed, blocked, and the accounts the old site
 * brings — with the bcrypt hash of a fixture password, from Google with or without a hash, from
 * Facebook.
 *
 * Outside the bench the factory stops before it writes anything.
 */

import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import type { AuthCollectionSlug, Payload, RequestContext, RequiredDataFromCollectionSlug } from 'payload'
import { CONTEXTE_SANS_PROFIL } from '../../src/collections/Profils'
import type { Variables } from './banc'
import { exigerBanc, exigerConnexionDuBanc, payloadDeTest } from './payload-test'
import { ouvrirSession, ouvrirSessionSansMotDePasse, type Session } from './session'

/** Reserved for tests (RFC 6761): no mail can ever be delivered to it. */
export const DOMAINE_DES_COMPTES = 'example.test'

/** How an account logged in on the old site: what `pros.legacyProvider` holds. */
export type FournisseurHerite = 'local' | 'google' | 'facebook'

/**
 * An account the old site brings, as the import writes it (plan 01 §2.4, M1; ticket 025):
 * confirmed, with its provider and its id on the old site, a password drawn at random that nobody
 * knows — not even a test that chose its own — and the bcrypt hash of the old site when it had one.
 */
export interface Reprise {
	fournisseur: FournisseurHerite
	/** It brings a bcrypt hash: always the hash of `MOT_DE_PASSE_HERITE_DE_FIXTURE`, never a real one. */
	hashHerite: boolean
}

/**
 * How an account of this type gets its session:
 * - absent, the default: by Payload's login, with the password the factory drew;
 * - `'sans-mot-de-passe'`: without a password, the way a login by Google opens one;
 * - `false`: never, the account cannot log in.
 */
export type Connexion = 'sans-mot-de-passe' | false

/** One type of account: the collection it lives in, and what it holds besides its address and its password. */
export interface DeclarationDeCompte<Slug extends AuthCollectionSlug> {
	collection: Slug
	donnees: () => Omit<RequiredDataFromCollectionSlug<Slug>, 'email' | 'password'>
	/** Handed to Payload with the creation (`context`): what the hooks of the collection read. */
	contexte?: RequestContext
	/** The account comes from the old site. */
	reprise?: Reprise
	connexion?: Connexion
}

const declarer = <Slug extends AuthCollectionSlug>(declaration: DeclarationDeCompte<Slug>) => declaration

/**
 * A type of account that cannot log in (an address not confirmed yet, a blocked account…): no
 * session is opened, and the account comes back with `session: null`.
 */
const declarerSansSession = <Slug extends AuthCollectionSlug>(declaration: DeclarationDeCompte<Slug>) => ({
	...declaration,
	connexion: false as const,
})

/** A type of account that logs in without a password (by Google): its session is opened without one. */
const declarerSansMotDePasse = <Slug extends AuthCollectionSlug>(declaration: DeclarationDeCompte<Slug>) => ({
	...declaration,
	connexion: 'sans-mot-de-passe' as const,
})

/** A made-up display name, different at each call: two accounts made side by side never share one. */
const nomFictif = (prefixe: string) => `${prefixe} ${randomUUID().slice(0, 8)}`

/**
 * The types of account the factory knows. A collection of accounts adds its own here, one
 * declaration each: nothing else changes in this file. Each type also has its account in the
 * fixed set of the bench (tests/fixtures/comptes.ts), which the compiler asks for.
 */
export const TYPES_DE_COMPTE = {
	/** An account of the admin panel with the role `admin`: it may do everything. */
	admin: declarer({ collection: 'admins', donnees: () => ({ role: 'admin' as const }) }),
	/** An account of the admin panel with the role `redaction`: articles and talents, and its own account. */
	redaction: declarer({ collection: 'admins', donnees: () => ({ role: 'redaction' as const }) }),
	/** The account of a makeup artist, address confirmed, with its empty profile. Call it twice for « A » and « B ». */
	maquilleuse: declarer({ collection: 'pros', donnees: () => ({ nom: nomFictif('Maquilleuse'), _verified: true }) }),
	/** The account of a makeup artist who has not confirmed her address: it cannot log in. */
	'maquilleuse-non-verifiee': declarerSansSession({
		collection: 'pros',
		donnees: () => ({ nom: nomFictif('Non vérifiée'), _verified: false }),
	}),
	/** The account of a makeup artist without a profile, as some accounts of the old site come. */
	'maquilleuse-sans-profil': declarer({
		collection: 'pros',
		donnees: () => ({ nom: nomFictif('Sans profil'), _verified: true }),
		contexte: CONTEXTE_SANS_PROFIL,
	}),
	/**
	 * A makeup artist an admin has blocked, with her profile. No session: blocking closes them, and
	 * the login turns her away (ticket 089). Her password is the drawn one, so that a test that
	 * gives its own (`motDePasse`) can try the right password on her.
	 */
	'maquilleuse-bloquee': declarerSansSession({
		collection: 'pros',
		donnees: () => ({ nom: nomFictif('Bloquée'), _verified: true, bloque: true }),
	}),
	/**
	 * An account of the old site with its bcrypt hash, and its profile. She logs in with her old
	 * password through the legacy path of the site (ticket 087): until then, no session.
	 */
	'reprise-avec-hash': declarerSansSession({
		collection: 'pros',
		donnees: () => ({ nom: nomFictif('Reprise'), _verified: true }),
		reprise: { fournisseur: 'local', hashHerite: true },
	}),
	/** An old Google account without a password, and its profile: she logs in by Google. */
	'reprise-google': declarerSansMotDePasse({
		collection: 'pros',
		donnees: () => ({ nom: nomFictif('Reprise Google'), _verified: true }),
		reprise: { fournisseur: 'google', hashHerite: false },
	}),
	/** An old Google account that also has a bcrypt hash, as one real account has: by Google, or by her old password. */
	'reprise-google-avec-hash': declarerSansMotDePasse({
		collection: 'pros',
		donnees: () => ({ nom: nomFictif('Reprise Google avec hash'), _verified: true }),
		reprise: { fournisseur: 'google', hashHerite: true },
	}),
	/**
	 * An old Facebook account, and its profile. Facebook is gone and she has no password: she cannot
	 * log in until she sets one through « mot de passe oublié » (ticket 093).
	 */
	'reprise-facebook': declarerSansSession({
		collection: 'pros',
		donnees: () => ({ nom: nomFictif('Reprise Facebook'), _verified: true }),
		reprise: { fournisseur: 'facebook', hashHerite: false },
	}),
}

export type TypeDeCompte = keyof typeof TYPES_DE_COMPTE

/** `null` for a type of account that cannot log in, a session for every other one. */
export type SessionDu<Type extends TypeDeCompte> = Type extends unknown
	? (typeof TYPES_DE_COMPTE)[Type] extends { connexion: false }
		? null
		: Session
	: never

/** The types of account that log in: their session is never `null`. */
export type TypeAvecSession = { [Type in TypeDeCompte]: SessionDu<Type> extends null ? never : Type }[TypeDeCompte]

/** An account made by the factory, without its session: what the fixed set of the bench holds. */
export interface CompteFixe<Type extends TypeDeCompte = TypeDeCompte> {
	type: Type
	collection: AuthCollectionSlug
	id: number | string
	/** Always in `@example.test`. */
	email: string
}

export interface CompteDeTest<Type extends TypeDeCompte = TypeDeCompte> extends CompteFixe<Type> {
	/** Unique: two calls never give the same account. */
	email: string
	session: SessionDu<Type>
}

/** What a test may replace. Nothing to give in an integration test: the defaults are the bench. */
export interface Dependances {
	payload?: () => Promise<Payload>
	/** The password of an account that logs in by password. An account of the old site never gets it. */
	motDePasse?: () => string
	variables?: Variables
}

/** What a caller may fix in an account: the fixed set of the bench gives the same ones every time. */
export interface ValeursDuCompte {
	/** In `@example.test`, and nowhere else. */
	email: string
	/** The display name of a makeup artist. Without it, a made-up one. */
	nom?: string
	/** The id on the old site of an account it brings. Without it, `strapiIdDeTest()`. */
	strapiId?: number
}

export const adresseDeTest = (type: TypeDeCompte): string => `${type}-${randomUUID()}@${DOMAINE_DES_COMPTES}`

/** 32 characters drawn at random: never typed, never shown. */
export const motDePasseAleatoire = (): string => randomBytes(24).toString('base64url')

/**
 * The id on the old site of an account a test makes: from 1 000 000 up, far above the ids of the
 * fake Strapi source and of the fixed set of the bench, so that a test never takes one of theirs.
 */
export const strapiIdDeTest = (): number => randomInt(1_000_000, 2_000_000_000)

/**
 * The password of the old site behind every fixture hash. Fictional and public: it opens nothing
 * but an account of the bench, through the legacy path of the site.
 */
export const MOT_DE_PASSE_HERITE_DE_FIXTURE = 'fixture-ancien-site-du-banc'

/**
 * The salt of the fixture hash. Fixed, so that the hash is the same at every creation, on every
 * bench; version `2a` and cost 10, like every hash of the old site (plan 01 §2.4).
 */
export const SEL_BCRYPT_DE_FIXTURE = '$2a$10$FabriqueDeComptesDuBa.'

let hashDeFixture: Promise<string> | undefined

/**
 * The fixture hash, worked out by the PostgreSQL of the bench with pgcrypto, as the fake Strapi
 * source does: no hash written in a file, and an oracle that does not share the bcryptjs the site checks it with. pgcrypto lives
 * inside one transaction, which is rolled back: the bench database keeps nothing of it. Worked out
 * once per process.
 */
function hashHeriteDeFixture(payload: Payload): Promise<string> {
	hashDeFixture ??= calculerLeHashDeFixture(payload).catch((erreur: unknown) => {
		hashDeFixture = undefined
		throw erreur
	})
	return hashDeFixture
}

async function calculerLeHashDeFixture(payload: Payload): Promise<string> {
	const client = await payload.db.pool.connect()
	try {
		await client.query('BEGIN')
		await client.query('CREATE SCHEMA fabrique_bcrypt')
		await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA fabrique_bcrypt')
		// Wherever pgcrypto lives: in the schema above, or where a database that already had it keeps it.
		const { rows: extensions } = await client.query<{ schema: string }>(
			`SELECT quote_ident(n.nspname) AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
			 WHERE e.extname = 'pgcrypto'`
		)
		const schema = extensions[0]?.schema ?? 'fabrique_bcrypt'
		const { rows } = await client.query<{ hash: string }>(`SELECT ${schema}.crypt($1, $2) AS hash`, [
			MOT_DE_PASSE_HERITE_DE_FIXTURE,
			SEL_BCRYPT_DE_FIXTURE,
		])
		const hash = rows[0]?.hash
		if (!hash) throw new Error('PostgreSQL n’a rendu aucun hash bcrypt pour le compte de fixture.')
		return hash
	} finally {
		const annule = await client.query('ROLLBACK').then(
			() => true,
			() => false
		)
		client.release(!annule)
	}
}

/**
 * Writes an account of this type in the bench database. The password goes back to this module
 * only: it opens the session, then is forgotten.
 */
async function ecrireLeCompte(
	payload: Payload,
	type: TypeDeCompte,
	valeurs: ValeursDuCompte,
	tirer: () => string
): Promise<{ id: number | string; motDePasse: string }> {
	if (!valeurs.email.endsWith(`@${DOMAINE_DES_COMPTES}`))
		throw new Error(`Un compte de test a une adresse en @${DOMAINE_DES_COMPTES}, et nulle part ailleurs.`)
	const { collection, donnees, contexte, reprise }: DeclarationDeCompte<AuthCollectionSlug> = TYPES_DE_COMPTE[type]
	// An account of the old site has a password nobody knows, as the import gives it.
	const motDePasse = reprise ? motDePasseAleatoire() : tirer()
	const heritage = reprise
		? {
				legacyProvider: reprise.fournisseur,
				strapiId: valeurs.strapiId ?? strapiIdDeTest(),
				...(reprise.hashHerite ? { legacyBcrypt: await hashHeriteDeFixture(payload) } : {}),
			}
		: {}
	// One call for every collection of accounts: the compiler has checked each declaration already.
	const creer = payload.create.bind(payload) as unknown as (options: {
		collection: AuthCollectionSlug
		data: Record<string, unknown>
		context?: RequestContext
		disableVerificationEmail: boolean
	}) => Promise<{ id: number | string }>
	const compte = await creer({
		collection,
		data: {
			...donnees(),
			...(valeurs.nom === undefined ? {} : { nom: valeurs.nom }),
			...heritage,
			email: valeurs.email,
			password: motDePasse,
		},
		context: contexte,
		disableVerificationEmail: true,
	})
	return { id: compte.id, motDePasse }
}

/**
 * Creates an account of this type in the bench database and opens its session. No mail leaves:
 * the confirmation email Payload would send for a new makeup artist is not sent.
 */
export async function creerCompte<Type extends TypeDeCompte = 'admin'>(
	type: Type = 'admin' as Type,
	dependances: Dependances = {}
): Promise<CompteDeTest<Type>> {
	const { payload: obtenirPayload = payloadDeTest, motDePasse: tirer = motDePasseAleatoire, variables } = dependances
	// Twice, and both before the first write: the environment before Payload is even loaded,
	// then the database Payload is really connected to.
	exigerBanc(variables)
	const payload = await obtenirPayload()
	exigerConnexionDuBanc(payload, variables)

	const { collection, connexion }: DeclarationDeCompte<AuthCollectionSlug> = TYPES_DE_COMPTE[type]
	const email = adresseDeTest(type)
	const { id, motDePasse } = await ecrireLeCompte(payload, type, { email }, tirer)
	let session: Session | null = null
	if (connexion === 'sans-mot-de-passe')
		session = await ouvrirSessionSansMotDePasse(payload, { collection, id }, variables)
	else if (connexion !== false) session = await ouvrirSession(payload, { collection, email, motDePasse }, variables)
	return { type, collection, id, email, session: session as SessionDu<Type> }
}

/**
 * Creates an account of this type with the values the caller fixes, and opens no session: for a
 * set of accounts that must be the same every time (tests/fixtures/comptes.ts). Its password is
 * drawn and forgotten at once.
 */
export async function creerCompteFixe<Type extends TypeDeCompte>(
	type: Type,
	valeurs: ValeursDuCompte,
	dependances: Omit<Dependances, 'motDePasse'> = {}
): Promise<CompteFixe<Type>> {
	const { payload: obtenirPayload = payloadDeTest, variables } = dependances
	exigerBanc(variables)
	const payload = await obtenirPayload()
	exigerConnexionDuBanc(payload, variables)

	const { id } = await ecrireLeCompte(payload, type, valeurs, motDePasseAleatoire)
	return { type, collection: TYPES_DE_COMPTE[type].collection, id, email: valeurs.email }
}
