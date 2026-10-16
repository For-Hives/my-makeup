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
export const ENVIRONNEMENTS = ['test', 'prod'] as const

/** The environments a test run is allowed to work in. */
export type EnvironnementAdmis = Exclude<(typeof ENVIRONNEMENTS)[number], 'prod'>

/** Thrown when the environment is refused. The message is safe to print: it holds no secret. */
export class EnvironnementRefuse extends Error {
	override name = 'EnvironnementRefuse'
}

const HOTES_LOCAUX = ['localhost', '127.0.0.1', '::1']

/** The services of the test stack, as named from inside its own container network. */
const SERVICES_DU_BANC = {
	base: 'postgres',
	mails: 'mailpit',
	stockage: 's3mock',
	google: 'faux-google',
	umami: 'faux-umami',
} as const

/**
 * Every host the bench answers on: this machine, and the services of the test stack under their
 * names. The outgoing HTTP bench lets a request to one of them through, and refuses any other
 * host (tests/outils/http-sortant.ts).
 */
export const HOTES_DU_BANC: readonly string[] = [...HOTES_LOCAUX, ...Object.values(SERVICES_DU_BANC)]

const DOMAINE_DU_SITE = 'my-makeup.fr'

/**
 * The address the end-to-end tests open, and the one the application writes in its links:
 * a test that follows a link read in a captured mail goes wherever the second one points.
 */
const ADRESSES = ['BASE_URL', 'NEXT_PUBLIC_SITE_URL'] as const

/** Variables that say through whom, or in whose name, mail is sent, whatever the provider. */
const FAMILLE_ENVOI = /^(SMTP|EMAIL|MAILGUN|RESEND)_/

/**
 * The client the application presents to Google, and its secret. On the bench both are made up
 * and say so: the word below is the allow-list, since a real credential cannot be told by its shape.
 */
const IDENTIFIANTS_GOOGLE = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const
const MARQUE_DU_FACTICE = /factice/i

/**
 * Query parameters of a connection string that name where to connect. The driver Payload uses
 * (`pg`, through pg-connection-string) lets `host` replace the host of the address; `hostaddr` does
 * the same for libpq. Read, they would have to be checked like the host; none is needed on the
 * bench, so they are refused.
 */
const PARAMETRES_D_HOTE = ['host', 'hostaddr'] as const

/** The site's domain or one of its subdomains, as a whole name (`not-my-makeup.fr` is another domain). */
const DOMAINE_REEL = /(?<![a-z0-9-])(?:[a-z0-9-]+\.)*my-makeup\.fr(?![a-z0-9-]|\.[a-z0-9])/i

function refuser(message: string): never {
	throw new EnvironnementRefuse(message)
}

/**
 * A value quoted for a message, only when it is a plain name (host, database, bucket).
 * Anything else may be a fragment of a secret: a password holding a `/` shifts the parts of a URL.
 */
const montrer = (valeur: string): string => (/^[\w.:-]{1,80}$/.test(valeur) ? `« ${valeur} »` : '(illisible)')

const lireAdresse = (valeur: string, protocoles: readonly string[]): URL | undefined => {
	const url = URL.canParse(valeur) ? new URL(valeur) : undefined
	return url && protocoles.includes(url.protocol) ? url : undefined
}

/** The host in lower case, without the brackets of an IPv6 literal. */
const hoteDe = (url: URL): string => url.hostname.replace(/^\[|\]$/g, '').toLowerCase()

const estLocal = (hote: string, service?: string): boolean => HOTES_LOCAUX.includes(hote) || hote === service

/** The site's domain and every subdomain are production. */
const estDeProd = (hote: string): boolean => hote === DOMAINE_DU_SITE || hote.endsWith(`.${DOMAINE_DU_SITE}`)

/**
 * The declared environment. Nothing declared means `test`: a test run that says nothing gets
 * the strictest rules.
 */
