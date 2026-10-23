import { randomBytes } from 'node:crypto'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload } from 'payload'
import { INITIAL_NAMES_KEY } from '../../profile/initial-names'
import { EMAIL_MAX, MAX_NAME_LENGTH } from '../sign-up'
import type { Claims } from './oidc'

/**
 * The account behind a Google identity (tickets 090 and 091).
 *
 * The rule is the one of the current site (Strapi's « connect »), kept as it is:
 * - Google must vouch for the address (`email_verified`). Otherwise nothing is done: no account, no
 *   session, even if an account has this address.
 * - The account is found by its address, lower-cased. One that came from Google (`legacyProvider` is
 *   « google ») opens a session. Any other account with this address (a password account, an old
 *   Facebook one) is refused, and nothing is linked: the person who owns that address on Google is
 *   not proven to own the account (AUTH-12; ticket 092). A blocked
 *   account is refused too.
 * - No account yet: it is made, confirmed at once (Google has checked the address, so no mail
 *   leaves), with her empty profile and its address, in one transaction. Its password is a random
 *   one that nobody knows: she can ask for her own with « Mot de passe oublié » (ticket 093).
 *
 * Two people who arrive at the same moment with the same address both try to create it: the second
 * is refused by the unicity of the address and then finds the first one.
 *
 * Nothing here logs. No `next` import.
 */

export type AccountRefusalCode = 'email-non-verifie' | 'compte-refuse' | 'compte-bloque' | 'service-indisponible'

export type AccountResult =
	| { ok: true; id: number | string; nouveau: boolean }
	| { ok: false; code: AccountRefusalCode }

/** How many times a creation is tried when only a collision of slugs stands in its way. */
const MAX_ATTEMPTS = 3

const GOOGLE_PROVIDER = 'google'

/** The address as the account stores it, or nothing when it is not one we accept. */
export function normalizedAddress(brute: string | undefined): string | undefined {
	const address = brute?.trim().toLowerCase()
	if (!address || address.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return undefined
	return address
}

/** The name shown for the account: Google's, else the part of the address before the @. */
export function accountName(revendications: Claims, adresse: string): string {
	const name = revendications.nom?.replace(/\s+/g, ' ').trim() || (adresse.split('@')[0] ?? '')
	return Array.from(name).slice(0, MAX_NAME_LENGTH).join('')
}

interface AccountFound {
	id: number | string
	blocked?: boolean | null
	legacyProvider?: string | null
	_verified?: boolean | null
}

async function find(payload: Payload, adresse: string): Promise<AccountFound | undefined> {
	const { docs } = await payload.find({
		collection: 'pros',
		depth: 0,
		limit: 1,
		overrideAccess: true,
		pagination: false,
		where: { email: { equals: adresse } },
	})
	return docs[0] as AccountFound | undefined
}

export async function googleAccount(payload: Payload, revendications: Claims): Promise<AccountResult> {
	const address = normalizedAddress(revendications.email)
	if (!revendications.emailVerifie || address === undefined) return { ok: false, code: 'email-non-verifie' }

	try {
		for (let trial = 1; trial <= MAX_ATTEMPTS; trial++) {
			const known = await find(payload, address)
			if (known) return await welcome(payload, known)
			const created = await create(payload, address, accountName(revendications, address), {
				firstName: revendications.givenName ?? '',
				lastName: revendications.familyName ?? '',
			})
			if (created.ok) return created
		}
	} catch {
		// Not the visitor's to see: she is told the service is down.
	}
	return { ok: false, code: 'service-indisponible' }
}

/** An account that exists: it opens a session if it came from Google and is not blocked. */
async function welcome(payload: Payload, compte: AccountFound): Promise<AccountResult> {
	// Blocked first: whoever proves the address on Google is told why the account stays shut.
	if (compte.blocked === true) return { ok: false, code: 'compte-bloque' }
	if (compte.legacyProvider !== GOOGLE_PROVIDER) return { ok: false, code: 'compte-refuse' }
	// Google has just vouched for the address: an account still marked unconfirmed is confirmed, or
	// Payload would ignore the session it is about to receive.
	// Written by the adapter: `payload.update` would write the sessions back as it read them, erasing
	// one opened at the same moment by another passage (ticket 235).
	if (compte._verified !== true)
		await payload.db.updateOne({ collection: 'pros', data: { _verified: true }, id: compte.id, returning: false })
	return { ok: true, id: compte.id, nouveau: false }
}

async function create(
	payload: Payload,
	adresse: string,
	nom: string,
	names: { firstName: string; lastName: string }
): Promise<AccountResult | { ok: false; code: 'service-indisponible' }> {
	const req = await createLocalReq({}, payload)
	await initTransaction(req)
	try {
		const account = await payload.create({
			collection: 'pros',
			data: {
				email: adresse,
				// Nobody knows it. Payload needs one; « Mot de passe oublié » gives her her own.
				password: randomBytes(48).toString('base64url'),
				name: nom,
				_verified: true,
				legacyProvider: GOOGLE_PROVIDER,
			},
			depth: 0,
			disableVerificationEmail: true,
			overrideAccess: true,
			// Her profile starts with the names Google gave (issue 1009).
			context: { [INITIAL_NAMES_KEY]: names },
			req,
		})
		await commitTransaction(req)
		return { ok: true, id: account.id, nouveau: true }
	} catch {
		await killTransaction(req)
		// The address was taken a moment ago (the next try finds that account), or the slug was.
		return { ok: false, code: 'service-indisponible' }
	}
}
