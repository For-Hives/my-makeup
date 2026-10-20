import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { ImportRefuse } from '../../scripts/migration/import/target'
import type { ImportEnv } from '../../src/lib/env'
import {
	importOnDemand,
	type OnDemandImportEnv,
	placeOfProcess,
	readTokens,
	requireSite,
	requireSourceOtherThanTarget,
	reserveToken,
	TOKENS_MARKER,
} from '../../src/migration/on-demand-import'

/**
 * Ticket 233: what the import run on demand refuses and remembers, with no database. The passes
 * themselves, on the bench with the fake Strapi source, are in tests/integration/import-on-demand.test.ts.
 */

const TARGET = 'postgres://app:mot-de-passe-factice@payload.interne.example.test:5432/mymakeup'
const SOURCE = 'postgres://lecture_strapi:mot-de-passe-factice@strapi.interne.example.test:5432/mymakeup'
const STORAGE = {
	endpoint: 'https://stockage.example.test',
	bucket: 'photos-factices',
	accessKeyId: 'x',
	secretAccessKey: 'y',
	local: false,
}
const REQUEST: ImportEnv = { token: '2026-11-05-passage-a', mode: 'dry-run', targetInService: false }
const ENV: OnDemandImportEnv = { databaseUri: TARGET, importation: REQUEST, sourceStrapi: SOURCE, storage: STORAGE }

/** A Payload that fails the test when anything reads from it: no token, no refusal reads the database. */
const payloadForbidden = new Proxy(
	{},
	{
		get: () => {
			throw new Error('la base ne devait pas être lue')
		},
	}
) as unknown as Payload

/** The comment of the schema `public`, the pool of `pg` just enough for `reserverLeJeton`. */
function fakeBase(commentaire: string | null = 'standard public schema') {
	const state = { commentaire, log: [] as string[], connexions: 0, relachees: 0 }
	const pool = {
		async connect() {
			state.connexions++
			return {
				async query(texte: string, parametres: unknown[] = []) {
					state.log.push(texte.split(' ').slice(0, 2).join(' '))
					if (texte.startsWith('SELECT obj_description')) {
						expect(parametres).toEqual(['public', 'pg_namespace'])
						return { rows: [{ marque: state.commentaire }] }
					}
					const written = /^COMMENT ON SCHEMA public IS '(.*)'$/s.exec(texte)
					if (written) state.commentaire = (written[1] ?? '').replaceAll("''", "'")
					return { rows: [] }
				},
				release() {
					state.relachees++
				},
			}
		},
	}
	return { etat: state, pool }
}

/** A Payload that has the tables of the v3 and a pool, to go past the schema check. */
function payloadWithSchema(pool: object): Payload {
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
		expect(placeOfProcess(site)).toBe('site')
		expect(() => requireSite('site')).not.toThrow()
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
		expect(placeOfProcess(variables)).toBe('autre')
		expect(() => requireSite('autre')).toThrow(ImportRefuse)
	})
})

describe('la source n’est jamais la base de Payload', () => {
	test('une autre base, ou un autre hôte, passe', () => {
		expect(() => requireSourceOtherThanTarget(SOURCE, TARGET)).not.toThrow()
		// Same host and database name on two servers: not the same database.
		expect(() =>
			requireSourceOtherThanTarget(
				'postgres://a:b@strapi.example.test/mymakeup',
				'postgres://a:b@payload.example.test/mymakeup'
			)
		).not.toThrow()
		// Same server, another database.
		expect(() =>
			requireSourceOtherThanTarget(
				'postgres://a:b@hote.example.test/strapi',
				'postgres://a:b@hote.example.test/payload'
			)
		).not.toThrow()
	})

	test.each([
		['la même adresse', TARGET, TARGET],
		['un autre rôle, la même base', 'postgres://lecture:autre@payload.interne.example.test:5432/mymakeup', TARGET],
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
		['une adresse illisible', 'pas une adresse', TARGET],
	])('refuse : %s', (_cas, source, cible) => {
		let message = ''
		try {
			requireSourceOtherThanTarget(source, cible)
		} catch (error) {
			expect(error).toBeInstanceOf(ImportRefuse)
			message = (error as Error).message
		}
		expect(message).toContain('STRAPI_SOURCE_URI')
		expect(message).not.toContain('mot-de-passe')
		expect(message).not.toContain('example.test')
	})
})

