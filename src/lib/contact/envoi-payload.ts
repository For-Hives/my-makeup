import type { Payload } from 'payload'
import { contenuEmailContact } from '../emails/contact'
import type { EnvoyerEmail, Journal } from '../emails/envoi'
import { composerEmail } from '../emails/gabarit'
import { SITE_ORIGIN } from '../env'
import type { EtatDuMail, StatutDeDemande } from './etats'
import { FREINS_DE_CONTACT, type FreinsDeContact, prendreUnePlaceDeContact } from './frein'
import { CHAMP_PIEGE_DU_CONTACT, type ErreursDeContact, type MessageDeContact, validerLeMessage } from './message'

/**
 * A contact message, server side (tickets 158 and 159). No `next` import: the Server Action calls it,
 * and so do the tests.
 *
 * The order is the point:
 * 0. The trap field (ticket 161) is hidden from every person: if it is filled, the answer is the success of
 *    anyone, and nothing is stored, sent or counted.
 * 1. The message is checked. A message that fails a rule creates no row and sends no mail, whoever
 *    called the action.
 *    Then the brakes (ticket 161): 5 an hour by client address, 20 a day by mailbox. A refused message is
 *    neither stored nor sent.
 * 2. It is stored in `demandes` (`nouvelle`, mail `en-attente`). If the store fails, nothing is sent and
 *    the visitor is told: a message that is not kept is not a message that was sent.
 * 3. The answer goes back, and the mail to the team leaves after it (`apres`: `after` of Next in a Server
 *    Action). The relay is never waited for by the visitor, so a relay that is silent changes nothing
 *    for her. The mail has a deadline of its own (`delaiMs`): past it, the row says `echec`.
 * 4. The row is told how the mail went: `envoye` and `transmise`, or `echec`. A mail that fails never
 *    loses the message, and the visitor sees the confirmation all the same.
 *
 * What she typed is never in a log: a failure writes its kind, a word, and nothing that the database
 * or the relay put in its error, which may quote the values.
 */

/** How long the mail to the team is given before the row says `echec`: under the 10 seconds a visitor may wait. */
export const DELAI_DE_L_ENVOI_MS = 8_000

/** The two writes the flow makes in `demandes`. The real one is `stockageDePayload`; a test hands its own. */
export interface StockageDesDemandes {
	creer: (message: MessageDeContact) => Promise<number>
	marquer: (id: number, etatMail: EtatDuMail, statut?: StatutDeDemande) => Promise<void>
}

/** The store wired to a Payload instance: the Local API without access control, as the server writes the journal. */
export function stockageDePayload(payload: Pick<Payload, 'create' | 'update'>): StockageDesDemandes {
	return {
		creer: async message =>
			(
				await payload.create({
					collection: 'demandes',
					data: { type: 'contact', statut: 'nouvelle', etatMail: 'en-attente', ...message },
					depth: 0,
				})
			).id,
		marquer: async (id, etatMail, statut) => {
			await payload.update({
				collection: 'demandes',
				id,
				data: { etatMail, ...(statut !== undefined && { statut }) },
				depth: 0,
			})
		},
	}
}

export type ResultatDuContact =
	| { ok: true }
	| { ok: false; code: 'donnees-invalides'; erreurs: ErreursDeContact }
	| { ok: false; code: 'enregistrement-impossible' }
	| { ok: false; code: 'trop-de-messages'; reessayerDansS: number }

export interface EntreesDuContact {
	/** What the form sent. */
	formulaire: { get: (nom: string) => unknown }
	stockage: StockageDesDemandes
	/** The door of the mails of the site. */
	envoyer: EnvoyerEmail
	/** The address of the team. */
	destinataire: string
	/** Runs the work after the answer: `after` of Next in a Server Action. A test hands one that waits. */
	apres: (travail: () => Promise<void>) => void
	journal: Journal
	delaiMs?: number
	/** The client address as `ipClient` gives it: the key of the brake by address. */
	client: string
	/** The brakes in use; the shared ones by default. */
	freins?: FreinsDeContact
}

