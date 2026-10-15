import { z } from 'zod'
import { finDuNettoyage } from './auth/cookies-herites'
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
		| 'BASCULE_LE'
		| 'CONTACT_TO'
		| 'DATABASE_URI'
		| 'EMAIL_FROM'
		| 'GOOGLE_CLIENT_ID'
		| 'GOOGLE_CLIENT_SECRET'
		| 'GOOGLE_OIDC_ISSUER'
		| 'NEXT_PHASE'
		| 'NEXT_PUBLIC_SITE_URL'
		| 'NODE_ENV'
		| 'PAYLOAD_DROP_DATABASE'
		| 'PAYLOAD_SECRET'
		| 'PORT'
		| 'PREPROD_REMISE_A_ZERO'
		| 'S3_ACCESS_KEY_ID'
		| 'S3_BUCKET'
		| 'S3_ENDPOINT'
		| 'S3_SECRET_ACCESS_KEY'
		| 'SMTP_HOST'
		| 'SMTP_PASSWORD'
		| 'SMTP_PORT'
		| 'SMTP_USER'
		| 'STATS_TOKEN'
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
 * What the pre-production does that no other environment does (ticket 027, docs/preprod.md): it
 * loads the fictional set when it starts on an empty database (ticket 053), and empties its
 * database once for each new token of PREPROD_REMISE_A_ZERO.
 */
export type PreprodEnv = {
	/**
	 * True when the environment says it is the pre-production (`APP_ENV=preprod`): the fictional set
	 * is then loaded when the database is empty (ticket 053). Without it the start loads nothing,
	 * and says so in its log.
	 */
	jeuFictif: boolean
	/** The token of the reset asked for, or nothing: the database is kept. */
	remiseAZero?: string
}

/** The Umami instance the `/u` relay talks to. */
export type UmamiEnv = {
	/** An origin, with a path when the instance lives under one, and no final slash. */
	origin: string
	/** True when the instance is on this machine: the fake Umami of the test bench. */
	local: boolean
}

export type ServerEnv = {
	/**
	 * Who receives the messages of the contact form (ticket 158): CONTACT_TO, else on the site itself the
	 * public address of the team, else an address of the domain reserved for tests (nothing real is written
	 * to on a work station, the bench or the pre-production unless CONTACT_TO says so).
	 */
	contactTo: string
	/**
	 * Whether a new account must confirm its email before it can sign in (AUTH_VERIFY, ticket 082).
	 * On unless AUTH_VERIFY is « off »: the operating switch of the sign-up, for a day when the mail
	 * relay is down. Off, a new account is confirmed on the spot and signed in.
	 */
	authVerify: boolean
	databaseUri: string
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
	 * Set on the pre-production only: a production build served from its address (ticket 027).
	 * Nothing anywhere else, the site included.
	 */
	preprod?: PreprodEnv
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
	/** The only origins a session cookie is accepted from. Never empty: for Payload, empty means « any ». */
	trustedOrigins: string[]
}

/** Shorter than this, a secret is refused. `openssl rand -hex 32` gives 64 characters. */
export const SECRET_MIN_LENGTH = 32

/** The two deployed addresses a build can be made for: the site and its pre-production. */
export const DEPLOYED_ORIGINS: readonly string[] = ['https://my-makeup.fr', 'https://preprod.my-makeup.fr']

/** The address of the site itself: the only one where a mail relay is mandatory (ticket 073). */
export const SITE_ORIGIN = 'https://my-makeup.fr'

/** The Umami instance of the site today: the one the live site measures into. Never reached from anywhere else than the site. */
export const UMAMI_ORIGIN_DEFAULT = 'https://umami.wadefade.fr'

/** The address of the pre-production: the only one where the reset and the import at start may run. */
export const PREPROD_ORIGIN = 'https://preprod.my-makeup.fr'

/** The values of APP_ENV the application knows: the bench, the pre-production, the site. */
const APP_ENVS: readonly string[] = ['test', 'preprod', 'prod']

/**
 * A token of PREPROD_REMISE_A_ZERO: lower case letters, digits and hyphens, 8 to 64 characters,
 * such as « 2026-10-15-matin ». It is written into the database once the reset is done.
 */
