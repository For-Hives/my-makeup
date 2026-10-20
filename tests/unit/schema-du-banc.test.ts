import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload, SanitizedConfig } from 'payload'
import { type SchemaFinding, schemaMessage, withoutOutput } from '../support/bench-schema'
import { withoutSchemaChange } from '../support/payload-test'

/**
 * Ticket 049: the bench database is built by the versioned migrations, never pushed from the code.
 * Here, without a database: the Payload of the tests connects without pushing the schema, and the
 * messages that stop a run say what to do. On the bench: tests/integration/migrations.test.ts.
 */

// Made-up values only.
const ENVIRONNEMENT = {
	DATABASE_URI: 'postgres://banc:banc@127.0.0.1:5442/mymakeup_test',
	NODE_ENV: 'development',
	PAYLOAD_SECRET: 'k'.repeat(64),
	PORT: '3123',
} as const
const VARIABLES = ['DATABASE_URI', 'NODE_ENV', 'PAYLOAD_SECRET', 'PORT', 'NEXT_PUBLIC_SITE_URL', 'SMTP_HOST'] as const

let chargements = 0

/** The real src/payload.config.ts, under the environment of a database of this machine: Payload would push there. */
async function configurationLocale(): Promise<SanitizedConfig> {
	const avant = VARIABLES.map(nom => [nom, process.env[nom]] as const)
	const regler = (nom: string, valeur: string | undefined) => {
		if (valeur === undefined) Reflect.deleteProperty(process.env, nom)
		else Reflect.set(process.env, nom, valeur)
	}
	for (const nom of VARIABLES) regler(nom, (ENVIRONNEMENT as Record<string, string>)[nom])
	try {
		const charge = (await import(`../../src/payload.config.ts?schema-du-banc=${++chargements}`)) as {
			default: Promise<SanitizedConfig>
		}
		return await charge.default
	} finally {
		for (const [nom, valeur] of avant) regler(nom, valeur)
	}
}

interface Adaptateur {
	push?: boolean
	prodMigrations?: unknown[]
	poolOptions?: unknown
	connect: () => Promise<void>
}

/** The adapter the configuration builds; `init` only builds the object, it opens nothing. */
const adaptateurDe = (config: SanitizedConfig): Adaptateur =>
	config.db.init({
		payload: {
			config: { localization: false },
			logger: { info: () => undefined, error: () => undefined },
		} as unknown as Payload,
	}) as unknown as Adaptateur

/**
 * Connects the adapter with everything it would reach stubbed: no pool, no extension. drizzle-kit,
 * which only the push of the schema asks for, says so instead of pushing.
 */
async function connexion(adaptateur: Adaptateur): Promise<'connecté' | 'schéma poussé'> {
	Object.assign(adaptateur, {
		pool: {},
		createExtensions: async () => undefined,
		requireDrizzleKit: () => {
			throw new Error('pushDevSchema')
		},
	})
	try {
		await adaptateur.connect()
		return 'connecté'
	} catch (erreur) {
		if (erreur instanceof Error && erreur.message === 'pushDevSchema') return 'schéma poussé'
		throw erreur
	}
}

const interrupteur = process.env.PAYLOAD_MIGRATING
afterEach(() => {
	if (interrupteur === undefined) Reflect.deleteProperty(process.env, 'PAYLOAD_MIGRATING')
	else process.env.PAYLOAD_MIGRATING = interrupteur
})

describe('the Payload of the tests never pushes the schema', () => {
	test('its adapter: push off, no migration to play; the rest as the application has it', async () => {
		const config = await configurationLocale()
		const application = adaptateurDe(config)
		const desTests = adaptateurDe(withoutSchemaChange(config))

		expect(application).toMatchObject({ push: true })
		expect(desTests.push).toBe(false)
		expect(desTests.prodMigrations).toBeUndefined()
		expect(desTests.poolOptions).toEqual(application.poolOptions)
	})

	test('connected out of production, it does not call pushDevSchema; the adapter of the application does', async () => {
		Reflect.deleteProperty(process.env, 'PAYLOAD_MIGRATING')
		const config = await configurationLocale()

		// The adapter of the tests first: Payload remembers the last schema it pushed, in its module.
		expect(await connexion(adaptateurDe(withoutSchemaChange(config)))).toBe('connecté')
		expect(await connexion(adaptateurDe(config))).toBe('schéma poussé')
	})
})

