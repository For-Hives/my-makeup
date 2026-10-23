/**
 * The command line of `bun run members:mail` and the gates of the real send (issue 998). Pure, so that a test
 * plays every combination.
 *
 * By default the command draws up a list and writes a report: nothing leaves. A mail leaves only when all
 * the gates are shut together:
 *
 *   1. `--send` on the command line;
 *   2. `MEMBERS_MAIL_SEND` exactly « on » in the environment;
 *   3. a cap per pass, `--limit` (50 by default, 500 at most);
 *   4. a send log, `--send-log <file>`: one mail per account, ever.
 *
 * `--send` with one of the others missing is refused, with the reason and nothing sent. The variable or the
 * log without `--send` change nothing: it is a list.
 */

import path from 'node:path'

/** The command does not go on: the message says why, never a value. */
export class MembersMailRefused extends Error {
	override readonly name = 'MembersMailRefused'
}

export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 500
export const DEFAULT_REPORT = '.members-mail/report.json'

export const USAGE = [
	'Usage : bun run members:mail [options]',
	'',
	'Sans option : une liste à blanc. Rien n’est envoyé ; un rapport (des nombres et des numéros de profil) est écrit.',
	'',
	`  --report <fichier>        où écrire le rapport (${DEFAULT_REPORT})`,
	'  --send-log <fichier>      le journal d’envoi : un courriel par compte, une seule fois. Lu pour la liste, requis pour envoyer',
	`  --send                    envoyer pour de bon (exige aussi MEMBERS_MAIL_SEND=on, --send-log et un plafond)`,
	`  --limit <n>               le plafond de courriels de cette passe (${DEFAULT_LIMIT} par défaut, ${MAX_LIMIT} au plus)`,
	'  --bench-sample            écrit UN courriel d’exemple dans la sonde de courrier du banc (jamais en production)',
	'  --remote-target           accepte une base qui n’est pas sur ce poste (exige --expected-database)',
	'  --expected-database <nom> le nom que la base doit donner (current_database())',
].join('\n')

export interface MembersMailArguments {
	send: boolean
	sendLog?: string
	limit: number
	report: string
	benchSample: boolean
	remoteTarget: boolean
	expectedDatabase?: string
}

/** The arguments, or `undefined` when they are not understood. Paths are made absolute here. */
export function readArguments(argv: readonly string[]): MembersMailArguments | undefined {
	const args: MembersMailArguments = {
		send: false,
		limit: DEFAULT_LIMIT,
		report: path.resolve(DEFAULT_REPORT),
		benchSample: false,
		remoteTarget: false,
	}
	for (let i = 0; i < argv.length; i++) {
		const option = argv[i] ?? ''
		const next = (): string | undefined => {
			const value = argv[++i]
			return value === undefined || value === '' || value.startsWith('--') ? undefined : value
		}
		if (option === '--send') args.send = true
		else if (option === '--bench-sample') args.benchSample = true
		else if (option === '--remote-target') args.remoteTarget = true
		else if (option === '--send-log') {
			const value = next()
			if (value === undefined) return undefined
			args.sendLog = path.resolve(value)
		} else if (option === '--report') {
			const value = next()
			if (value === undefined) return undefined
			args.report = path.resolve(value)
		} else if (option === '--expected-database') {
			const value = next()
			if (value === undefined) return undefined
			args.expectedDatabase = value
		} else if (option === '--limit') {
			const value = next()
			if (value === undefined || !/^[1-9]\d{0,5}$/.test(value)) return undefined
			const limit = Number(value)
			if (limit > MAX_LIMIT) return undefined
			args.limit = limit
		} else return undefined
	}
	return args
}

export type SendPermission = { send: false } | { send: true; limit: number; sendLog: string }

/** Whether this run may send. Throws `MembersMailRefused` when `--send` is given without the other gates. */
export function sendPermission(
	args: MembersMailArguments,
	env: Readonly<Record<string, string | undefined>>
): SendPermission {
	if (!args.send) return { send: false }
	if (env.MEMBERS_MAIL_SEND !== 'on')
		throw new MembersMailRefused(
			'--send exige MEMBERS_MAIL_SEND=on dans l’environnement (exactement « on »). Rien n’est envoyé.'
		)
	if (args.sendLog === undefined)
		throw new MembersMailRefused('--send exige --send-log <fichier>, le journal d’envoi. Rien n’est envoyé.')
	return { send: true, limit: args.limit, sendLog: args.sendLog }
}