describe('les jetons joués, gardés dans le commentaire du schéma', () => {
	test('aucun commentaire, ou celui de PostgreSQL, ne porte aucun jeton', () => {
		for (const empty of [null, undefined, '', 'standard public schema']) expect(readTokens(empty)).toEqual([])
	})

	test('les jetons se lisent dans l’ordre où ils ont été joués', () => {
		expect(readTokens(`${TOKENS_MARKER}2026-11-05-passage-a 2026-11-05-passage-b`)).toEqual([
			'2026-11-05-passage-a',
			'2026-11-05-passage-b',
		])
	})

	test('un commentaire d’un autre auteur est refusé : il n’est jamais écrasé', () => {
		expect(() => readTokens('le commentaire de quelqu’un d’autre')).toThrow(ImportRefuse)
	})

	test('un jeton nouveau est réservé une fois, et le même jeton ne l’est plus', async () => {
		const { etat: state, pool } = fakeBase()

		expect(await reserveToken(pool, '2026-11-05-passage-a')).toBe(true)
		expect(await reserveToken(pool, '2026-11-05-passage-a')).toBe(false)
		expect(state.commentaire).toBe(`${TOKENS_MARKER}2026-11-05-passage-a`)
	})

	test('chaque jeton joué reste gardé : un ancien jeton ne rejoue pas non plus', async () => {
		const { etat: state, pool } = fakeBase()

		for (const token of ['2026-11-05-passage-a', '2026-11-05-passage-b', '2026-11-05-passage-c'])
			expect(await reserveToken(pool, token)).toBe(true)
		expect(await reserveToken(pool, '2026-11-05-passage-a')).toBe(false)
		expect(readTokens(state.commentaire)).toEqual([
			'2026-11-05-passage-a',
			'2026-11-05-passage-b',
			'2026-11-05-passage-c',
		])
	})

	test('la réservation se fait sous verrou, dans une transaction, et rend sa connexion', async () => {
		const { etat: state, pool } = fakeBase()

		await reserveToken(pool, '2026-11-05-passage-a')

		expect(state.log[0]).toBe('BEGIN')
		expect(state.log[1]).toBe('SELECT pg_advisory_xact_lock(hashtext($1))')
		expect(state.log.at(-1)).toBe('COMMIT')
		expect(state.connexions).toBe(state.relachees)
	})

	test('un commentaire inconnu ne perd pas la connexion : retour en arrière, rien n’est écrit', async () => {
		const { etat: state, pool } = fakeBase('le commentaire de quelqu’un d’autre')

		await expect(reserveToken(pool, '2026-11-05-passage-a')).rejects.toBeInstanceOf(ImportRefuse)

		expect(state.commentaire).toBe('le commentaire de quelqu’un d’autre')
		expect(state.log.at(-1)).toBe('ROLLBACK')
		expect(state.connexions).toBe(state.relachees)
	})
})

