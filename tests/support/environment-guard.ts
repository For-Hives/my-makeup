/**
 * The guard of the test bench.
 *
 * bun loads this file before any test file (bunfig.toml, `[test] preload`). It stops the run
 * before the first test when the environment could reach anything else than the local bench:
 * a remote or non-test database, the production site, a real mail relay or sending domain,
 * a remote or non-test bucket, Google itself or its real credentials.
 *
 * Only when `bun test` is started from the repository root: bun reads the bunfig.toml of the
 * folder it is started in, not the one of a parent folder. Started from a sub-folder, the tests
 * run without this guard.
 *
 * Every destination is checked against an allow-list (local hosts, `_test` and `-test`
 * suffixes): a production host nobody thought of listing here is refused like the others.
 *
 * Messages are in French and never repeat a full value: a connection string holds a password.
 */

/** What the guard reads: `process.env`, or the content of an environment file. */
export type Variables = Readonly<Record<string, string | undefined>>

/**
 * The environments a test run may declare in `APP_ENV`. `prod` is recognised, and always refused.
 * There is no other: the v3 has a single deployed environment, the site, and the local bench (ticket 232).
 */
export const ENVIRONMENTS = ['test', 'prod'] as const

/** The environments a test run is allowed to work in. */
export type AcceptedEnvironment = Exclude<(typeof ENVIRONMENTS)[number], 'prod'>

/** Thrown when the environment is refused. The message is safe to print: it holds no secret. */
export class RefusedEnvironment extends Error {
	override name = 'EnvironnementRefuse'
}

const HOST_LOCAL = ['localhost', '127.0.0.1', '::1']

/** The services of the test stack, as named from inside its own container network. */
const BENCH_SERVICES = {
	base: 'postgres',
	mails: 'mailpit',
	stockage: 's3mock',
	google: 'fake-google',
	umami: 'fake-umami',
} as const

/**
 * Every host the bench answers on: this machine, and the services of the test stack under their
 * names. The outgoing HTTP bench lets a request to one of them through, and refuses any other
 * host (tests/support/outgoing-http.ts).
 */
export const BENCH_HOSTS: readonly string[] = [...HOST_LOCAL, ...Object.values(BENCH_SERVICES)]

const SITE_DOMAIN = 'my-makeup.fr'

/**
 * The address the end-to-end tests open, and the one the application writes in its links:
 * a test that follows a link read in a captured mail goes wherever the second one points.
 */
const URLS = ['BASE_URL', 'NEXT_PUBLIC_SITE_URL'] as const

/** Variables that say through whom, or in whose name, mail is sent, whatever the provider. */
const FAMILY_UPLOAD = /^(SMTP|EMAIL|MAILGUN|RESEND)_/

/**
 * The client the application presents to Google, and its secret. On the bench both are made up
 * and say so: the word below is the allow-list, since a real credential cannot be told by its shape.
 */
const IDENTIFIERS_GOOGLE = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const
const FAKE_MARK = /factice/i

/**
 * Query parameters of a connection string that name where to connect. The driver Payload uses
 * (`pg`, through pg-connection-string) lets `host` replace the host of the address; `hostaddr` does
 * the same for libpq. Read, they would have to be checked like the host; none is needed on the
 * bench, so they are refused.
 */
const HOST_PARAMETERS = ['host', 'hostaddr'] as const

/** The site's domain or one of its subdomains, as a whole name (`not-my-makeup.fr` is another domain). */
const REAL_DOMAIN = /(?<![a-z0-9-])(?:[a-z0-9-]+\.)*my-makeup\.fr(?![a-z0-9-]|\.[a-z0-9])/i

function refuse(message: string): never {
	throw new RefusedEnvironment(message)
}

/**
 * A value quoted for a message, only when it is a plain name (host, database, bucket).
 * Anything else may be a fragment of a secret: a password holding a `/` shifts the parts of a URL.
 */
const show = (valeur: string): string => (/^[\w.:-]{1,80}$/.test(valeur) ? `« ${valeur} »` : '(illisible)')

const readUrl = (valeur: string, protocoles: readonly string[]): URL | undefined => {
	const url = URL.canParse(valeur) ? new URL(valeur) : undefined
	return url && protocoles.includes(url.protocol) ? url : undefined
}

/** The host in lower case, without the brackets of an IPv6 literal. */
const hostOf = (url: URL): string => url.hostname.replace(/^\[|\]$/g, '').toLowerCase()

const isLocal = (hote: string, service?: string): boolean => HOST_LOCAL.includes(hote) || hote === service

