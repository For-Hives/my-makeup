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

export interface RateLimitRules {
	/** Names the counters: two brakes of the same name share them. */
	nom: string
	/** Places per key and per window. */
	limite: number
	fenetreMs: number
	/** Keys kept at most; when full, the oldest key goes. */
	clesMax?: number
}

export type Decision = { autorise: true } | { autorise: false; reessayerDansS: number }

export interface RateLimit {
	/** Takes a place for this key, or says when to come back. */
	prendre(cle: string, maintenant?: number): Decision
	/** Gives back the latest place of this key: the attempt succeeded. */
	rendre(cle: string, maintenant?: number): void
	/** Forgets everything (tests). */
	vider(): void
}

const DEFAULT_KEYS = 50_000

const REGISTRY = Symbol.for('my-makeup.freins')
type Registry = Map<string, Map<string, number[]>>

function counters(nom: string): Map<string, number[]> {
	const g = globalThis as { [REGISTRY]?: Registry }
	g[REGISTRY] ??= new Map()
	let table = g[REGISTRY].get(nom)
	if (!table) {
		table = new Map()
		g[REGISTRY].set(nom, table)
	}
	return table
}

export function createRateLimit({ nom, limite, fenetreMs, clesMax = DEFAULT_KEYS }: RateLimitRules): RateLimit {
	// Looked up at each call: `vider` and a second brake of the same name see the same table.
	const recent = (cle: string, maintenant: number): number[] => {
		const table = counters(nom)
		const guards = (table.get(cle) ?? []).filter(t => t > maintenant - fenetreMs)
		if (guards.length === 0) table.delete(cle)
		else table.set(cle, guards)
		return guards
	}
	return {
		prendre(cle, maintenant = Date.now()) {
			const guards = recent(cle, maintenant)
			const first = guards[0]
			if (guards.length >= limite && first !== undefined)
				return { autorise: false, reessayerDansS: Math.max(1, Math.ceil((first + fenetreMs - maintenant) / 1000)) }
			const table = counters(nom)
			if (guards.length === 0 && table.size >= clesMax) {
				// Refusing the newcomer would give whoever fills the table the very lockout this brick avoids.
				const oldest = table.keys().next().value
				if (oldest !== undefined) table.delete(oldest)
			}
			table.set(cle, [...guards, maintenant])
			return { autorise: true }
		},
		rendre(cle, maintenant = Date.now()) {
			const guards = recent(cle, maintenant)
			if (guards.length === 0) return
			counters(nom).set(cle, guards.slice(0, -1))
			if (guards.length === 1) counters(nom).delete(cle)
		},
		vider() {
			counters(nom).clear()
		},
	}
}

/** The sign-in: 10 failures per address and per 15 minutes (plan 01 §2.3). */
export const signInRateLimit: RateLimit = createRateLimit({ nom: 'connexion', limite: 10, fenetreMs: 15 * 60 * 1000 })

/** The request of a link for a forgotten password: 10 per address and per 15 minutes, every request counted (ticket 086). */
export const forgotPasswordRateLimit: RateLimit = createRateLimit({ nom: 'mot-de-passe-oublie', limite: 10, fenetreMs: 15 * 60 * 1000 })

/** The choice of the new password: 10 failures per address and per 15 minutes (ticket 086). */
export const passwordResetRateLimit: RateLimit = createRateLimit({
	nom: 'reinitialisation',
	limite: 10,
	fenetreMs: 15 * 60 * 1000,
})

/**
 * The return from Google (ticket 223): 10 failed returns per address and per 15 minutes, like the
 * sign-in. A place is taken when the return arrives and given back when it ends in a session.
 */
export const googleCallbackRateLimit: RateLimit = createRateLimit({ nom: 'retour-google', limite: 10, fenetreMs: 15 * 60 * 1000 })
