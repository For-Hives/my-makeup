import { z } from 'zod'
import type { VersionSources } from './version'

/**
 * The environment variables the server reads, checked in one place.
 *
 * Two callers, one rule:
 * - src/instrumentation.ts checks them when the server starts, and stops it when they are not valid;
 * - src/payload.config.ts checks them again, because the Payload CLI and the scripts load the
 *   configuration without starting the server.
 *
 * One variable is read earlier, when Next loads its configuration: R2_PUBLIC_URL, by `mediaOrigin`
 * below, called from next.config.ts.
 *
 * A variable is added here by the ticket that starts reading it, with its line in `.env.exemple`.
 * An error names the variable and what is expected, never the value it received.
 *
 * The optional variables behind the version of /api/health are read here too (`versionEnv`), and
 * never checked. next.config.ts reads SOURCE_COMMIT by itself, when Next loads its configuration:
 * it copies the commit of the build into the bundles, where `versionEnv` finds it.
 *
 * No `next` import: this file is also loaded by the Payload CLI, outside of Next.
 */

/** What `process.env` gives: every variable is text, or missing. */
export type RawEnv = Partial<
	Record<
		| 'DATABASE_URI'
		| 'NEXT_PHASE'
		| 'NEXT_PUBLIC_SITE_URL'
		| 'NODE_ENV'
		| 'PAYLOAD_DROP_DATABASE'
		| 'PAYLOAD_SECRET'
		| 'PORT',
		string
	>
>

export type ServerEnv = {
	databaseUri: string
	/** True when the database is on this machine: the only place where Payload may push its schema. */
	localDatabase: boolean
	payloadSecret: string
	/** The only origins a session cookie is accepted from. Never empty: for Payload, empty means « any ». */
	trustedOrigins: string[]
}

/** Shorter than this, a secret is refused. `openssl rand -hex 32` gives 64 characters. */
export const SECRET_MIN_LENGTH = 32

/** The two deployed addresses a build can be made for: the site and its pre-production. */
export const DEPLOYED_ORIGINS: readonly string[] = ['https://my-makeup.fr', 'https://preprod.my-makeup.fr']

/** Where the photos of the site are served from today: the public address of the production bucket. */
export const MEDIA_ORIGIN_DEFAULT = 'https://r2-my-makeup.andy-cinquin.fr'

/** Names that can only be this machine. A compose service name or a private address is not one. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

/** The value Next gives NEXT_PHASE while `next build` runs. */
const BUILD_PHASE = 'phase-production-build'

const DEFAULT_PORT = '3000'

const ABSENT = 'absente'

const EXPECTED = {
	DATABASE_URI: 'postgres://UTILISATEUR:MOT_DE_PASSE@HÔTE:PORT/BASE',
	NEXT_PUBLIC_SITE_URL: `${DEPLOYED_ORIGINS.join(', ')} ou une adresse de ce poste comme http://localhost:${DEFAULT_PORT}, sans « / » final`,
	PAYLOAD_SECRET: `au moins ${SECRET_MIN_LENGTH} caractères, par exemple la sortie de « openssl rand -hex 32 »`,
	R2_PUBLIC_URL: 'une adresse https://HÔTE, sans chemin ni « / » final',
} as const

type CheckedVariable = keyof typeof EXPECTED

/** The environment is not valid. The message is meant to be read by the person who starts the application. */
export class EnvError extends Error {
	/** Names of the variables to fix, without their values. */
	readonly variables: string[]

	constructor(problems: { variable: string; problem: string }[]) {
		super(
			[
				'Configuration invalide : l’application ne démarre pas.',
				...problems.map(({ variable, problem }) => `- ${variable} : ${problem}`),
				'Aucune valeur n’est affichée ici. La liste des variables est dans .env.exemple.',
			].join('\n')
		)
		this.name = 'EnvError'
		this.variables = problems.map(({ variable }) => variable)
	}
}

/** The connection string as an address, or nothing when it does not name a host and a database. */
function postgresUrl(uri: string): URL | undefined {
	let url: URL
	try {
		url = new URL(uri)
	} catch {
		return undefined
	}
	const known = url.protocol === 'postgres:' || url.protocol === 'postgresql:'
	return known && url.hostname !== '' && url.pathname.length > 1 ? url : undefined
}

/**
 * True when the connection string can only reach a database of this machine.
 *
 * `pg` lets a `?host=` parameter replace the host of the address: both are read, and every one of
 * them must be a loopback name. Anything unreadable is not local.
 */
