import { z } from 'zod'
import { cleanupEnd } from './auth/legacy-cookies'
import {
	PHOTO_LIMIT_SETTINGS,
	type PhotoLimits,
	type PhotoLimitVariable,
	photoLimitsFrom,
	settingInvalid,
} from './photo-limits'
import {
	CONNECTION_TIMEOUT_MS,
	CONNECTION_TIMEOUT_RANGE,
	CONNECTIONS_MAX,
	CONNECTIONS_MAX_RANGE,
	DEFAULT_POOL_SIZE,
	type PoolSize,
} from './pool-base'
import { KEY_FORMAT } from './seo/indexnow'
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
 * below, called from next.config.ts. src/payload.config.ts reads it again, by `mediaBaseUrl`, for
 * the address of each photo.
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
		| 'APP_ENV'
		| 'AUTH_VERIFY'
		| 'CUTOVER_DATE'
		| 'CONTACT_TO'
		| 'DATABASE_POOL_MAX'
		| 'DATABASE_POOL_TIMEOUT_MS'
		| 'DATABASE_URI'
		| 'EMAIL_FROM'
		| 'GOOGLE_CLIENT_ID'
		| 'GOOGLE_CLIENT_SECRET'
		| 'GOOGLE_OIDC_ISSUER'
		| 'IMPORT_TARGET_IN_SERVICE'
		| 'IMPORT_CITIES'
		| 'IMPORT_CONSENT_DATE'
		| 'IMPORT_DECISIONS'
		| 'IMPORT_TOKEN'
		| 'IMPORT_MODE'
		| 'INDEXNOW_KEY'
		| 'NEXT_PHASE'
		| 'NEXT_PUBLIC_SITE_URL'
		| 'NEXT_PUBLIC_TURNSTILE_SITE_KEY'
		| 'NODE_ENV'
		| 'PAYLOAD_DROP_DATABASE'
		| 'PAYLOAD_SECRET'
		| 'PHOTO_PROFILE_MAX_COUNT'
		| 'PHOTO_PROFILE_MAX_MB'
		| 'PHOTO_SIDE_MAX_PX'
		| 'PHOTO_UPLOAD_MAX_MB'
		| 'PHOTO_WEBP_QUALITY'
		| 'PORT'
		| 'REMINDERS_SEND'
		| 'S3_ACCESS_KEY_ID'
		| 'S3_BUCKET'
		| 'S3_ENDPOINT'
		| 'S3_SECRET_ACCESS_KEY'
		| 'SMTP_HOST'
		| 'SMTP_PASSWORD'
		| 'SMTP_PORT'
		| 'SMTP_USER'
		| 'STATS_TOKEN'
		| 'STRAPI_SOURCE_URI'
		| 'TURNSTILE_SECRET_KEY'
		| 'UMAMI_ORIGIN',
		string
	>
>

/** The relay every mail of the application leaves through, and the sender it leaves under. */
export type MailEnv = {
	host: string
	port: number
	fromAddress: string
	fromName: string
	/** The login of the relay (ticket 073): set on the site, where Resend asks for one. Never logged. */
	auth?: { user: string; pass: string }
}

/**
 * The object storage the photos are written to (ticket 043): Cloudflare R2 on the site, the S3
 * simulator on the test bench. The keys never leave the server.
 */
export type StorageEnv = {
	/** The S3 API of the storage, an origin without a path: `https://<account>.r2.cloudflarestorage.com`. */
	endpoint: string
	bucket: string
	accessKeyId: string
	secretAccessKey: string
	/** True when the storage is on this machine: the test bench. */
	local: boolean
}

/**
 * The import of the old site that the deployed container runs on demand (ticket 233,
 * src/migration/on-demand-import.ts): asked for by a token, only on the site.
 */
export type ImportEnv = {
	/** The token of IMPORT_TOKEN: a token that was already played does nothing. */
	token: string
	/** `dry-run` writes nothing, `real` writes and reads again, `check` is a dry run that says whether the target is the source. */
	mode: ImportMode
	/** The table of decisions, as JSON text (identifiers only). Read by the import, which refuses a table it cannot read. */
	decisions?: string
	/** The date of the switch (`2026-11-02`, or with a time and a zone). */
	consentDate?: string
	/** The kept answers of the referential of the communes, as JSON text. Optional. */
	cities?: string
	/** `IMPORT_TARGET_IN_SERVICE=oui`: run on a target the v3 already uses. Never with `check`. */
	targetInService: boolean
}

export type ImportMode = 'dry-run' | 'real' | 'check'

/** The Umami instance the `/u` relay talks to. */
export type UmamiEnv = {
	/** An origin, with a path when the instance lives under one, and no final slash. */
	origin: string
	/** True when the instance is on this machine: the fake Umami of the test bench. */
	local: boolean
}

/** Cloudflare Turnstile on the contact form (ticket 1000): both keys, or the check is off. */
export type TurnstileEnv = {
	/** The secret key. Never leaves the server, never logged. */
	secret: string
	/** The public key of the widget. */
	siteKey: string
}

