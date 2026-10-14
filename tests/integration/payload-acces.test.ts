import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { viderLeCapteur } from '../outils/mailpit'
import { type Distribution, distribuer, jouer, type Ligne, nommer, VOIES } from '../outils/matrice-acces'
import { viderLaBase } from '../outils/payload-test'

/**
 * The access matrix (plan 01 §5 P3; docs/tests/banc.md, « La matrice d'accès »).
 *
 * Every access rule of a collection has its lines here: who acts, on what, and what must happen.
 * Each line is played twice, through REST and through the Local API with the rules active, and
 * gives one test per way in. A rule added without its lines is a rule nobody checks.
 */
const MATRICE: Ligne[] = [
	// admins (ticket 018): the role `admin` does everything; `redaction` reaches its own account
	// only, and never its role; nobody else reaches any account.
	{ role: 'anonyme', collection: 'admins', operation: 'lister', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'admins', operation: 'lire', document: 'admin', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'admins', operation: 'creer', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'admins', operation: 'modifier', document: 'admin', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'admins', operation: 'supprimer', document: 'admin', attendu: 'refuse' },
	{ role: 'redaction', collection: 'admins', operation: 'lister', attendu: 'soi' },
	{ role: 'redaction', collection: 'admins', operation: 'lire', document: 'redaction', attendu: 'autorise' },
	{ role: 'redaction', collection: 'admins', operation: 'lire', document: 'admin', attendu: 'refuse' },
	{ role: 'redaction', collection: 'admins', operation: 'creer', attendu: 'refuse' },
	{ role: 'redaction', collection: 'admins', operation: 'modifier', document: 'redaction', attendu: 'autorise' },
	{ role: 'redaction', collection: 'admins', operation: 'modifier', document: 'admin', attendu: 'refuse' },
	{
		role: 'redaction',
		collection: 'admins',
		operation: 'modifier',
		document: 'redaction',
		champ: 'role',
		valeur: 'admin',
		attendu: 'ignore',
	},
	{ role: 'redaction', collection: 'admins', operation: 'supprimer', document: 'redaction', attendu: 'refuse' },
	{ role: 'redaction', collection: 'admins', operation: 'supprimer', document: 'admin', attendu: 'refuse' },
	{ role: 'admin', collection: 'admins', operation: 'lister', attendu: 'tous' },
	{ role: 'admin', collection: 'admins', operation: 'lire', document: 'redaction', attendu: 'autorise' },
	{ role: 'admin', collection: 'admins', operation: 'creer', attendu: 'autorise' },
	{ role: 'admin', collection: 'admins', operation: 'modifier', document: 'redaction', attendu: 'autorise' },
	{
		role: 'admin',
		collection: 'admins',
		operation: 'modifier',
		document: 'redaction',
		champ: 'role',
		valeur: 'admin',
		attendu: 'autorise',
	},
	{ role: 'admin', collection: 'admins', operation: 'supprimer', document: 'redaction', attendu: 'autorise' },
	// A makeup artist reaches no account of the admin panel (ticket 019).
	{ role: 'maquilleuse', collection: 'admins', operation: 'lister', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'admins', operation: 'lire', document: 'admin', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'admins', operation: 'creer', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'admins', operation: 'modifier', document: 'admin', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'admins', operation: 'supprimer', document: 'admin', attendu: 'refuse' },

	// pros (ticket 019): a makeup artist reads and changes her own account only (U57, I06), never
	// its reserved fields; `admin` reaches every account; nobody else reaches any.
	{ role: 'anonyme', collection: 'pros', operation: 'lister', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'pros', operation: 'lire', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'pros', operation: 'creer', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'pros', operation: 'modifier', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'pros', operation: 'supprimer', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'pros', operation: 'lister', attendu: 'soi' },
	{ role: 'maquilleuse', collection: 'pros', operation: 'lire', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'maquilleuse', collection: 'pros', operation: 'lire', document: 'autreMaquilleuse', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'pros', operation: 'creer', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'pros', operation: 'modifier', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'maquilleuse', collection: 'pros', operation: 'modifier', document: 'autreMaquilleuse', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'pros', operation: 'supprimer', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'pros', operation: 'supprimer', document: 'autreMaquilleuse', attendu: 'refuse' },
	...(
		[
			['bloque', true],
			['_verified', false],
			['legacyProvider', 'facebook'],
			['strapiId', 999],
		] as const
	).map(
		([champ, valeur]): Ligne => ({
			role: 'maquilleuse',
			collection: 'pros',
			operation: 'modifier',
			document: 'maquilleuse',
			champ,
			valeur,
			attendu: 'ignore',
		})
	),
	{ role: 'autreMaquilleuse', collection: 'pros', operation: 'lister', attendu: 'soi' },
	{ role: 'autreMaquilleuse', collection: 'pros', operation: 'lire', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'autreMaquilleuse', collection: 'pros', operation: 'modifier', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'redaction', collection: 'pros', operation: 'lister', attendu: 'refuse' },
	{ role: 'redaction', collection: 'pros', operation: 'lire', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'redaction', collection: 'pros', operation: 'creer', attendu: 'refuse' },
	{ role: 'redaction', collection: 'pros', operation: 'modifier', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'redaction', collection: 'pros', operation: 'supprimer', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'admin', collection: 'pros', operation: 'lister', attendu: 'tous' },
	{ role: 'admin', collection: 'pros', operation: 'lire', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'admin', collection: 'pros', operation: 'creer', attendu: 'autorise' },
	{ role: 'admin', collection: 'pros', operation: 'modifier', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'admin', collection: 'pros', operation: 'supprimer', document: 'maquilleuse', attendu: 'autorise' },
	...(
		[
			['bloque', true, 'autorise'],
			['_verified', false, 'autorise'],
			['legacyProvider', 'facebook', 'ignore'],
			['strapiId', 999, 'ignore'],
		] as const
	).map(
		([champ, valeur, attendu]): Ligne => ({
			role: 'admin',
			collection: 'pros',
			operation: 'modifier',
			document: 'maquilleuse',
			champ,
			valeur,
			attendu,
		})
	),
	{ role: 'sansProfil', collection: 'pros', operation: 'lister', attendu: 'soi' },

	// profils (ticket 020): a makeup artist reads and changes her own profile only (U54, I02),
	// never its account, its slug or what the import wrote; an account without a profile gets an
	// empty list and a refusal on any write; `admin` reaches every profile; nobody else, any yet.
	{ role: 'anonyme', collection: 'profils', operation: 'lister', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'profils', operation: 'lire', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'profils', operation: 'creer', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'profils', operation: 'modifier', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'anonyme', collection: 'profils', operation: 'supprimer', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'profils', operation: 'lister', attendu: 'soi' },
	{ role: 'maquilleuse', collection: 'profils', operation: 'lire', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'maquilleuse', collection: 'profils', operation: 'lire', document: 'autreMaquilleuse', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'profils', operation: 'creer', attendu: 'refuse' },
	{ role: 'maquilleuse', collection: 'profils', operation: 'modifier', document: 'maquilleuse', attendu: 'autorise' },
	{
		role: 'maquilleuse',
		collection: 'profils',
		operation: 'modifier',
		document: 'autreMaquilleuse',
		attendu: 'refuse',
	},
	{ role: 'maquilleuse', collection: 'profils', operation: 'supprimer', document: 'maquilleuse', attendu: 'refuse' },
	{
		role: 'maquilleuse',
		collection: 'profils',
		operation: 'supprimer',
		document: 'autreMaquilleuse',
		attendu: 'refuse',
	},
	...(
		[
			['slug', 'une-autre-adresse'],
			['strapiId', 999],
			['legacyUsername', 'Ancien Pseudo'],
			['pro', { compteDe: 'sansProfil' }],
		] as const
	).map(
		([champ, valeur]): Ligne => ({
			role: 'maquilleuse',
			collection: 'profils',
			operation: 'modifier',
			document: 'maquilleuse',
			champ,
			valeur,
			attendu: 'ignore',
		})
	),
	{ role: 'autreMaquilleuse', collection: 'profils', operation: 'lister', attendu: 'soi' },
	{ role: 'autreMaquilleuse', collection: 'profils', operation: 'lire', document: 'maquilleuse', attendu: 'refuse' },
	{
		role: 'autreMaquilleuse',
		collection: 'profils',
		operation: 'modifier',
		document: 'maquilleuse',
		attendu: 'refuse',
	},
	{
		role: 'autreMaquilleuse',
		collection: 'profils',
		operation: 'supprimer',
		document: 'maquilleuse',
		attendu: 'refuse',
	},
	{ role: 'sansProfil', collection: 'profils', operation: 'lister', attendu: 'aucun' },
	{ role: 'sansProfil', collection: 'profils', operation: 'lire', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'sansProfil', collection: 'profils', operation: 'creer', attendu: 'refuse' },
	{ role: 'sansProfil', collection: 'profils', operation: 'modifier', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'sansProfil', collection: 'profils', operation: 'supprimer', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'redaction', collection: 'profils', operation: 'lister', attendu: 'refuse' },
	{ role: 'redaction', collection: 'profils', operation: 'lire', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'redaction', collection: 'profils', operation: 'creer', attendu: 'refuse' },
	{ role: 'redaction', collection: 'profils', operation: 'modifier', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'redaction', collection: 'profils', operation: 'supprimer', document: 'maquilleuse', attendu: 'refuse' },
	{ role: 'admin', collection: 'profils', operation: 'lister', attendu: 'tous' },
	{ role: 'admin', collection: 'profils', operation: 'lire', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'admin', collection: 'profils', operation: 'creer', attendu: 'autorise' },
	{ role: 'admin', collection: 'profils', operation: 'modifier', document: 'maquilleuse', attendu: 'autorise' },
	{ role: 'admin', collection: 'profils', operation: 'supprimer', document: 'maquilleuse', attendu: 'autorise' },
	...(
		[
			['slug', 'une-autre-adresse', 'ignore'],
			['strapiId', 999, 'ignore'],
			['legacyUsername', 'Ancien Pseudo', 'ignore'],
			['pro', { compteDe: 'sansProfil' }, 'autorise'],
		] as const
	).map(
		([champ, valeur, attendu]): Ligne => ({
			role: 'admin',
			collection: 'profils',
			operation: 'modifier',
			document: 'maquilleuse',
			champ,
			valeur,
			attendu,
		})
	),

	// talents (ticket 022): the newsroom (`redaction` and `admin`) creates, changes, publishes,
	// unpublishes and deletes, and reads drafts too; everyone else, a makeup artist as an anonymous
	// visitor, reads the published talents only and writes nothing (U59). Nobody writes `strapiId`.
	...(['anonyme', 'maquilleuse', 'autreMaquilleuse', 'sansProfil'] as const).flatMap((role): Ligne[] => [
		{ role, collection: 'talents', operation: 'lister', attendu: 'publies' },
		{ role, collection: 'talents', operation: 'lire', document: 'publie', attendu: 'autorise' },
		{ role, collection: 'talents', operation: 'lire', document: 'brouillon', attendu: 'refuse' },
		{ role, collection: 'talents', operation: 'creer', attendu: 'refuse' },
		{ role, collection: 'talents', operation: 'modifier', document: 'publie', attendu: 'refuse' },
		{
			role,
			collection: 'talents',
			operation: 'modifier',
			document: 'brouillon',
			champ: '_status',
			valeur: 'published',
			attendu: 'refuse',
		},
		{ role, collection: 'talents', operation: 'supprimer', document: 'publie', attendu: 'refuse' },
		{ role, collection: 'talents', operation: 'supprimer', document: 'brouillon', attendu: 'refuse' },
	]),
	...(['redaction', 'admin'] as const).flatMap((role): Ligne[] => [
		{ role, collection: 'talents', operation: 'lister', attendu: 'tous' },
		{ role, collection: 'talents', operation: 'lire', document: 'publie', attendu: 'autorise' },
		{ role, collection: 'talents', operation: 'lire', document: 'brouillon', attendu: 'autorise' },
		// Created published: created and published in one request.
		{ role, collection: 'talents', operation: 'creer', attendu: 'autorise' },
		{ role, collection: 'talents', operation: 'modifier', document: 'publie', attendu: 'autorise' },
		{ role, collection: 'talents', operation: 'modifier', document: 'brouillon', attendu: 'autorise' },
		{
			role,
			collection: 'talents',
			operation: 'modifier',
			document: 'brouillon',
			champ: '_status',
			valeur: 'published',
			attendu: 'autorise',
		},
		{
			role,
			collection: 'talents',
			operation: 'modifier',
			document: 'publie',
			champ: '_status',
			valeur: 'draft',
			attendu: 'autorise',
		},
		{
			role,
			collection: 'talents',
			operation: 'modifier',
			document: 'publie',
			champ: 'slug',
			valeur: 'une-autre-adresse',
			attendu: 'autorise',
		},
		{
			role,
			collection: 'talents',
			operation: 'modifier',
			document: 'publie',
			champ: 'strapiId',
			valeur: 999,
			attendu: 'ignore',
		},
		{ role, collection: 'talents', operation: 'supprimer', document: 'publie', attendu: 'autorise' },
	]),
]

let distribution: Distribution

beforeAll(async () => {
	distribution = await distribuer()
})

// An account an admin creates through REST gets Payload's confirmation email: the mail catcher is emptied too.
afterAll(async () => {
	await Promise.all([viderLaBase(), viderLeCapteur()])
})

describe('La matrice d’accès, par l’API REST et par l’API locale avec les règles actives', () => {
	for (const ligne of MATRICE)
		for (const voie of VOIES)
			test(nommer(ligne, voie), async () => {
				expect(await jouer(ligne, voie, distribution)).toBe(ligne.attendu)
			})
})
