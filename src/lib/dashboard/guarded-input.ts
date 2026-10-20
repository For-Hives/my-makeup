/**
 * The typing kept in the browser when her session ends while she edits (ticket 121, plan 02 E32).
 *
 * The save fails cleanly (nothing is stored), the form sends her once to the sign-in page, and the
 * same panel opens again with what she typed once she is back. The draft lives in the
 * `sessionStorage` of the tab: it never leaves the browser, goes with the tab, and is forgotten
 * after a successful save, after she abandons, or after a day. Every access is guarded: a browser
 * that refuses storage (private window, blocked data) just loses the draft.
 */

/** The part of her profile being edited: one key per section, so that the next ones reuse this. */
export type EditedSection = 'identite'

/** How long a draft is believed. */
export const INPUT_LIFETIME_MS = 24 * 60 * 60 * 1000

/** Under this delay after a redirection, a second expiry does not send her away again: no loop. */
export const ANTI_LOOP_DELAY_MS = 10 * 60 * 1000

/** What `sessionStorage` offers, and what a test fakes. */
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface GuardedInput<Valeurs> {
	valeurs: Valeurs
	/** When the draft was kept (ms). */
	le: number
	/** When she was sent to sign in again for this draft (ms), if she was. */
	redirigeLe: number | null
}

const key = (section: EditedSection, proprietaire: string): string => `mm:saisie:${section}:${proprietaire}`

/** The tab's storage, or nothing when the browser refuses it. */
export function tabStorage(): DraftStorage | null {
	try {
		return typeof window === 'undefined' ? null : window.sessionStorage
	} catch {
		return null
	}
}

const isText = (valeur: unknown): valeur is string => typeof valeur === 'string'

/**
 * The draft kept for this section and this account, or nothing: no draft, a draft that is too old,
 * unreadable, or whose values are not the texts of the form. `champs` are the fields of the form.
 */
export function readInput<Champ extends string>(
	stockage: DraftStorage | null,
	section: EditedSection,
	proprietaire: string,
	champs: readonly Champ[],
	maintenant: number
): GuardedInput<Record<Champ, string>> | null {
	if (stockage === null) return null
	try {
		const raw = stockage.getItem(key(section, proprietaire))
		if (raw === null) return null
		const parsed: unknown = JSON.parse(raw)
		if (typeof parsed !== 'object' || parsed === null) return null
		const { valeurs: values, le: savedAt, redirigeLe: redirectedAt } = parsed as Record<string, unknown>
		if (typeof savedAt !== 'number' || maintenant - savedAt > INPUT_LIFETIME_MS || savedAt > maintenant + 60_000) {
			forgetInput(stockage, section, proprietaire)
			return null
		}
		if (typeof values !== 'object' || values === null) return null
		const output = {} as Record<Champ, string>
		for (const field of champs) {
			const value = (values as Record<string, unknown>)[field]
			if (!isText(value)) return null
			output[field] = value
		}
		return { valeurs: output, le: savedAt, redirigeLe: typeof redirectedAt === 'number' ? redirectedAt : null }
	} catch {
		return null
	}
}

/** Keeps the draft. Returns whether the browser accepted it. */
export function guardInput<Valeurs>(
	stockage: DraftStorage | null,
	section: EditedSection,
	proprietaire: string,
	saisie: GuardedInput<Valeurs>
): boolean {
	if (stockage === null) return false
	try {
		stockage.setItem(key(section, proprietaire), JSON.stringify(saisie))
		return true
	} catch {
		return false
	}
}

/** Forgets the draft: after a successful save, or when she abandons. */
export function forgetInput(stockage: DraftStorage | null, section: EditedSection, proprietaire: string): void {
	try {
		stockage?.removeItem(key(section, proprietaire))
	} catch {
		// Nothing to forget in a browser that refuses storage.
	}
}

/**
 * Whether an expired session may send her to sign in again: once. If she was already sent for this
 * draft a moment ago and the save still says « expired », the message stays in the panel instead.
 */
export function canRedirect(avant: GuardedInput<unknown> | null, maintenant: number): boolean {
	return avant?.redirigeLe == null || maintenant - avant.redirigeLe > ANTI_LOOP_DELAY_MS
}