export type ServerEnv = {
	/**
	 * Who receives the messages of the contact form (ticket 158): CONTACT_TO, else on the site itself the
	 * public address of the team, else an address of the domain reserved for tests (nothing real is written
	 * to on a work station or the bench unless CONTACT_TO says so).
	 */
	contactTo: string
	/**
	 * Whether a new account must confirm its email before it can sign in (AUTH_VERIFY, ticket 082).
	 * On unless AUTH_VERIFY is « off »: the operating switch of the sign-up, for a day when the mail
	 * relay is down. Off, a new account is confirmed on the spot and signed in.
	 */
	authVerify: boolean
	databaseUri: string
	/** What a profile may store and how a photo is converted (PHOTO_*, ticket 309). */
	photoLimits: PhotoLimits
	/** The size of the connection pool and its wait limit (DATABASE_POOL_MAX, DATABASE_POOL_TIMEOUT_MS, ticket 268). */
	databasePool: PoolSize
	/**
	 * Set only on the site, when IMPORT_TOKEN is: the import the container runs once for this token
	 * (ticket 233). Nothing anywhere else, and never while Next builds.
	 */
	importation?: ImportEnv
	/**
	 * The Strapi database the import reads, through a read-only role on the internal network
	 * (STRAPI_SOURCE_URI). Nothing when unset. Only the import reads it.
	 */
	sourceStrapi?: string
	/**
	 * The OpenID Connect issuer the Google sign-in talks to: Google itself, or on this machine the
	 * fake provider of the test bench. Never a local one on a deployed site.
	 */
	googleIssuer: string
	/**
	 * The client of the Google sign-in (ticket 090): both variables set, or nothing. Without it the
	 * site has no Google button and the routes of the sign-in send the visitor back to the form. The
	 * secret never leaves the server and is never logged.
	 */
	google?: { clientId: string; clientSecret: string }
	/** True when the database is on this machine: the only place where Payload may push its schema. */
	localDatabase: boolean
	/**
	 * Nothing when SMTP_HOST is not set: Payload then gets no email adapter, and writes a log line
	 * in place of each mail.
	 */
	mail?: MailEnv
	payloadSecret: string
	/**
	 * Whether the reminders to the profiles that are close to publishable really leave (REMINDERS_SEND, issue 1006).
	 * True only when the variable is exactly « on »: absent, empty or any other value, nothing is sent, and the
	 * daily task only writes its internal report ("dry-run" list). Never refused at start: a typo must not stop the site.
	 */
	remindersSend: boolean
	/**
	 * Nothing when S3_ENDPOINT is not set: no photo can then be sent, and the application writes
	 * nothing on its own disk.
	 */
	storage?: StorageEnv
	/**
	 * The service token of /api/stats/weekly (ticket 149). Nothing when STATS_TOKEN is not set: the
	 * route then refuses every request.
	 */
	statsToken?: string
	/**
	 * The Umami instance behind the site's own `/u` path (ticket 111). Nothing when none is wired: `/u`
	 * then answers 404. On the site, unset means the current instance.
	 */
	umami?: UmamiEnv
	/**
	 * Nothing when TURNSTILE_SECRET_KEY is not set: the contact form then checks nothing with Cloudflare
	 * (the trap field and the brakes stay). Never a test key on the site.
	 */
	turnstile?: TurnstileEnv
	/** The only origins a session cookie is accepted from. Never empty: for Payload, empty means « any ». */
	trustedOrigins: string[]
}

/** Shorter than this, a secret is refused. `openssl rand -hex 32` gives 64 characters. */
export const SECRET_MIN_LENGTH = 32

/** The only deployed address a build can be made for: the site. There is no staging environment (ticket 232). */
export const DEPLOYED_ORIGINS: readonly string[] = ['https://my-makeup.fr']

/** The address of the site itself: the only one where a mail relay is mandatory (ticket 073). */
export const SITE_ORIGIN = 'https://my-makeup.fr'

/** The Umami instance of the site today: the one the live site measures into. Never reached from anywhere else than the site. */
export const UMAMI_ORIGIN_DEFAULT = 'https://umami.wadefade.fr'

/**
 * A token of IMPORT_TOKEN: lower case letters, digits and hyphens, 8 to 64 characters, such as
 * « 2026-11-02-essai-1 ». A token that was already played does nothing (it is kept in the database).
 */
export const IMPORT_TOKEN_PATTERN = /^[a-z0-9][a-z0-9-]{7,63}$/

/** The values of IMPORT_MODE. */
const IMPORT_MODES: readonly string[] = ['dry-run', 'real', 'check']

/** The values of APP_ENV the application knows: the bench and the site. Nothing else. */
const APP_ENVIRONMENTS: readonly string[] = ['test', 'prod']

/** Google's own OpenID Connect issuer: the only one a deployed site talks to. */
export const GOOGLE_ISSUER = 'https://accounts.google.com'

/** Where the photos of the site are served from today: the public address of the production bucket. */
export const MEDIA_ORIGIN_DEFAULT = 'https://r2-my-makeup.andy-cinquin.fr'

/** Names that can only be this machine. A compose service name or a private address is not one. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

/**
 * True for every way of writing a host that can only be this machine: the 127.0.0.0/8 range, 0.0.0.0, `::`,
 * `::1`, an IPv4-mapped IPv6 address, short or padded forms included. The URL parser does the normalising.
 */
export function isLoopbackHost(host: string): boolean {
	const bare = host.trim().replace(/^\[(.+)\]$/, '$1')
	let name: string
	try {
		name = new URL(bare.includes(':') ? `http://[${bare}]` : `http://${bare}`).hostname
	} catch {
		return false
	}
	return (
		name === 'localhost' ||
		name === '0.0.0.0' ||
		/^127\.\d+\.\d+\.\d+$/.test(name) ||
		name === '[::]' ||
		name === '[::1]' ||
		name.startsWith('[::ffff:')
	)
}

/** The value Next gives NEXT_PHASE while `next build` runs. */
const BUILD_PHASE = 'phase-production-build'

const DEFAULT_PORT = '3000'

const ABSENT = 'absente'

/** The name a mail is sent under when EMAIL_FROM holds an address alone. */
const DEFAULT_SENDER_NAME = 'My Makeup'

