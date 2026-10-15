/**
 * What a probe answers: a verdict and what it saw, one line each, in French.
 *
 * `inconnu` is not `vert`: a probe that could not look (no token, a registry that does not answer)
 * says so, and the run does not count it as a pass (tickets 156 and 157).
 */

export type Verdict = 'vert' | 'rouge' | 'inconnu' | 'non lancée'

export interface Constat {
	verdict: Verdict
	/** Never the address of a real profile, never a token. */
	constats: string[]
}

/** The worst verdict of several: rouge, then inconnu, then vert. Empty: inconnu. */
export function pire(verdicts: readonly Verdict[]): Verdict {
	if (verdicts.length === 0) return 'inconnu'
	if (verdicts.includes('rouge')) return 'rouge'
	if (verdicts.includes('inconnu')) return 'inconnu'
	return 'vert'
}

/** Why a request or a reading failed, in one line, without an address that could name a profile. */
export function raisonDe(erreur: unknown): string {
	if (!(erreur instanceof Error)) return 'erreur inconnue'
	const message = erreur.message.replace(/\/profil\/[^\s/?#'"]+/g, '/profil/<…>')
	return erreur.name === 'LectureTropLongue' ? message : `${erreur.name} : ${message}`
}
