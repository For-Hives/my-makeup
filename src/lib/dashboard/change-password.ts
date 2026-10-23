import type { Payload } from 'payload'
import { z } from 'zod'
import { COLLECTION_PROS } from '../access'
import type { EventCode, Log } from '../auth/auth-log'
import { ipClient } from '../auth/client-ip'
import { PASSWORD_MESSAGES, validateNewPassword } from '../auth/forgot-password'
import { createRateLimit } from '../auth/rate-limit'
import { MAX_PASSWORD_LENGTH } from '../auth/sign-in'
import { composerEmail } from '../emails/layout'
import { passwordChangedEmailContent } from '../emails/password-changed'
import type { SendEmail } from '../emails/send'
import { isPasswordCorrect, VerificationError } from './delete-account'
import { confirmationMode } from './deletion-confirmation'

/**
 * She changes her password from her space (ticket 999), without going through her mailbox.
 *
 * - **She retypes her current password.** A session alone is not enough: a stolen session cannot change the
 *   password. The check is the one of the deletion of the account (`isPasswordCorrect`), which signs nobody in.
 * - **An account with no password she knows** (it came from Google or Facebook, or still holds the hash of the old
 *   site) cannot change one: there is nothing to retype. She asks for a link by email instead
 *   (`passwordChangeMode`, then the forgotten password), which proves her mailbox. Defining a password from a session
 *   alone would turn a stolen session into a permanent hold on the account.
 * - **A wrong current password changes nothing** and counts as a failure for the brake: 10 per 15 minutes, by
 *   client address AND by account. The brake never touches the sign-in, so nobody is locked out by it. A place is
 *   given back when the failure is ours.
 * - **The other sessions are closed, this one stays.** Payload's own update of a password does it for the session of the
 *   request (`_sid`); the old password of the old site (`legacyBcrypt`) goes too, through the hooks of `pros`.
 * - **The account is told by email** (`passwordChangedEmailContent`): no password and no token in it, a way back if
 *   it was not her. The mail leaves after the answer and its failure never undoes the change.
 * - Nothing here ever returns, logs or stores a password. The journal holds a kind and a code only: the kind is
 *   `password-reset` and the method `password` tells it from the reset by a link, which has none.
 *
 * No `next` import: the tests load this file too.
 */

/** Wrong current passwords: 10 per address and per 15 minutes, and 10 per account. */
export const passwordChangeRateLimit = createRateLimit({
	nom: 'changement-mot-de-passe',
	limite: 10,
	fenetreMs: 15 * 60 * 1000,
})

export const CHANGE_MESSAGES = {
	ok: 'Ton mot de passe est changé. Tes autres appareils ont été déconnectés.',
	echec: 'Ton mot de passe n’a pas été changé. Réessaie dans un instant.',
	actuel: 'Ce n’est pas ton mot de passe actuel : ton mot de passe n’a pas été changé.',
	identique: 'Choisis un mot de passe différent de l’actuel.',
	freine: 'Trop d’essais. Réessaie dans quelques minutes : ton mot de passe n’a pas été changé.',
	session: 'Ta session a expiré : ton mot de passe n’a pas été changé. Reconnecte-toi, puis recommence.',
	lien: 'Ton compte n’a pas de mot de passe que tu connaisses : demande un lien par email pour en définir un.',
	'mot-de-passe-trop-court': PASSWORD_MESSAGES['mot-de-passe-trop-court'],
	'mot-de-passe-trop-long': PASSWORD_MESSAGES['mot-de-passe-trop-long'],
	'mots-de-passe-differents': PASSWORD_MESSAGES['mots-de-passe-differents'],
	lienEnvoye:
		'Un email avec un lien vient de partir vers l’adresse de ton compte. Pense à regarder dans tes courriers indésirables.',
} as const

export type ChangeCode = Exclude<keyof typeof CHANGE_MESSAGES, 'ok' | 'lienEnvoye'>

export type PasswordChangeResult =
	| { ok: true; message: string }
	| { ok: false; code: ChangeCode; message: string; session?: 'expiree'; freine?: true }

/** What she types: her current password, the new one, and the new one again. One key more refuses the request. */
export const passwordChangeSchema = z.strictObject({
	current: z.string().max(MAX_PASSWORD_LENGTH),
	password: z.string().max(MAX_PASSWORD_LENGTH + 1),
	confirmation: z.string().max(MAX_PASSWORD_LENGTH + 1),
})

export interface PasswordChangeValues extends Record<string, unknown> {
	current: string
	password: string
	confirmation: string
}

export type PasswordChangeMode = 'mot-de-passe' | 'lien'

/** « mot-de-passe » when she holds a password she knows and can retype, « lien » when only a mail link can give her one. */
export function passwordChangeMode(compte: object): PasswordChangeMode {
	if (confirmationMode(compte) === 'email') return 'lien'
	return 'legacyBcrypt' in compte && typeof compte.legacyBcrypt === 'string' && compte.legacyBcrypt !== ''
		? 'lien'
		: 'mot-de-passe'
}

