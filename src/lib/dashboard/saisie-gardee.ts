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
export type SectionEditee = 'identite'

/** How long a draft is believed. */
export const DUREE_DE_VIE_DE_LA_SAISIE_MS = 24 * 60 * 60 * 1000

/** Under this delay after a redirection, a second expiry does not send her away again: no loop. */
export const DELAI_ANTI_BOUCLE_MS = 10 * 60 * 1000

/** What `sessionStorage` offers, and what a test fakes. */
export type Stockage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface SaisieGardee<Valeurs> {
	valeurs: Valeurs
	/** When the draft was kept (ms). */
	le: number
	/** When she was sent to sign in again for this draft (ms), if she was. */
	redirigeLe: number | null
}

const cle = (section: SectionEditee, proprietaire: string): string => `mm:saisie:${section}:${proprietaire}`

/** The tab's storage, or nothing when the browser refuses it. */
export function stockageDeLOnglet(): Stockage | null {
	try {
		return typeof window === 'undefined' ? null : window.sessionStorage
	} catch {
		return null
	}
}

const estUnTexte = (valeur: unknown): valeur is string => typeof valeur === 'string'

/**
 * The draft kept for this section and this account, or nothing: no draft, a draft that is too old,
 * unreadable, or whose values are not the texts of the form. `champs` are the fields of the form.
 */
export function lireLaSaisie<Champ extends string>(
	stockage: Stockage | null,
	section: SectionEditee,
	proprietaire: string,
	champs: readonly Champ[],
	maintenant: number
): SaisieGardee<Record<Champ, string>> | null {
	if (stockage === null) return null
	try {
		const brut = stockage.getItem(cle(section, proprietaire))
		if (brut === null) return null
		const lue: unknown = JSON.parse(brut)
		if (typeof lue !== 'object' || lue === null) return null
		const { valeurs, le, redirigeLe } = lue as Record<string, unknown>
		if (typeof le !== 'number' || maintenant - le > DUREE_DE_VIE_DE_LA_SAISIE_MS || le > maintenant + 60_000) {
			oublierLaSaisie(stockage, section, proprietaire)
			return null
		}
		if (typeof valeurs !== 'object' || valeurs === null) return null
		const sortie = {} as Record<Champ, string>
		for (const champ of champs) {
			const valeur = (valeurs as Record<string, unknown>)[champ]
			if (!estUnTexte(valeur)) return null
			sortie[champ] = valeur
		}
		return { valeurs: sortie, le, redirigeLe: typeof redirigeLe === 'number' ? redirigeLe : null }
	} catch {
		return null
	}
}

/** Keeps the draft. Returns whether the browser accepted it. */
export function garderLaSaisie<Valeurs>(
	stockage: Stockage | null,
	section: SectionEditee,
	proprietaire: string,
	saisie: SaisieGardee<Valeurs>
): boolean {
	if (stockage === null) return false
	try {
		stockage.setItem(cle(section, proprietaire), JSON.stringify(saisie))
		return true
	} catch {
		return false
	}
}

/** Forgets the draft: after a successful save, or when she abandons. */
export function oublierLaSaisie(stockage: Stockage | null, section: SectionEditee, proprietaire: string): void {
	try {
		stockage?.removeItem(cle(section, proprietaire))
	} catch {
		// Nothing to forget in a browser that refuses storage.
	}
}

/**
 * Whether an expired session may send her to sign in again: once. If she was already sent for this
 * draft a moment ago and the save still says « expired », the message stays in the panel instead.
 */
export function peutRediriger(avant: SaisieGardee<unknown> | null, maintenant: number): boolean {
	return avant?.redirigeLe == null || maintenant - avant.redirigeLe > DELAI_ANTI_BOUCLE_MS
}