export const JETON_DE_REMISE_A_ZERO = /^[a-z0-9][a-z0-9-]{7,63}$/

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
	APP_ENV:
		'« test » sur le banc de test, « preprod » sur la préprod, « prod » sur le site en ligne, ou absente sur un poste',
	AUTH_VERIFY: '« on » (la valeur par défaut) ou « off »',
	BASCULE_LE: 'une date au format AAAA-MM-JJ, comme « 2027-02-01 », qui existe',
	CONTACT_TO: 'une adresse email seule, comme « equipe@domaine »',
	DATABASE_URI: 'postgres://UTILISATEUR:MOT_DE_PASSE@HÔTE:PORT/BASE',
	EMAIL_FROM: '« Nom <adresse@domaine> », ou une adresse seule',
	GOOGLE_CLIENT_ID: 'l’identifiant du client OAuth de la console Google, avec GOOGLE_CLIENT_SECRET',
	GOOGLE_CLIENT_SECRET: 'le secret de ce client OAuth, avec GOOGLE_CLIENT_ID',
	GOOGLE_OIDC_ISSUER: `${GOOGLE_ISSUER}, ou sur ce poste l’adresse du faux Google du banc de test, comme http://127.0.0.1:7080, sans « / » final`,
	NEXT_PUBLIC_SITE_URL: `${DEPLOYED_ORIGINS.join(', ')} ou une adresse de ce poste comme http://localhost:${DEFAULT_PORT}, sans « / » final`,
	PAYLOAD_SECRET: `au moins ${SECRET_MIN_LENGTH} caractères, par exemple la sortie de « openssl rand -hex 32 »`,
	PREPROD_REMISE_A_ZERO: `un jeton de 8 à 64 caractères, minuscules, chiffres et tirets, comme « 2026-10-15-matin », et seulement sur la préprod (${PREPROD_ORIGIN}, en production)`,
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
	STATS_TOKEN: `au moins ${SECRET_MIN_LENGTH} caractères, par exemple la sortie de « openssl rand -hex 32 »`,
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
 *   The pre-production, a test and a development machine measure into nothing.
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
 * The pre-production, and what it is asked to do, or nothing (ticket 027). The pre-production is a
 * production build served from its own address: `next dev`, a test or the site never are.
 *
 * PREPROD_REMISE_A_ZERO empties the whole database: it is refused anywhere else than on the
 * pre-production, the site first, and the server does not start. A token it cannot read is refused
 * too.
 */
function preprodEnv(raw: RawEnv, problems: { variable: string; problem: string }[]): PreprodEnv | undefined {
	const preprod = raw.NODE_ENV === 'production' && raw.NEXT_PUBLIC_SITE_URL === PREPROD_ORIGIN
	// APP_ENV says where the application believes it runs; the fictional set reads it too (src/jeu-fictif/garde.ts).
	const appEnv = raw.APP_ENV?.trim()
	if (appEnv !== undefined && !APP_ENVS.includes(appEnv))
		problems.push({ variable: 'APP_ENV', problem: `illisible. Attendu : ${EXPECTED.APP_ENV}.` })
	else if (appEnv === 'preprod' && !preprod)
		problems.push({
			variable: 'APP_ENV',
			problem: `refusée, car ce n’est pas la préprod. Attendu : ${EXPECTED.APP_ENV}.`,
		})
	else if (preprod && appEnv !== undefined && appEnv !== 'preprod')
		problems.push({
			variable: 'APP_ENV',
			problem: `refusée, car cette application est servie depuis la préprod. Attendu : ${EXPECTED.APP_ENV}.`,
		})
	const jeton = raw.PREPROD_REMISE_A_ZERO?.trim()
	if (jeton !== undefined && !preprod)
		problems.push({
			variable: 'PREPROD_REMISE_A_ZERO',
			problem: `refusée, car elle efface toute la base et ce n’est pas la préprod. Attendu : ${EXPECTED.PREPROD_REMISE_A_ZERO}.`,
		})
	else if (jeton !== undefined && !JETON_DE_REMISE_A_ZERO.test(jeton))
		problems.push({
			variable: 'PREPROD_REMISE_A_ZERO',
			problem: `illisible. Attendu : ${EXPECTED.PREPROD_REMISE_A_ZERO}.`,
		})
	if (!preprod) return undefined
	return { jeuFictif: appEnv === 'preprod', ...(jeton !== undefined && { remiseAZero: jeton }) }
}

const required = z.string({ error: ABSENT })

