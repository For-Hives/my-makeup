import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { initI18n } from '@payloadcms/translations'
import { Forbidden, getRequestLanguage, type Payload, type SanitizedConfig, ValidationError } from 'payload'
import { BlockedAccount } from '@/lib/auth/blocked-account'
import { adapterWithoutRelay } from '@/lib/emails/relay'
import { EnvError, type RawEnv } from '@/lib/env'
import { migrations } from '@/migrations'

// Made-up values only. The remote address ends in `.test`, a name that never resolves.
const LOCAL_URI = 'postgres://banc:banc@127.0.0.1:5442/mymakeup_test'
const REMOTE_URI = 'postgres://banc:banc@base.exemple.test:5432/mymakeup_test'
const SECRET = 'k'.repeat(64)
const SENDER = 'My Makeup <ne-pas-repondre@example.test>'

const development: RawEnv = { DATABASE_URI: LOCAL_URI, NODE_ENV: 'development', PAYLOAD_SECRET: SECRET, PORT: '3123' }
// The site in production: the only deployed environment (ticket 232). It holds a relay with its login (ticket 073).
const enLigne: RawEnv = {
	DATABASE_URI: REMOTE_URI,
	EMAIL_FROM: SENDER,
	NEXT_PUBLIC_SITE_URL: 'https://my-makeup.fr',
	NODE_ENV: 'production',
	PAYLOAD_SECRET: SECRET,
	SMTP_HOST: 'relais.exemple.test',
	SMTP_PASSWORD: 'mot-de-passe-temoin',
	SMTP_PORT: '465',
	SMTP_USER: 'resend',
}