const EXPECTED = {
	APP_ENV: '« test » sur le banc de test, « prod » sur le site en ligne, ou absente sur un poste',
	AUTH_VERIFY: '« on » (la valeur par défaut) ou « off »',
	CUTOVER_DATE: 'une date au format AAAA-MM-JJ, comme « 2027-02-01 », qui existe',
	CONTACT_TO: 'une adresse email seule, comme « equipe@domaine »',
	DATABASE_POOL_MAX: `un nombre entier de connexions, de ${CONNECTIONS_MAX_RANGE.min} à ${CONNECTIONS_MAX_RANGE.max} (${CONNECTIONS_MAX} par défaut)`,
	DATABASE_POOL_TIMEOUT_MS: `une attente en millisecondes, de ${CONNECTION_TIMEOUT_RANGE.min} à ${CONNECTION_TIMEOUT_RANGE.max} (${CONNECTION_TIMEOUT_MS} par défaut)`,
	DATABASE_URI: 'postgres://UTILISATEUR:MOT_DE_PASSE@HÔTE:PORT/BASE',
	EMAIL_FROM: '« Nom <adresse@domaine> », ou une adresse seule',
	GOOGLE_CLIENT_ID: 'l’identifiant du client OAuth de la console Google, avec GOOGLE_CLIENT_SECRET',
	GOOGLE_CLIENT_SECRET: 'le secret de ce client OAuth, avec GOOGLE_CLIENT_ID',
	GOOGLE_OIDC_ISSUER: `${GOOGLE_ISSUER}, ou sur ce poste l’adresse du faux Google du banc de test, comme http://127.0.0.1:7080, sans « / » final`,
	IMPORT_TARGET_IN_SERVICE: '« oui » seulement, et jamais avec IMPORT_MODE=check',
	IMPORT_CITIES: 'un texte JSON',
	IMPORT_CONSENT_DATE: 'une date comme « 2026-11-02 », ou avec heure et fuseau comme « 2026-11-02T08:00:00Z »',
	IMPORT_DECISIONS: 'un texte JSON (la table de décision, des identifiants seulement)',
	IMPORT_TOKEN: `un jeton de 8 à 64 caractères, minuscules, chiffres et tirets, comme « 2026-11-02-essai-1 », et seulement sur le site (${SITE_ORIGIN}, en production, APP_ENV=prod)`,
	IMPORT_MODE: '« dry-run » (la valeur par défaut), « real » ou « check »',
	INDEXNOW_KEY: '32 caractères hexadécimaux en minuscules, comme la sortie de « openssl rand -hex 16 »',
	NEXT_PUBLIC_SITE_URL: `${DEPLOYED_ORIGINS.join(', ')} ou une adresse de ce poste comme http://localhost:${DEFAULT_PORT}, sans « / » final`,
	...photoExpected(),
	PAYLOAD_SECRET: `au moins ${SECRET_MIN_LENGTH} caractères, par exemple la sortie de « openssl rand -hex 32 »`,
	R2_PUBLIC_URL: 'une adresse https://HÔTE, sans chemin ni « / » final',
	S3_ACCESS_KEY_ID: 'l’identifiant de la clé d’accès au stockage des photos',
	S3_BUCKET: 'un nom d’espace : 3 à 63 caractères, minuscules, chiffres, points et tirets',
	S3_ENDPOINT:
		'l’adresse de l’API S3 du stockage, https://HÔTE, ou sur ce poste celle du banc de test, comme http://127.0.0.1:9090, sans chemin ni « / » final',
	S3_SECRET_ACCESS_KEY: 'le secret de cette clé',
	SMTP_HOST: 'un nom d’hôte seul, sans protocole ni port',
	SMTP_PASSWORD: 'le mot de passe du relais (pour Resend, une clé d’envoi), avec SMTP_USER',
	SMTP_PORT: 'un numéro de port, de 1 à 65535',
	SMTP_USER: 'l’identifiant du relais (pour Resend, « resend »), avec SMTP_PASSWORD',
	UMAMI_ORIGIN: `une origine https://HÔTE (un chemin est permis, jamais de paramètres), ou sur ce poste celle du faux Umami du banc de test, comme http://127.0.0.1:4200`,
	NEXT_PUBLIC_TURNSTILE_SITE_KEY:
		'la clé de site publique du widget Turnstile de Cloudflare, avec TURNSTILE_SECRET_KEY',
	TURNSTILE_SECRET_KEY: 'la clé secrète du widget Turnstile de Cloudflare, avec NEXT_PUBLIC_TURNSTILE_SITE_KEY',
	STATS_TOKEN: `au moins ${SECRET_MIN_LENGTH} caractères, par exemple la sortie de « openssl rand -hex 32 »`,
	STRAPI_SOURCE_URI: 'postgres://UTILISATEUR:MOT_DE_PASSE@HÔTE:PORT/BASE, le rôle en lecture seule de la base Strapi',
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
 * The issuer the Google sign-in talks to, when it is one of the two allowed kinds written in its
 * exact form: Google itself, or a provider of this machine (the fake Google of the test bench,
 * which stands in for Google by configuration).
 */
function oidcIssuer(value: string): { issuer: string; local: boolean } | undefined {
	if (value === GOOGLE_ISSUER) return { issuer: value, local: false }
	let url: URL
	try {
		url = new URL(value)
	} catch {
		return undefined
	}
	// Exact form only, as for the address of the site. Plain http: nothing local serves https.
	const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
	return url.origin === value && url.protocol === 'http:' && loopback ? { issuer: value, local: true } : undefined
}

/**
 * The Umami instance, when it is written in its exact form: an https origin (a path is allowed
 * when the instance lives under one), or on this machine an http one (the fake Umami of the test
 * bench serves no https). No credentials, no query, no fragment, no final slash.
 */
function umamiOrigin(value: string): UmamiEnv | undefined {
	let url: URL
	try {
		url = new URL(value)
	} catch {
		return undefined
	}
	if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') return undefined
	if (value.includes('?') || value.includes('#')) return undefined
	const path = url.pathname === '/' ? '' : url.pathname
	if (value !== `${url.origin}${path}`) return undefined
	const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
	if (url.protocol === 'https:') return { origin: value, local: loopback }
	return url.protocol === 'http:' && loopback ? { origin: value, local: true } : undefined
}

/**
 * The Umami instance behind `/u`, or nothing, for a site served from `site`.
 *
 * - Set: that instance, once it is written in its exact form.
 * - Unset: the instance of the site today, on the site (https://my-makeup.fr) and nowhere else.
 *   A test and a development machine measure into nothing.
 *
 * Read alone by the relay, which must not need the rest of the environment; an origin it cannot
 * read gives nothing here and stops the server when it starts (`parseServerEnv`).
 */
export function umamiFromEnv(
	value: string | undefined = process.env.UMAMI_ORIGIN,
	site: string | undefined = process.env.NEXT_PUBLIC_SITE_URL
): UmamiEnv | undefined {
	const set = value?.trim()
	if (set !== undefined && set !== '') return umamiOrigin(set)
	return site === SITE_ORIGIN ? { origin: UMAMI_ORIGIN_DEFAULT, local: false } : undefined
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

/**
 * Where the photos are served from, with the bucket in the path when there is one to add: the
 * public origin of the bucket (R2_PUBLIC_URL, or the one of the site in production), or on this
 * machine the S3 simulator of the test bench, which serves a bucket under its own name
 * (`http://127.0.0.1:9090/mymakeup-test`). The address of a photo is this, then its key.
 *
 * Read by src/payload.config.ts with the environment of the server. A refused R2_PUBLIC_URL throws,
 * as in `mediaOrigin`.
 */
export function mediaBaseUrl(r2PublicUrl: string | undefined, storage: StorageEnv | undefined): string {
	const set = r2PublicUrl !== undefined && r2PublicUrl.trim() !== ''
	if (!set && storage?.local) return `${storage.endpoint}/${storage.bucket}`
	return mediaOrigin(r2PublicUrl)
}

/** A bucket name as S3 and R2 accept it. */
const BUCKET_NAME = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/

/**
 * The endpoint of the storage, when it is written in its exact form: an https origin, or on this
 * machine an http one (the S3 simulator of the test bench serves no https).
 */
function storageEndpoint(value: string): { endpoint: string; local: boolean } | undefined {
	let url: URL
	try {
		url = new URL(value)
	} catch {
		return undefined
	}
	if (url.origin !== value) return undefined
	const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
	if (url.protocol === 'https:') return { endpoint: value, local: loopback }
	return url.protocol === 'http:' && loopback ? { endpoint: value, local: true } : undefined
}

/**
 * The storage of the photos. S3_ENDPOINT switches it on, and then asks for the three others: a
 * storage without a bucket or a key is refused when the server starts, not at the first photo.
 */
function storageEnv(raw: RawEnv, problems: { variable: string; problem: string }[]): StorageEnv | undefined {
	if (raw.S3_ENDPOINT === undefined) return undefined
	const refuse = (
		variable: 'S3_ACCESS_KEY_ID' | 'S3_BUCKET' | 'S3_ENDPOINT' | 'S3_SECRET_ACCESS_KEY',
		problem: string
	) => problems.push({ variable, problem: `${problem}. Attendu : ${EXPECTED[variable]}.` })
	const missing = `${ABSENT}, alors que S3_ENDPOINT est réglée`

	const endpoint = storageEndpoint(raw.S3_ENDPOINT)
	if (!endpoint) refuse('S3_ENDPOINT', 'refusée')
	if (raw.S3_BUCKET === undefined) refuse('S3_BUCKET', missing)
	else if (!BUCKET_NAME.test(raw.S3_BUCKET)) refuse('S3_BUCKET', 'refusée')
	if (raw.S3_ACCESS_KEY_ID === undefined) refuse('S3_ACCESS_KEY_ID', missing)
	if (raw.S3_SECRET_ACCESS_KEY === undefined) refuse('S3_SECRET_ACCESS_KEY', missing)

	// Like the fake Google: the simulator of this machine never stands in for the storage of a deployed site.
	if (endpoint?.local && raw.NEXT_PUBLIC_SITE_URL !== undefined && DEPLOYED_ORIGINS.includes(raw.NEXT_PUBLIC_SITE_URL))
		problems.push({
			variable: 'S3_ENDPOINT',
			problem:
				'refusée, car elle désigne un stockage de ce poste alors que le site est déployé. Un site déployé écrit ses photos dans son vrai stockage.',
		})

	if (!endpoint || !raw.S3_BUCKET || !raw.S3_ACCESS_KEY_ID || !raw.S3_SECRET_ACCESS_KEY) return undefined
	return {
		...endpoint,
		bucket: raw.S3_BUCKET,
		accessKeyId: raw.S3_ACCESS_KEY_ID,
		secretAccessKey: raw.S3_SECRET_ACCESS_KEY,
	}
}

/** A local address under both of its names: a browser may be opened on either. */
function withLoopbackTwin(origin: string): string[] {
	const url = new URL(origin)
	if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return [origin]
	const port = url.port === '' ? '' : `:${url.port}`
	return [`http://localhost${port}`, `http://127.0.0.1${port}`]
}

/**
 * In production, a build trusts the address it is served from and nothing else: no other address is trusted.
 * Everywhere else, only this machine is trusted: the port Next listens on, and the stated address
 * when it is a local one.
 */
function trustedOrigins(site: string | undefined, production: boolean, port: string | undefined): string[] {
	if (production && site) return withLoopbackTwin(site)
	const local = withLoopbackTwin(`http://localhost:${port && /^\d{1,5}$/.test(port) ? port : DEFAULT_PORT}`)
	const localSite = site && !DEPLOYED_ORIGINS.includes(site) ? withLoopbackTwin(site) : []
	return [...new Set([...local, ...localSite])]
}

/** The public address of the team: where the contact form writes on the site itself, and nowhere else by default. */
export const CONTACT_TO_SITE = 'contact@my-makeup.fr'

/** Where the contact form writes anywhere but the site when CONTACT_TO is not set: a domain reserved for tests. */
export const CONTACT_TO_TEST = 'contact@example.test'

/** A host name or an IP address, and nothing around it: no protocol, no port, no path, no bracket. */
const HOST_ALONE = /^(?:[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?|(?=(?:[^:]*:){2})[0-9a-f:]{2,39})$/i

/** `Name <address>`, the name between quotes or not. No control character: a line break would add a header. */
const NAMED_SENDER = /^"?([^<>"\p{Cc}]*?)"?\s*<([^<>"\s@\p{Cc}]+@[^<>"\s@\p{Cc}]+)>$/u
const ADDRESS_ALONE = /^[^<>"\s@\p{Cc}]+@[^<>"\s@\p{Cc}]+$/u

/** Who the mails are from, read from `Name <address>` or from an address alone. */
function sender(value: string): Pick<MailEnv, 'fromAddress' | 'fromName'> | undefined {
	const text = value.trim()
	if (ADDRESS_ALONE.test(text)) return { fromAddress: text, fromName: DEFAULT_SENDER_NAME }
	const [, name, address] = NAMED_SENDER.exec(text) ?? []
	return address ? { fromAddress: address, fromName: name?.trim() || DEFAULT_SENDER_NAME } : undefined
}

/** Who receives the contact form: CONTACT_TO, else the team on the site itself, else a domain reserved for tests. */
function contactTo(value: string | undefined, site: string | undefined): string {
	const set = value?.trim()
	if (set !== undefined && set !== '') return set
	return site === SITE_ORIGIN ? CONTACT_TO_SITE : CONTACT_TO_TEST
}

/**
 * The relay the mails leave through. SMTP_HOST switches it on, and then asks for the two others:
 * a relay without a port, or mails without a sender, are refused when the server starts and not
 * at the first mail.
 *
 * SMTP_USER and SMTP_PASSWORD go together (Resend: the user « resend », a sending key as
 * password). Without them the relay is used as it is given, which suits the mail catcher of the
 * test bench.
 *
 * On the site itself (`inSite`: a production build served from https://my-makeup.fr) a mail relay is mandatory, with its login, and none of this machine is accepted:
 * the application refuses to start instead of dropping the mails of its members (ticket 073).
 */
function mailEnv(raw: RawEnv, problems: { variable: string; problem: string }[], inSite: boolean): MailEnv | undefined {
	const refuse = (variable: CheckedVariable, problem: string) =>
		problems.push({ variable, problem: `${problem}. Attendu : ${EXPECTED[variable]}.` })
	if (raw.SMTP_HOST === undefined) {
		if (inSite)
			refuse(
				'SMTP_HOST',
				`${ABSENT}, alors qu’elle est obligatoire sur le site en ligne : sans relais, aucun mail ne partirait`
			)
		return undefined
	}
	const missing = `${ABSENT}, alors que SMTP_HOST est réglée`

	const host = raw.SMTP_HOST.trim()
	if (!HOST_ALONE.test(host)) refuse('SMTP_HOST', 'illisible')
	else if (inSite && isLoopbackHost(host))
		refuse('SMTP_HOST', 'refusée, car elle désigne un relais de ce poste alors que le site est déployé')

	const port = /^\d{1,5}$/.test(raw.SMTP_PORT?.trim() ?? '') ? Number(raw.SMTP_PORT) : Number.NaN
	if (raw.SMTP_PORT === undefined) refuse('SMTP_PORT', missing)
	else if (!(port >= 1 && port <= 65_535)) refuse('SMTP_PORT', 'illisible')

	const from = raw.EMAIL_FROM === undefined ? undefined : sender(raw.EMAIL_FROM)
	if (raw.EMAIL_FROM === undefined) refuse('EMAIL_FROM', missing)
	else if (!from) refuse('EMAIL_FROM', 'illisible')

	const lonely = (present: string, absent: CheckedVariable) =>
		refuse(absent, `${ABSENT}, alors que ${present} est réglée`)
	if (raw.SMTP_USER !== undefined && raw.SMTP_PASSWORD === undefined) lonely('SMTP_USER', 'SMTP_PASSWORD')
	if (raw.SMTP_PASSWORD !== undefined && raw.SMTP_USER === undefined) lonely('SMTP_PASSWORD', 'SMTP_USER')
	if (inSite && raw.SMTP_USER === undefined && raw.SMTP_PASSWORD === undefined) {
		refuse('SMTP_USER', `${ABSENT}, alors que le site en ligne n’envoie que par un relais authentifié`)
		refuse('SMTP_PASSWORD', `${ABSENT}, alors que le site en ligne n’envoie que par un relais authentifié`)
	}
	const auth = raw.SMTP_USER !== undefined && raw.SMTP_PASSWORD !== undefined
	return from
		? { host, port, ...from, ...(auth && { auth: { user: raw.SMTP_USER ?? '', pass: raw.SMTP_PASSWORD ?? '' } }) }
		: undefined
}

/**
 * APP_ENV says where the application believes it runs; the fictional set reads it too
 * (src/demo-data/guard.ts). Only « test » and « prod » exist: there is no staging
 * environment (ticket 232), so any other value is unreadable. The refusal names the
 * variable, never what it holds.
 */
function appEnvProblem(raw: RawEnv, problems: { variable: string; problem: string }[]): void {
	const appEnv = raw.APP_ENV?.trim()
	if (appEnv !== undefined && !APP_ENVIRONMENTS.includes(appEnv))
		problems.push({ variable: 'APP_ENV', problem: `illisible. Attendu : ${EXPECTED.APP_ENV}.` })
}

/** True when the text is JSON. */
function isJson(text: string): boolean {
	try {
		JSON.parse(text)
		return true
	} catch {
		return false
	}
}

/** A date written the way the import reads it: a day, or a day with a time and a zone. */
const CUTOVER_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/

/**
 * The import the container runs on demand (ticket 233), or nothing. It runs on the site only:
 * `NODE_ENV=production`, `APP_ENV=prod` and the address of the site. Any IMPORT_* variable is
 * refused anywhere else, so that a work station or the bench can never be asked to import.
 * The refusals name the variable, never its value.
 */
function importEnv(raw: RawEnv, problems: { variable: string; problem: string }[]): ImportEnv | undefined {
	const names = [
		'IMPORT_TARGET_IN_SERVICE',
		'IMPORT_CITIES',
		'IMPORT_CONSENT_DATE',
		'IMPORT_DECISIONS',
		'IMPORT_TOKEN',
		'IMPORT_MODE',
	] as const
	const set = names.filter(name => raw[name] !== undefined)
	if (set.length === 0) return undefined
	const onTheSite =
		raw.NODE_ENV === 'production' && raw.APP_ENV?.trim() === 'prod' && raw.NEXT_PUBLIC_SITE_URL === SITE_ORIGIN
	if (!onTheSite) {
		for (const variable of set)
			problems.push({
				variable,
				problem: `refusée, car ce n’est pas le site (${SITE_ORIGIN}, en production, APP_ENV=prod). Attendu : ${EXPECTED[variable]}.`,
			})
		return undefined
	}
	const before = problems.length
	const refuse = (variable: (typeof names)[number], problem = 'illisible') =>
		problems.push({ variable, problem: `${problem}. Attendu : ${EXPECTED[variable]}.` })
	const importToken = raw.IMPORT_TOKEN?.trim()
	if (importToken === undefined) {
		for (const variable of set) refuse(variable, `refusée, car IMPORT_TOKEN est ${ABSENT}`)
		return undefined
	}
	if (!IMPORT_TOKEN_PATTERN.test(importToken)) refuse('IMPORT_TOKEN')
	const mode = raw.IMPORT_MODE?.trim() ?? 'dry-run'
	const renamedMode = RENAMED_MODES.find(([old]) => old === mode)
	if (renamedMode)
		refuse('IMPORT_MODE', `ancienne valeur, refusée : « ${renamedMode[0]} » s’appelle maintenant « ${renamedMode[1]} »`)
	else if (!IMPORT_MODES.includes(mode)) refuse('IMPORT_MODE')
	const targetInService = raw.IMPORT_TARGET_IN_SERVICE?.trim()
	if (targetInService !== undefined && targetInService !== 'oui') refuse('IMPORT_TARGET_IN_SERVICE')
	else if (targetInService === 'oui' && mode === 'check')
		refuse(
			'IMPORT_TARGET_IN_SERVICE',
			'refusée avec IMPORT_MODE=check, qui ne compare pas les comptes laissés tels quels'
		)
	if (raw.IMPORT_CONSENT_DATE !== undefined) {
		const date = raw.IMPORT_CONSENT_DATE.trim()
		if (!CUTOVER_DATE_PATTERN.test(date) || Number.isNaN(Date.parse(date))) refuse('IMPORT_CONSENT_DATE')
	}
	for (const variable of ['IMPORT_DECISIONS', 'IMPORT_CITIES'] as const)
		if (raw[variable] !== undefined && !isJson(raw[variable])) refuse(variable)
	if (raw.STRAPI_SOURCE_URI === undefined)
		problems.push({
			variable: 'STRAPI_SOURCE_URI',
			problem: `${ABSENT}, alors qu’IMPORT_TOKEN est réglée. Attendu : ${EXPECTED.STRAPI_SOURCE_URI}.`,
		})
	if (problems.length > before) return undefined
	return {
		token: importToken,
		mode: mode as ImportMode,
		...(raw.IMPORT_DECISIONS !== undefined && { decisions: raw.IMPORT_DECISIONS }),
		...(raw.IMPORT_CONSENT_DATE !== undefined && { consentDate: raw.IMPORT_CONSENT_DATE.trim() }),
		...(raw.IMPORT_CITIES !== undefined && { cities: raw.IMPORT_CITIES }),
		targetInService: targetInService === 'oui',
	}
}

const required = z.string({ error: ABSENT })

/** A whole number written in digits only, within the range; nothing else (« 10.5 », « 1e1 », « 0x10 », « -1 »). */
function wholeNumberIn(value: string, range: { min: number; max: number }): number | undefined {
	const text = value.trim()
	if (!/^\d{1,6}$/.test(text)) return undefined
	const number = Number(text)
	return number >= range.min && number <= range.max ? number : undefined
}

/** The `EXPECTED` sentences of the photo settings (ticket 309): the range and the default of each. */
function photoExpected(): Record<PhotoLimitVariable, string> {
	const sentence = (name: PhotoLimitVariable, what: string): string => {
		const { min, max, fallback, unit } = PHOTO_LIMIT_SETTINGS[name]
		return `${what}, de ${min} à ${max}${unit === '' ? '' : ` ${unit}`} (${fallback} par défaut)`
	}
	return {
		PHOTO_UPLOAD_MAX_MB: sentence('PHOTO_UPLOAD_MAX_MB', 'un nombre entier de mégaoctets par envoi de photo'),
		PHOTO_PROFILE_MAX_COUNT: sentence('PHOTO_PROFILE_MAX_COUNT', 'un nombre entier de photos par profil'),
		PHOTO_PROFILE_MAX_MB: sentence('PHOTO_PROFILE_MAX_MB', 'un nombre entier de mégaoctets de photos par profil'),
		PHOTO_WEBP_QUALITY: sentence('PHOTO_WEBP_QUALITY', 'une qualité WebP entière'),
		PHOTO_SIDE_MAX_PX: sentence('PHOTO_SIDE_MAX_PX', 'un nombre entier de pixels pour le grand côté'),
	}
}

/** The schema entries of the photo settings: optional, a whole number in the range of each. */
function photoSchema() {
	const entry = (name: PhotoLimitVariable) =>
		z
			.string()
			.refine(value => !settingInvalid(name, value), { error: 'illisible' })
			.optional()
	return {
		PHOTO_UPLOAD_MAX_MB: entry('PHOTO_UPLOAD_MAX_MB'),
		PHOTO_PROFILE_MAX_COUNT: entry('PHOTO_PROFILE_MAX_COUNT'),
		PHOTO_PROFILE_MAX_MB: entry('PHOTO_PROFILE_MAX_MB'),
		PHOTO_WEBP_QUALITY: entry('PHOTO_WEBP_QUALITY'),
		PHOTO_SIDE_MAX_PX: entry('PHOTO_SIDE_MAX_PX'),
	}
}

const schema = z.object({
	AUTH_VERIFY: z
		.string()
		.refine(value => ['on', 'off'].includes(value.trim().toLowerCase()), { error: 'illisible' })
		.optional(),
	CUTOVER_DATE: z
		.string()
		.refine(value => cleanupEnd(value) !== undefined, { error: 'illisible' })
		.optional(),
	CONTACT_TO: z
		.string()
		.refine(value => ADDRESS_ALONE.test(value.trim()), { error: 'illisible' })
		.optional(),
	DATABASE_POOL_MAX: z
		.string()
		.refine(value => wholeNumberIn(value, CONNECTIONS_MAX_RANGE) !== undefined, { error: 'illisible' })
		.optional(),
	DATABASE_POOL_TIMEOUT_MS: z
		.string()
		.refine(value => wholeNumberIn(value, CONNECTION_TIMEOUT_RANGE) !== undefined, { error: 'illisible' })
		.optional(),
	DATABASE_URI: required.refine(value => postgresUrl(value) !== undefined, { error: 'illisible' }),
	GOOGLE_CLIENT_ID: z.string().optional(),
	GOOGLE_CLIENT_SECRET: z.string().optional(),
	GOOGLE_OIDC_ISSUER: z
		.string()
		.refine(value => oidcIssuer(value) !== undefined, { error: 'refusée' })
		.optional(),
	INDEXNOW_KEY: z
		.string()
		.refine(value => KEY_FORMAT.test(value.trim()), { error: 'illisible' })
		.optional(),
	STRAPI_SOURCE_URI: z
		.string()
		.refine(value => postgresUrl(value.trim()) !== undefined, { error: 'illisible' })
		.optional(),
	NEXT_PUBLIC_SITE_URL: z
		.string()
		.refine(value => siteOrigin(value) !== undefined, { error: 'refusée' })
		.optional(),
	...photoSchema(),
	PAYLOAD_SECRET: required.refine(value => value.trim().length >= SECRET_MIN_LENGTH, { error: 'trop courte' }),
	UMAMI_ORIGIN: z
		.string()
		.refine(value => umamiOrigin(value.trim()) !== undefined, { error: 'refusée' })
		.optional(),
	NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
	TURNSTILE_SECRET_KEY: z.string().optional(),
	STATS_TOKEN: z
		.string()
		.refine(value => value.trim().length >= SECRET_MIN_LENGTH, { error: 'trop courte' })
		.optional(),
})

/** An empty or blank variable is a missing one: `NAME=` in a .env file gives an empty text. */
function withoutBlanks(source: RawEnv): RawEnv {
	return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ''))
}

