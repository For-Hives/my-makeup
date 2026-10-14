import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { DatabaseAdapterObj, Payload, SanitizedConfig } from 'payload'
import { EnvError, PREPROD_ORIGIN, parseServerEnv, type RawEnv, serverEnv } from '@/lib/env'
import { auDemarrage, avecLaRemiseAZero } from '@/preprod/au-demarrage'
import { COLLECTIONS_DU_JEU, chargerLeJeuDeLaPreprod, lirePhotoDeLApplication } from '@/preprod/jeu'
import { BASE_DE_LA_PREPROD, MARQUE_DE_REMISE } from '@/preprod/remise'
import {
	adressesDeLaSource,
	MEDIAS_DE_LA_SOURCE_FICTIVE,
	PreprodRefusee,
	SOURCE_DE_LA_PREPROD,
} from '@/preprod/tranche'
import { DEPLOYED_ORIGINS } from '../../src/lib/env'
import { definitionDeLaSource } from '../outils/source-strapi/donnees'

/**
 * Tickets 027 and 053: what the pre-production does when it starts, and nowhere else. The task
 * itself runs on the bench (tests/integration/preprod-demarrage.test.ts); here, without any
 * database: where it runs, what it refuses, the reset before the migrations, the fictional set it
 * loads, and the fake source the first slice posed (./tranche.ts, kept for the import on demand).
 */

// Made-up values only. The remote address ends in `.test`, a name that never resolves.
const REMOTE_URI = 'postgres://payload:mot-de-passe-factice@base.exemple.test:5432/mymakeup_preprod?sslmode=disable'
const SECRET = 'k'.repeat(64)
const JETON = 'essai-remise-027'

const preprod: RawEnv = {
	APP_ENV: 'preprod',
	DATABASE_URI: REMOTE_URI,
	NEXT_PUBLIC_SITE_URL: PREPROD_ORIGIN,
	NODE_ENV: 'production',
	PAYLOAD_SECRET: SECRET,
}
const site: RawEnv = { ...preprod, APP_ENV: 'prod', NEXT_PUBLIC_SITE_URL: 'https://my-makeup.fr' }
const poste: RawEnv = {
	...preprod,
	APP_ENV: undefined,
	DATABASE_URI: 'postgres://banc:banc@127.0.0.1:5442/mymakeup_dev',
	NODE_ENV: 'development',
}

/** The variables to fix, as the start of the server lists them, or nothing. */
function refus(env: RawEnv): string[] {
	try {
		parseServerEnv(env)
		return []
	} catch (erreur) {
		if (!(erreur instanceof EnvError)) throw erreur
		return erreur.variables
	}
}

/**
 * A Payload that nobody may touch: any reading of it is recorded, and fails. `permis` are the
 * properties that may be read: the plugin that bounds the requests reads the collections before
 * the hook of this ticket (src/lib/requete-bornee.ts).
 */
function payloadIntouchable(permis: Readonly<Record<string, unknown>> = {}): { payload: Payload; touches: string[] } {
	const touches: string[] = []
	const payload = new Proxy(
		{},
		{
			get(_cible, nom) {
				if (typeof nom === 'string' && Object.hasOwn(permis, nom)) return permis[nom]
				touches.push(String(nom))
				throw new Error('Payload a été touché.')
			},
		}
	) as Payload
	return { payload, touches }
}

/** What the fake client of `pg` answers: the database it is on, the mark on its schema, or a failure. */
interface Reponses {
	base?: string
	marque?: string | null
	echec?: Error
}

/**
 * The `pg` module as the reset sees it: a client that records each statement and answers the two
 * readings of the reset. `etapes` receives the statements, and what else happens, in order.
 */
