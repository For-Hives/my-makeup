import { timingSafeEqual } from 'node:crypto'
import type { Payload } from 'payload'
import type { CodeErreurGoogle } from '../erreurs'
import { ouvrirSansMotDePasse } from '../jeton'
import type { CodeEvenement, Journaliser } from '../journal'
import { PAGE_D_ACCUEIL_DU_COMPTE } from '../retour'
import { type CodeRefusDuCompte, compteDeGoogle } from './compte'
import { type ConfigGoogle, decouvrir, JetonRefuse, ouvrirLeCookie, type Requeter, revendicationsDuCode } from './oidc'

/**
 * The return from Google (tickets 090 and 091), from the address it called to the session.
 *
 * `terminerLaConnexionGoogle` believes nothing it has not checked: the cookie sealed at the
 * departure must come back, and its `state` must be the address's; only then is the code exchanged,
 * the ID token checked, the account found or made, and a session opened for it. Every refusal is
 * written to the journal (type « connexion », method « google ») and answered with one code of the
 * closed list of `erreurs.ts`: nothing Google sent, no address and no token is ever shown or kept.
 *
 * No `next` import: the route calls it with what it read from the request.
 */

export interface RetourDeGoogle {
	code: string | null
	state: string | null
	error: string | null
}

export type IssueDeGoogle =
	| {
			ok: true
			token: string
			/** True for a first passage: the account has just been made. */
			nouveau: boolean
			/** Where she goes: the onboarding for a new account, else the page she asked for. */
			destination: string
	  }
	| { ok: false; code: CodeErreurGoogle }

export interface EntreesDuRetour {
	payload: Payload
	config: ConfigGoogle
	/** The key the departure's cookie was sealed with. */
	secret: string
	retour: RetourDeGoogle
	/** The value of the sealed cookie, if the browser sent it. */
	cookie: string | undefined
	journal?: Journaliser
	requeter?: Requeter
	maintenant?: () => number
}

const CODE_MAX = 2048

const memeTexte = (a: string, b: string): boolean => {
	const x = Buffer.from(a)
	const y = Buffer.from(b)
	return x.length === y.length && timingSafeEqual(x, y)
}

const CODE_URL_DU_REFUS: Record<CodeRefusDuCompte, CodeErreurGoogle> = {
	'email-non-verifie': 'google-email-non-verifie',
	'compte-refuse': 'email-deja-avec-mot-de-passe',
	'compte-bloque': 'compte-bloque',
	'service-indisponible': 'google-indisponible',
}

const CODE_JOURNAL_DU_REFUS: Record<CodeRefusDuCompte, CodeEvenement> = {
	'email-non-verifie': 'email-non-verifie',
	'compte-refuse': 'compte-refuse',
	'compte-bloque': 'compte-bloque',
	'service-indisponible': 'service-indisponible',
}

export async function terminerLaConnexionGoogle({
	payload,
	config,
	secret,
	retour,
	cookie,
	journal,
	requeter,
	maintenant = Date.now,
}: EntreesDuRetour): Promise<IssueDeGoogle> {
	const debut = Date.now()
	const noter = async (type: 'connexion' | 'inscription', code: CodeEvenement) => {
		try {
			await journal?.({ type, code, dureeMs: Date.now() - debut, methode: 'google' })
		} catch {
			// The journal is not the sign-in's to fail.
		}
	}
	const refuser = async (code: CodeEvenement, url: CodeErreurGoogle): Promise<IssueDeGoogle> => {
		await noter('connexion', code)
		return { ok: false, code: url }
	}

	// What Google said by itself (RFC 6749 §4.1.2.1): a refusal, an outage, or something else.
	const refuserLeRetour = (erreur: string): Promise<IssueDeGoogle> => {
		if (erreur === 'access_denied') return refuser('annule', 'google-annule')
		if (erreur === 'server_error' || erreur === 'temporarily_unavailable')
			return refuser('service-indisponible', 'google-indisponible')
		return refuser('retour-invalide', 'google-echec')
	}

	const demande = ouvrirLeCookie(cookie, secret, maintenant)
	if (!demande || retour.state === null || !memeTexte(retour.state, demande.state))
		return refuser('retour-invalide', 'google-echec')
	// She closed Google's screen, or refused: the state was ours, so this is a real answer.
	if (retour.error !== null) return refuserLeRetour(retour.error)
	if (retour.code === null || retour.code === '' || retour.code.length > CODE_MAX)
		return refuser('retour-invalide', 'google-echec')

	let revendications: Awaited<ReturnType<typeof revendicationsDuCode>>
	try {
		const decouverte = await decouvrir(config.emetteur, { requeter, maintenant })
		revendications = await revendicationsDuCode(
			config,
			decouverte,
			{ code: retour.code, demande },
			{ requeter, maintenant }
		)
	} catch (erreur) {
		if (erreur instanceof JetonRefuse) return refuser('retour-invalide', 'google-echec')
		// GoogleIndisponible, or anything unforeseen: the provider or the network, not the visitor.
		return refuser('service-indisponible', 'google-indisponible')
	}

	const compte = await compteDeGoogle(payload, revendications)
	if (!compte.ok) return refuser(CODE_JOURNAL_DU_REFUS[compte.code], CODE_URL_DU_REFUS[compte.code])

	let token: string
	try {
		;({ token } = await ouvrirSansMotDePasse(payload, { collection: 'pros', id: compte.id }))
	} catch {
		return refuser('service-indisponible', 'google-indisponible')
	}
	// The date of the last sign-in (the `afterLogin` hook does it for a password): a failure to write
	// it is not the sign-in's to fail.
	await payload
		.update({
			collection: 'pros',
			data: { derniereConnexion: new Date().toISOString() },
			depth: 0,
			id: compte.id,
			overrideAccess: true,
		})
		.catch(() => undefined)
	if (compte.nouveau) await noter('inscription', 'ok')
	await noter('connexion', 'ok')
	return {
		ok: true,
		token,
		nouveau: compte.nouveau,
		destination: compte.nouveau ? PAGE_D_ACCUEIL_DU_COMPTE : demande.retour,
	}
}
