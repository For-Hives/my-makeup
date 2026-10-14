import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { Payload, SanitizedConfig } from 'payload'
import { EnvError, type RawEnv } from '@/lib/env'
import { migrations } from '@/migrations'

// Made-up values only. The remote address ends in `.test`, a name that never resolves.
const LOCAL_URI = 'postgres://banc:banc@127.0.0.1:5442/mymakeup_test'
const REMOTE_URI = 'postgres://banc:banc@base.exemple.test:5432/mymakeup_test'
const SECRET = 'k'.repeat(64)

const development: RawEnv = { DATABASE_URI: LOCAL_URI, NODE_ENV: 'development', PAYLOAD_SECRET: SECRET, PORT: '3123' }
const preproduction: RawEnv = {
	DATABASE_URI: REMOTE_URI,
	NEXT_PUBLIC_SITE_URL: 'https://preprod.my-makeup.fr',
	NODE_ENV: 'production',
	PAYLOAD_SECRET: SECRET,
}

const VARIABLES = [
	'DATABASE_URI',
	'NEXT_PHASE',
	'NEXT_PUBLIC_SITE_URL',
	'NODE_ENV',
	'PAYLOAD_DROP_DATABASE',
	'PAYLOAD_SECRET',
	'PORT',
] as const

let loads = 0

/**
 * The real src/payload.config.ts, evaluated again under exactly this environment: a `.env` that
 * `bun test` may have loaded does not leak in. Nothing connects: building the configuration only
 * stores the database adapter.
 */
async function configUnder(env: RawEnv): Promise<SanitizedConfig> {
	const before = VARIABLES.map(name => [name, process.env[name]] as const)
	const set = (name: string, value: string | undefined) => {
		if (value === undefined) Reflect.deleteProperty(process.env, name)
		else Reflect.set(process.env, name, value)
	}
	for (const name of VARIABLES) set(name, env[name])
	try {
		// A new query string gives a new instance of the module, so it reads the environment again.
		const loaded = (await import(`../../src/payload.config.ts?load=${++loads}`)) as {
			default: Promise<SanitizedConfig>
		}
		return await loaded.default
	} finally {
		for (const [name, value] of before) set(name, value)
	}
}

type DatabaseOptions = {
	disableCreateDatabase: boolean
	poolOptions: { connectionString?: string; max?: number }
	prodMigrations?: unknown[]
	push: boolean
}

/** What the Postgres adapter was given. `init` only builds the adapter object, it opens nothing. */
const database = (config: SanitizedConfig) => config.db.init({ payload: {} as Payload }) as unknown as DatabaseOptions

describe('src/payload.config.ts is hardened', () => {
	test('on a local database: GraphQL off, schema pushed, this machine as the only trusted origin', async () => {
		const config = await configUnder(development)

		expect(config.graphQL.disable).toBe(true)
		expect(config.admin.meta.defaultOGImageType).toBe('off')
		expect(config.csrf).toEqual(['http://localhost:3123', 'http://127.0.0.1:3123'])
		expect(config.cors).toEqual([])
		expect(config.secret).toBe(SECRET)
		expect(database(config)).toMatchObject({
			disableCreateDatabase: false,
			poolOptions: { connectionString: LOCAL_URI, max: 5 },
			push: true,
		})
	})

	test('on any other database: no schema push, no database created, the versioned migrations instead', async () => {
		const config = await configUnder(preproduction)

		expect(database(config)).toMatchObject({
			disableCreateDatabase: true,
			poolOptions: { connectionString: REMOTE_URI, max: 5 },
			push: false,
		})
		expect(database(config).prodMigrations).toBe(migrations)
		expect(config.csrf).toEqual(['https://preprod.my-makeup.fr'])
		expect(config.cors).toEqual([])
	})

	test('a development server pointed at a remote database does not push either', async () => {
		const config = await configUnder({ ...development, DATABASE_URI: REMOTE_URI })
		expect(database(config).push).toBe(false)
	})

	test('without its secrets, the configuration cannot even be loaded (Payload CLI, scripts)', async () => {
		await expect(configUnder({ NODE_ENV: 'development' })).rejects.toBeInstanceOf(EnvError)
		await expect(configUnder({ ...development, PAYLOAD_SECRET: 'court' })).rejects.toBeInstanceOf(EnvError)
	})

	test('next build loads it with no secret and no database: the secret stays empty, which Payload refuses to run with', async () => {
		const config = await configUnder({ NEXT_PHASE: 'phase-production-build', NODE_ENV: 'production' })
		expect(config.secret).toBe('')
		expect(database(config).push).toBe(false)
		expect(config.csrf.length).toBeGreaterThan(0)
	})

	test('no email adapter when nothing is set: Payload then only writes a log line, and opens no connection', async () => {
		// Tripwire for the ticket that adds emails: `nodemailerAdapter()` called with no transport
		// creates an account at ethereal.email, and checks its transport when the server starts.
		expect((await configUnder(development)).email).toBeUndefined()
		expect((await configUnder(preproduction)).email).toBeUndefined()
	})
})

