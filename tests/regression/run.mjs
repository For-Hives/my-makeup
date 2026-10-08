// npm run test:regression : the artist's space scenarios (RG-01 to RG-08,
// upload, forgotten password) and the public pages (profiles rendered on the
// server, slugs and 308, sitemap, robots, noindex, Open Graph, JSON-LD,
// search by city) in a real browser against a fake Strapi.
//
// 1. starts the fake Strapi (127.0.0.1:4112);
// 2. builds the app into .next-test-regression/ with the API pointing to it
//    and the forgotten password link on (the real .next is never touched);
//    REGRESSION_SKIP_BUILD=1 reuses that build;
// 3. starts `next start` on localhost:3996;
// 4. runs Playwright (tests/regression/playwright.config.mjs) with the
//    arguments given after `--`, then stops everything.
//
// Same isolation as tests/auth/run.mjs: the children get a minimal
// environment where every variable of .env.exemple is set (to a local or
// empty value), so neither the shell nor a local .env can point the test
// server to the real API.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, openSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { demarrerFauxStrapi } from './mock-api.mjs'

const RACINE = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../..'
)
const DIST = '.next-test-regression'
const PORT_API = 4112
const PORT_APP = 3996
const API = `http://127.0.0.1:${PORT_API}`
const APP = `http://localhost:${PORT_APP}`
const NEXT = path.join(RACINE, 'node_modules/next/dist/bin/next')
const PLAYWRIGHT = path.join(RACINE, 'node_modules/@playwright/test/cli.js')
// outside DIST: `next build` empties it
const JOURNAUX = path.join(RACINE, `${DIST}-journaux`)
const HOTES_LOCAUX = new Set(['localhost', '127.0.0.1', '[::1]'])

const variablesDocumentees = readFileSync(
	path.join(RACINE, '.env.exemple'),
	'utf8'
)
	.split('\n')
	.map(ligne => /^([A-Z][A-Z0-9_]*)=/.exec(ligne)?.[1])
	.filter(Boolean)

function environnement(extra = {}) {
	const env = {}
	for (const nom of [
		'PATH',
		'HOME',
		'TMPDIR',
		'LANG',
		'CI',
		'PLAYWRIGHT_BROWSERS_PATH',
	]) {
		if (process.env[nom] !== undefined) env[nom] = process.env[nom]
	}
	for (const nom of variablesDocumentees) env[nom] = ''
	Object.assign(env, {
		NEXT_TELEMETRY_DISABLED: '1',
		NEXT_DIST_DIR: DIST,
		NEXT_PUBLIC_API_URL: API,
		API_INTERNAL_URL: API,
		NEXT_PUBLIC_URL: APP,
		NEXTAUTH_URL: APP,
		NEXTAUTH_SECRET: randomBytes(32).toString('base64'),
		AUTH_REVALIDATION_MS: '0',
		GOOGLE_CLIENT_ID: 'id-client-factice',
		GOOGLE_CLIENT_SECRET: 'secret-client-factice',
		NEXT_PUBLIC_FORGOT_PASSWORD: 'on',
		...extra,
	})
	for (const nom of [
		'NEXT_PUBLIC_API_URL',
		'API_INTERNAL_URL',
		'NEXTAUTH_URL',
		'NEXT_PUBLIC_URL',
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
const fauxStrapi = await demarrerFauxStrapi(PORT_API, { origine: APP })
try {
	mkdirSync(JOURNAUX, { recursive: true })
	if (process.env.REGRESSION_SKIP_BUILD !== '1') {
		console.log(`# build de test dans ${DIST}/ (API = faux Strapi)`)
		const build = lancer(
			[NEXT, 'build'],
			environnement(),
			path.join(JOURNAUX, 'build.log')
		)
		if ((await termine(build)) !== 0)
			throw new Error(`build en échec, voir ${DIST}-journaux/build.log`)
	}

	const serveur = lancer(
		[NEXT, 'start', '-p', String(PORT_APP), '-H', 'localhost'],
		environnement(),
		path.join(JOURNAUX, 'app.log')
	)
	await attendrePret(APP, serveur)

	const tests = lancer(
		[
			PLAYWRIGHT,
			'test',
			'-c',
			'tests/regression/playwright.config.mjs',
			// e.g. npm run test:regression -- --grep RG-04
			...process.argv.slice(2),
		],
		{
			...environnement(),
			RG_APP: APP,
			RG_API: API,
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
