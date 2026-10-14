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
import type { AuthCollectionSlug, Payload, RequiredDataFromCollectionSlug } from 'payload'
import type { Variables } from './banc'
import { exigerBanc, exigerConnexionDuBanc, payloadDeTest } from './payload-test'
import { ouvrirSession, type Session } from './session'

/** Reserved for tests (RFC 6761): no mail can ever be delivered to it. */
export const DOMAINE_DES_COMPTES = 'example.test'

/** One type of account: the collection it lives in, and what it holds besides its address and its password. */
export interface DeclarationDeCompte<Slug extends AuthCollectionSlug> {
	collection: Slug
	donnees: () => Omit<RequiredDataFromCollectionSlug<Slug>, 'email' | 'password'>
}

const declarer = <Slug extends AuthCollectionSlug>(declaration: DeclarationDeCompte<Slug>) => declaration

/**
 * The types of account the factory knows. A collection of accounts adds its own here, one
 * declaration each: nothing else changes in this file.
 */
export const TYPES_DE_COMPTE = {
	/** An account of the admin panel, as the skeleton defines it: no role yet. */
	admin: declarer({ collection: 'admins', donnees: () => ({}) }),
}

export type TypeDeCompte = keyof typeof TYPES_DE_COMPTE

export interface CompteDeTest {
	type: TypeDeCompte
	collection: AuthCollectionSlug
	id: number | string
	/** Always in `@example.test`, and unique: two calls never give the same account. */
	email: string
	session: Session
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

/** Creates an account of this type in the bench database and opens its session. */
export async function creerCompte(type: TypeDeCompte = 'admin', dependances: Dependances = {}): Promise<CompteDeTest> {
	const { payload: obtenirPayload = payloadDeTest, motDePasse: tirer = motDePasseAleatoire, variables } = dependances
	// Twice, and both before the first write: the environment before Payload is even loaded,
	// then the database Payload is really connected to.
	exigerBanc(variables)
	const payload = await obtenirPayload()
	exigerConnexionDuBanc(payload, variables)

	const { collection, donnees } = TYPES_DE_COMPTE[type]
	const email = adresseDeTest(type)
	const motDePasse = tirer()
	const compte = await payload.create({ collection, data: { ...donnees(), email, password: motDePasse } })
	const session = await ouvrirSession(payload, { collection, email, motDePasse }, variables)
	return { type, collection, id: compte.id, email, session }
}
