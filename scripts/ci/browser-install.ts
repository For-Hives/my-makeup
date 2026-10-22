/**
 * Installs the browser of the end-to-end tests and the system libraries it needs, in the CI (ticket 312).
 *
 *   bun run browser:install
 *
 * Why not the bare `bunx playwright install --with-deps chromium`: on 22/10/2026 the Ubuntu mirror of the runner stalled
 * on one package of the browser, for 7 minutes with no byte, and two shards of five spent their 10 minutes there and were
 * cancelled before any test. The install lasts 25 seconds when it works: an attempt that lasts 150 seconds is cut, with
 * its whole process group (`apt` included), and made again, three times at most. The packages already fetched are kept
 * by apt. When the third attempt fails too, the command fails: it is never a step that passes without a browser.
 */

export const ATTEMPTS = 3
export const ATTEMPT_LIMIT_SECONDS = 150
export const KILL_AFTER_SECONDS = 10

/** What runs one attempt, and says whether it ended in time and well. */
export type Attempt = (limitSeconds: number) => Promise<boolean>

/** The command of one attempt: `timeout` cuts the whole group of the install, not only its first process. */
export const attemptCommand = (limitSeconds: number): string[] => [
	'timeout',
	`--kill-after=${KILL_AFTER_SECONDS}`,
	String(limitSeconds),
	'bunx',
	'playwright',
	'install',
	'--with-deps',
	'chromium',
]

/** Tries until an attempt succeeds, `attempts` times at most. Gives the number of attempts it made, or 0 when none succeeded. */
export async function installWithRetries(
	attempt: Attempt,
	{ attempts = ATTEMPTS, limitSeconds = ATTEMPT_LIMIT_SECONDS, say = console.log } = {}
): Promise<number> {
	for (let number = 1; number <= attempts; number += 1) {
		if (await attempt(limitSeconds)) return number
		say(`The install of the browser did not end in time (attempt ${number} of ${attempts}).`)
	}
	return 0
}

if (import.meta.main) {
	const made = await installWithRetries(async limit => {
		const child = Bun.spawn(attemptCommand(limit), { stdio: ['inherit', 'inherit', 'inherit'] })
		return (await child.exited) === 0
	})
	process.exit(made > 0 ? 0 : 1)
}
