/**
 * The brake by client address (ticket 076): a reusable brick that counts events by key over a
 * sliding window and refuses the ones past the limit. The sign-in uses it; the sign-up, the
 * forgotten password, the search and the contact form take one each (`creerFrein` with their own
 * name and numbers).
 *
 * Only the address is braked, never the account: ten wrong passwords typed by one person must not
 * lock the account they aimed at, and an attacker must not be able to lock someone out by
 * knocking on her email (AUTH-05).
 *
 * A place is taken BEFORE the check (so that attempts sent at the same time cannot all pass) and
 * given back when the attempt succeeds: what is counted is the failures. A refused attempt takes
 * no place, so a braked address is freed 15 minutes after its tenth failure, not after its last
 * knock.
 *
 * In memory, per process: the application runs as one container. The counters live on
 * `globalThis`: Next loads a module once per bundle layer (route handler, Server Action), and the
 * limit must be one for the process.
 *
 * Keys come from `ipClient` and are never logged.
 */

export interface ReglesDuFrein {
	/** Names the counters: two brakes of the same name share them. */
	nom: string
	/** Places per key and per window. */
	limite: number
	fenetreMs: number
	/** Keys kept at most; when full, the oldest key goes. */
	clesMax?: number
}

export type Decision = { autorise: true } | { autorise: false; reessayerDansS: number }

export interface Frein {
	/** Takes a place for this key, or says when to come back. */
	prendre(cle: string, maintenant?: number): Decision
	/** Gives back the latest place of this key: the attempt succeeded. */
	rendre(cle: string, maintenant?: number): void
	/** Forgets everything (tests). */
	vider(): void
}

const CLES_PAR_DEFAUT = 50_000

const REGISTRE = Symbol.for('my-makeup.freins')
type Registre = Map<string, Map<string, number[]>>

function compteurs(nom: string): Map<string, number[]> {
	const g = globalThis as { [REGISTRE]?: Registre }
	g[REGISTRE] ??= new Map()
	let table = g[REGISTRE].get(nom)
	if (!table) {
		table = new Map()
		g[REGISTRE].set(nom, table)
	}
	return table
}

export function creerFrein({ nom, limite, fenetreMs, clesMax = CLES_PAR_DEFAUT }: ReglesDuFrein): Frein {
	// Looked up at each call: `vider` and a second brake of the same name see the same table.
	const recents = (cle: string, maintenant: number): number[] => {
		const table = compteurs(nom)
		const gardes = (table.get(cle) ?? []).filter(t => t > maintenant - fenetreMs)
		if (gardes.length === 0) table.delete(cle)
		else table.set(cle, gardes)
		return gardes
	}
	return {
		prendre(cle, maintenant = Date.now()) {
			const gardes = recents(cle, maintenant)
			const premier = gardes[0]
			if (gardes.length >= limite && premier !== undefined)
				return { autorise: false, reessayerDansS: Math.max(1, Math.ceil((premier + fenetreMs - maintenant) / 1000)) }
			const table = compteurs(nom)
			if (gardes.length === 0 && table.size >= clesMax) {
				// Refusing the newcomer would give whoever fills the table the very lockout this brick avoids.
				const plusAncienne = table.keys().next().value
				if (plusAncienne !== undefined) table.delete(plusAncienne)
			}
			table.set(cle, [...gardes, maintenant])
			return { autorise: true }
		},
		rendre(cle, maintenant = Date.now()) {
			const gardes = recents(cle, maintenant)
			if (gardes.length === 0) return
			compteurs(nom).set(cle, gardes.slice(0, -1))
			if (gardes.length === 1) compteurs(nom).delete(cle)
		},
		vider() {
			compteurs(nom).clear()
		},
	}
}

/** The sign-in: 10 failures per address and per 15 minutes (plan 01 §2.3). */
export const freinDeConnexion: Frein = creerFrein({ nom: 'connexion', limite: 10, fenetreMs: 15 * 60 * 1000 })

/** The request of a link for a forgotten password: 10 per address and per 15 minutes, every request counted (ticket 086). */
export const freinDeLOubli: Frein = creerFrein({ nom: 'mot-de-passe-oublie', limite: 10, fenetreMs: 15 * 60 * 1000 })

/** The choice of the new password: 10 failures per address and per 15 minutes (ticket 086). */
export const freinDeLaReinitialisation: Frein = creerFrein({
	nom: 'reinitialisation',
	limite: 10,
	fenetreMs: 15 * 60 * 1000,
})

/**
 * The return from Google (ticket 223): 10 failed returns per address and per 15 minutes, like the
 * sign-in. A place is taken when the return arrives and given back when it ends in a session.
 */
export const freinDuRetourGoogle: Frein = creerFrein({ nom: 'retour-google', limite: 10, fenetreMs: 15 * 60 * 1000 })