/** The site's domain and every subdomain are production. */
const isProd = (hote: string): boolean => hote === SITE_DOMAIN || hote.endsWith(`.${SITE_DOMAIN}`)

/**
 * The declared environment. Nothing declared means `test`: a test run that says nothing gets
 * the strictest rules.
 */
export function readEnvironment(valeur: string | undefined): AcceptedEnvironment {
	if (!valeur) return 'test'
	if (valeur === 'test') return valeur
	if (valeur === 'prod') refuse('APP_ENV vaut « prod » : aucun test ne tourne en environnement de prod.')
	return refuse(
		`APP_ENV vaut ${show(valeur)} : environnement inconnu. Reconnus : ${ENVIRONMENTS.join(', ')} (prod toujours refusé).`
	)
}

/**
 * The database must be local and its name must end with `_test`. No database at all is fine.
 * `nom` is the variable the address comes from: `DATABASE_URI`, or `STRAPI_SOURCE_URI` for the
 * fake Strapi source the import reads (docs/tests/source-strapi.md).
 *
 * Exported for the tools that open the database themselves: the preload only runs when `bun test`
 * is started from the repository root, so such a tool calls `verifierBase` on the address it is
 * about to connect to.
 */
export function checkBase(uri: string | undefined, nom = 'DATABASE_URI'): void {
	if (!uri) return
	const url = readUrl(uri, ['postgres:', 'postgresql:'])
	if (!url) refuse(`${nom} n'est pas une adresse PostgreSQL lisible.`)
	// The value of the parameter is never quoted: it is where the connection would really go.
	const detour = HOST_PARAMETERS.find(parametre => url.searchParams.has(parametre))
	if (detour)
		refuse(
			`Base refusée : ${nom} porte un paramètre « ${detour} », qui remplace l'hôte de l'adresse. Les tests ne lisent l'hôte de la base que dans l'adresse elle-même.`
		)
	const host = hostOf(url)
	const base = url.pathname.slice(1)
	if (!isLocal(host, BENCH_SERVICES.base) || !base.endsWith('_test'))
		refuse(
			`Base refusée : hôte ${show(host)}, base ${show(base)}. Les tests n'écrivent que dans une base locale dont le nom finit par « _test ».`
		)
}

/** The address the end-to-end tests open: local, and nothing else. Never production. */
// `_environnement` keeps the positional shape the callers have always used; there is a single environment now.
export function checkTarget(adresse: string, _environnement: AcceptedEnvironment = 'test', nom = 'BASE_URL'): void {
	const url = readUrl(adresse, ['http:', 'https:'])
	if (!url) refuse(`${nom} n'est pas une adresse web lisible.`)
	const host = hostOf(url)
	if (isProd(host)) refuse(`${nom} vise la prod (${show(host)}) : aucun test ne vise la prod.`)
	if (isLocal(host)) return
	refuse(`${nom} refusée (hôte ${show(host)}) : les tests visent une adresse locale.`)
}

/**
 * Mail goes to the local mail catcher only, and no sending variable may name the site's real
 * domain: a test sender lives on a reserved domain such as `example.test`. The API the tests
 * read and empty the catcher through is local too.
 */
export function checkUpload(variables: Variables): void {
	const relay = variables.SMTP_HOST?.trim().toLowerCase()
	if (relay && !isLocal(relay, BENCH_SERVICES.mails))
		refuse(`SMTP_HOST refusé (${show(relay)}) : les tests n'envoient qu'au capteur de mails local.`)
	if (variables.MAILPIT_URL) {
		const url = readUrl(variables.MAILPIT_URL, ['http:', 'https:'])
		if (!url) refuse("MAILPIT_URL n'est pas une adresse web lisible.")
		const host = hostOf(url)
		if (!isLocal(host, BENCH_SERVICES.mails))
			refuse(`MAILPIT_URL refusée (hôte ${show(host)}) : les tests ne lisent que le capteur de mails local.`)
	}
	for (const [name, value] of Object.entries(variables)) {
		if (!FAMILY_UPLOAD.test(name)) continue
		const domain = value?.match(REAL_DOMAIN)?.[0]
		if (domain)
			refuse(
				`${name} cite un domaine d'envoi réel (${show(domain.toLowerCase())}) : les tests n'envoient qu'au nom d'un domaine réservé, comme example.test.`
			)
	}
}

