import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload } from 'payload'
import { contenuEmailConfirmation } from '../emails/confirmation'
import { EnvoiEmailEchoue, type EnvoyerEmail } from '../emails/envoi'
import { composerEmail } from '../emails/gabarit'
import type { CodeEchecInscription, DonneesInscription } from './inscription'
import type { CodeEvenement, Journaliser } from './journal'

/**
 * The sign-up of a makeup artist, once the form has been checked (ticket 082).
 *
 * Everything happens in one transaction, the mail included: the account (and, with it, her empty
 * profile and its slug, made by the server), then the confirmation mail through the door of ticket
 * 073. If the mail cannot leave, nothing is kept: no account that nobody can confirm, and the
 * visitor can try again with the same address. Payload's own mail is turned off for this creation
 * (`disableVerificationEmail`), because it links to the admin panel she never opens.
 *
 * - `verifier` true (the default of the site, AUTH_VERIFY): the account starts unconfirmed and the
 *   mail goes with a link that confirms it. False: the account is confirmed at once, no mail leaves.
 * - An address already used is reported as such. Ticket 083 replaces this answer with a neutral one
 *   that gives nothing away; until then this is the honest minimum, and never a 500.
 * - The journal gets one row with the outcome, outside the transaction.
 *
 * No `next` import.
 */

/** How many times a sign-up is tried when only a collision of slugs stands in its way. */
const ESSAIS_MAX = 3

export type ResultatDInscription = { ok: true; confirmee: boolean } | { ok: false; code: CodeEchecInscription }

export interface EntreesDInscription {
	payload: Payload
	donnees: DonneesInscription
	verifier: boolean
	envoyer: EnvoyerEmail
	/** The origin the links of the mail are built on: the address of the site. */
	site: string
	journal?: Journaliser
}

/** True for the refusal Payload gives when the email is already the login of another account. */
function estUneAdresseDejaPrise(erreur: unknown): boolean {
	const erreurs = (erreur as { data?: { errors?: { path?: string }[] } } | null)?.data?.errors
	return Array.isArray(erreurs) && erreurs.some(({ path }) => path === 'email')
}

function codeDeLEchec(erreur: unknown): CodeEchecInscription {
	if (estUneAdresseDejaPrise(erreur)) return 'email-deja-pris'
	if (erreur instanceof EnvoiEmailEchoue) return 'email-non-envoye'
	return 'service-indisponible'
}

export async function inscrire({
	payload,
	donnees,
	verifier,
	envoyer,
	site,
	journal,
}: EntreesDInscription): Promise<ResultatDInscription> {
	const debut = Date.now()
	const noter = async (code: CodeEvenement) => {
		try {
			await journal?.({ type: 'inscription', code, dureeMs: Date.now() - debut, methode: 'mot-de-passe' })
		} catch {
			// The journal is not the sign-up's to fail.
		}
	}
	// Two homonyms who sign up at the same moment compute the same free slug, and the second write
	// breaks the unicity of the slug: the whole transaction is rolled back, and the next try sees the
	// slug taken. The address and the mail are never retried: their refusal is the answer.
	let code: CodeEchecInscription = 'service-indisponible'
	for (let essai = 1; essai <= ESSAIS_MAX; essai++) {
		const echec = await tenter()
		if (echec === undefined) {
			await noter('ok')
			return { ok: true, confirmee: !verifier }
		}
		code = echec
		if (code !== 'service-indisponible') break
	}
	await noter(code === 'email-non-envoye' ? 'service-indisponible' : code)
	return { ok: false, code }

	/** One try, in its own transaction: nothing when it succeeded, the code of its failure otherwise. */
	async function tenter(): Promise<CodeEchecInscription | undefined> {
		const req = await createLocalReq({}, payload)
		await initTransaction(req)
		try {
			const compte = await payload.create({
				collection: 'pros',
				data: { email: donnees.email, password: donnees.password, nom: donnees.nom, _verified: !verifier },
				depth: 0,
				disableVerificationEmail: true,
				overrideAccess: true,
				req,
			})
			if (verifier) {
				// The token is hidden from every read: the adapter gives it to the server alone.
				const ligne = await payload.db.findOne<{ id: number; _verificationToken?: string | null }>({
					collection: 'pros',
					req,
					where: { id: { equals: compte.id } },
				})
				if (!ligne?._verificationToken) throw new Error('Le jeton de confirmation manque.')
				await envoyer(
					{ a: donnees.email, ...composerEmail(contenuEmailConfirmation(ligne._verificationToken), site) },
					{ context: req.context }
				)
			}
			await commitTransaction(req)
			return undefined
		} catch (erreur) {
			await killTransaction(req)
			return codeDeLEchec(erreur)
		}
	}
}