function pgFactice(etapes: string[], reponses: Reponses = {}) {
	class Client {
		async connect(): Promise<void> {
			etapes.push('client : connexion')
		}
		async query(texte: string): Promise<{ rows: unknown[] }> {
			if (reponses.echec) throw reponses.echec
			etapes.push(texte)
			if (texte.includes('current_database()')) return { rows: [{ base: reponses.base ?? BASE_DE_LA_PREPROD }] }
			if (texte.includes('obj_description')) return { rows: [{ marque: reponses.marque ?? null }] }
			return { rows: [] }
		}
		async end(): Promise<void> {
			etapes.push('client : fin')
		}
	}
	return { Client }
}

/** A database adapter whose own connection, the one that plays the migrations, is only recorded. */
function adaptateurFactice(
	reponses: Reponses = {},
	prodMigrations: { name: string }[] = [{ name: 'a' }, { name: 'b' }]
) {
	const etapes: string[] = []
	const db = {
		pg: pgFactice(etapes, reponses),
		poolOptions: { connectionString: REMOTE_URI, max: 5 },
		prodMigrations,
		connect: async () => {
			etapes.push('Payload : connexion, puis ses migrations')
		},
	}
	const adaptateur = {
		name: 'postgres',
		defaultIDType: 'number',
		allowIDOnCreate: false,
		init: () => db,
	} as unknown as DatabaseAdapterObj<PostgresAdapter>
	return { adaptateur, etapes }
}

/** The statements of a reset that empties the database, in their order. */
const EFFACEMENT = [
	'DROP DATABASE IF EXISTS "strapi_source_preprod" WITH (FORCE)',
	'DROP ROLE IF EXISTS "lecture_strapi_preprod"',
	`DROP SCHEMA public CASCADE; CREATE SCHEMA public; COMMENT ON SCHEMA public IS '${MARQUE_DE_REMISE}${JETON}'`,
]

let espion: ReturnType<typeof spyOn<Console, 'log'>> | undefined

/** The lines the start writes to the log, captured instead of printed. */
function capterLeJournal(): string[] {
	const lignes: string[] = []
	espion = spyOn(console, 'log').mockImplementation((...valeurs: unknown[]) => {
		lignes.push(valeurs.map(String).join(' '))
	})
	return lignes
}

afterEach(() => {
	espion?.mockRestore()
	espion = undefined
})

