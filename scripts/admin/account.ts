/**
 * The rules of the operating procedure that creates an account of the admin panel
 * (`bun run admin:create`, README « Créer un compte admin »). Pure, so that a test plays them.
 *
 * The password never travels in an argument, in the environment or in a pipe: it is typed at the
 * keyboard (`scripts/admin/keyboard.ts`), twice. Nothing printed holds an email or a password.
 */

import { ROLES_ADMIN, type RoleAdmin } from '../../src/lib/access'

/** The command does not go on: the message says why, never a value typed by the person. */
export class CreationRefused extends Error {
	override readonly name = 'CreationRefusee'
}

/** The flag that lets the command write into a database that is not on this machine. */
export const REMOTE_TARGET_FLAG = '--remote-target'

/** The shortest password of an admin account. No rule of composition: length is what counts. */
export const PASSWORD_MINIMUM_LENGTH = 12

/** The longest, so that a pasted file is not hashed. */
export const PASSWORD_MAXIMUM_LENGTH = 200

export const USAGE = [
	'Usage : bun run admin:create <email> [--role=admin|editor] [--remote-target]',
	'',
	'  <email>             l’adresse du compte, en argument (ce n’est pas un secret)',
	'  --role=…            admin (par défaut) ou editor (la rédaction)',
	`  ${REMOTE_TARGET_FLAG}   écrire dans une base qui n’est pas sur ce poste (DATABASE_URI)`,
	'',
	'Le mot de passe se tape au clavier, deux fois, sans s’afficher. Il n’existe aucune option pour le donner.',
].join('\n')

export interface CreationRequest {
	email: string
	role: RoleAdmin
	cibleDistante: boolean
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const isRole = (valeur: string): valeur is RoleAdmin => (ROLES_ADMIN as readonly string[]).includes(valeur)

/**
 * The request from the command line, or `undefined` when it is not understood: no email or two,
 * an unknown role or option. An option that looks like a way to give the password is refused by name
 * before anything is read, so that nobody believes it works.
 */
export function readArguments(argv: string[]): CreationRequest | undefined {
	let email: string | undefined
	let role: RoleAdmin = 'admin'
	let remoteTarget = false
	for (const argument of argv) {
		if (argument === REMOTE_TARGET_FLAG) remoteTarget = true
		else if (argument.startsWith('--role=')) {
			const value = argument.slice('--role='.length)
			if (!isRole(value)) return undefined
			role = value
		} else if (argument.startsWith('-') || email !== undefined) return undefined
		else email = argument
	}
	if (email === undefined) return undefined
	const normalized = email.trim().toLowerCase()
	return EMAIL_PATTERN.test(normalized) ? { email: normalized, role, cibleDistante: remoteTarget } : undefined
}

/** Why this password is refused, or nothing when it is accepted. Never echoes the password. */
export function passwordRefusal(motDePasse: string): string | undefined {
	if (motDePasse.length < PASSWORD_MINIMUM_LENGTH)
		return `Le mot de passe compte moins de ${PASSWORD_MINIMUM_LENGTH} caractères.`
	if (motDePasse.length > PASSWORD_MAXIMUM_LENGTH)
		return `Le mot de passe compte plus de ${PASSWORD_MAXIMUM_LENGTH} caractères.`
	if (motDePasse.trim() !== motDePasse) return 'Le mot de passe commence ou finit par une espace.'
	return undefined
}

/** What the command asks of an account collection: the Local API, nothing else. */
export interface Accounts {
	existe(email: string): Promise<boolean>
	creer(donnees: { email: string; password: string; role: RoleAdmin }): Promise<{ id: number }>
}

/**
 * Creates the account. Refuses an address that already has one, and a password that is too short
 * or typed differently the second time. The message never carries the email or the password.
 */
export async function createAccount(
	comptes: Accounts,
	{ email, role }: Pick<CreationRequest, 'email' | 'role'>,
	motDePasse: string,
	confirmation: string
): Promise<{ id: number; role: RoleAdmin }> {
	const refusal = passwordRefusal(motDePasse)
	if (refusal) throw new CreationRefused(`${refusal} Rien n’est écrit.`)
	if (motDePasse !== confirmation)
		throw new CreationRefused('Les deux saisies du mot de passe diffèrent. Rien n’est écrit.')
	if (await comptes.existe(email))
		throw new CreationRefused('Un compte admin porte déjà cette adresse. Rien n’est écrit.')
	const { id } = await comptes.creer({ email, password: motDePasse, role })
	return { id, role }
}
