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
 * Outside the bench the factory stops before it writes anything.
 */

import { randomBytes, randomUUID } from 'node:crypto'
import type { AuthCollectionSlug, Payload, RequestContext, RequiredDataFromCollectionSlug } from 'payload'
import type { Variables } from './banc'
import { exigerBanc, exigerConnexionDuBanc, payloadDeTest } from './payload-test'
import { ouvrirSession, type Session } from './session'

/** Reserved for tests (RFC 6761): no mail can ever be delivered to it. */
export const DOMAINE_DES_COMPTES = 'example.test'

/** One type of account: the collection it lives in, and what it holds besides its address and its password. */
export interface DeclarationDeCompte<Slug extends AuthCollectionSlug> {
	collection: Slug
	donnees: () => Omit<RequiredDataFromCollectionSlug<Slug>, 'email' | 'password'>
	/** Handed to Payload with the creation (`context`): what the hooks of the collection read. */
	contexte?: RequestContext
}

const declarer = <Slug extends AuthCollectionSlug>(declaration: DeclarationDeCompte<Slug>) => declaration

/**
 * A type of account that cannot log in (an address not confirmed yet): no session is opened, and
 * the account comes back with `session: null`.
 */
const declarerSansSession = <Slug extends AuthCollectionSlug>(declaration: DeclarationDeCompte<Slug>) => ({
	...declaration,
	connexion: false as const,
})

/** A made-up display name, different at each call: two accounts made side by side never share one. */
const nomFictif = (prefixe: string) => `${prefixe} ${randomUUID().slice(0, 8)}`

/**
 * The types of account the factory knows. A collection of accounts adds its own here, one
 * declaration each: nothing else changes in this file.
 */
export const TYPES_DE_COMPTE = {
	/** An account of the admin panel with the role `admin`: it may do everything. */
	admin: declarer({ collection: 'admins', donnees: () => ({ role: 'admin' as const }) }),
	/** An account of the admin panel with the role `redaction`: articles and talents, and its own account. */
	redaction: declarer({ collection: 'admins', donnees: () => ({ role: 'redaction' as const }) }),
	/** The account of a makeup artist, address confirmed. Call it twice for « A » and « B ». */
	maquilleuse: declarer({ collection: 'pros', donnees: () => ({ nom: nomFictif('Maquilleuse'), _verified: true }) }),
	/** The account of a makeup artist who has not confirmed her address: it cannot log in. */
	'maquilleuse-non-verifiee': declarerSansSession({
		collection: 'pros',
		donnees: () => ({ nom: nomFictif('Non vérifiée'), _verified: false }),
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

export interface CompteDeTest<Type extends TypeDeCompte = TypeDeCompte> {
	type: Type
	collection: AuthCollectionSlug
	id: number | string
	/** Always in `@example.test`, and unique: two calls never give the same account. */
	email: string
	session: SessionDu<Type>
}

/** What a test may replace. Nothing to give in an integration test: the defaults are the bench. */
export interface Dependances {
	payload?: () => Promise<Payload>
	motDePasse?: () => string
	variables?: Variables
}

export const adresseDeTest = (type: TypeDeCompte): string => `${type}-${randomUUID()}@${DOMAINE_DES_COMPTES}`

/** 32 characters drawn at random: never typed, never shown. */
export const motDePasseAleatoire = (): string => randomBytes(24).toString('base64url')

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

	const declaration: DeclarationDeCompte<AuthCollectionSlug> & { connexion?: false } = TYPES_DE_COMPTE[type]
	const { collection, donnees, contexte } = declaration
	const email = adresseDeTest(type)
	const motDePasse = tirer()
	// One call for every collection of accounts: the compiler has checked each declaration already.
	const creer = payload.create.bind(payload) as unknown as (options: {
		collection: AuthCollectionSlug
		data: Record<string, unknown>
		context?: RequestContext
		disableVerificationEmail: boolean
	}) => Promise<{ id: number | string }>
	const compte = await creer({
		collection,
		data: { ...donnees(), email, password: motDePasse },
		context: contexte,
		disableVerificationEmail: true,
	})
	const session =
		declaration.connexion === false ? null : await ouvrirSession(payload, { collection, email, motDePasse }, variables)
	return { type, collection, id: compte.id, email, session: session as SessionDu<Type> }
}