describe('I05: GraphQL is switched off, its two routes answer 404 without running anything', () => {
	const ROUTES = ['src/app/(payload)/api/graphql/route.ts', 'src/app/(payload)/api/graphql-playground/route.ts']
	const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const

	test('every method of /api/graphql and /api/graphql-playground: 404, empty body', async () => {
		const answers: unknown[] = []
		for (const file of ROUTES) {
			const route = (await import(`../../${file}`)) as Record<(typeof METHODS)[number], () => Response>
			for (const method of METHODS) {
				const response = route[method]()
				answers.push({ file, method, status: response.status, body: await response.text() })
			}
		}
		expect(answers).toEqual(ROUTES.flatMap(file => METHODS.map(method => ({ file, method, status: 404, body: '' }))))
	})

	test('nothing is loaded behind them: no import, so no Payload configuration and no session', () => {
		const LOADS_A_MODULE = /^\s*import\b.*$|\b(?:import|require)\(.*$/gm
		for (const file of ROUTES)
			expect({ file, loads: readFileSync(file, 'utf8').match(LOADS_A_MODULE) }).toEqual({ file, loads: null })
	})
})

describe('a session cookie counts only when the request comes from a trusted origin', () => {
	type ExtractJWT = (args: { headers: Headers; payload: { config: SanitizedConfig } }) => null | string

	/** Payload's own gate, not exported by the package: the file is loaded by its path. */
	const gate = async (): Promise<ExtractJWT> =>
		((await import(new URL('./auth/extractJWT.js', import.meta.resolve('payload')).href)) as { extractJWT: ExtractJWT })
			.extractJWT

	const from = (headers: Record<string, string>) => new Headers({ Cookie: 'payload-token=jeton-de-test', ...headers })

	test('the pre-production accepts its own origin and ignores the cookie from anywhere else, the site included', async () => {
		const extractJWT = await gate()
		const config = await configUnder(preproduction)
		const token = (headers: Record<string, string>) => extractJWT({ headers: from(headers), payload: { config } })

		expect(token({ Origin: 'https://preprod.my-makeup.fr' })).toBe('jeton-de-test')
		for (const origin of ['https://my-makeup.fr', 'https://exemple.test', 'http://localhost:3000', 'null'])
			expect({ origin, token: token({ Origin: origin }) }).toEqual({ origin, token: null })
	})

	test('without an Origin header, the browser must say the request comes from the site itself', async () => {
		const extractJWT = await gate()
		const config = await configUnder(preproduction)
		const token = (headers: Record<string, string>) => extractJWT({ headers: from(headers), payload: { config } })

		expect(token({ 'Sec-Fetch-Site': 'same-origin' })).toBe('jeton-de-test')
		expect(token({ 'Sec-Fetch-Site': 'cross-site' })).toBeNull()
		// A client that is not a browser sends neither header: its cookie is ignored.
		expect(token({})).toBeNull()
	})
})