export function isLocalDatabase(uri: string): boolean {
	const url = postgresUrl(uri)
	if (!url) return false
	return [url.hostname, ...url.searchParams.getAll('host')].every(host =>
		LOOPBACK_HOSTS.has(host.toLowerCase().replace(/^\[(.+)\]$/, '$1'))
	)
}

/** The origin this build is served from, when it is one of the allowed ones written in its exact form. */
function siteOrigin(value: string): string | undefined {
	let url: URL
	try {
		url = new URL(value)
	} catch {
		return undefined
	}
	// Exact form only: no path, no final « / », no upper case, no default port spelled out.
	if (url.origin !== value) return undefined
	if (DEPLOYED_ORIGINS.includes(value)) return value
	const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
	return url.protocol === 'http:' && loopback ? value : undefined
}

/**
 * A plain DNS name that ends with a top-level domain. No « * » and no bracket (Next reads the host
 * of an image pattern as a glob), no single label and no IP address.
 */
const PLAIN_HOST = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/

/**
 * The origin the photos are served from: the one remote host the image optimizer may fetch from,
 * and the one remote host the content policy names (next.config.ts).
 *
 * R2_PUBLIC_URL is public and read when the configuration of Next is loaded: by the build, which
 * writes the headers, and again by `next start`. Missing or blank, it is the production bucket.
 * A refused value throws: a build must stop rather than freeze a host nobody chose.
 */
export function mediaOrigin(raw: string | undefined): string {
	// As everywhere in this file, an empty or blank variable is a missing one.
	if (raw === undefined || raw.trim() === '') return MEDIA_ORIGIN_DEFAULT
	let url: URL | undefined
	try {
		url = new URL(raw)
	} catch {
		url = undefined
	}
	// Exact form only, as for the address of the site: https, a plain host, nothing after it.
	if (url?.protocol === 'https:' && url.origin === raw && PLAIN_HOST.test(url.hostname)) return raw
	throw new EnvError([{ variable: 'R2_PUBLIC_URL', problem: `refusée. Attendu : ${EXPECTED.R2_PUBLIC_URL}.` }])
}

/** A local address under both of its names: a browser may be opened on either. */
function withLoopbackTwin(origin: string): string[] {
	const url = new URL(origin)
	if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return [origin]
	const port = url.port === '' ? '' : `:${url.port}`
	return [`http://localhost${port}`, `http://127.0.0.1${port}`]
}

/**
 * In production, a build trusts the address it is served from and nothing else: the site does not
 * trust its pre-production, nor the other way round.
 * Everywhere else, only this machine is trusted: the port Next listens on, and the stated address
 * when it is a local one.
 */
function trustedOrigins(site: string | undefined, production: boolean, port: string | undefined): string[] {
	if (production && site) return withLoopbackTwin(site)
	const local = withLoopbackTwin(`http://localhost:${port && /^\d{1,5}$/.test(port) ? port : DEFAULT_PORT}`)
	const localSite = site && !DEPLOYED_ORIGINS.includes(site) ? withLoopbackTwin(site) : []
	return [...new Set([...local, ...localSite])]
}

const required = z.string({ error: ABSENT })

const schema = z.object({
	DATABASE_URI: required.refine(value => postgresUrl(value) !== undefined, { error: 'illisible' }),
	NEXT_PUBLIC_SITE_URL: z
		.string()
		.refine(value => siteOrigin(value) !== undefined, { error: 'refusée' })
		.optional(),
	PAYLOAD_SECRET: required.refine(value => value.trim().length >= SECRET_MIN_LENGTH, { error: 'trop courte' }),
})

/** An empty or blank variable is a missing one: `NAME=` in a .env file gives an empty text. */
function withoutBlanks(source: RawEnv): RawEnv {
	return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ''))
}

/**
 * Checks the variables and gives back what the configuration needs.
 * Throws one `EnvError` that lists every variable to fix.
 */
