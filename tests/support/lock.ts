/**
 * A lock between the test processes of one run (Playwright starts one process per worker, and they
 * share the one bench): `await sousVerrou('nom', async () => { … })` runs the work alone. A process that
 * finds the lock taken waits for it. A lock older than `AGE_MAX_MS` is a crashed process's and is taken
 * over. It is a folder, which the system creates in one step or refuses.
 */

import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const AGE_MAX_MS = 3 * 60_000
const WAITING_MAX_MS = 5 * 60_000

const lockFolder = (nom: string): string =>
	join(tmpdir(), `my-makeup-verrou-${nom}-${(process.env.DATABASE_URI ?? '').replace(/[^a-z0-9]+/gi, '-')}`)

export async function underLock<T>(nom: string, travail: () => Promise<T>): Promise<T> {
	const folder = lockFolder(nom)
	const limit = Date.now() + WAITING_MAX_MS
	for (;;) {
		try {
			mkdirSync(folder)
			break
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
			try {
				if (Date.now() - statSync(folder).mtimeMs > AGE_MAX_MS) rmSync(folder, { recursive: true, force: true })
			} catch {
				// Released between the two calls: take it again.
			}
			if (Date.now() > limit) throw new Error(`Le verrou « ${nom} » reste pris depuis plus de 5 minutes.`)
			await new Promise(fin => setTimeout(fin, 250))
		}
	}
	try {
		return await travail()
	} finally {
		rmSync(folder, { recursive: true, force: true })
	}
}

/**
 * Counts the workers of one run that use a shared set of data: `await usagers('nom', +1)` when one starts,
 * `await usagers('nom', -1)` when it ends, and the answer is how many are left. The worker that
 * ends last (the answer is 0) is the one that may clear the data away: the others still read them.
 * The count belongs to one run: it is kept under the process that started the workers (their parent), so
 * that the count of a run that crashed never reaches the next one.
 */
export async function users(nom: string, variation: 1 | -1): Promise<number> {
	return underLock(`usagers-${nom}-${process.ppid}`, async () => {
		const file = join(
			tmpdir(),
			`my-makeup-usagers-${nom}-${process.ppid}-${(process.env.DATABASE_URI ?? '').replace(/[^a-z0-9]+/gi, '-')}`
		)
		let current = 0
		try {
			current = Number(readFileSync(file, 'utf8')) || 0
		} catch {
			// First worker of the run: nobody uses the data yet.
		}
		const rest = Math.max(current + variation, 0)
		if (rest === 0) rmSync(file, { force: true })
		else writeFileSync(file, String(rest))
		return rest
	})
}
