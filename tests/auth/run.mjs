// npm run test:auth : the AF-01 to AF-10 suite against a fake Strapi.
//
// 1. starts the fake Strapi (127.0.0.1:4111);
// 2. builds the app into .next-test-auth/ with the API pointing to it (the
//    real .next is never touched); AUTH_TEST_SKIP_BUILD=1 reuses that build;
// 3. starts two `next start`: revalidation on every read (3998) and a 2 s
//    window (3997, AF-05);
// 4. runs `node --test tests/auth/auth.test.mjs`, then stops everything.
//
// The children get a minimal environment: every variable of .env.exemple is
// set (to a local or empty value) so neither the shell nor a local .env file
// can point the test servers to the real API.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, openSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { demarrerFauxStrapi } from './mock-strapi.mjs'

const RACINE = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../..'
)
const DIST = '.next-test-auth'
const PORT_API = 4111
const PORT_APP = 3998
const PORT_APP_FENETRE = 3997
const FENETRE_MS = 2000
const API = `http://127.0.0.1:${PORT_API}`
const NEXT = path.join(RACINE, 'node_modules/next/dist/bin/next')
// outside DIST: `next build` empties it
const JOURNAUX = path.join(RACINE, `${DIST}-journaux`)
const HOTES_LOCAUX = new Set(['localhost', '127.0.0.1', '[::1]'])

// Variables documented in .env.exemple, all overridden for the children
const variablesDocumentees = readFileSync(
	path.join(RACINE, '.env.exemple'),
	'utf8'
)
	.split('\n')
	.map(ligne => /^([A-Z][A-Z0-9_]*)=/.exec(ligne)?.[1])
	.filter(Boolean)

function environnement(extra = {}) {
	const env = {}
	for (const nom of ['PATH', 'HOME', 'TMPDIR', 'LANG', 'CI']) {
		if (process.env[nom] !== undefined) env[nom] = process.env[nom]
	}
	for (const nom of variablesDocumentees) env[nom] = ''
	Object.assign(env, {
		NEXT_TELEMETRY_DISABLED: '1',
		NEXT_DIST_DIR: DIST,
		NEXT_PUBLIC_API_URL: API,
		API_INTERNAL_URL: API,
		NEXT_PUBLIC_URL: `http://localhost:${PORT_APP}`,
		NEXTAUTH_SECRET: randomBytes(32).toString('base64'),
		GOOGLE_CLIENT_ID: 'id-client-factice',
		GOOGLE_CLIENT_SECRET: 'secret-client-factice',
		// /u/* (Umami) leads nowhere: no request can reach the real instance
		UMAMI_ORIGIN: 'http://127.0.0.1:9',
		...extra,
	})
	for (const nom of [
		'NEXT_PUBLIC_API_URL',
		'API_INTERNAL_URL',
		'NEXTAUTH_URL',
		'NEXT_PUBLIC_URL',
		'UMAMI_ORIGIN',
	]) {
		if (env[nom] && !HOTES_LOCAUX.has(new URL(env[nom]).hostname))
			throw new Error(`${nom} doit viser une adresse locale (${env[nom]})`)
	}
	return env
}

const enfants = []
function lancer(args, env, journal) {
	const sortie = journal ? openSync(journal, 'w') : 'inherit'
	const enfant = spawn(process.execPath, args, {
		cwd: RACINE,
		env,
		stdio: ['ignore', sortie, sortie],
	})
	enfants.push(enfant)
	return enfant
}
const termine = enfant =>
	new Promise(resolve => enfant.on('exit', code => resolve(code ?? 1)))

async function attendrePret(url, enfant, delaiMs = 60_000) {
	const limite = Date.now() + delaiMs
	while (Date.now() < limite) {
		if (enfant.exitCode !== null) throw new Error(`serveur arrêté (${url})`)
		try {
			if ((await fetch(`${url}/api/auth/csrf`)).ok) return
		} catch {
			// not listening yet
		}
		await new Promise(resolve => setTimeout(resolve, 250))
	}
	throw new Error(`serveur pas prêt après ${delaiMs} ms (${url})`)
}

function arreter() {
	for (const enfant of enfants)
		if (enfant.exitCode === null) enfant.kill('SIGTERM')
}
process.on('SIGINT', () => {
	arreter()
	process.exit(130)
})

let code = 1
const fauxStrapi = await demarrerFauxStrapi(PORT_API)
try {
	mkdirSync(JOURNAUX, { recursive: true })
	if (process.env.AUTH_TEST_SKIP_BUILD !== '1') {
		console.log(`# build de test dans ${DIST}/ (API = faux Strapi)`)
		const build = lancer(
			[NEXT, 'build'],
			environnement({ NEXTAUTH_URL: `http://localhost:${PORT_APP}` }),
			path.join(JOURNAUX, 'build.log')
		)
		if ((await termine(build)) !== 0)
			throw new Error(`build en échec, voir ${DIST}-journaux/build.log`)
	}

	const serveurs = [
		[PORT_APP, '0', 'app.log'],
		[PORT_APP_FENETRE, String(FENETRE_MS), 'app-fenetre.log'],
	].map(([port, revalidation, journal]) => ({
		url: `http://localhost:${port}`,
		enfant: lancer(
			[NEXT, 'start', '-p', String(port), '-H', 'localhost'],
			environnement({
				NEXTAUTH_URL: `http://localhost:${port}`,
				AUTH_REVALIDATION_MS: revalidation,
			}),
			path.join(JOURNAUX, journal)
		),
	}))
	for (const { url, enfant } of serveurs) await attendrePret(url, enfant)

	const tests = lancer(
		[
			'--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
			'--test',
			'--test-concurrency=1',
			'tests/auth/auth.test.mjs',
		],
		{
			...environnement(),
			AF_APP: `http://localhost:${PORT_APP}`,
			AF_APP_FENETRE: `http://localhost:${PORT_APP_FENETRE}`,
			AF_FENETRE_MS: String(FENETRE_MS),
			AF_API: API,
			AF_JOURNAL: path.join(JOURNAUX, 'app.log'),
			AF_NEXT: NEXT,
			AF_DIST: DIST,
		}
	)
	code = await termine(tests)
} catch (erreur) {
	console.error(`# ${erreur.message}`)
	code = 1
} finally {
	arreter()
	fauxStrapi.closeAllConnections()
	fauxStrapi.close()
}
process.exit(code)
