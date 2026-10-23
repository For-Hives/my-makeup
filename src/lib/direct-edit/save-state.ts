/**
 * What a block of the direct edition shows of its save (issue 1008): saving, saved, failed. The
 * state follows the answer of the server and nothing else, so « saved » is never shown before it.
 */

/** What every save of the space gives back, reduced to what a block needs. */
export type BlockOutcome =
	| { ok: true }
	| {
			ok: false
			message: string
			champs?: Partial<Record<string, string | undefined>> | undefined
			session?: 'expiree' | undefined
	  }

export type BlockSave =
	| { kind: 'idle' }
	| { kind: 'saving' }
	| { kind: 'saved' }
	| { kind: 'error'; message: string; fields?: Partial<Record<string, string | undefined>> | undefined }
	| { kind: 'expired'; message: string }

/** The state after the server answered. */
export function saveFromOutcome(outcome: BlockOutcome): BlockSave {
	if (outcome.ok) return { kind: 'saved' }
	if (outcome.session === 'expiree') return { kind: 'expired', message: outcome.message }
	return outcome.champs === undefined
		? { kind: 'error', message: outcome.message }
		: { kind: 'error', message: outcome.message, fields: outcome.champs }
}

export type BarStatus = {
	kind: 'resting' | 'editing' | 'saving' | 'saved' | 'error'
	text: string
}

/** The line of the bar above her page: which block is open, and where its save stands. */
export function barStatus(openId: string | null, save: BlockSave): BarStatus {
	if (save.kind === 'saving') return { kind: 'saving', text: 'Enregistrement…' }
	if (save.kind === 'error' || save.kind === 'expired')
		return { kind: 'error', text: 'Pas enregistré : ta modification est toujours là' }
	if (openId !== null) return { kind: 'editing', text: 'Modification en cours' }
	if (save.kind === 'saved') return { kind: 'saved', text: 'Enregistré à l’instant' }
	return { kind: 'resting', text: '' }
}