/** The test keys Cloudflare publishes (always passes, always blocks, token already spent). */
const TURNSTILE_TEST_KEY = /^[123]x0{10,}(AA|BB)$/

/**
 * The two keys of Turnstile (ticket 1000): both or none; none means the check is off. On the site itself,
 * one of Cloudflare's published test keys would let every bot through (or block everybody): the start is refused.
 */
function turnstileEnv(
	raw: RawEnv,
	problems: { variable: string; problem: string }[],
	inSite: boolean
): TurnstileEnv | undefined {
	const secret = raw.TURNSTILE_SECRET_KEY?.trim()
	const siteKey = raw.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()
	if (secret === undefined) return undefined
	if (siteKey === undefined) {
		problems.push({
			variable: 'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
			problem: `${ABSENT}, alors que TURNSTILE_SECRET_KEY est réglée. Attendu : ${EXPECTED.NEXT_PUBLIC_TURNSTILE_SITE_KEY}.`,
		})
		return undefined
	}
	if (inSite)
		for (const [variable, value] of [
			['TURNSTILE_SECRET_KEY', secret],
			['NEXT_PUBLIC_TURNSTILE_SITE_KEY', siteKey],
		] as const)
			if (TURNSTILE_TEST_KEY.test(value))
				problems.push({
					variable,
					problem: `refusée, car c’est une clé de test de Cloudflare et ceci est le site (${SITE_ORIGIN}). Attendu : ${EXPECTED[variable]}.`,
				})
	return { secret, siteKey }
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

	const inSite = production && raw.NEXT_PUBLIC_SITE_URL === SITE_ORIGIN
	const mail = mailEnv(raw, problems, inSite)
	const storage = storageEnv(raw, problems)
	appEnvProblem(raw, problems)
	const importation = importEnv(raw, problems)

	// A provider of this machine stands in for Google on this machine only. On the site,
	// whatever NODE_ENV says, the Google sign-in talks to Google and nobody else.
	const issuer = raw.GOOGLE_OIDC_ISSUER === undefined ? undefined : oidcIssuer(raw.GOOGLE_OIDC_ISSUER)
	if (issuer?.local && raw.NEXT_PUBLIC_SITE_URL !== undefined && DEPLOYED_ORIGINS.includes(raw.NEXT_PUBLIC_SITE_URL)) {
		problems.push({
			variable: 'GOOGLE_OIDC_ISSUER',
			problem:
				'refusée, car elle désigne un fournisseur de ce poste alors que le site est déployé. Un site déployé ne parle qu’à Google : retire cette variable.',
		})
	}

	// The client of the Google sign-in is both halves or nothing: one alone could never sign anybody in.
	for (const [present, absente] of [
		['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
		['GOOGLE_CLIENT_SECRET', 'GOOGLE_CLIENT_ID'],
	] as const)
		if (raw[present] !== undefined && raw[absente] === undefined)
			problems.push({
				variable: absente,
				problem: `${ABSENT}, alors que ${present} est réglée. Attendu : ${EXPECTED[absente]}.`,
			})

	// Nothing reaches the live instance of Umami from a site that is not the site, and no instance
	// of this machine stands in for it on a deployed one.
	const umami = parsed.success ? umamiFromEnv(raw.UMAMI_ORIGIN, raw.NEXT_PUBLIC_SITE_URL) : undefined
	const deployedElsewhere =
		raw.NEXT_PUBLIC_SITE_URL !== undefined &&
		DEPLOYED_ORIGINS.includes(raw.NEXT_PUBLIC_SITE_URL) &&
		raw.NEXT_PUBLIC_SITE_URL !== SITE_ORIGIN
	if (umami && raw.UMAMI_ORIGIN !== undefined) {
		if (umami.local && raw.NEXT_PUBLIC_SITE_URL !== undefined && DEPLOYED_ORIGINS.includes(raw.NEXT_PUBLIC_SITE_URL))
			problems.push({
				variable: 'UMAMI_ORIGIN',
				problem:
					'refusée, car elle désigne une instance de ce poste alors que le site est déployé. Un site déployé ne mesure que dans sa vraie instance.',
			})
		else if (deployedElsewhere && umami.origin === UMAMI_ORIGIN_DEFAULT)
			problems.push({
				variable: 'UMAMI_ORIGIN',
				problem:
					'refusée, car elle désigne l’instance du site alors que ce n’est pas le site. Seul le site mesure dans sa vraie instance : retire cette variable.',
			})
	}

	const turnstile = turnstileEnv(raw, problems, inSite)

	if (!parsed.success || problems.length > 0) throw new EnvError(problems)

	return {
		authVerify: parsed.data.AUTH_VERIFY?.trim().toLowerCase() !== 'off',
		contactTo: contactTo(parsed.data.CONTACT_TO, parsed.data.NEXT_PUBLIC_SITE_URL),
		databasePool: {
			max: wholeNumberIn(parsed.data.DATABASE_POOL_MAX ?? '', CONNECTIONS_MAX_RANGE) ?? CONNECTIONS_MAX,
			timeoutMs:
				wholeNumberIn(parsed.data.DATABASE_POOL_TIMEOUT_MS ?? '', CONNECTION_TIMEOUT_RANGE) ?? CONNECTION_TIMEOUT_MS,
		},
		databaseUri: parsed.data.DATABASE_URI,
		googleIssuer: issuer?.issuer ?? GOOGLE_ISSUER,
		...(importation && { importation }),
		...(parsed.data.STRAPI_SOURCE_URI !== undefined && { sourceStrapi: parsed.data.STRAPI_SOURCE_URI.trim() }),
		...(raw.GOOGLE_CLIENT_ID !== undefined &&
			raw.GOOGLE_CLIENT_SECRET !== undefined && {
				google: { clientId: raw.GOOGLE_CLIENT_ID.trim(), clientSecret: raw.GOOGLE_CLIENT_SECRET.trim() },
			}),
		localDatabase: isLocalDatabase(parsed.data.DATABASE_URI),
		...(mail && { mail }),
		payloadSecret: parsed.data.PAYLOAD_SECRET,
		photoLimits: photoLimitsFrom(parsed.data),
		remindersSend: raw.REMINDERS_SEND?.trim() === 'on',
		...(storage && { storage }),
		...(parsed.data.STATS_TOKEN !== undefined && { statsToken: parsed.data.STATS_TOKEN.trim() }),
		...(turnstile && { turnstile }),
		...(umami && { umami }),
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
		APP_ENV: process.env.APP_ENV,
		AUTH_VERIFY: process.env.AUTH_VERIFY,
		CUTOVER_DATE: process.env.CUTOVER_DATE,
		CONTACT_TO: process.env.CONTACT_TO,
		DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX,
		DATABASE_POOL_TIMEOUT_MS: process.env.DATABASE_POOL_TIMEOUT_MS,
		DATABASE_URI: process.env.DATABASE_URI,
		EMAIL_FROM: process.env.EMAIL_FROM,
		GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
		GOOGLE_OIDC_ISSUER: process.env.GOOGLE_OIDC_ISSUER,
		IMPORT_TARGET_IN_SERVICE: process.env.IMPORT_TARGET_IN_SERVICE,
		IMPORT_CITIES: process.env.IMPORT_CITIES,
		IMPORT_CONSENT_DATE: process.env.IMPORT_CONSENT_DATE,
		IMPORT_DECISIONS: process.env.IMPORT_DECISIONS,
		IMPORT_TOKEN: process.env.IMPORT_TOKEN,
		IMPORT_MODE: process.env.IMPORT_MODE,
		INDEXNOW_KEY: process.env.INDEXNOW_KEY,
		NEXT_PHASE: process.env.NEXT_PHASE,
		NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
		NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
		NODE_ENV: process.env.NODE_ENV,
		PAYLOAD_DROP_DATABASE: process.env.PAYLOAD_DROP_DATABASE,
		PAYLOAD_SECRET: process.env.PAYLOAD_SECRET,
		PHOTO_PROFILE_MAX_COUNT: process.env.PHOTO_PROFILE_MAX_COUNT,
		PHOTO_PROFILE_MAX_MB: process.env.PHOTO_PROFILE_MAX_MB,
		PHOTO_SIDE_MAX_PX: process.env.PHOTO_SIDE_MAX_PX,
		PHOTO_UPLOAD_MAX_MB: process.env.PHOTO_UPLOAD_MAX_MB,
		PHOTO_WEBP_QUALITY: process.env.PHOTO_WEBP_QUALITY,
		PORT: process.env.PORT,
		REMINDERS_SEND: process.env.REMINDERS_SEND,
		S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
		S3_BUCKET: process.env.S3_BUCKET,
		S3_ENDPOINT: process.env.S3_ENDPOINT,
		S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
		SMTP_HOST: process.env.SMTP_HOST,
		SMTP_PASSWORD: process.env.SMTP_PASSWORD,
		SMTP_PORT: process.env.SMTP_PORT,
		SMTP_USER: process.env.SMTP_USER,
		STATS_TOKEN: process.env.STATS_TOKEN,
		STRAPI_SOURCE_URI: process.env.STRAPI_SOURCE_URI,
		TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
		UMAMI_ORIGIN: process.env.UMAMI_ORIGIN,
	}
}

/**
 * The variables the English-names lot renamed (ticket 244): old name, new name. A variable under its old
 * name is refused at the start, so that an import is never asked for under a name nobody reads any more.
 * Plain pairs, not a Record: the old names are no variable of ours any more.
 */
export const RENAMED_VARIABLES: readonly (readonly [string, string])[] = [
	['IMPORT_JETON', 'IMPORT_TOKEN'],
	['IMPORT_CIBLE_EN_SERVICE', 'IMPORT_TARGET_IN_SERVICE'],
	['IMPORT_COMMUNES', 'IMPORT_CITIES'],
	['IMPORT_CONSENTEMENT_LE', 'IMPORT_CONSENT_DATE'],
	['BASCULE_LE', 'CUTOVER_DATE'],
]

/** The values of IMPORT_MODE that were renamed: old value, new value. */
const RENAMED_MODES: readonly (readonly [string, string])[] = [
	['a-blanc', 'dry-run'],
	['reel', 'real'],
	['controle', 'check'],
]

/**
 * One problem per variable that is set under an old name. The value is never shown. A value that is empty
 * once its spaces are cut is ignored, like a new name left blank: the old `.env.exemple` listed these
 * variables empty, and a `.env` copied from it must still start.
 */
export function renamedVariableProblems(
	environment: Readonly<Record<string, string | undefined>> = process.env
): { variable: string; problem: string }[] {
	return RENAMED_VARIABLES.filter(([old]) => (environment[old]?.trim() ?? '') !== '').map(([old, current]) => ({
		variable: old,
		problem: `ancien nom, refusé : cette variable s’appelle maintenant ${current}. Renomme-la, rien n’est lu sous l’ancien nom.`,
	}))
}

/**
 * The checked environment of this process.
 *
 * `next build` is the one exception: it loads the Payload configuration to compile the routes, and
 * must work with no secret and no database. Nothing is checked then, and a missing secret stays
 * empty: Payload refuses to start with an empty secret, so such a configuration cannot serve.
 * A build sends no mail either: it gets no relay, whatever its environment holds; and no storage.
 * Nothing is imported or reset while Next builds.
 */
export function serverEnv(
	source: RawEnv = processEnv(),
	environment: Readonly<Record<string, string | undefined>> = process.env
): ServerEnv {
	if (source.NEXT_PHASE !== BUILD_PHASE) {
		const renamed = renamedVariableProblems(environment)
		if (renamed.length > 0) throw new EnvError(renamed)
		return parseServerEnv(source)
	}
	const raw = withoutBlanks(source)
	const site = raw.NEXT_PUBLIC_SITE_URL === undefined ? undefined : siteOrigin(raw.NEXT_PUBLIC_SITE_URL)
	return {
		// Not read while Next builds, where nothing signs anybody up: the server reads it when it starts.
		authVerify: true,
		// Not read while Next builds, where nothing is sent: the server reads it when it starts.
		contactTo: CONTACT_TO_TEST,
		// Not read while Next builds, which opens no connection: the server reads it when it starts.
		databasePool: DEFAULT_POOL_SIZE,
		databaseUri: raw.DATABASE_URI ?? '',
		// Not read while Next builds, where nothing talks to a provider: the server reads it when it starts.
		googleIssuer: GOOGLE_ISSUER,
		localDatabase: isLocalDatabase(raw.DATABASE_URI ?? ''),
		payloadSecret: raw.PAYLOAD_SECRET ?? '',
		// Not read while Next builds, where nothing is sent: the server reads it when it starts.
		remindersSend: false,
		// Not read while Next builds, where nothing is received: the server reads it when it starts.
		photoLimits: photoLimitsFrom({}),
		trustedOrigins: trustedOrigins(site, raw.NODE_ENV === 'production', raw.PORT),
	}
}

/**
 * The service token of /api/stats/weekly, or nothing: unset, blank or shorter than a secret. Read
 * alone, so that the route answers 401 without the rest of the environment; a short value is
 * refused when the server starts (`parseServerEnv`).
 */
export function statsTokenFromEnv(value: string | undefined = process.env.STATS_TOKEN): string | undefined {
	const token = value?.trim()
	return token !== undefined && token.length >= SECRET_MIN_LENGTH ? token : undefined
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