describe('the environment says where the pre-production is, and nowhere else', () => {
	test('its address is one of the two deployed ones', () => {
		expect(DEPLOYED_ORIGINS).toContain(PREPROD_ORIGIN)
	})

	test('a production build served from its address is the pre-production; the token of a reset is read', () => {
		expect(parseServerEnv(preprod).preprod).toEqual({ jeuFictif: true })
		expect(parseServerEnv({ ...preprod, PREPROD_REMISE_A_ZERO: ` ${JETON} ` }).preprod).toEqual({
			jeuFictif: true,
			remiseAZero: JETON,
		})
	})

	test('APP_ENV=preprod is what lets the start load the fictional set; without it the pre-production only says so', () => {
		expect(parseServerEnv({ ...preprod, APP_ENV: undefined }).preprod).toEqual({ jeuFictif: false })
	})

	test('APP_ENV is refused when it contradicts where the application is served from: the server does not start', () => {
		// The site and a development machine are never « preprod »; the pre-production is never anything else.
		expect(refus({ ...site, APP_ENV: 'preprod' })).toEqual(['APP_ENV'])
		expect(refus({ ...poste, APP_ENV: 'preprod' })).toEqual(['APP_ENV'])
		expect(refus({ ...preprod, APP_ENV: 'prod' })).toEqual(['APP_ENV'])
		expect(refus({ ...preprod, APP_ENV: 'test' })).toEqual(['APP_ENV'])
		expect(refus({ ...preprod, APP_ENV: 'staging' })).toEqual(['APP_ENV'])
		expect(refus({ ...site, APP_ENV: 'prod' })).toEqual([])
		expect(refus({ ...poste, APP_ENV: 'test' })).toEqual([])
	})

	test('the site, `next dev` and a build while Next builds never are', () => {
		expect(parseServerEnv(site).preprod).toBeUndefined()
		expect(parseServerEnv(poste).preprod).toBeUndefined()
		expect(parseServerEnv({ ...preprod, APP_ENV: undefined, NODE_ENV: 'development' }).preprod).toBeUndefined()
		expect(
			serverEnv({ ...preprod, NEXT_PHASE: 'phase-production-build', PREPROD_REMISE_A_ZERO: JETON }).preprod
		).toBeUndefined()
	})

	test('PREPROD_REMISE_A_ZERO is refused anywhere else than on the pre-production, the site first: the server does not start', () => {
		expect(refus({ ...site, PREPROD_REMISE_A_ZERO: JETON })).toEqual(['PREPROD_REMISE_A_ZERO'])
		expect(refus({ ...poste, PREPROD_REMISE_A_ZERO: JETON })).toEqual(['PREPROD_REMISE_A_ZERO'])
		expect(refus({ ...preprod, APP_ENV: undefined, NODE_ENV: 'development', PREPROD_REMISE_A_ZERO: JETON })).toEqual([
			'PREPROD_REMISE_A_ZERO',
		])
	})

	test('a token it cannot read is refused, and the message never shows it', () => {
		for (const jeton of ['court', 'Majuscules-2026', 'jeton avec espaces', "2026-10-15';drop", `a${'b'.repeat(64)}`]) {
			expect(refus({ ...preprod, PREPROD_REMISE_A_ZERO: jeton }), jeton).toEqual(['PREPROD_REMISE_A_ZERO'])
		}
		let message = ''
		try {
			parseServerEnv({ ...site, PREPROD_REMISE_A_ZERO: JETON })
		} catch (erreur) {
			message = String((erreur as Error).message)
		}
		expect(message).toContain(
			'PREPROD_REMISE_A_ZERO : refusée, car elle efface toute la base et ce n’est pas la préprod.'
		)
		expect(message).not.toContain(JETON)
	})
})

describe('the task refuses to run in production, before it touches anything', () => {
	test('called without the pre-production, it throws PreprodRefusee and never reads Payload', async () => {
		const { payload, touches } = payloadIntouchable()
		const journal: string[] = []

		const essai = chargerLeJeuDeLaPreprod(payload, {
			preprod: parseServerEnv(site).preprod,
			journal: ligne => journal.push(ligne),
		})

		await expect(essai).rejects.toBeInstanceOf(PreprodRefusee)
		expect(touches).toEqual([])
		expect(journal).toEqual([])
	})

	test('the hook of Payload does nothing on the site, nor in a process that migrates', async () => {
		const journal = capterLeJournal()
		const { payload, touches } = payloadIntouchable()

		await auDemarrage(payload, parseServerEnv(site), false)
		await auDemarrage(payload, parseServerEnv(poste), false)
		await auDemarrage(payload, parseServerEnv(preprod), true)

		expect(touches).toEqual([])
		expect(journal).toEqual([])
	})

	test('on the pre-production, a failure is written by its type and code, never its text, and the site keeps serving', async () => {
		const journal = capterLeJournal()
		const echec = Object.assign(new Error('duplicate key (email)=(zoe.lefevre@example.test)'), { code: '57P01' })
		const payload = {
			db: { tableNameMap: new Map(), pool: { query: () => Promise.reject(echec) } },
		} as unknown as Payload

		await auDemarrage(payload, parseServerEnv(preprod), false)

		expect(journal).toEqual([
			'[preprod] Démarrage de la préprod interrompu. Le jeu fictif s’est arrêté sur une erreur inattendue (Error, code 57P01). Son texte n’est pas affiché : il peut porter des valeurs de la base. Un jeton nouveau de PREPROD_REMISE_A_ZERO recommence d’une base vide.',
		])
	})
})

