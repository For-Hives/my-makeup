import { EnvError, serverEnv } from './lib/env'
import { demarrerLesTachesQuotidiennes } from './lib/taches/planificateur'
import { lancerLesTachesQuotidiennes } from './lib/taches/quotidiennes'

/**
 * Ends the process when the environment is not valid. Loaded by src/instrumentation.ts on the
 * Node.js server only.
 *
 * `next build` is not stopped: `serverEnv` checks nothing while Next builds.
 */
export function stopOnInvalidEnv(): void {
	try {
		serverEnv()
	} catch (error) {
		if (!(error instanceof EnvError)) throw error
		// The message names the variables, never their values. No stack trace: it would say nothing more.
		console.error(error.message)
		process.exit(1)
	}
}

/**
 * Starts the daily tasks (ticket 077) on a server that serves: the purges that keep a retention
 * promise. Not while Next builds, and not in `next dev`, where the database is not the one to
 * purge. Payload starts only when the first run is due, never at the start of the server.
 */
export function startDailyTasks(): void {
	if (process.env.NEXT_PHASE === 'phase-production-build' || process.env.NODE_ENV !== 'production') return
	demarrerLesTachesQuotidiennes({
		lancer: async () => {
			const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('./payload.config')])
			await lancerLesTachesQuotidiennes(await getPayload({ config }))
		},
	})
}