describe('importALaDemande : ce qu’elle refuse, sans rien lire quand il n’y a rien à faire', () => {
	function withLog() {
		const lines: string[] = []
		return { rows: lines, options: { log: (ligne: string) => lines.push(ligne) } }
	}

	test('sans jeton, elle ne fait rien et ne touche à rien', async () => {
		const { rows: lines, options } = withLog()

		const issue = await importOnDemand(
			payloadForbidden,
			{ ...ENV, importation: undefined },
			{ ...options, place: 'site' }
		)

		expect(issue).toEqual({ state: 'sans-jeton' })
		expect(lines).toEqual([])
	})

	test('hors du site, elle refuse avant toute lecture, même avec un jeton', async () => {
		const { rows: lines, options } = withLog()

		const issue = await importOnDemand(payloadForbidden, ENV, { ...options, place: 'autre' })

		expect(issue.state).toBe('refuse')
		expect(lines.join('\n')).toContain('ne tourne que sur le site')
	})

	test('sans lieu donné, elle lit l’environnement du processus : celui des tests n’est pas le site', async () => {
		const { options } = withLog()

		expect((await importOnDemand(payloadForbidden, ENV, options)).state).toBe('refuse')
	})

	test('sans source, ou avec la base de Payload pour source, elle refuse avant toute lecture', async () => {
		const { rows: lines, options } = withLog()

		expect(
			(await importOnDemand(payloadForbidden, { ...ENV, sourceStrapi: undefined }, { ...options, place: 'site' })).state
		).toBe('refuse')
		expect(
			(await importOnDemand(payloadForbidden, { ...ENV, sourceStrapi: TARGET }, { ...options, place: 'site' })).state
		).toBe('refuse')
		expect(lines.join('\n')).toContain('STRAPI_SOURCE_URI manque')
		expect(lines.join('\n')).toContain('désigne la base de Payload')
	})

	test('sans stockage des photos, elle refuse avant toute lecture', async () => {
		const { rows: lines, options } = withLog()

		const issue = await importOnDemand(payloadForbidden, { ...ENV, storage: undefined }, { ...options, place: 'site' })

		expect(issue.state).toBe('refuse')
		expect(lines.join('\n')).toContain('stockage des photos')
	})

	test.each([
		['une table de décision illisible', { ...REQUEST, decisions: '{"sharedEmails": "non"}' }],
		['une date qui n’en est pas une', { ...REQUEST, consentDate: '2026-02-31' }],
		['des réponses gardées illisibles', { ...REQUEST, cities: '{"pas": "des réponses"}' }],
	])('%s : refusé AVANT que le jeton soit écrit', async (_cas, importation) => {
		const { etat: state, pool } = fakeBase()
		const { rows: lines, options } = withLog()

		const issue = await importOnDemand(payloadWithSchema(pool), { ...ENV, importation }, { ...options, place: 'site' })

		expect(issue.state).toBe('refuse')
		expect(state.connexions).toBe(0)
		expect(state.commentaire).toBe('standard public schema')
		expect(lines.join('\n')).toContain('Passage refusé ou arrêté')
	})

	test('un jeton déjà joué ne rouvre pas la source', async () => {
		const { pool } = fakeBase(`${TOKENS_MARKER}${REQUEST.token}`)
		const { rows: lines, options } = withLog()
		let open = false

		const issue = await importOnDemand(payloadWithSchema(pool), ENV, {
			...options,
			place: 'site',
			openSource: () => {
				open = true
				throw new Error('ne devait pas s’ouvrir')
			},
		})

		expect(issue).toEqual({ state: 'deja-joue', token: REQUEST.token })
		expect(open).toBe(false)
		expect(lines.join('\n')).toContain('a déjà été joué')
	})

	test('une erreur de la base est dite par son type et son code, jamais par son texte, et le journal reste propre', async () => {
		const { pool } = fakeBase()
		const { rows: lines, options } = withLog()
		const error = Object.assign(
			new Error('password authentication failed for user "lecture_strapi" at pers@example.test $2a$10$abcdefghij'),
			{
				name: 'error',
				code: '28P01',
			}
		)

		const issue = await importOnDemand(payloadWithSchema(pool), ENV, {
			...options,
			place: 'site',
			mediaBase: 'https://stockage.example.test/photos-factices',
			reference: { repondre: async () => [] },
			openSource: () => {
				throw error
			},
		})

		const log = lines.join('\n')
		expect(issue.state).toBe('refuse')
		expect(log).toContain('code 28P01')
		expect(log).not.toContain('pers@')
		expect(log).not.toContain('$2a$')
		expect(log).not.toContain('lecture_strapi')
		for (const line of lines) expect(line).not.toMatch(/@|\$2a\$/)
	})

	test('une ligne qui porterait un @ ou un hash est retenue, d’où qu’elle vienne', async () => {
		const { pool } = fakeBase()
		const { rows: lines, options } = withLog()
		const { ImportRefuse: Refusal } = await import('../../scripts/migration/import/target')

		await importOnDemand(payloadWithSchema(pool), ENV, {
			...options,
			place: 'site',
			mediaBase: 'https://stockage.example.test/photos-factices',
			reference: { repondre: async () => [] },
			openSource: () => {
				throw new Refusal('quelqu’un@example.test $2a$10$abcdefghij')
			},
		})

		for (const line of lines) expect(line).not.toMatch(/@|\$2a\$/)
		expect(lines.join('\n')).toContain('retenue')
	})
})