describe('the fictional set is loaded on the database of the pre-production only, once', () => {
	test('on another database, it refuses before it reads a collection, and poses nothing', async () => {
		const requetes: string[] = []
		const { payload, touches } = payloadIntouchable({
			db: {
				pool: {
					query: async (texte: string) => {
						requetes.push(texte)
						return { rows: [{ base: 'mymakeup' }] }
					},
				},
			},
		})
		const journal: string[] = []

		const essai = chargerLeJeuDeLaPreprod(payload, {
			preprod: { jeuFictif: true },
			journal: ligne => journal.push(ligne),
		})

		await expect(essai).rejects.toThrow(
			new PreprodRefusee(
				'Refusé : la base de DATABASE_URI n’est pas celle de la préprod (mymakeup_preprod). Rien n’est lu ni écrit.'
			)
		)
		expect(requetes).toEqual(['SELECT current_database() AS base'])
		expect(touches).toEqual([])
		expect(journal).toEqual([])
	})

	/** A Payload that counts what the set writes, and records every write. */
	function payloadQuiCompte(documents: number) {
		const ecritures: string[] = []
		const payload = {
			db: { pool: { query: async () => ({ rows: [{ base: BASE_DE_LA_PREPROD }] }) } },
			count: async ({ collection }: { collection: string }) => ({
				totalDocs: collection === 'profils' ? documents : 0,
			}),
			create: async () => {
				ecritures.push('create')
				throw new Error('create ne devait pas être appelé')
			},
		} as unknown as Payload
		return { payload, ecritures }
	}

	test('a database that already holds a document of the set is kept: nothing is loaded, the log gives the counts', async () => {
		const { payload, ecritures } = payloadQuiCompte(12)
		const journal: string[] = []

		const issue = await chargerLeJeuDeLaPreprod(payload, {
			preprod: { jeuFictif: true },
			journal: ligne => journal.push(ligne),
		})

		expect(issue.etat).toBe('deja-remplie')
		expect(ecritures).toEqual([])
		expect(journal).toEqual([
			`Base déjà remplie (${COLLECTIONS_DU_JEU.map(c => `${c} ${c === 'profils' ? 12 : 0}`).join(', ')}) : pas de jeu fictif au démarrage.`,
		])
	})

	test('without APP_ENV=preprod the set is not loaded, and the log says which variable to set', async () => {
		const { payload, ecritures } = payloadQuiCompte(0)
		const journal: string[] = []

		const issue = await chargerLeJeuDeLaPreprod(payload, {
			preprod: { jeuFictif: false },
			journal: ligne => journal.push(ligne),
		})

		expect(issue.etat).toBe('non-declaree')
		expect(ecritures).toEqual([])
		expect(journal).toEqual([
			'APP_ENV n’est pas « preprod » : le jeu fictif n’est pas chargé. Pose APP_ENV=preprod dans Coolify.',
		])
	})

	test('on an empty database, the set guard still decides: a production environment writes nothing', async () => {
		const { payload, ecritures } = payloadQuiCompte(0)

		const essai = chargerLeJeuDeLaPreprod(payload, {
			preprod: { jeuFictif: true },
			variables: { APP_ENV: 'prod', NEXT_PUBLIC_SITE_URL: 'https://my-makeup.fr', DATABASE_URI: REMOTE_URI },
			journal: () => undefined,
		})

		await expect(essai).rejects.toThrow('Jeu fictif refusé : APP_ENV vaut « prod »')
		expect(ecritures).toEqual([])
	})

	test('the photos are read from the folder the build keeps next to the application', async () => {
		const octets = await lirePhotoDeLApplication('photo-1.webp')

		expect(octets.length).toBeGreaterThan(1000)
		expect(octets.length).toBeLessThan(30_000)
	})
})

