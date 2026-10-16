import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { ImportRefuse } from '../../scripts/migration/import/cible'
import type { ImportEnv } from '../../src/lib/env'
import {
	type EnvDeLImport,
	exigerLeSite,
	exigerUneSourceAUtreQueLaCible,
	importALaDemande,
	lieuDuProcessus,
	lireLesJetons,
	MARQUE_DES_JETONS,
	reserverLeJeton,
} from '../../src/migration/import-a-la-demande'

/**
 * Ticket 233: what the import run on demand refuses and remembers, with no database. The passes
 * themselves, on the bench with the fake Strapi source, are in tests/integration/import-a-la-demande.test.ts.
 */

const CIBLE = 'postgres://app:mot-de-passe-factice@payload.interne.example.test:5432/mymakeup'
const SOURCE = 'postgres://lecture_strapi:mot-de-passe-factice@strapi.interne.example.test:5432/mymakeup'
const STOCKAGE = {
	endpoint: 'https://stockage.example.test',
	bucket: 'photos-factices',
	accessKeyId: 'x',
	secretAccessKey: 'y',
	local: false,
}
const DEMANDE: ImportEnv = { jeton: '2026-11-05-passage-a', mode: 'a-blanc', cibleEnService: false }
const ENV: EnvDeLImport = { databaseUri: CIBLE, importation: DEMANDE, sourceStrapi: SOURCE, storage: STOCKAGE }

/** A Payload that fails the test when anything reads from it: no token, no refusal reads the database. */
const payloadInterdit = new Proxy(
	{},
	{
		get: () => {
			throw new Error('la base ne devait pas être lue')
		},
	}
) as unknown as Payload

/** The comment of the schema `public`, the pool of `pg` just enough for `reserverLeJeton`. */
function fausseBase(commentaire: string | null = 'standard public schema') {
	const etat = { commentaire, journal: [] as string[], connexions: 0, relachees: 0 }
	const pool = {
		async connect() {
			etat.connexions++
			return {
				async query(texte: string, parametres: unknown[] = []) {
					etat.journal.push(texte.split(' ').slice(0, 2).join(' '))
					if (texte.startsWith('SELECT obj_description')) {
						expect(parametres).toEqual(['public', 'pg_namespace'])
						return { rows: [{ marque: etat.commentaire }] }
					}
					const ecrit = /^COMMENT ON SCHEMA public IS '(.*)'$/s.exec(texte)
					if (ecrit) etat.commentaire = (ecrit[1] ?? '').replaceAll("''", "'")
					return { rows: [] }
				},
				release() {
					etat.relachees++
				},
			}
		},
	}
	return { etat, pool }
}

/** A Payload that has the tables of the v3 and a pool, to go past the schema check. */
function payloadAvecSchema(pool: object): Payload {
	return {
		db: {
			tableNameMap: new Map(),
			pool: { ...pool, query: async () => ({ rows: [] }) },
		},
	} as unknown as Payload
}

describe('où tourne le processus : le site, ou ailleurs', () => {
	const site = { NODE_ENV: 'production', APP_ENV: 'prod', NEXT_PUBLIC_SITE_URL: 'https://my-makeup.fr' }

	test('le site : production, APP_ENV=prod et l’adresse du site, ensemble', () => {
		expect(lieuDuProcessus(site)).toBe('site')
		expect(() => exigerLeSite('site')).not.toThrow()
	})

	test.each([
		['NODE_ENV absent', { ...site, NODE_ENV: undefined }],
		['NODE_ENV=development', { ...site, NODE_ENV: 'development' }],
		['APP_ENV absent', { ...site, APP_ENV: undefined }],
		['APP_ENV=test', { ...site, APP_ENV: 'test' }],
		['une autre adresse', { ...site, NEXT_PUBLIC_SITE_URL: 'https://v3.my-makeup.fr' }],
		['l’adresse du banc', { ...site, NEXT_PUBLIC_SITE_URL: 'http://localhost:3100' }],
		['rien', {}],
	])('ailleurs : %s', (_cas, variables) => {
		expect(lieuDuProcessus(variables)).toBe('autre')
		expect(() => exigerLeSite('autre')).toThrow(ImportRefuse)
	})
})

