import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
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
]

let distribution: Distribution

beforeAll(async () => {
	distribution = await distribuer()
})

afterAll(viderLaBase)

describe('La matrice d’accès, par l’API REST et par l’API locale avec les règles actives', () => {
	for (const ligne of MATRICE)
		for (const voie of VOIES)
			test(nommer(ligne, voie), async () => {
				expect(await jouer(ligne, voie, distribution)).toBe(ligne.attendu)
			})
})
