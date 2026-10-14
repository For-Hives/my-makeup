/**
 * Next calls `register` once when a server starts (`next dev`, `next start`, the standalone
 * server), before it answers its first request.
 *
 * The application stops there when its environment is not valid: a missing or short secret must
 * not wait for the first visit of the admin panel to be noticed.
 */
export async function register(): Promise<void> {
	// Written as a positive test on purpose: Next compiles this file for the Edge runtime as well,
	// and drops this block there. The check itself lives in a file only Node.js loads.
	if (process.env.NEXT_RUNTIME === 'nodejs') {
		const { stopOnInvalidEnv } = await import('./instrumentation-node')
		stopOnInvalidEnv()
	}
}