export function lireEnvironnement(valeur: string | undefined): EnvironnementAdmis {
	if (!valeur) return 'test'
	if (valeur === 'test') return valeur
	if (valeur === 'prod') refuser('APP_ENV vaut « prod » : aucun test ne tourne en environnement de prod.')
	return refuser(
		`APP_ENV vaut ${montrer(valeur)} : environnement inconnu. Reconnus : ${ENVIRONNEMENTS.join(', ')} (prod toujours refusé).`
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
export function verifierBase(uri: string | undefined, nom = 'DATABASE_URI'): void {
	if (!uri) return
	const url = lireAdresse(uri, ['postgres:', 'postgresql:'])
	if (!url) refuser(`${nom} n'est pas une adresse PostgreSQL lisible.`)
	// The value of the parameter is never quoted: it is where the connection would really go.
	const detour = PARAMETRES_D_HOTE.find(parametre => url.searchParams.has(parametre))
	if (detour)
		refuser(
			`Base refusée : ${nom} porte un paramètre « ${detour} », qui remplace l'hôte de l'adresse. Les tests ne lisent l'hôte de la base que dans l'adresse elle-même.`
		)
	const hote = hoteDe(url)
	const base = url.pathname.slice(1)
	if (!estLocal(hote, SERVICES_DU_BANC.base) || !base.endsWith('_test'))
		refuser(
			`Base refusée : hôte ${montrer(hote)}, base ${montrer(base)}. Les tests n'écrivent que dans une base locale dont le nom finit par « _test ».`
		)
}

/** The address the end-to-end tests open: local, and nothing else. Never production. */
// `_environnement` keeps the positional shape the callers have always used; there is a single environment now.
export function verifierCible(adresse: string, _environnement: EnvironnementAdmis = 'test', nom = 'BASE_URL'): void {
	const url = lireAdresse(adresse, ['http:', 'https:'])
	if (!url) refuser(`${nom} n'est pas une adresse web lisible.`)
	const hote = hoteDe(url)
	if (estDeProd(hote)) refuser(`${nom} vise la prod (${montrer(hote)}) : aucun test ne vise la prod.`)
	if (estLocal(hote)) return
	refuser(`${nom} refusée (hôte ${montrer(hote)}) : les tests visent une adresse locale.`)
}

/**
 * Mail goes to the local mail catcher only, and no sending variable may name the site's real
 * domain: a test sender lives on a reserved domain such as `example.test`. The API the tests
 * read and empty the catcher through is local too.
 */
export function verifierEnvoi(variables: Variables): void {
	const relais = variables.SMTP_HOST?.trim().toLowerCase()
	if (relais && !estLocal(relais, SERVICES_DU_BANC.mails))
		refuser(`SMTP_HOST refusé (${montrer(relais)}) : les tests n'envoient qu'au capteur de mails local.`)
	if (variables.MAILPIT_URL) {
		const url = lireAdresse(variables.MAILPIT_URL, ['http:', 'https:'])
		if (!url) refuser("MAILPIT_URL n'est pas une adresse web lisible.")
		const hote = hoteDe(url)
		if (!estLocal(hote, SERVICES_DU_BANC.mails))
			refuser(`MAILPIT_URL refusée (hôte ${montrer(hote)}) : les tests ne lisent que le capteur de mails local.`)
	}
	for (const [nom, valeur] of Object.entries(variables)) {
		if (!FAMILLE_ENVOI.test(nom)) continue
		const domaine = valeur?.match(DOMAINE_REEL)?.[0]
		if (domaine)
			refuser(
				`${nom} cite un domaine d'envoi réel (${montrer(domaine.toLowerCase())}) : les tests n'envoient qu'au nom d'un domaine réservé, comme example.test.`
			)
	}
}

/** Objects go to the local object storage only, in a bucket whose name ends with `-test`. */
export function verifierStockage(variables: Variables): void {
	if (variables.S3_ENDPOINT) {
		const url = lireAdresse(variables.S3_ENDPOINT, ['http:', 'https:'])
		if (!url) refuser("S3_ENDPOINT n'est pas une adresse web lisible.")
		const hote = hoteDe(url)
		if (!estLocal(hote, SERVICES_DU_BANC.stockage))
			refuser(`S3_ENDPOINT refusé (hôte ${montrer(hote)}) : les tests n'écrivent que dans le stockage local.`)
	}
	const bucket = variables.S3_BUCKET
	if (bucket && !bucket.endsWith('-test'))
		refuser(
			`S3_BUCKET refusé (${montrer(bucket)}) : les tests n'écrivent que dans un bucket dont le nom finit par « -test ».`
		)
}

/**
 * The Google sign-in talks to the fake Google of the bench only, with the made-up client of the
 * bench only. Without GOOGLE_OIDC_ISSUER the application would talk to Google itself: credentials
 * set without it are refused too. A value is never quoted: it may be a real secret.
 */
export function verifierGoogle(variables: Variables): void {
	const emetteur = variables.GOOGLE_OIDC_ISSUER
	if (emetteur) {
		const url = lireAdresse(emetteur, ['http:', 'https:'])
		if (!url) refuser("GOOGLE_OIDC_ISSUER n'est pas une adresse web lisible.")
		const hote = hoteDe(url)
		if (!estLocal(hote, SERVICES_DU_BANC.google))
			refuser(
				`GOOGLE_OIDC_ISSUER refusé (hôte ${montrer(hote)}) : les tests ne parlent qu'au faux Google du banc, jamais à Google.`
			)
	}
	for (const nom of IDENTIFIANTS_GOOGLE) {
		const valeur = variables[nom]
		if (!valeur) continue
		if (!emetteur)
			refuser(
				`${nom} est réglé sans GOOGLE_OIDC_ISSUER : la connexion Google viserait Google lui-même. Les tests ne parlent qu'au faux Google du banc.`
			)
		if (!MARQUE_DU_FACTICE.test(valeur))
			refuser(
				`${nom} refusé : sa valeur ne porte pas le mot « factice ». Les tests n'utilisent que le client factice du banc, jamais un vrai identifiant Google.`
			)
	}
}

/**
 * The audience measure goes to the fake Umami of the bench only: never to the real instance. A
 * test run that names no instance relays nothing (the relay answers 404 without one).
 */
export function verifierUmami(variables: Variables): void {
	const instance = variables.UMAMI_ORIGIN
	if (!instance) return
	const url = lireAdresse(instance, ['http:', 'https:'])
	if (!url) refuser("UMAMI_ORIGIN n'est pas une adresse web lisible.")
	const hote = hoteDe(url)
	if (!estLocal(hote, SERVICES_DU_BANC.umami))
		refuser(
			`UMAMI_ORIGIN refusé (hôte ${montrer(hote)}) : les tests ne parlent qu'au faux Umami du banc, jamais à la vraie instance.`
		)
}

/**
 * Every check, on the given variables. Returns the environment the run works in, or throws
 * `EnvironnementRefuse` on the first refusal.
 */
export function verifierEnvironnement(variables: Variables = process.env): EnvironnementAdmis {
	const environnement = lireEnvironnement(variables.APP_ENV)
	verifierBase(variables.DATABASE_URI)
	verifierBase(variables.STRAPI_SOURCE_URI, 'STRAPI_SOURCE_URI')
	for (const nom of ADRESSES) {
		const adresse = variables[nom]
		if (adresse) verifierCible(adresse, environnement, nom)
	}
	verifierEnvoi(variables)
	verifierStockage(variables)
	verifierGoogle(variables)
	verifierUmami(variables)
	return environnement
}

// The preload itself: the real environment is checked once, when this file is loaded. Exiting
// here, and not throwing, stops the run at once with a single message: bun reports an error
// thrown by a preload once per test file, with a stack trace, and carries on to the next file.
try {
	verifierEnvironnement()
} catch (erreur) {
	if (!(erreur instanceof EnvironnementRefuse)) throw erreur
	console.error(
		`\nTests arrêtés avant le premier test. ${erreur.message}\n` +
			'Les tests ne lisent jamais le fichier .env de travail : lance-les par « bun run test », ou ajoute --no-env-file à « bun test ».\n'
	)
	process.exit(1)
}