describe('the reset comes before Payload plays its migrations, on the pre-production only', () => {
	const avecJeton = parseServerEnv({ ...preprod, PREPROD_REMISE_A_ZERO: JETON })

	/** The adapter Payload would build from this configuration, then its connection, as Payload starts. */
	async function connecter(
		adaptateur: DatabaseAdapterObj<PostgresAdapter>,
		journal: string[],
		parametres?: { hotReload: boolean }
	): Promise<void> {
		const db = avecLaRemiseAZero(adaptateur, avecJeton, {
			journal: ligne => journal.push(ligne),
			migrationEnCours: false,
		}).init({ payload: {} as Payload })
		await db.connect?.(parametres)
	}

	test('anywhere else, or without a token: the adapter itself, untouched', () => {
		const { adaptateur } = adaptateurFactice()

		expect(avecLaRemiseAZero(adaptateur, parseServerEnv(site))).toBe(adaptateur)
		expect(avecLaRemiseAZero(adaptateur, parseServerEnv(poste))).toBe(adaptateur)
		expect(avecLaRemiseAZero(adaptateur, parseServerEnv(preprod))).toBe(adaptateur)
	})

	test('in a process that migrates (`payload migrate`, the import command), Payload connects and nothing is reset', async () => {
		const { adaptateur, etapes } = adaptateurFactice()
		const journal: string[] = []
		const avant = process.env.PAYLOAD_MIGRATING
		// The switch the CLI of Payload sets once the configuration is loaded: read when Payload connects.
		const db = avecLaRemiseAZero(adaptateur, avecJeton, { journal: ligne => journal.push(ligne) }).init({
			payload: {} as Payload,
		})
		Reflect.set(process.env, 'PAYLOAD_MIGRATING', 'true')
		try {
			await db.connect?.()
		} finally {
			if (avant === undefined) Reflect.deleteProperty(process.env, 'PAYLOAD_MIGRATING')
			else Reflect.set(process.env, 'PAYLOAD_MIGRATING', avant)
		}

		expect(etapes).toEqual(['Payload : connexion, puis ses migrations'])
		expect(journal).toEqual([])
	})

	test('a new token: the database of the pre-production and its source are emptied, then Payload connects and plays its migrations on the empty schema', async () => {
		const { adaptateur, etapes } = adaptateurFactice()
		const journal: string[] = []

		await connecter(adaptateur, journal)

		expect(etapes).toEqual([
			'client : connexion',
			'SELECT current_database() AS base',
			'SELECT obj_description(to_regnamespace($1), $2) AS marque',
			...EFFACEMENT,
			'client : fin',
			'Payload : connexion, puis ses migrations',
		])
		expect(journal).toEqual([
			`Remise à zéro « ${JETON} » : la base et la fausse source Strapi sont effacées, avant les migrations.`,
			`Remise à zéro « ${JETON} » faite : 2 migrations rejouées sur une base vide.`,
		])
	})

	test('the token of the last reset: nothing is emptied', async () => {
		const { adaptateur, etapes } = adaptateurFactice({ marque: `${MARQUE_DE_REMISE}${JETON}` })
		const journal: string[] = []

		await connecter(adaptateur, journal)

		expect(etapes).toEqual([
			'client : connexion',
			'SELECT current_database() AS base',
			'SELECT obj_description(to_regnamespace($1), $2) AS marque',
			'client : fin',
			'Payload : connexion, puis ses migrations',
		])
		expect(journal).toEqual([`Remise à zéro « ${JETON} » déjà faite : rien n’est effacé.`])
	})

	test('another database than the one of the pre-production: nothing is read or emptied, the log says why, and Payload connects as before', async () => {
		const { adaptateur, etapes } = adaptateurFactice({ base: 'mymakeup' })
		const journal: string[] = []

		await connecter(adaptateur, journal)

		expect(etapes).toEqual([
			'client : connexion',
			'SELECT current_database() AS base',
			'client : fin',
			'Payload : connexion, puis ses migrations',
		])
		expect(journal).toEqual([
			`Remise à zéro « ${JETON} » non faite, la base est gardée. Refusé : la base de DATABASE_URI n’est pas celle de la préprod (mymakeup_preprod). Rien n’est lu ni écrit.`,
		])
	})

	test('without a migration to rebuild the tables, nothing is emptied', async () => {
		const { adaptateur, etapes } = adaptateurFactice({}, [])
		const journal: string[] = []

		await connecter(adaptateur, journal)

		expect(etapes.some(etape => etape.startsWith('DROP'))).toBe(false)
		expect(etapes.at(-1)).toBe('Payload : connexion, puis ses migrations')
		expect(journal).toEqual([
			`Remise à zéro « ${JETON} » non faite, la base est gardée. Remise à zéro refusée : l’application n’a aucune migration pour reconstruire la base.`,
		])
	})

	test('a failure is written by its type and code, never its text, and Payload still connects', async () => {
		const echec = Object.assign(new Error('duplicate key (email)=(zoe.lefevre@example.test)'), { code: '57P01' })
		const { adaptateur, etapes } = adaptateurFactice({ echec })
		const journal: string[] = []

		await connecter(adaptateur, journal)

		expect(etapes).toEqual(['client : connexion', 'client : fin', 'Payload : connexion, puis ses migrations'])
		expect(journal).toEqual([
			`Remise à zéro « ${JETON} » interrompue, la base est gardée (Error, code 57P01). Son texte n’est pas affiché : il peut porter des valeurs de la base.`,
		])
	})

	test('a hot reload reconnects a running server: it is not a start', async () => {
		const { adaptateur, etapes } = adaptateurFactice()
		const journal: string[] = []

		await connecter(adaptateur, journal, { hotReload: true })

		expect(etapes).toEqual(['Payload : connexion, puis ses migrations'])
		expect(journal).toEqual([])
	})
})

