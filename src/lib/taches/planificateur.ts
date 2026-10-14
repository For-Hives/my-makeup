/**
 * Starts the daily tasks on the server (ticket 077): a first run a few minutes after the start,
 * then one every 24 hours. The timer never keeps the process alive, and a run that is still going
 * when the next one is due is not doubled.
 *
 * It is started by `src/instrumentation-node.ts` on a running server only: never by a build, the
 * Payload CLI, a script or a test, which load the configuration without serving anything.
 *
 * The runner is passed in, so that this file knows neither Payload nor the database.
 */

export const DELAI_AVANT_LA_PREMIERE_EXECUTION_MS = 5 * 60 * 1000
export const INTERVALLE_ENTRE_EXECUTIONS_MS = 24 * 60 * 60 * 1000

export interface OptionsDuPlanificateur {
	lancer: () => Promise<unknown>
	delaiInitialMs?: number
	intervalleMs?: number
}

/** Starts the schedule; gives the function that stops it. */
export function demarrerLesTachesQuotidiennes({
	lancer,
	delaiInitialMs = DELAI_AVANT_LA_PREMIERE_EXECUTION_MS,
	intervalleMs = INTERVALLE_ENTRE_EXECUTIONS_MS,
}: OptionsDuPlanificateur): () => void {
	let enCours = false
	const executer = () => {
		if (enCours) return
		enCours = true
		lancer()
			.catch(() => undefined)
			.finally(() => {
				enCours = false
			})
	}
	let repetition: ReturnType<typeof setInterval> | undefined
	const premier = setTimeout(() => {
		executer()
		repetition = setInterval(executer, intervalleMs)
		repetition.unref()
	}, delaiInitialMs)
	premier.unref()
	return () => {
		clearTimeout(premier)
		if (repetition) clearInterval(repetition)
	}
}
