import { randomBytes } from 'node:crypto'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload } from 'payload'
import { EMAIL_MAX, NOM_MAX } from '../sign-up'
import type { Revendications } from './oidc'

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

export type CodeRefusDuCompte = 'email-non-verifie' | 'compte-refuse' | 'compte-bloque' | 'service-indisponible'

export type ResultatDuCompte =
	| { ok: true; id: number | string; nouveau: boolean }
	| { ok: false; code: CodeRefusDuCompte }

/** How many times a creation is tried when only a collision of slugs stands in its way. */
const ESSAIS_MAX = 3

const FOURNISSEUR_GOOGLE = 'google'

/** The address as the account stores it, or nothing when it is not one we accept. */
export function adresseNormalisee(brute: string | undefined): string | undefined {
	const adresse = brute?.trim().toLowerCase()
	if (!adresse || adresse.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)) return undefined
	return adresse
}

/** The name shown for the account: Google's, else the part of the address before the @. */
export function nomDuCompte(revendications: Revendications, adresse: string): string {
	const nom = revendications.nom?.replace(/\s+/g, ' ').trim() || (adresse.split('@')[0] ?? '')
	return Array.from(nom).slice(0, NOM_MAX).join('')
}

interface CompteTrouve {
	id: number | string
	blocked?: boolean | null
	legacyProvider?: string | null
	_verified?: boolean | null
}

async function chercher(payload: Payload, adresse: string): Promise<CompteTrouve | undefined> {
	const { docs } = await payload.find({
		collection: 'pros',
		depth: 0,
		limit: 1,
		overrideAccess: true,
		pagination: false,
		where: { email: { equals: adresse } },
	})
	return docs[0] as CompteTrouve | undefined
}

export async function compteDeGoogle(payload: Payload, revendications: Revendications): Promise<ResultatDuCompte> {
	const adresse = adresseNormalisee(revendications.email)
	if (!revendications.emailVerifie || adresse === undefined) return { ok: false, code: 'email-non-verifie' }

	try {
		for (let essai = 1; essai <= ESSAIS_MAX; essai++) {
			const connu = await chercher(payload, adresse)
			if (connu) return await accueillir(payload, connu)
			const cree = await creer(payload, adresse, nomDuCompte(revendications, adresse))
			if (cree.ok) return cree
		}
	} catch {
		// Not the visitor's to see: she is told the service is down.
	}
	return { ok: false, code: 'service-indisponible' }
}

/** An account that exists: it opens a session if it came from Google and is not blocked. */
async function accueillir(payload: Payload, compte: CompteTrouve): Promise<ResultatDuCompte> {
	// Blocked first: whoever proves the address on Google is told why the account stays shut.
	if (compte.blocked === true) return { ok: false, code: 'compte-bloque' }
	if (compte.legacyProvider !== FOURNISSEUR_GOOGLE) return { ok: false, code: 'compte-refuse' }
	// Google has just vouched for the address: an account still marked unconfirmed is confirmed, or
	// Payload would ignore the session it is about to receive.
	// Written by the adapter: `payload.update` would write the sessions back as it read them, erasing
	// one opened at the same moment by another passage (ticket 235).
	if (compte._verified !== true)
		await payload.db.updateOne({ collection: 'pros', data: { _verified: true }, id: compte.id, returning: false })
	return { ok: true, id: compte.id, nouveau: false }
}

async function creer(
	payload: Payload,
	adresse: string,
	nom: string
): Promise<ResultatDuCompte | { ok: false; code: 'service-indisponible' }> {
	const req = await createLocalReq({}, payload)
	await initTransaction(req)
	try {
		const compte = await payload.create({
			collection: 'pros',
			data: {
				email: adresse,
				// Nobody knows it. Payload needs one; « Mot de passe oublié » gives her her own.
				password: randomBytes(48).toString('base64url'),
				name: nom,
				_verified: true,
				legacyProvider: FOURNISSEUR_GOOGLE,
			},
			depth: 0,
			disableVerificationEmail: true,
			overrideAccess: true,
			req,
		})
		await commitTransaction(req)
		return { ok: true, id: compte.id, nouveau: true }
	} catch {
		await killTransaction(req)
		// The address was taken a moment ago (the next try finds that account), or the slug was.
		return { ok: false, code: 'service-indisponible' }
	}
}