describe('the configuration of Payload runs the hook with its own environment', () => {
	const VARIABLES = [
		'APP_ENV',
		'DATABASE_URI',
		'NEXT_PHASE',
		'NEXT_PUBLIC_SITE_URL',
		'NODE_ENV',
		'PAYLOAD_SECRET',
		'PREPROD_REMISE_A_ZERO',
	] as const
	let chargements = 0

	/** The real src/payload.config.ts, evaluated again under exactly this environment. Nothing connects. */
	async function configurationSous(env: RawEnv): Promise<SanitizedConfig> {
		const avant = VARIABLES.map(nom => [nom, process.env[nom]] as const)
		const poser = (nom: string, valeur: string | undefined) => {
			if (valeur === undefined) Reflect.deleteProperty(process.env, nom)
			else Reflect.set(process.env, nom, valeur)
		}
		for (const nom of VARIABLES) poser(nom, env[nom])
		try {
			const charge = (await import(`../../src/payload.config.ts?preprod=${++chargements}`)) as {
				default: Promise<SanitizedConfig>
			}
			return await charge.default
		} finally {
			for (const [nom, valeur] of avant) poser(nom, valeur)
		}
	}

	test('on the site: nothing is touched', async () => {
		const journal = capterLeJournal()
		const { payload, touches } = payloadIntouchable({ collections: {} })
		const configuration = await configurationSous(site)

		await configuration.onInit?.(payload)

		expect(touches).toEqual([])
		expect(journal).toEqual([])
	})

	test('on the pre-production: the start runs, and a failure stays in the log', async () => {
		const journal = capterLeJournal()
		const { payload, touches } = payloadIntouchable({ collections: {} })
		const configuration = await configurationSous(preprod)

		await configuration.onInit?.(payload)

		expect(touches).toContain('db')
		expect(journal).toEqual([expect.stringMatching(/^\[preprod\] Démarrage de la préprod interrompu\. /)])
	})

	/**
	 * The adapter of the real configuration, as Payload builds it, connected with a fake `pg`: its
	 * pool fails at once, so that nothing goes further than the first step of Payload's own
	 * connection. Gives what happened, in order.
	 */
	async function connexionSous(env: RawEnv): Promise<string[]> {
		const configuration = await configurationSous(env)
		const etapes: string[] = []
		const payload = { logger: { error: () => undefined, info: () => undefined } } as unknown as Payload
		const db = configuration.db.init({ payload }) as PostgresAdapter
		class Pool {
			constructor() {
				etapes.push('Payload : sa connexion, avant ses migrations')
				throw new Error('Pool factice')
			}
		}
		db.pg = { ...pgFactice(etapes), Pool } as unknown as PostgresAdapter['pg']
		// Payload rejects this promise when its connection fails: nobody else waits for it here.
		db.initializing.catch(() => undefined)
		await expect(db.connect?.()).rejects.toThrow('Pool factice')
		return etapes
	}

	test('on the site: Payload connects as it is, no reset', async () => {
		capterLeJournal()

		expect(await connexionSous(site)).toEqual(['Payload : sa connexion, avant ses migrations'])
	})

	test('on the pre-production with a new token: the reset runs first, then Payload connects', async () => {
		const journal = capterLeJournal()

		const etapes = await connexionSous({ ...preprod, PREPROD_REMISE_A_ZERO: JETON })

		expect(etapes).toEqual([
			'client : connexion',
			'SELECT current_database() AS base',
			'SELECT obj_description(to_regnamespace($1), $2) AS marque',
			...EFFACEMENT,
			'client : fin',
			'Payload : sa connexion, avant ses migrations',
		])
		expect(journal).toEqual([
			`[preprod] Remise à zéro « ${JETON} » : la base et la fausse source Strapi sont effacées, avant les migrations.`,
		])
	})
})

