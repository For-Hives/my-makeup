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

export const FIRST_RUN_DELAY_MS = 5 * 60 * 1000
export const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000

export interface SchedulerOptions {
	lancer: () => Promise<unknown>
	delaiInitialMs?: number
	intervalleMs?: number
}

/** Starts the schedule; gives the function that stops it. */
export function scheduleDailyTasks({
	lancer,
	delaiInitialMs = FIRST_RUN_DELAY_MS,
	intervalleMs = RUN_INTERVAL_MS,
}: SchedulerOptions): () => void {
	let running = false
	const run = () => {
		if (running) return
		running = true
		lancer()
			.catch(() => undefined)
			.finally(() => {
				running = false
			})
	}
	let repeat: ReturnType<typeof setInterval> | undefined
	const first = setTimeout(() => {
		run()
		repeat = setInterval(run, intervalleMs)
		repeat.unref()
	}, delaiInitialMs)
	first.unref()
	return () => {
		clearTimeout(first)
		if (repeat) clearInterval(repeat)
	}
}
