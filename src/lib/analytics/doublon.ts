/**
 * Keeps an event from being sent twice for one view (ticket 145).
 *
 * The browser remembers, for the tab, the key of the last event of this kind it sent. A reload of
 * the 404 or of the error page shows the same page again: that is not a new one, so nothing is
 * sent. The search also skips the same search shown again (its other pages, a click on « back »),
 * unless the visitor has just submitted the form.
 *
 * The key is kept as a short hash, never the words: what was typed stays out of the storage too.
 */

export const CLE_DERNIER_EVENEMENT = 'mm-mesure-dernier'
export const CLE_SOUMISSION_DU_FORMULAIRE = 'mm-mesure-formulaire'

/** What of the browser the decision uses; the tests give their own. */
export interface Navigateur {
	lire(cle: string): string | null
	ecrire(cle: string, valeur: string): void
	supprimer(cle: string): void
	/** True when the page was loaded by a reload of the browser. */
	rechargement(): boolean
}

/** A short, stable hash (djb2) in base 36: enough to tell two keys apart, nothing to read back. */
export function empreinte(texte: string): string {
	let hash = 5381
	for (let i = 0; i < texte.length; i += 1) hash = ((hash << 5) + hash + texte.charCodeAt(i)) | 0
	return (hash >>> 0).toString(36)
}

/** True when this view has not been counted yet. `memeVue` is what makes two views the same. */
export function aEmettre(
	evenement: string,
	memeVue: string,
	mode: 'rechargement' | 'meme-vue',
	navigateur: Navigateur
): boolean {
	const cle = `${evenement}:${empreinte(memeVue)}`
	const derniere = navigateur.lire(CLE_DERNIER_EVENEMENT)
	navigateur.ecrire(CLE_DERNIER_EVENEMENT, cle)
	if (derniere !== cle) return true
	return mode === 'rechargement' ? !navigateur.rechargement() : false
}

/** Notes that the visitor submitted the search form; the page of results reads it once. */
export function noterLaSoumission(navigateur: Navigateur): void {
	navigateur.ecrire(CLE_SOUMISSION_DU_FORMULAIRE, '1')
}

/** True when the visitor has just submitted the form; reading it clears it. */
export function soumissionDuFormulaire(navigateur: Navigateur): boolean {
	const soumis = navigateur.lire(CLE_SOUMISSION_DU_FORMULAIRE) === '1'
	if (soumis) navigateur.supprimer(CLE_SOUMISSION_DU_FORMULAIRE)
	return soumis
}

/** The real browser. Storage may be missing or throw (private window): then every view counts. */
export function navigateurReel(): Navigateur {
	const stockage = () => {
		try {
			return window.sessionStorage
		} catch {
			return null
		}
	}
	return {
		lire: cle => {
			try {
				return stockage()?.getItem(cle) ?? null
			} catch {
				return null
			}
		},
		ecrire: (cle, valeur) => {
			try {
				stockage()?.setItem(cle, valeur)
			} catch {}
		},
		supprimer: cle => {
			try {
				stockage()?.removeItem(cle)
			} catch {}
		},
		rechargement: () => {
			const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
			return navigation?.type === 'reload'
		},
	}
}