describe('a process.exit of Payload becomes a value, never the end of the process', () => {
	test('an action that ends: its result', async () => {
		expect(await withoutOutput(async () => 'joué')).toEqual({ resultat: 'joué' })
	})

	test('an action that asks to end: the code it gave, and process.exit is given back', async () => {
		const sortir = process.exit

		expect(await withoutOutput(async () => process.exit(0))).toEqual({ sortie: 0 })
		expect(await withoutOutput(async () => process.exit(1))).toEqual({ sortie: 1 })
		expect(process.exit).toBe(sortir)
	})

	test('another error goes through', async () => {
		await expect(withoutOutput(() => Promise.reject(new Error('autre')))).rejects.toThrow('autre')
	})
})

describe('the message that stops a run', () => {
	const conforme: SchemaFinding = { lignesDeDeveloppement: 0, ecart: { instructions: [], ambiguites: [] } }

	test('a database built by the migrations as the code describes it: nothing to say', () => {
		expect(schemaMessage(conforme, 'essai')).toBeUndefined()
	})

	test('the mark of a push: refused first, whatever else', () => {
		const message = schemaMessage(
			{
				lignesDeDeveloppement: 2,
				ecart: { instructions: ['ALTER TABLE "a" ADD COLUMN "b" varchar;'], ambiguites: [] },
			},
			'essai'
		)

		expect(message?.split('\n')).toEqual([
			'La base du banc porte la trace d’une poussée du schéma : 2 lignes de lot -1 (« dev ») dans payload_migrations.',
			'Son schéma ne vient donc pas des seules migrations versionnées, et une migration manquante y passerait inaperçue.',
			'Un Payload s’est branché sur le banc sans sansChangementDeSchema (tests/support/payload-test.ts) : cherche-le, puis relance.',
			'Aucun essai n’a tourné.',
		])
	})

	test('a missing migration: the statements it would hold, and what to do', () => {
		const message = schemaMessage(
			{
				...conforme,
				ecart: { instructions: ['ALTER TABLE "talents" ADD COLUMN "seo_title" varchar;'], ambiguites: [] },
			},
			'test'
		)

		expect(message?.split('\n')).toEqual([
			'Il manque une migration : la base construite par les migrations versionnées ne décrit pas les collections du code.',
			'Pour la rattraper, une migration contiendrait cette instruction :',
			'  ALTER TABLE "talents" ADD COLUMN "seo_title" varchar;',
			'Écris la migration qui manque (bun run payload:migrate:create), ou corrige le SQL de la migration qui ne crée pas ce que son instantané déclare, puis relance.',
			'Aucun test n’a tourné.',
		])
	})

	test('several statements are counted', () => {
		const message = schemaMessage(
			{ ...conforme, ecart: { instructions: ['CREATE TABLE "a" ();', 'CREATE TABLE "b" ();'], ambiguites: [] } },
			'essai'
		)

		expect(message).toContain(
			'une migration contiendrait ces 2 instructions :\n  CREATE TABLE "a" ();\n  CREATE TABLE "b" ();\n'
		)
	})

	test('a name on one side only: each one on its line', () => {
		const message = schemaMessage(
			{ ...conforme, ecart: { instructions: [], ambiguites: ['colonnes de « public.a » : « b » … ; « c » …'] } },
			'essai'
		)

		expect(message).toStartWith('Il manque une migration : des noms n’existent que d’un côté')
		expect(message).toContain('\n- colonnes de « public.a » : « b » … ; « c » …\n')
		expect(message).toEndWith('Aucun essai n’a tourné.')
	})
})
