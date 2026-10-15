/**
 * What a save of the space gives back to the form (ticket 119): the values as the server stored
 * them, or a message in French (never the raw message of Payload), with the fields it is about.
 * Every section of the space (tickets 122 to 135) saves through this contract.
 */

export type ResultatDEnregistrement<Valeurs extends Record<string, unknown>> =
	| { ok: true; valeurs: Valeurs }
	| {
			ok: false
			/** The message under the form, always in French. */
			message: string
			/** The message of each field the server refused, in French. */
			champs?: Partial<Record<keyof Valeurs, string>>
			/** The session ended: the form tells so, and keeps what was typed (ticket 121). */
			session?: 'expiree'
	  }

/** The message when nothing more precise can be said: the old value stays. */
export const MESSAGE_ECHEC =
	'L’enregistrement n’a pas abouti : ta modification n’a pas été prise en compte, et rien n’a changé. Réessaie dans un instant.'

/** The message when she is no longer signed in. */
export const MESSAGE_SESSION =
	'Ta session a expiré : ta modification n’a pas été enregistrée. Reconnecte-toi, puis recommence.'

/** What a Payload validation error holds, read without trusting its shape. */
function erreursDeChamp(erreur: unknown): { path: string; message: string }[] {
	if (typeof erreur !== 'object' || erreur === null || !('data' in erreur)) return []
	const { data } = erreur as { data: unknown }
	if (typeof data !== 'object' || data === null || !('errors' in data) || !Array.isArray(data.errors)) return []
	return data.errors.flatMap((ligne: unknown) => {
		if (typeof ligne !== 'object' || ligne === null) return []
		const { path, message } = ligne as { path?: unknown; message?: unknown }
		return typeof path === 'string' && typeof message === 'string' && message.trim() !== '' ? [{ path, message }] : []
	})
}

/**
 * The failure to give back for an error thrown by Payload: the message of each field it names
 * (`data.errors`, French since ticket 221) among the `champs` of the form, else the generic French
 * message. `error.message` is never read: Payload keeps a few messages in English.
 */
export function echecDePayload<Champ extends string>(
	erreur: unknown,
	champs: readonly Champ[]
): { ok: false; message: string; champs?: Partial<Record<Champ, string>> } {
	const parChamp: Partial<Record<Champ, string>> = {}
	for (const { path, message } of erreursDeChamp(erreur)) {
		const champ = champs.find(nom => nom === path)
		if (champ !== undefined && parChamp[champ] === undefined) parChamp[champ] = message
	}
	return Object.keys(parChamp).length > 0
		? { ok: false, message: 'Un champ n’est pas valide : corrige-le, puis enregistre à nouveau.', champs: parChamp }
		: { ok: false, message: MESSAGE_ECHEC }
}
