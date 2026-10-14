import { EnvError, serverEnv } from './lib/env'

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
