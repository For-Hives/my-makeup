import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload } from 'payload'
import { contenuEmailConfirmation } from '../emails/confirmation'
import { contenuEmailDejaInscrite } from '../emails/deja-inscrite'
import { EnvoiEmailEchoue, type EnvoyerEmail } from '../emails/envoi'
import { composerEmail } from '../emails/gabarit'
import { trouverLeCompte } from './compte-par-email'
import { cleDeBoite } from './email-canonique'
import { FREINS_DE_BOITE, type FreinsDeBoite, prendreUnMailPour } from './freins-inscription'
import type { CodeEchecInscription, DonneesInscription } from './inscription'
import type { CodeEvenement, Journaliser } from './journal'

/**
 * The sign-up of a makeup artist, once the form has been checked (tickets 082, 083 and 084).
 *
 * Everything happens in one transaction, the mail included: the account (and, with it, her empty
 * profile and its slug, made by the server), then the confirmation mail through the door of ticket
 * 073. If the mail cannot leave, nothing is kept: no account that nobody can confirm, and the
 * visitor can try again with the same address. Payload's own mail is turned off for this creation
 * (`disableVerificationEmail`), because it links to the admin panel she never opens.
 *
 * - `verifier` true (the default of the site, AUTH_VERIFY): the account starts unconfirmed and the
 *   mail goes with a link that confirms it. False: the account is confirmed at once, no mail leaves.
 * - An address that already has an account, or a Gmail variant of one (dots, `+tag`), is told to
 *   nobody (ticket 083). With the confirmation on, the answer is the one of a new address, down to
 *   the time it takes (a floor, `plancherMs`, applied last); no second account is made; the real
 *   owner reads « tu as déjà un compte » in her mailbox, at most once a minute and 5 a day for a
 *   mailbox. With the confirmation off, a new account is signed in at once and cannot be mistaken
 *   for a refused one, so the honest answer stays.
 * - The journal gets one row with the outcome, outside the transaction.
 *
 * No `next` import.
 */

/** How many times a sign-up is tried when only a collision of slugs stands in its way. */
const ESSAIS_MAX = 3

/**
 * The least time a sign-up takes, whatever its outcome. A new address creates an account and sends
 * a mail; a taken one only sends a mail: the floor hides the difference. It must stay above what
 * the slower of the two takes with the relay in use.
 */
export const PLANCHER_INSCRIPTION_MS = 1500

export type ResultatDInscription = { ok: true; confirmee: boolean } | { ok: false; code: CodeEchecInscription }

export interface EntreesDInscription {
	payload: Payload
	donnees: DonneesInscription
	verifier: boolean
	envoyer: EnvoyerEmail
	/** The origin the links of the mail are built on: the address of the site. */
	site: string
	journal?: Journaliser
	/** The floor of the duration, in milliseconds. */
	plancherMs?: number
	/** The brakes by mailbox; a test hands its own. */
	freins?: FreinsDeBoite
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

/** Waits until `instant` (a clock reading in milliseconds); nothing when it is past. */
export const attendreJusqua = (instant: number): Promise<void> =>
	new Promise(resolve => setTimeout(resolve, Math.max(0, instant - Date.now())))

export async function inscrire({
	payload,
	donnees,
	verifier,
	envoyer,
	site,
	journal,
	plancherMs = PLANCHER_INSCRIPTION_MS,
	freins = FREINS_DE_BOITE,
}: EntreesDInscription): Promise<ResultatDInscription> {
	const debut = Date.now()
	const noter = async (code: CodeEvenement) => {
		try {
			await journal?.({ type: 'inscription', code, dureeMs: Date.now() - debut })
		} catch {
			// The journal is not the sign-up's to fail.
		}
	}
	const resultat = await traiter()
	// Last, after the journal: whatever happened, the answer leaves no sooner than the floor.
	await attendreJusqua(debut + plancherMs)
	return resultat

	async function traiter(): Promise<ResultatDInscription> {
		try {
			const existant = await trouverLeCompte(payload, donnees.email)
			if (existant) return await dejaPris(existant.email)
		} catch {
			await noter('service-indisponible')
			return { ok: false, code: 'service-indisponible' }
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
			if (code === 'email-deja-pris') {
				// Two sign-ups with the same address at the same moment: the other one won. Told only if
				// the address really has an account now (any other refusal on the email is not that).
				const gagnant = await trouverLeCompte(payload, donnees.email).catch(() => undefined)
				if (gagnant) return await dejaPris(gagnant.email)
				code = 'service-indisponible'
			}
			if (code !== 'service-indisponible') break
		}
		await noter(code === 'email-non-envoye' ? 'service-indisponible' : code)
		return { ok: false, code }
	}

	/** The address has an account. Neutral when the confirmation is on, honest when it is off. */
	async function dejaPris(destinataire: string): Promise<ResultatDInscription> {
		if (!verifier) {
			await noter('email-deja-pris')
			return { ok: false, code: 'email-deja-pris' }
		}
		if (prendreUnMailPour(cleDeBoite(destinataire), freins).autorise) {
			try {
				await envoyer({ a: destinataire, ...composerEmail(contenuEmailDejaInscrite(), site) })
			} catch (erreur) {
				// The same refusal as a new address whose mail cannot leave: a relay in trouble splits nothing.
				await noter('service-indisponible')
				return { ok: false, code: codeDeLEchec(erreur) }
			}
		}
		await noter('email-deja-pris')
		return { ok: true, confirmee: false }
	}

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