describe('la source n’est jamais la base de Payload', () => {
	test('une autre base, ou un autre hôte, passe', () => {
		expect(() => exigerUneSourceAUtreQueLaCible(SOURCE, CIBLE)).not.toThrow()
		// Same host and database name on two servers: not the same database.
		expect(() =>
			exigerUneSourceAUtreQueLaCible(
				'postgres://a:b@strapi.example.test/mymakeup',
				'postgres://a:b@payload.example.test/mymakeup'
			)
		).not.toThrow()
		// Same server, another database.
		expect(() =>
			exigerUneSourceAUtreQueLaCible(
				'postgres://a:b@hote.example.test/strapi',
				'postgres://a:b@hote.example.test/payload'
			)
		).not.toThrow()
	})

	test.each([
		['la même adresse', CIBLE, CIBLE],
		['un autre rôle, la même base', 'postgres://lecture:autre@payload.interne.example.test:5432/mymakeup', CIBLE],
		[
			'le port par défaut écrit ou non',
			'postgres://a:b@hote.example.test/base',
			'postgres://a:b@HOTE.example.test:5432/base',
		],
		[
			'un hôte donné par le paramètre host',
			'postgres://a:b@hote.example.test/base?host=x.example.test',
			'postgres://a:b@hote.example.test/base?host=x.example.test',
		],
		['une adresse illisible', 'pas une adresse', CIBLE],
	])('refuse : %s', (_cas, source, cible) => {
		let message = ''
		try {
			exigerUneSourceAUtreQueLaCible(source, cible)
		} catch (erreur) {
			expect(erreur).toBeInstanceOf(ImportRefuse)
			message = (erreur as Error).message
		}
		expect(message).toContain('STRAPI_SOURCE_URI')
		expect(message).not.toContain('mot-de-passe')
		expect(message).not.toContain('example.test')
	})
})

describe('les jetons joués, gardés dans le commentaire du schéma', () => {
	test('aucun commentaire, ou celui de PostgreSQL, ne porte aucun jeton', () => {
		for (const vide of [null, undefined, '', 'standard public schema']) expect(lireLesJetons(vide)).toEqual([])
	})

	test('les jetons se lisent dans l’ordre où ils ont été joués', () => {
		expect(lireLesJetons(`${MARQUE_DES_JETONS}2026-11-05-passage-a 2026-11-05-passage-b`)).toEqual([
			'2026-11-05-passage-a',
			'2026-11-05-passage-b',
		])
	})

	test('un commentaire d’un autre auteur est refusé : il n’est jamais écrasé', () => {
		expect(() => lireLesJetons('le commentaire de quelqu’un d’autre')).toThrow(ImportRefuse)
	})

	test('un jeton nouveau est réservé une fois, et le même jeton ne l’est plus', async () => {
		const { etat, pool } = fausseBase()

		expect(await reserverLeJeton(pool, '2026-11-05-passage-a')).toBe(true)
		expect(await reserverLeJeton(pool, '2026-11-05-passage-a')).toBe(false)
		expect(etat.commentaire).toBe(`${MARQUE_DES_JETONS}2026-11-05-passage-a`)
	})

	test('chaque jeton joué reste gardé : un ancien jeton ne rejoue pas non plus', async () => {
		const { etat, pool } = fausseBase()

		for (const jeton of ['2026-11-05-passage-a', '2026-11-05-passage-b', '2026-11-05-passage-c'])
			expect(await reserverLeJeton(pool, jeton)).toBe(true)
		expect(await reserverLeJeton(pool, '2026-11-05-passage-a')).toBe(false)
		expect(lireLesJetons(etat.commentaire)).toEqual([
			'2026-11-05-passage-a',
			'2026-11-05-passage-b',
			'2026-11-05-passage-c',
		])
	})

	test('la réservation se fait sous verrou, dans une transaction, et rend sa connexion', async () => {
		const { etat, pool } = fausseBase()

		await reserverLeJeton(pool, '2026-11-05-passage-a')

		expect(etat.journal[0]).toBe('BEGIN')
		expect(etat.journal[1]).toBe('SELECT pg_advisory_xact_lock(hashtext($1))')
		expect(etat.journal.at(-1)).toBe('COMMIT')
		expect(etat.connexions).toBe(etat.relachees)
	})

	test('un commentaire inconnu ne perd pas la connexion : retour en arrière, rien n’est écrit', async () => {
		const { etat, pool } = fausseBase('le commentaire de quelqu’un d’autre')

		await expect(reserverLeJeton(pool, '2026-11-05-passage-a')).rejects.toBeInstanceOf(ImportRefuse)

		expect(etat.commentaire).toBe('le commentaire de quelqu’un d’autre')
		expect(etat.journal.at(-1)).toBe('ROLLBACK')
		expect(etat.connexions).toBe(etat.relachees)
	})
})