const schema = z.object({
	AUTH_VERIFY: z
		.string()
		.refine(value => ['on', 'off'].includes(value.trim().toLowerCase()), { error: 'illisible' })
		.optional(),
	BASCULE_LE: z
		.string()
		.refine(value => finDuNettoyage(value) !== undefined, { error: 'illisible' })
		.optional(),
	CONTACT_TO: z
		.string()
		.refine(value => ADDRESS_ALONE.test(value.trim()), { error: 'illisible' })
		.optional(),
	DATABASE_URI: required.refine(value => postgresUrl(value) !== undefined, { error: 'illisible' }),
	GOOGLE_CLIENT_ID: z.string().optional(),
	GOOGLE_CLIENT_SECRET: z.string().optional(),
	GOOGLE_OIDC_ISSUER: z
		.string()
		.refine(value => oidcIssuer(value) !== undefined, { error: 'refusée' })
		.optional(),
	NEXT_PUBLIC_SITE_URL: z
		.string()
		.refine(value => siteOrigin(value) !== undefined, { error: 'refusée' })
		.optional(),
	PAYLOAD_SECRET: required.refine(value => value.trim().length >= SECRET_MIN_LENGTH, { error: 'trop courte' }),
	UMAMI_ORIGIN: z
		.string()
		.refine(value => umamiOrigin(value.trim()) !== undefined, { error: 'refusée' })
		.optional(),
	STATS_TOKEN: z
		.string()
		.refine(value => value.trim().length >= SECRET_MIN_LENGTH, { error: 'trop courte' })
		.optional(),
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

	const inSite = production && raw.NEXT_PUBLIC_SITE_URL === SITE_ORIGIN
	const mail = mailEnv(raw, problems, inSite)
	const storage = storageEnv(raw, problems)
	const preprod = preprodEnv(raw, problems)

	// A provider of this machine stands in for Google on this machine only. On the site and on
	// its pre-production, whatever NODE_ENV says, the Google sign-in talks to Google and nobody else.
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

	if (!parsed.success || problems.length > 0) throw new EnvError(problems)

	return {
		authVerify: parsed.data.AUTH_VERIFY?.trim().toLowerCase() !== 'off',
		contactTo: contactTo(parsed.data.CONTACT_TO, parsed.data.NEXT_PUBLIC_SITE_URL),
		databaseUri: parsed.data.DATABASE_URI,
		googleIssuer: issuer?.issuer ?? GOOGLE_ISSUER,
		...(raw.GOOGLE_CLIENT_ID !== undefined &&
			raw.GOOGLE_CLIENT_SECRET !== undefined && {
				google: { clientId: raw.GOOGLE_CLIENT_ID.trim(), clientSecret: raw.GOOGLE_CLIENT_SECRET.trim() },
			}),
		localDatabase: isLocalDatabase(parsed.data.DATABASE_URI),
		...(mail && { mail }),
		payloadSecret: parsed.data.PAYLOAD_SECRET,
		...(preprod && { preprod }),
		...(storage && { storage }),
		...(parsed.data.STATS_TOKEN !== undefined && { statsToken: parsed.data.STATS_TOKEN.trim() }),
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
		BASCULE_LE: process.env.BASCULE_LE,
		CONTACT_TO: process.env.CONTACT_TO,
		DATABASE_URI: process.env.DATABASE_URI,
		EMAIL_FROM: process.env.EMAIL_FROM,
		GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
		GOOGLE_OIDC_ISSUER: process.env.GOOGLE_OIDC_ISSUER,
		NEXT_PHASE: process.env.NEXT_PHASE,
		NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
		NODE_ENV: process.env.NODE_ENV,
		PAYLOAD_DROP_DATABASE: process.env.PAYLOAD_DROP_DATABASE,
		PAYLOAD_SECRET: process.env.PAYLOAD_SECRET,
		PORT: process.env.PORT,
		PREPROD_REMISE_A_ZERO: process.env.PREPROD_REMISE_A_ZERO,
		S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
		S3_BUCKET: process.env.S3_BUCKET,
		S3_ENDPOINT: process.env.S3_ENDPOINT,
		S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
		SMTP_HOST: process.env.SMTP_HOST,
		SMTP_PASSWORD: process.env.SMTP_PASSWORD,
		SMTP_PORT: process.env.SMTP_PORT,
		SMTP_USER: process.env.SMTP_USER,
		STATS_TOKEN: process.env.STATS_TOKEN,
		UMAMI_ORIGIN: process.env.UMAMI_ORIGIN,
	}
}

/**
 * The checked environment of this process.
 *
 * `next build` is the one exception: it loads the Payload configuration to compile the routes, and
 * must work with no secret and no database. Nothing is checked then, and a missing secret stays
 * empty: Payload refuses to start with an empty secret, so such a configuration cannot serve.
 * A build sends no mail either: it gets no relay, whatever its environment holds; and no storage.
 * Nor is it ever the pre-production: nothing is imported or reset while Next builds.
 */
export function serverEnv(source: RawEnv = processEnv()): ServerEnv {
	if (source.NEXT_PHASE !== BUILD_PHASE) return parseServerEnv(source)
	const raw = withoutBlanks(source)
	const site = raw.NEXT_PUBLIC_SITE_URL === undefined ? undefined : siteOrigin(raw.NEXT_PUBLIC_SITE_URL)
	return {
		// Not read while Next builds, where nothing signs anybody up: the server reads it when it starts.
		authVerify: true,
		// Not read while Next builds, where nothing is sent: the server reads it when it starts.
		contactTo: CONTACT_TO_TEST,
		databaseUri: raw.DATABASE_URI ?? '',
		// Not read while Next builds, where nothing talks to a provider: the server reads it when it starts.
		googleIssuer: GOOGLE_ISSUER,
		localDatabase: isLocalDatabase(raw.DATABASE_URI ?? ''),
		payloadSecret: raw.PAYLOAD_SECRET ?? '',
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