/** The mode of an account read from the database (the hash of the old site is hidden from the session's own user). */
export async function readPasswordChangeMode(payload: Payload, id: number | string): Promise<PasswordChangeMode> {
	const stored = await payload.findByID({
		collection: 'pros',
		depth: 0,
		disableErrors: true,
		id,
		overrideAccess: true,
		showHiddenFields: true,
		select: { legacyProvider: true, legacyBcrypt: true },
	})
	return stored === null ? 'lien' : passwordChangeMode(stored)
}

const failure = (code: ChangeCode, extra: { session?: 'expiree'; freine?: true } = {}): PasswordChangeResult => ({
	ok: false,
	code,
	message: CHANGE_MESSAGES[code],
	...extra,
})

export interface PasswordChangeInputs {
	payload: Payload
	/** The request: its cookie is the only source of who she is, and its address feeds the brake. */
	headers: Headers
	saisie: unknown
	/** The door of the mails of the site. */
	envoyer: SendEmail
	site: string
	/** Runs the work after the answer: `after` of Next in a Server Action. A test hands one that runs it at once. */
	apres?: (travail: () => Promise<void>) => void
	journal?: Log
	frein?: typeof passwordChangeRateLimit
	maintenant?: number
}

export async function changeMyPassword({
	payload,
	headers,
	saisie,
	envoyer,
	site,
	apres = travail => void travail(),
	journal,
	frein = passwordChangeRateLimit,
	maintenant,
}: PasswordChangeInputs): Promise<PasswordChangeResult> {
	const start = Date.now()
	const record = async (code: EventCode) => {
		try {
			await journal?.({ type: 'password-reset', code, durationMs: Date.now() - start, method: 'password' })
		} catch {
			// The journal is not the change's to fail.
		}
	}

	const parsed = passwordChangeSchema.safeParse(saisie)
	if (!parsed.success) {
		await record('donnees-invalides')
		return failure('echec')
	}
	const { current, password, confirmation } = parsed.data
	const isNew = validateNewPassword(password, confirmation)
	if (!isNew.ok) {
		await record('donnees-invalides')
		return failure(isNew.code)
	}

	// Who she is comes from the cookie of the request, never from what was typed.
	const { user } = await payload.auth({ headers }).catch(() => ({ user: null }))
	if (!user || user.collection !== COLLECTION_PROS) return failure('session', { session: 'expiree' })
	const sessionId = (user as { _sid?: unknown })._sid
	if (typeof sessionId !== 'string') return failure('session', { session: 'expiree' })

	const keys = [`adresse:${ipClient(headers)}`, `compte:${user.id}`]
	const taken: string[] = []
	const render = () => {
		for (const key of taken) frein.rendre(key, maintenant)
	}
	for (const key of keys) {
		if (!frein.prendre(key, maintenant).autorise) {
			render()
			await record('trop-de-tentatives')
			return failure('freine', { freine: true })
		}
		taken.push(key)
	}

	try {
		const stored = await payload.findByID({
			collection: 'pros',
			depth: 0,
			disableErrors: true,
			id: user.id,
			overrideAccess: true,
			// The hash of the old site is a hidden field: only the server reads it, to know whether she has a password of her own.
			showHiddenFields: true,
			select: { email: true, legacyProvider: true, legacyBcrypt: true },
		})
		if (stored === null) {
			render()
			return failure('session', { session: 'expiree' })
		}
		if (passwordChangeMode(stored) === 'lien') {
			render()
			return failure('lien')
		}
		if (!(await isPasswordCorrect(payload, String(stored.email), current))) {
			await record('identifiants-invalides')
			return failure('actuel')
		}
		// The current password was right: the places go back, whatever happens next.
		render()
		if (current === isNew.motDePasse) return failure('identique')

		// Payload hashes the password and keeps the session of this request only (`_sid`); the hooks of `pros`
		// drop the hash of the old site.
		await payload.update({
			collection: 'pros',
			data: { password: isNew.motDePasse },
			depth: 0,
			id: user.id,
			overrideAccess: true,
			user: { ...user, collection: COLLECTION_PROS, _sid: sessionId } as typeof user,
		})
		await record('ok')

		const sendNotice = async () => {
			try {
				await envoyer({ a: String(stored.email), ...composerEmail(passwordChangedEmailContent(), site) })
			} catch {
				// No detail: the error of the relay names the address.
				try {
					payload.logger.error({ msg: 'Le courriel de changement de mot de passe n’a pas pu partir.' })
				} catch {
					// The log itself failed.
				}
			}
		}
		try {
			apres(sendNotice)
		} catch {
			// Outside a request, `after` refuses: the work then runs here.
			void sendNotice()
		}
		return { ok: true, message: CHANGE_MESSAGES.ok }
	} catch (error) {
		if (error instanceof VerificationError) render()
		payload.logger.error({ msg: `[mot-de-passe] account ${user.id}: the change failed, the password is unchanged` })
		await record('service-indisponible')
		return failure('echec')
	}
}
