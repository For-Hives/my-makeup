/**
 * The rules of the operating procedure that creates an account of the admin panel
 * (`bun run admin:creer`, README « Créer un compte admin »). Pure, so that a test plays them.
 *
 * The password never travels in an argument, in the environment or in a pipe: it is typed at the
 * keyboard (`scripts/admin/clavier.ts`), twice. Nothing printed holds an email or a password.
 */

import { ROLES_ADMIN, type RoleAdmin } from '../../src/lib/acces'

/** The command does not go on: the message says why, never a value typed by the person. */
export class CreationRefusee extends Error {
	override readonly name = 'CreationRefusee'
}

/** The flag that lets the command write into a database that is not on this machine. */
export const DRAPEAU_CIBLE_DISTANTE = '--cible-distante'

/** The shortest password of an admin account. No rule of composition: length is what counts. */
export const LONGUEUR_MINIMALE_DU_MOT_DE_PASSE = 12

/** The longest, so that a pasted file is not hashed. */
export const LONGUEUR_MAXIMALE_DU_MOT_DE_PASSE = 200

export const USAGE = [
	'Usage : bun run admin:creer <email> [--role=admin|editor] [--cible-distante]',
	'',
	'  <email>             l’adresse du compte, en argument (ce n’est pas un secret)',
	'  --role=…            admin (par défaut) ou editor (la rédaction)',
	`  ${DRAPEAU_CIBLE_DISTANTE}   écrire dans une base qui n’est pas sur ce poste (DATABASE_URI)`,
	'',
	'Le mot de passe se tape au clavier, deux fois, sans s’afficher. Il n’existe aucune option pour le donner.',
].join('\n')

export interface Demande {
	email: string
	role: RoleAdmin
	cibleDistante: boolean
}

const MOTIF_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const estUnRole = (valeur: string): valeur is RoleAdmin => (ROLES_ADMIN as readonly string[]).includes(valeur)

/**
 * The request from the command line, or `undefined` when it is not understood: no email or two,
 * an unknown role or option. An option that looks like a way to give the password is refused by name
 * before anything is read, so that nobody believes it works.
 */
export function lireLesArguments(argv: string[]): Demande | undefined {
	let email: string | undefined
	let role: RoleAdmin = 'admin'
	let cibleDistante = false
	for (const argument of argv) {
		if (argument === DRAPEAU_CIBLE_DISTANTE) cibleDistante = true
		else if (argument.startsWith('--role=')) {
			const valeur = argument.slice('--role='.length)
			if (!estUnRole(valeur)) return undefined
			role = valeur
		} else if (argument.startsWith('-') || email !== undefined) return undefined
		else email = argument
	}
	if (email === undefined) return undefined
	const normalise = email.trim().toLowerCase()
	return MOTIF_EMAIL.test(normalise) ? { email: normalise, role, cibleDistante } : undefined
}

/** Why this password is refused, or nothing when it is accepted. Never echoes the password. */
export function refusDuMotDePasse(motDePasse: string): string | undefined {
	if (motDePasse.length < LONGUEUR_MINIMALE_DU_MOT_DE_PASSE)
		return `Le mot de passe compte moins de ${LONGUEUR_MINIMALE_DU_MOT_DE_PASSE} caractères.`
	if (motDePasse.length > LONGUEUR_MAXIMALE_DU_MOT_DE_PASSE)
		return `Le mot de passe compte plus de ${LONGUEUR_MAXIMALE_DU_MOT_DE_PASSE} caractères.`
	if (motDePasse.trim() !== motDePasse) return 'Le mot de passe commence ou finit par une espace.'
	return undefined
}

/** What the command asks of an account collection: the Local API, nothing else. */
export interface Comptes {
	existe(email: string): Promise<boolean>
	creer(donnees: { email: string; password: string; role: RoleAdmin }): Promise<{ id: number }>
}

/**
 * Creates the account. Refuses an address that already has one, and a password that is too short
 * or typed differently the second time. The message never carries the email or the password.
 */
export async function creerLeCompte(
	comptes: Comptes,
	{ email, role }: Pick<Demande, 'email' | 'role'>,
	motDePasse: string,
	confirmation: string
): Promise<{ id: number; role: RoleAdmin }> {
	const refus = refusDuMotDePasse(motDePasse)
	if (refus) throw new CreationRefusee(`${refus} Rien n’est écrit.`)
	if (motDePasse !== confirmation)
		throw new CreationRefusee('Les deux saisies du mot de passe diffèrent. Rien n’est écrit.')
	if (await comptes.existe(email))
		throw new CreationRefusee('Un compte admin porte déjà cette adresse. Rien n’est écrit.')
	const { id } = await comptes.creer({ email, password: motDePasse, role })
	return { id, role }
}