/** The kind of a failure, in a word: what a log may keep of an error that may quote what was typed. */
function natureDeLEchec(erreur: unknown): string {
	if (typeof erreur === 'object' && erreur !== null) {
		if ('code' in erreur && typeof erreur.code === 'string' && /^[A-Za-z0-9_]{2,30}$/.test(erreur.code))
			return erreur.code
		if ('name' in erreur && typeof erreur.name === 'string' && /^[A-Za-z]{3,40}$/.test(erreur.name)) return erreur.name
	}
	return 'inconnue'
}

/** Resolves with `envoye` or `echec`, or with `delai` once `ms` have passed: the mail is then left to finish alone. */
async function avecUnDelai(envoi: Promise<'envoye' | 'echec'>, ms: number): Promise<'envoye' | 'echec' | 'delai'> {
	let minuteur: ReturnType<typeof setTimeout> | undefined
	const delai = new Promise<'delai'>(fin => {
		minuteur = setTimeout(() => fin('delai'), ms)
	})
	try {
		return await Promise.race([envoi, delai])
	} finally {
		clearTimeout(minuteur)
	}
}

/** What the mail to the team needs: the form and `apres` are the business of the first send only. */
export type EntreesDExpedition = Omit<EntreesDuContact, 'formulaire' | 'apres' | 'client' | 'freins'>

/**
 * Sends the mail to the team and tells the row how it went. Never throws. Gives the state the row was
 * left in: the first send and the re-send of an admin (ticket 163) share it.
 */
export async function expedier(
	id: number,
	message: MessageDeContact,
	{ stockage, envoyer, destinataire, journal, delaiMs = DELAI_DE_L_ENVOI_MS }: EntreesDExpedition
): Promise<'envoye' | 'echec'> {
	const marquer = async (etat: EtatDuMail, statut?: StatutDeDemande) => {
		try {
			await stockage.marquer(id, etat, statut)
		} catch (erreur) {
			journal.erreur(
				`L’état de l’email d’un message de contact n’a pas pu être écrit (nature : ${natureDeLEchec(erreur)}).`
			)
		}
	}
	const envoi: Promise<'envoye' | 'echec'> = (async () => {
		const email = composerEmail(contenuEmailContact(message), SITE_ORIGIN)
		await envoyer({ a: destinataire, repondreA: message.email, ...email })
		return 'envoye' as const
	})().catch((erreur: unknown) => {
		// The door already wrote its own line (kind of failure only); this one says which flow it was.
		journal.erreur(`L’email d’un message de contact n’est pas parti (nature : ${natureDeLEchec(erreur)}).`)
		return 'echec' as const
	})

	const issue = await avecUnDelai(envoi, delaiMs)
	if (issue === 'envoye') {
		await marquer('envoye', 'transmise')
		return 'envoye'
	}
	if (issue === 'echec') {
		await marquer('echec')
		return 'echec'
	}
	journal.erreur('L’email d’un message de contact n’est pas parti : le service d’envoi ne répond pas à temps.')
	await marquer('echec')
	// A relay that was only slow: if the mail leaves after all, the row says so.
	void envoi.then(async fin => {
		if (fin === 'envoye') await marquer('envoye', 'transmise')
	})
	return 'echec'
}

export async function enregistrerUnMessageDeContact(entrees: EntreesDuContact): Promise<ResultatDuContact> {
	const piege = entrees.formulaire.get(CHAMP_PIEGE_DU_CONTACT)
	// A script. It is shown the success of a person, which it cannot tell from a real one.
	if (typeof piege === 'string' && piege.trim() !== '') return { ok: true }

	const verifie = validerLeMessage(entrees.formulaire)
	if (!verifie.ok) return { ok: false, code: 'donnees-invalides', erreurs: verifie.erreurs }

	const place = prendreUnePlaceDeContact(entrees.client, verifie.message.email, entrees.freins ?? FREINS_DE_CONTACT)
	if (!place.autorise) return { ok: false, code: 'trop-de-messages', reessayerDansS: place.reessayerDansS }

	let id: number
	try {
		id = await entrees.stockage.creer(verifie.message)
	} catch (erreur) {
		entrees.journal.erreur(`Un message de contact n’a pas pu être enregistré (nature : ${natureDeLEchec(erreur)}).`)
		return { ok: false, code: 'enregistrement-impossible' }
	}

	entrees.apres(async () => void (await expedier(id, verifie.message, entrees)))
	return { ok: true }
}