/** Objects go to the local object storage only, in a bucket whose name ends with `-test`. */
export function checkStorage(variables: Variables): void {
	if (variables.S3_ENDPOINT) {
		const url = readUrl(variables.S3_ENDPOINT, ['http:', 'https:'])
		if (!url) refuse("S3_ENDPOINT n'est pas une adresse web lisible.")
		const host = hostOf(url)
		if (!isLocal(host, BENCH_SERVICES.stockage))
			refuse(`S3_ENDPOINT refusé (hôte ${show(host)}) : les tests n'écrivent que dans le stockage local.`)
	}
	const bucket = variables.S3_BUCKET
	if (bucket && !bucket.endsWith('-test'))
		refuse(
			`S3_BUCKET refusé (${show(bucket)}) : les tests n'écrivent que dans un bucket dont le nom finit par « -test ».`
		)
}

/**
 * The Google sign-in talks to the fake Google of the bench only, with the made-up client of the
 * bench only. Without GOOGLE_OIDC_ISSUER the application would talk to Google itself: credentials
 * set without it are refused too. A value is never quoted: it may be a real secret.
 */
export function checkGoogle(variables: Variables): void {
	const issuer = variables.GOOGLE_OIDC_ISSUER
	if (issuer) {
		const url = readUrl(issuer, ['http:', 'https:'])
		if (!url) refuse("GOOGLE_OIDC_ISSUER n'est pas une adresse web lisible.")
		const host = hostOf(url)
		if (!isLocal(host, BENCH_SERVICES.google))
			refuse(
				`GOOGLE_OIDC_ISSUER refusé (hôte ${show(host)}) : les tests ne parlent qu'au faux Google du banc, jamais à Google.`
			)
	}
	for (const name of IDENTIFIERS_GOOGLE) {
		const value = variables[name]
		if (!value) continue
		if (!issuer)
			refuse(
				`${name} est réglé sans GOOGLE_OIDC_ISSUER : la connexion Google viserait Google lui-même. Les tests ne parlent qu'au faux Google du banc.`
			)
		if (!FAKE_MARK.test(value))
			refuse(
				`${name} refusé : sa valeur ne porte pas le mot « factice ». Les tests n'utilisent que le client factice du banc, jamais un vrai identifiant Google.`
			)
	}
}

/**
 * The audience measure goes to the fake Umami of the bench only: never to the real instance. A
 * test run that names no instance relays nothing (the relay answers 404 without one).
 */
export function checkUmami(variables: Variables): void {
	const instance = variables.UMAMI_ORIGIN
	if (!instance) return
	const url = readUrl(instance, ['http:', 'https:'])
	if (!url) refuse("UMAMI_ORIGIN n'est pas une adresse web lisible.")
	const host = hostOf(url)
	if (!isLocal(host, BENCH_SERVICES.umami))
		refuse(
			`UMAMI_ORIGIN refusé (hôte ${show(host)}) : les tests ne parlent qu'au faux Umami du banc, jamais à la vraie instance.`
		)
}

/**
 * No test run asks for the import of the old site: IMPORT_* variables are for the deployed site, where a
 * token makes the container import (ticket 233). The tests of the import give their options as arguments.
 * A value is never quoted.
 */
export function checkImport(variables: Variables): void {
	const name = Object.keys(variables).find(cle => /^IMPORT_/.test(cle) && variables[cle]?.trim())
	if (name)
		refuse(
			`${name} est réglé : aucun test ne lance l'import à la demande. Cette variable ne vaut que sur le site déployé.`
		)
}

/**
 * Every check, on the given variables. Returns the environment the run works in, or throws
 * `EnvironnementRefuse` on the first refusal.
 */
export function checkEnvironment(variables: Variables = process.env): AcceptedEnvironment {
	const environment = readEnvironment(variables.APP_ENV)
	checkBase(variables.DATABASE_URI)
	checkBase(variables.STRAPI_SOURCE_URI, 'STRAPI_SOURCE_URI')
	for (const name of URLS) {
		const address = variables[name]
		if (address) checkTarget(address, environment, name)
	}
	checkUpload(variables)
	checkStorage(variables)
	checkGoogle(variables)
	checkUmami(variables)
	checkImport(variables)
	return environment
}

// The preload itself: the real environment is checked once, when this file is loaded. Exiting
// here, and not throwing, stops the run at once with a single message: bun reports an error
// thrown by a preload once per test file, with a stack trace, and carries on to the next file.
try {
	checkEnvironment()
} catch (error) {
	if (!(error instanceof RefusedEnvironment)) throw error
	console.error(
		`\nTests arrêtés avant le premier test. ${error.message}\n` +
			'Les tests ne lisent jamais le fichier .env de travail : lance-les par « bun run test », ou ajoute --no-env-file à « bun test ».\n'
	)
	process.exit(1)
}
