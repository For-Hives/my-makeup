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
const ATTENTE_MAX_MS = 5 * 60_000

const dossierDuVerrou = (nom: string): string =>
	join(tmpdir(), `my-makeup-verrou-${nom}-${(process.env.DATABASE_URI ?? '').replace(/[^a-z0-9]+/gi, '-')}`)

export async function sousVerrou<T>(nom: string, travail: () => Promise<T>): Promise<T> {
	const dossier = dossierDuVerrou(nom)
	const limite = Date.now() + ATTENTE_MAX_MS
	for (;;) {
		try {
			mkdirSync(dossier)
			break
		} catch (erreur) {
			if ((erreur as NodeJS.ErrnoException).code !== 'EEXIST') throw erreur
			try {
				if (Date.now() - statSync(dossier).mtimeMs > AGE_MAX_MS) rmSync(dossier, { recursive: true, force: true })
			} catch {
				// Released between the two calls: take it again.
			}
			if (Date.now() > limite) throw new Error(`Le verrou « ${nom} » reste pris depuis plus de 5 minutes.`)
			await new Promise(fin => setTimeout(fin, 250))
		}
	}
	try {
		return await travail()
	} finally {
		rmSync(dossier, { recursive: true, force: true })
	}
}

/**
 * Counts the workers of one run that use a shared set of data: `await usagers('nom', +1)` when one starts,
 * `await usagers('nom', -1)` when it ends, and the answer is how many are left. The worker that
 * ends last (the answer is 0) is the one that may clear the data away: the others still read them.
 * The count belongs to one run: it is kept under the process that started the workers (their parent), so
 * that the count of a run that crashed never reaches the next one.
 */
export async function usagers(nom: string, variation: 1 | -1): Promise<number> {
	return sousVerrou(`usagers-${nom}-${process.ppid}`, async () => {
		const fichier = join(
			tmpdir(),
			`my-makeup-usagers-${nom}-${process.ppid}-${(process.env.DATABASE_URI ?? '').replace(/[^a-z0-9]+/gi, '-')}`
		)
		let courant = 0
		try {
			courant = Number(readFileSync(fichier, 'utf8')) || 0
		} catch {
			// First worker of the run: nobody uses the data yet.
		}
		const reste = Math.max(courant + variation, 0)
		if (reste === 0) rmSync(fichier, { force: true })
		else writeFileSync(fichier, String(reste))
		return reste
	})
}