describe('the fake source, next to the database of the pre-production', () => {
	test('a database of its own on the same server, read by a role of its own', () => {
		const { administration, lecture } = adressesDeLaSource(REMOTE_URI, SOURCE_DE_LA_PREPROD, 'abc123def456')

		expect(administration).toBe(
			'postgres://payload:mot-de-passe-factice@base.exemple.test:5432/strapi_source_preprod?sslmode=disable'
		)
		expect(lecture).toBe(
			'postgres://lecture_strapi_preprod:abc123def456@base.exemple.test:5432/strapi_source_preprod?sslmode=disable'
		)
	})

	test('never the database of Payload itself', () => {
		const memeBase = 'postgres://payload:factice@base.exemple.test:5432/strapi_source_preprod'

		expect(() => adressesDeLaSource(memeBase, SOURCE_DE_LA_PREPROD, 'abc123def456')).toThrow(PreprodRefusee)
	})

	test('no real data: every address, phone and file of the source it poses is fictional', () => {
		const { lignes } = definitionDeLaSource(MEDIAS_DE_LA_SOURCE_FICTIVE)
		const emails = [
			...lignes.up_users.map(compte => String(compte.email)),
			...lignes.components_makeupartists_networks.map(reseau => reseau.email).filter(email => email !== null),
		]
		const telephones = lignes.components_makeupartists_networks.map(reseau => reseau.phone).filter(tel => tel !== null)
		const fichiers = lignes.files.map(fichier => String(fichier.url))

		expect(emails.length).toBeGreaterThan(0)
		for (const email of emails) expect(String(email).trim().toLowerCase()).toEndWith('@example.test')
		expect(telephones.length).toBeGreaterThan(0)
		for (const telephone of telephones) expect(String(telephone)).toStartWith('06 39 98')
		for (const fichier of fichiers) expect(fichier).toStartWith(`${MEDIAS_DE_LA_SOURCE_FICTIVE}/`)
		expect(new URL(MEDIAS_DE_LA_SOURCE_FICTIVE).hostname).toEndWith('.example.test')
	})
})