const VARIABLES = [
	'DATABASE_URI',
	'EMAIL_FROM',
	'NEXT_PHASE',
	'NEXT_PUBLIC_SITE_URL',
	'NODE_ENV',
	'PAYLOAD_DROP_DATABASE',
	'PAYLOAD_SECRET',
	'PORT',
	'SMTP_HOST',
	'SMTP_PASSWORD',
	'SMTP_PORT',
	'SMTP_USER',
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

	test('ticket 223 : the admin panel asks no avatar of gravatar.com, and the blocked account is logged as info', async () => {
		const config = await configUnder(development)

		// Without it, the panel loads an image computed from the admin's email from a third party.
		expect(config.admin.avatar).toBe('default')
		// CompteBloque sets its own `name`: `APIError` does not cover it. Payload reads the level by that name.
		expect(config.loggingLevels).toMatchObject({ APIError: 'info', CompteBloque: 'info' })
		expect(new BlockedAccount().name).toBe('CompteBloque')
	})

	test('on any other database: no schema push, no database created, the versioned migrations instead', async () => {
		const config = await configUnder(enLigne)

		expect(database(config)).toMatchObject({
			disableCreateDatabase: true,
			poolOptions: { connectionString: REMOTE_URI, max: 5 },
			push: false,
		})
		expect(database(config).prodMigrations).toBe(migrations)
		expect(config.csrf).toEqual(['https://my-makeup.fr'])
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

	test('no relay when nothing is set: the mails of Payload go to an adapter that writes a line with no address, and opens no connection', async () => {
		// `nodemailerAdapter()` called with no transport creates an account at ethereal.email, and
		// checks its transport when the server starts: without SMTP_HOST, it is not called at all.
		expect((await configUnder(development)).email).toBe(adapterWithoutRelay)
		// The sender alone switches nothing on.
		expect((await configUnder({ ...development, EMAIL_FROM: SENDER })).email).toBe(adapterWithoutRelay)
	})
})

describe('Payload speaks French only, whatever the request asks for (ticket 221)', () => {
	test('French is the one language Payload offers, and the one it falls back to', async () => {
		const config = await configUnder(development)

		expect(Object.keys(config.i18n.supportedLanguages)).toEqual(['fr'])
		expect(config.i18n.fallbackLanguage).toBe('fr')
	})

	test('a request that asks for English, by its header or by the cookie of the admin panel, gets French', async () => {
		const config = await configUnder(development)
		const langue = (headers: Record<string, string>, cookies: Record<string, string> = {}) =>
			getRequestLanguage({ config, cookies: new Map(Object.entries(cookies)), headers: new Headers(headers) })

		expect(langue({})).toBe('fr')
		expect(langue({ 'Accept-Language': 'en' })).toBe('fr')
		expect(langue({ 'Accept-Language': 'en-US,en;q=0.9' })).toBe('fr')
		expect(langue({ 'Accept-Language': 'de' }, { 'payload-lng': 'en' })).toBe('fr')
	})

	test('the envelope of a refusal and Payload’s own refusals read in French', async () => {
		const { t } = await initI18n({ config: (await configUnder(development)).i18n, context: 'api', language: 'fr' })

		const refus = new ValidationError(
			{ collection: 'profiles', errors: [{ label: 'Téléphone', message: 'Trop long.', path: 'telephone' }] },
			t
		)
		// Payload's French puts a no-break space before the colon.
		expect(refus.message).toBe('Le champ suivant n’est pas valide\u00a0: Téléphone')
		expect(new Forbidden(t).message).toBe('Vous n’êtes pas autorisé à effectuer cette action.')
		expect(t('validation:shorterThanMax', { maxLength: 70 })).toBe(
			'Cette valeur doit être inférieure à la longueur maximale de 70 caractères.'
		)
	})
})

/** A local port that counts who connects to it, and hangs up at once: never an SMTP server. */
async function countingPort() {
	let connections = 0
	const server = createServer(socket => {
		connections += 1
		socket.destroy()
	})
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
	const address = server.address()
	if (address === null || typeof address === 'string') throw new Error('no local port')
	return {
		port: address.port,
		connections: () => connections,
		close: () => new Promise(resolve => server.close(resolve)),
	}
}

/** The adapter the configuration holds, as Payload starts it. Nothing connects here either. */
async function emailOf(config: SanitizedConfig) {
	const adapter = await config.email
	if (!adapter) throw new Error('the configuration has no email adapter')
	return adapter({ payload: {} as Payload })
}

describe('the mails leave through the adapter of Payload, set by the environment', () => {
	const mail = { subject: 'Essai', text: 'Bonjour', to: 'lea@example.test' }

	test('SMTP_HOST, SMTP_PORT and EMAIL_FROM: the nodemailer adapter, under the sender of the environment', async () => {
		const relay = await countingPort()
		try {
			const config = await configUnder({
				...development,
				EMAIL_FROM: SENDER,
				SMTP_HOST: '127.0.0.1',
				SMTP_PORT: String(relay.port),
			})
			const email = await emailOf(config)

			expect(email.name).toBe('nodemailer')
			expect(email.defaultFromName).toBe('My Makeup')
			expect(email.defaultFromAddress).toBe('ne-pas-repondre@example.test')
			// Loading the configuration and starting the adapter opened nothing: the Payload CLI and the
			// scripts load this file with no relay within reach.
			expect(relay.connections()).toBe(0)

			// The first mail is what connects, and it goes where the environment says.
			await expect(email.sendEmail(mail)).rejects.toThrow()
			expect(relay.connections()).toBe(1)
		} finally {
			await relay.close()
		}
	})

	test('a relay that is stopped: the mail fails at once, and the error says where it was sent', async () => {
		const relay = await countingPort()
		await relay.close()
		const config = await configUnder({
			...development,
			EMAIL_FROM: SENDER,
			SMTP_HOST: '127.0.0.1',
			SMTP_PORT: String(relay.port),
		})
		const email = await emailOf(config)

		const start = performance.now()
		await expect(email.sendEmail(mail)).rejects.toThrow(`connect ECONNREFUSED 127.0.0.1:${relay.port}`)
		expect(performance.now() - start).toBeLessThan(5000)
	})

	test('a relay without its port or its sender: the configuration cannot be loaded', async () => {
		await expect(configUnder({ ...development, SMTP_HOST: '127.0.0.1' })).rejects.toBeInstanceOf(EnvError)
	})

	test('next build loads it with the silent adapter, even when the relay is in its environment', async () => {
		const config = await configUnder({
			EMAIL_FROM: SENDER,
			NEXT_PHASE: 'phase-production-build',
			NODE_ENV: 'production',
			SMTP_HOST: '127.0.0.1',
			SMTP_PORT: '1025',
		})

		expect(config.email).toBe(adapterWithoutRelay)
	})
})

// The two handlers, called directly. That Next really routes /api/graphql and
// /api/graphql-playground to them is the HTTP-level I05 of plan 02 §7.3: it belongs to
// tests/integration/payload-acces and comes with the integration bench (ticket 018).
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

	test('the site accepts its own origin and ignores the cookie from anywhere else', async () => {
		const extractJWT = await gate()
		const config = await configUnder(enLigne)
		const token = (headers: Record<string, string>) => extractJWT({ headers: from(headers), payload: { config } })

		expect(token({ Origin: 'https://my-makeup.fr' })).toBe('jeton-de-test')
		for (const origin of ['https://www.my-makeup.fr', 'https://exemple.test', 'http://localhost:3000', 'null'])
			expect({ origin, token: token({ Origin: origin }) }).toEqual({ origin, token: null })
	})

	test('without an Origin header, the browser must say the request comes from the site itself', async () => {
		const extractJWT = await gate()
		const config = await configUnder(enLigne)
		const token = (headers: Record<string, string>) => extractJWT({ headers: from(headers), payload: { config } })

		expect(token({ 'Sec-Fetch-Site': 'same-origin' })).toBe('jeton-de-test')
		expect(token({ 'Sec-Fetch-Site': 'cross-site' })).toBeNull()
		// A client that is not a browser sends neither header: its cookie is ignored.
		expect(token({})).toBeNull()
	})
})