describe('importALaDemande : ce qu’elle refuse, sans rien lire quand il n’y a rien à faire', () => {
	function avecJournal() {
		const lignes: string[] = []
		return { lignes, options: { journal: (ligne: string) => lignes.push(ligne) } }
	}

	test('sans jeton, elle ne fait rien et ne touche à rien', async () => {
		const { lignes, options } = avecJournal()

		const issue = await importALaDemande(
			payloadInterdit,
			{ ...ENV, importation: undefined },
			{ ...options, lieu: 'site' }
		)

		expect(issue).toEqual({ etat: 'sans-jeton' })
		expect(lignes).toEqual([])
	})

	test('hors du site, elle refuse avant toute lecture, même avec un jeton', async () => {
		const { lignes, options } = avecJournal()

		const issue = await importALaDemande(payloadInterdit, ENV, { ...options, lieu: 'autre' })

		expect(issue.etat).toBe('refuse')
		expect(lignes.join('\n')).toContain('ne tourne que sur le site')
	})

	test('sans lieu donné, elle lit l’environnement du processus : celui des tests n’est pas le site', async () => {
		const { options } = avecJournal()

		expect((await importALaDemande(payloadInterdit, ENV, options)).etat).toBe('refuse')
	})

	test('sans source, ou avec la base de Payload pour source, elle refuse avant toute lecture', async () => {
		const { lignes, options } = avecJournal()

		expect(
			(await importALaDemande(payloadInterdit, { ...ENV, sourceStrapi: undefined }, { ...options, lieu: 'site' })).etat
		).toBe('refuse')
		expect(
			(await importALaDemande(payloadInterdit, { ...ENV, sourceStrapi: CIBLE }, { ...options, lieu: 'site' })).etat
		).toBe('refuse')
		expect(lignes.join('\n')).toContain('STRAPI_SOURCE_URI manque')
		expect(lignes.join('\n')).toContain('désigne la base de Payload')
	})

	test('sans stockage des photos, elle refuse avant toute lecture', async () => {
		const { lignes, options } = avecJournal()

		const issue = await importALaDemande(payloadInterdit, { ...ENV, storage: undefined }, { ...options, lieu: 'site' })

		expect(issue.etat).toBe('refuse')
		expect(lignes.join('\n')).toContain('stockage des photos')
	})

	test.each([
		['une table de décision illisible', { ...DEMANDE, decisions: '{"emailsPartages": "non"}' }],
		['une date qui n’en est pas une', { ...DEMANDE, consentiLe: '2026-02-31' }],
		['des réponses gardées illisibles', { ...DEMANDE, communes: '{"pas": "des réponses"}' }],
	])('%s : refusé AVANT que le jeton soit écrit', async (_cas, importation) => {
		const { etat, pool } = fausseBase()
		const { lignes, options } = avecJournal()

		const issue = await importALaDemande(payloadAvecSchema(pool), { ...ENV, importation }, { ...options, lieu: 'site' })

		expect(issue.etat).toBe('refuse')
		expect(etat.connexions).toBe(0)
		expect(etat.commentaire).toBe('standard public schema')
		expect(lignes.join('\n')).toContain('Passage refusé ou arrêté')
	})

	test('un jeton déjà joué ne rouvre pas la source', async () => {
		const { pool } = fausseBase(`${MARQUE_DES_JETONS}${DEMANDE.jeton}`)
		const { lignes, options } = avecJournal()
		let ouverte = false

		const issue = await importALaDemande(payloadAvecSchema(pool), ENV, {
			...options,
			lieu: 'site',
			ouvrirLaSource: () => {
				ouverte = true
				throw new Error('ne devait pas s’ouvrir')
			},
		})

		expect(issue).toEqual({ etat: 'deja-joue', jeton: DEMANDE.jeton })
		expect(ouverte).toBe(false)
		expect(lignes.join('\n')).toContain('a déjà été joué')
	})

	test('une erreur de la base est dite par son type et son code, jamais par son texte, et le journal reste propre', async () => {
		const { pool } = fausseBase()
		const { lignes, options } = avecJournal()
		const erreur = Object.assign(
			new Error('password authentication failed for user "lecture_strapi" at pers@example.test $2a$10$abcdefghij'),
			{
				name: 'error',
				code: '28P01',
			}
		)

		const issue = await importALaDemande(payloadAvecSchema(pool), ENV, {
			...options,
			lieu: 'site',
			baseDesMedias: 'https://stockage.example.test/photos-factices',
			referentiel: { repondre: async () => [] },
			ouvrirLaSource: () => {
				throw erreur
			},
		})

		const journal = lignes.join('\n')
		expect(issue.etat).toBe('refuse')
		expect(journal).toContain('code 28P01')
		expect(journal).not.toContain('pers@')
		expect(journal).not.toContain('$2a$')
		expect(journal).not.toContain('lecture_strapi')
		for (const ligne of lignes) expect(ligne).not.toMatch(/@|\$2a\$/)
	})

	test('une ligne qui porterait un @ ou un hash est retenue, d’où qu’elle vienne', async () => {
		const { pool } = fausseBase()
		const { lignes, options } = avecJournal()
		const { ImportRefuse: Refus } = await import('../../scripts/migration/import/cible')

		await importALaDemande(payloadAvecSchema(pool), ENV, {
			...options,
			lieu: 'site',
			baseDesMedias: 'https://stockage.example.test/photos-factices',
			referentiel: { repondre: async () => [] },
			ouvrirLaSource: () => {
				throw new Refus('quelqu’un@example.test $2a$10$abcdefghij')
			},
		})

		for (const ligne of lignes) expect(ligne).not.toMatch(/@|\$2a\$/)
		expect(lignes.join('\n')).toContain('retenue')
	})
})
