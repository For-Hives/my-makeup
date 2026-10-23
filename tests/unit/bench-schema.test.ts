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
const ENVIRONMENT = {
	DATABASE_URI: 'postgres://banc:banc@127.0.0.1:5442/mymakeup_test',
	NODE_ENV: 'development',
	PAYLOAD_SECRET: 'k'.repeat(64),
	PORT: '3123',
} as const
const VARIABLES = ['DATABASE_URI', 'NODE_ENV', 'PAYLOAD_SECRET', 'PORT', 'NEXT_PUBLIC_SITE_URL', 'SMTP_HOST'] as const

let loads = 0

/** The real src/payload.config.ts, under the environment of a database of this machine: Payload would push there. */
async function configurationLocale(): Promise<SanitizedConfig> {
	const before = VARIABLES.map(nom => [nom, process.env[nom]] as const)
	const set = (nom: string, valeur: string | undefined) => {
		if (valeur === undefined) Reflect.deleteProperty(process.env, nom)
		else Reflect.set(process.env, nom, valeur)
	}
	for (const name of VARIABLES) set(name, (ENVIRONMENT as Record<string, string>)[name])
	try {
		const charge = (await import(`../../src/payload.config.ts?schema-du-banc=${++loads}`)) as {
			default: Promise<SanitizedConfig>
		}
		return await charge.default
	} finally {
		for (const [name, value] of before) set(name, value)
	}
}

interface Adapter {
	push?: boolean
	prodMigrations?: unknown[]
	poolOptions?: unknown
	connect: () => Promise<void>
}

/** The adapter the configuration builds; `init` only builds the object, it opens nothing. */
const adapterOf = (config: SanitizedConfig): Adapter =>
	config.db.init({
		payload: {
			config: { localization: false },
			logger: { info: () => undefined, error: () => undefined },
		} as unknown as Payload,
	}) as unknown as Adapter

/**
 * Connects the adapter with everything it would reach stubbed: no pool, no extension. drizzle-kit,
 * which only the push of the schema asks for, says so instead of pushing.
 */
async function signIn(adaptateur: Adapter): Promise<'connecté' | 'schéma poussé'> {
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
	} catch (error) {
		if (error instanceof Error && error.message === 'pushDevSchema') return 'schéma poussé'
		throw error
	}
}

const toggle = process.env.PAYLOAD_MIGRATING
afterEach(() => {
	if (toggle === undefined) Reflect.deleteProperty(process.env, 'PAYLOAD_MIGRATING')
	else process.env.PAYLOAD_MIGRATING = toggle
})

describe('the Payload of the tests never pushes the schema', () => {
	test('its adapter: push off, no migration to play; the rest as the application has it', async () => {
		const config = await configurationLocale()
		const application = adapterOf(config)
		const tests = adapterOf(withoutSchemaChange(config))

		expect(application).toMatchObject({ push: true })
		expect(tests.push).toBe(false)
		expect(tests.prodMigrations).toBeUndefined()
		expect(tests.poolOptions).toEqual(application.poolOptions)
	})

	test('connected out of production, it does not call pushDevSchema; the adapter of the application does', async () => {
		Reflect.deleteProperty(process.env, 'PAYLOAD_MIGRATING')
		const config = await configurationLocale()

		// The adapter of the tests first: Payload remembers the last schema it pushed, in its module.
		expect(await signIn(adapterOf(withoutSchemaChange(config)))).toBe('connecté')
		expect(await signIn(adapterOf(config))).toBe('schéma poussé')
	})
})

describe('a process.exit of Payload becomes a value, never the end of the process', () => {
	test('an action that ends: its result', async () => {
		expect(await withoutOutput(async () => 'joué')).toEqual({ resultat: 'joué' })
	})

	test('an action that asks to end: the code it gave, and process.exit is given back', async () => {
		const exit = process.exit

		expect(await withoutOutput(async () => process.exit(0))).toEqual({ sortie: 0 })
		expect(await withoutOutput(async () => process.exit(1))).toEqual({ sortie: 1 })
		expect(process.exit).toBe(exit)
	})

	test('another error goes through', async () => {
		await expect(withoutOutput(() => Promise.reject(new Error('autre')))).rejects.toThrow('autre')
	})
})

describe('the message that stops a run', () => {
	const compliant: SchemaFinding = { lignesDeDeveloppement: 0, ecart: { instructions: [], ambiguites: [] } }

	test('a database built by the migrations as the code describes it: nothing to say', () => {
		expect(schemaMessage(compliant, 'essai')).toBeUndefined()
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
				...compliant,
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
			{ ...compliant, ecart: { instructions: ['CREATE TABLE "a" ();', 'CREATE TABLE "b" ();'], ambiguites: [] } },
			'essai'
		)

		expect(message).toContain(
			'une migration contiendrait ces 2 instructions :\n  CREATE TABLE "a" ();\n  CREATE TABLE "b" ();\n'
		)
	})

	test('a name on one side only: each one on its line', () => {
		const message = schemaMessage(
			{ ...compliant, ecart: { instructions: [], ambiguites: ['colonnes de « public.a » : « b » … ; « c » …'] } },
			'essai'
		)

		expect(message).toStartWith('Il manque une migration : des noms n’existent que d’un côté')
		expect(message).toContain('\n- colonnes de « public.a » : « b » … ; « c » …\n')
		expect(message).toEndWith('Aucun essai n’a tourné.')
	})
})