export function parseServerEnv(source: RawEnv): ServerEnv {
	const raw = withoutBlanks(source)
	const production = raw.NODE_ENV === 'production'
	const parsed = schema.safeParse(raw)
	const problems: { variable: string; problem: string }[] = (parsed.error?.issues ?? []).map(issue => {
		const variable = String(issue.path[0]) as CheckedVariable
		return { variable, problem: `${issue.message}. Attendu : ${EXPECTED[variable]}.` }
	})

	// A production build must say which address it is served from: without it, no origin could be trusted.
	if (production && raw.NEXT_PUBLIC_SITE_URL === undefined) {
		problems.push({
			variable: 'NEXT_PUBLIC_SITE_URL',
			problem: `${ABSENT}, alors qu’elle est obligatoire en production. Attendu : ${EXPECTED.NEXT_PUBLIC_SITE_URL}.`,
		})
	}

	// Payload empties the database when it connects with this variable set, whatever NODE_ENV says.
	const databaseIsReadable = raw.DATABASE_URI !== undefined && postgresUrl(raw.DATABASE_URI) !== undefined
	if (raw.PAYLOAD_DROP_DATABASE === 'true' && databaseIsReadable && !isLocalDatabase(raw.DATABASE_URI ?? '')) {
		problems.push({
			variable: 'PAYLOAD_DROP_DATABASE',
			problem: 'refusée, car la base n’est pas sur ce poste. Cette variable efface toutes les tables.',
		})
	}

	if (!parsed.success || problems.length > 0) throw new EnvError(problems)

	return {
		databaseUri: parsed.data.DATABASE_URI,
		localDatabase: isLocalDatabase(parsed.data.DATABASE_URI),
		payloadSecret: parsed.data.PAYLOAD_SECRET,
		trustedOrigins: trustedOrigins(parsed.data.NEXT_PUBLIC_SITE_URL, production, raw.PORT),
	}
}

/**
 * Each variable is read by its full name: that is how Next replaces a `NEXT_PUBLIC_*` variable by
 * its value when it builds. Such a variable is then frozen in the build; one that was missing at
 * build time is read when the server starts.
 */
function processEnv(): RawEnv {
	return {
		DATABASE_URI: process.env.DATABASE_URI,
		NEXT_PHASE: process.env.NEXT_PHASE,
		NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
		NODE_ENV: process.env.NODE_ENV,
		PAYLOAD_DROP_DATABASE: process.env.PAYLOAD_DROP_DATABASE,
		PAYLOAD_SECRET: process.env.PAYLOAD_SECRET,
		PORT: process.env.PORT,
	}
}

/**
 * The checked environment of this process.
 *
 * `next build` is the one exception: it loads the Payload configuration to compile the routes, and
 * must work with no secret and no database. Nothing is checked then, and a missing secret stays
 * empty: Payload refuses to start with an empty secret, so such a configuration cannot serve.
 */
export function serverEnv(source: RawEnv = processEnv()): ServerEnv {
	if (source.NEXT_PHASE !== BUILD_PHASE) return parseServerEnv(source)
	const raw = withoutBlanks(source)
	const site = raw.NEXT_PUBLIC_SITE_URL === undefined ? undefined : siteOrigin(raw.NEXT_PUBLIC_SITE_URL)
	return {
		databaseUri: raw.DATABASE_URI ?? '',
		localDatabase: isLocalDatabase(raw.DATABASE_URI ?? ''),
		payloadSecret: raw.PAYLOAD_SECRET ?? '',
		trustedOrigins: trustedOrigins(site, raw.NODE_ENV === 'production', raw.PORT),
	}
}

/** What `process.env` gives for the version shown by /api/health. All optional. */
export type RawVersionEnv = Partial<Record<'BUILD_SOURCE_COMMIT' | 'NEXT_PUBLIC_APP_VERSION' | 'SOURCE_COMMIT', string>>

/** Read by their full names, like `processEnv`: Next freezes the first two into the build. */
function processVersionEnv(): RawVersionEnv {
	return {
		BUILD_SOURCE_COMMIT: process.env.BUILD_SOURCE_COMMIT,
		NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
		SOURCE_COMMIT: process.env.SOURCE_COMMIT,
	}
}

/**
 * Where the version shown by /api/health comes from (src/lib/version.ts turns it into a label).
 *
 * Nothing is checked and nothing stops the start: any text is a label, and a commit that is not a
 * sha is ignored further on. The commit given to the build (BUILD_SOURCE_COMMIT, written by
 * next.config.ts, empty when the build had none) wins over the one of the running container.
 */
export function versionEnv(
	source: RawVersionEnv = processVersionEnv()
): Pick<VersionSources, 'buildVersion' | 'commit'> {
	return {
		buildVersion: source.NEXT_PUBLIC_APP_VERSION,
		commit: source.BUILD_SOURCE_COMMIT || source.SOURCE_COMMIT,
	}
}
