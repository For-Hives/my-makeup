/**
 * The send log of the mail to the members (issue 998): a file, outside of the database, with one line for each
 * step of each account: `{"profile":12,"status":"attempt","at":"…"}`, then `sent` or `failed`. It holds a profile
 * number and a date, never an address or a name.
 *
 * - **At most once.** The `attempt` line is written and synced to disk BEFORE the door is called. A crash
 *   between the two leaves an `attempt` with no outcome: that account is skipped from then on, because we do
 *   not know whether the mail left. Missing one mail is repaired by hand; writing twice to one person is not.
 * - **A failure is not retried by itself.** Every number in the file is skipped by the next pass.
 * - **One pass at a time.** A lock file (`<log>.lock`, created exclusively) refuses a second pass; `close`
 *   removes it. After a crash, the lock stays: look at the log, then delete the lock.
 * - **A stop file.** Creating `<log>.stop` ends the pass before the next mail.
 *
 * Only Node's own modules.
 */

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs'
import path from 'node:path'

/** The log cannot be used: the message says why, never a line of the file. */
export class SendLogRefused extends Error {
	override readonly name = 'SendLogRefused'
}

export type Outcome = 'sent' | 'failed'

export interface SendLog {
	/** Every profile with a line in the log, whatever its outcome. */
	handled(): ReadonlySet<number>
	/** Writes the `attempt` line and syncs it to disk. Call before the door. */
	begin(profileId: number): void
	finish(profileId: number, outcome: Outcome): void
	/** True when `<log>.stop` exists. */
	stopRequested(): boolean
	/** Releases the lock. */
	close(): void
}

const STATUSES = new Set(['attempt', 'sent', 'failed'])

function readHandled(file: string): Set<number> {
	const handled = new Set<number>()
	if (!existsSync(file)) return handled
	const lines = readFileSync(file, 'utf8').split('\n')
	lines.forEach((line, index) => {
		if (line.trim() === '') return
		let entry: unknown
		try {
			entry = JSON.parse(line)
		} catch {
			throw new SendLogRefused(
				`Le journal d’envoi n’est pas lisible à la ligne ${index + 1}. Rien n’est envoyé ; la ligne n’est pas recopiée ici.`
			)
		}
		const profile = (entry as { profile?: unknown } | null)?.profile
		const status = (entry as { status?: unknown } | null)?.status
		if (
			typeof profile !== 'number' ||
			!Number.isSafeInteger(profile) ||
			typeof status !== 'string' ||
			!STATUSES.has(status)
		)
			throw new SendLogRefused(
				`Le journal d’envoi n’a pas la forme attendue à la ligne ${index + 1}. Rien n’est envoyé ; la ligne n’est pas recopiée ici.`
			)
		handled.add(profile)
	})
	return handled
}

export function openSendLog(file: string): SendLog {
	const log = path.resolve(file)
	const lock = `${log}.lock`
	const stop = `${log}.stop`
	mkdirSync(path.dirname(log), { recursive: true })
	let lockFd: number
	try {
		lockFd = openSync(lock, 'wx')
	} catch {
		throw new SendLogRefused(
			'Le journal d’envoi est déjà pris (fichier .lock) : une autre passe tourne, ou une passe précédente s’est arrêtée brutalement. Vérifie le journal, puis supprime le fichier .lock. Rien n’est envoyé.'
		)
	}
	const release = (): void => {
		closeSync(lockFd)
		try {
			unlinkSync(lock)
		} catch {
			// Already gone.
		}
	}
	let handled: Set<number>
	let fd: number
	try {
		handled = readHandled(log)
		fd = openSync(log, 'a')
	} catch (error) {
		release()
		if (error instanceof SendLogRefused) throw error
		throw new SendLogRefused('Le journal d’envoi ne peut pas être ouvert en écriture. Rien n’est envoyé.')
	}
	let closed = false
	const write = (profileId: number, status: 'attempt' | Outcome): void => {
		writeSync(fd, `${JSON.stringify({ profile: profileId, status, at: new Date().toISOString() })}\n`)
		fsyncSync(fd)
	}
	return {
		handled: () => handled,
		begin(profileId) {
			write(profileId, 'attempt')
			handled.add(profileId)
		},
		finish: (profileId, outcome) => write(profileId, outcome),
		stopRequested: () => existsSync(stop),
		close() {
			if (closed) return
			closed = true
			closeSync(fd)
			release()
		},
	}
}
