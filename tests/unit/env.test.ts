import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
	EnvError,
	GOOGLE_ISSUER,
	isLocalDatabase,
	parseServerEnv,
	type RawEnv,
	SECRET_MIN_LENGTH,
	serverEnv,
	versionEnv,
} from '@/lib/env'
import { deployedVersion } from '@/lib/version'

// Made-up values only. The remote address ends in `.test`, a name that never resolves.
const LOCAL_URI = 'postgres://banc:banc@127.0.0.1:5442/mymakeup_test'
const REMOTE_URI = 'postgres://banc:MOT-DE-PASSE-TEMOIN@base.exemple.test:5432/mymakeup_test'
const SECRET = 'k'.repeat(64)
const valid: RawEnv = { DATABASE_URI: LOCAL_URI, PAYLOAD_SECRET: SECRET }

/** The error this environment is refused with. Fails when it is accepted. */
function refusal(env: RawEnv): EnvError {
	try {
		parseServerEnv(env)
	} catch (error) {
		if (error instanceof EnvError) return error
		throw error
	}
	throw new Error('this environment was accepted')
}

describe('a missing or short secret stops the start', () => {
	test.each([
		['missing', undefined],
		['empty', ''],
		['blank', '   '],
	])('PAYLOAD_SECRET %s: refused as « absente »', (_case, secret) => {
		const error = refusal({ ...valid, PAYLOAD_SECRET: secret })
		expect(error.variables).toEqual(['PAYLOAD_SECRET'])
		expect(error.message).toContain('- PAYLOAD_SECRET : absente. Attendu : au moins 32 caractères')
	})

	test('PAYLOAD_SECRET one character too short: refused as « trop courte », the right length is accepted', () => {
		const error = refusal({ ...valid, PAYLOAD_SECRET: 'k'.repeat(SECRET_MIN_LENGTH - 1) })
		expect(error.variables).toEqual(['PAYLOAD_SECRET'])
		expect(error.message).toContain('- PAYLOAD_SECRET : trop courte. Attendu : au moins 32 caractères')

		const exact = 'k'.repeat(SECRET_MIN_LENGTH)
		expect(parseServerEnv({ ...valid, PAYLOAD_SECRET: exact }).payloadSecret).toBe(exact)
	})

	test('a short secret padded with spaces is still too short', () => {
		expect(refusal({ ...valid, PAYLOAD_SECRET: `court${' '.repeat(40)}` }).variables).toEqual(['PAYLOAD_SECRET'])
	})

	test('DATABASE_URI missing: refused as « absente »', () => {
		const error = refusal({ ...valid, DATABASE_URI: undefined })
		expect(error.variables).toEqual(['DATABASE_URI'])
		expect(error.message).toContain('- DATABASE_URI : absente. Attendu : postgres://')
	})

	test.each([
		['not an address', 'base locale'],
		['another database engine', 'mysql://banc:banc@127.0.0.1:3306/mymakeup_test'],
		['no host', 'postgres:///mymakeup_test'],
		['no database name', 'postgres://banc:banc@127.0.0.1:5442'],
	])('DATABASE_URI with %s: refused as « illisible »', (_case, uri) => {
		const error = refusal({ ...valid, DATABASE_URI: uri })
		expect(error.variables).toEqual(['DATABASE_URI'])
		expect(error.message).toContain('- DATABASE_URI : illisible. Attendu : postgres://')
	})

	test('every variable to fix is listed in one message', () => {
		const error = refusal({})
		expect(error.variables).toEqual(['DATABASE_URI', 'PAYLOAD_SECRET'])
		expect(error.message.split('\n')).toHaveLength(4)
		expect(error.message).toStartWith('Configuration invalide : l’application ne démarre pas.')
	})

	test('the message names the variables and never shows a value', () => {
		const refused: RawEnv = {
			DATABASE_URI: 'mysql://banc:MOT-DE-PASSE-TEMOIN@base.exemple.test:3306/base_temoin',
			NEXT_PUBLIC_SITE_URL: 'https://site-temoin.exemple.test',
			NODE_ENV: 'production',
			PAYLOAD_DROP_DATABASE: 'true',
			PAYLOAD_SECRET: 'secret-temoin',
		}
		const dropped: RawEnv = { ...valid, DATABASE_URI: REMOTE_URI, PAYLOAD_DROP_DATABASE: 'true' }

		const messages = [refusal(refused).message, refusal(dropped).message].join('\n')
		for (const variable of ['DATABASE_URI', 'NEXT_PUBLIC_SITE_URL', 'PAYLOAD_SECRET', 'PAYLOAD_DROP_DATABASE'])
			expect(messages).toContain(`- ${variable} : `)
		for (const part of ['TEMOIN', 'temoin', 'exemple.test', 'mysql', 'banc', 'mymakeup_test', '3306', '5432'])
			expect(messages).not.toContain(part)
	})

	test('a valid environment is given back as it is', () => {
		expect(parseServerEnv(valid)).toEqual({
			databaseUri: LOCAL_URI,
			googleIssuer: 'https://accounts.google.com',
			localDatabase: true,
			payloadSecret: SECRET,
			trustedOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
		})
	})
})

describe('the schema is pushed only into a database of this machine', () => {
	test.each([
		'postgres://banc:banc@localhost:5442/mymakeup_test',
		'postgres://banc:banc@LOCALHOST:5442/mymakeup_test',
		'postgresql://banc:banc@127.0.0.1/mymakeup_test',
		'postgres://banc:banc@[::1]:5442/mymakeup_test',
		'postgres://banc:banc@localhost:5442/mymakeup_test?host=127.0.0.1',
	])('local: %s', uri => {
		expect(isLocalDatabase(uri)).toBe(true)
		expect(parseServerEnv({ ...valid, DATABASE_URI: uri }).localDatabase).toBe(true)
	})

	test.each([
		REMOTE_URI,
		// A compose service name or a private address is another machine as far as a push is concerned.
		'postgres://banc:banc@postgres:5432/mymakeup_test',
		'postgres://banc:banc@10.0.0.5:5432/mymakeup_test',
		'postgres://banc:banc@192.168.1.20:5432/mymakeup_test',
		// Look-alikes of a local name.
		'postgres://banc:banc@localhost.exemple.test:5432/mymakeup_test',
		'postgres://banc:banc@127.0.0.1.exemple.test:5432/mymakeup_test',
		'postgres://banc:banc@%6cocalhost.exemple.test:5432/mymakeup_test',
		// `pg` connects to the `host` parameter, not to the host of the address.
		'postgres://banc:banc@localhost:5432/mymakeup_test?host=base.exemple.test',
		'postgres://banc:banc@127.0.0.1:5432/mymakeup_test?host=127.0.0.1&host=base.exemple.test',
		'postgres://banc:banc@localhost,base.exemple.test:5432/mymakeup_test',
	])('not local: %s', uri => {
		expect(isLocalDatabase(uri)).toBe(false)
		expect(parseServerEnv({ ...valid, DATABASE_URI: uri }).localDatabase).toBe(false)
	})

	test.each([
		'',
		'base locale',
		'postgres:///mymakeup_test',
		'/var/run/postgresql mymakeup_test',
	])('unreadable, so not local: « %s »', uri => {
		expect(isLocalDatabase(uri)).toBe(false)
	})

	test('PAYLOAD_DROP_DATABASE, which empties the database: refused unless the database is local', () => {
		const error = refusal({ ...valid, DATABASE_URI: REMOTE_URI, PAYLOAD_DROP_DATABASE: 'true' })
		expect(error.variables).toEqual(['PAYLOAD_DROP_DATABASE'])
		expect(error.message).toContain('- PAYLOAD_DROP_DATABASE : refusée, car la base n’est pas sur ce poste.')

		expect(() => parseServerEnv({ ...valid, PAYLOAD_DROP_DATABASE: 'true' })).not.toThrow()
		expect(() => parseServerEnv({ ...valid, DATABASE_URI: REMOTE_URI, PAYLOAD_DROP_DATABASE: 'false' })).not.toThrow()
	})
})

describe('trusted origins: the site, its pre-production and this machine, each for itself', () => {
	const production: RawEnv = { ...valid, DATABASE_URI: REMOTE_URI, NODE_ENV: 'production' }
	const origins = (env: RawEnv) => parseServerEnv(env).trustedOrigins

	test('outside production: this machine, on the port Next listens on', () => {
		expect(origins(valid)).toEqual(['http://localhost:3000', 'http://127.0.0.1:3000'])
		expect(origins({ ...valid, NODE_ENV: 'development', PORT: '3100' })).toEqual([
			'http://localhost:3100',
			'http://127.0.0.1:3100',
		])
		expect(origins({ ...valid, PORT: 'pas un port' })).toEqual(['http://localhost:3000', 'http://127.0.0.1:3000'])
	})

	test('outside production: a stated local address is added, a deployed one is not', () => {
		expect(origins({ ...valid, NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3123' })).toEqual([
			'http://localhost:3000',
			'http://127.0.0.1:3000',
			'http://localhost:3123',
			'http://127.0.0.1:3123',
		])
		expect(origins({ ...valid, NEXT_PUBLIC_SITE_URL: 'https://my-makeup.fr' })).toEqual([
			'http://localhost:3000',
			'http://127.0.0.1:3000',
		])
	})

	test('in production: the site trusts itself only, the pre-production trusts itself only', () => {
		expect(origins({ ...production, NEXT_PUBLIC_SITE_URL: 'https://my-makeup.fr' })).toEqual(['https://my-makeup.fr'])
		expect(origins({ ...production, NEXT_PUBLIC_SITE_URL: 'https://preprod.my-makeup.fr' })).toEqual([
			'https://preprod.my-makeup.fr',
		])
	})

	test('in production on this machine: the stated address under both of its names, whatever PORT says', () => {
		expect(origins({ ...production, NEXT_PUBLIC_SITE_URL: 'http://localhost:3123', PORT: '3000' })).toEqual([
			'http://localhost:3123',
			'http://127.0.0.1:3123',
		])
	})

	test('in production without NEXT_PUBLIC_SITE_URL: the start is refused', () => {
		const error = refusal(production)
		expect(error.variables).toEqual(['NEXT_PUBLIC_SITE_URL'])
		expect(error.message).toContain('- NEXT_PUBLIC_SITE_URL : absente, alors qu’elle est obligatoire en production.')
	})

	test.each([
		'https://exemple.test',
		'https://www.my-makeup.fr',
		// The temporary address of the production application before the switch (plan 01 §4.9).
		// Refused on purpose until the ticket that opens that address (185) adds it to
		// DEPLOYED_ORIGINS and moves this case to the accepted ones.
		'https://v3.my-makeup.fr',
		'https://my-makeup.fr.exemple.test',
		'https://preprod.my-makeup.fr.exemple.test',
		'http://my-makeup.fr',
		'https://my-makeup.fr/',
		'https://my-makeup.fr/admin',
		'https://MY-MAKEUP.fr',
		'https://localhost:3000',
		'http://localhost.exemple.test:3000',
		'http://192.168.1.20:3000',
		'my-makeup.fr',
		'*',
	])('any other address is refused, in production or not: %s', site => {
		for (const env of [valid, production]) {
			const error = refusal({ ...env, NEXT_PUBLIC_SITE_URL: site })
			expect(error.variables).toEqual(['NEXT_PUBLIC_SITE_URL'])
			expect(error.message).toContain('- NEXT_PUBLIC_SITE_URL : refusée. Attendu : https://my-makeup.fr, ')
		}
	})
})

describe('the Google sign-in talks to Google, or on this machine to the fake Google of the test bench', () => {
	const FAKE = 'http://127.0.0.1:7080'
	const production: RawEnv = { ...valid, DATABASE_URI: REMOTE_URI, NODE_ENV: 'production' }
	const SITE = 'https://my-makeup.fr'
	const PREPROD = 'https://preprod.my-makeup.fr'

	test('nothing set: Google itself, in production or not', () => {
		expect(GOOGLE_ISSUER).toBe('https://accounts.google.com')
		expect(parseServerEnv(valid).googleIssuer).toBe(GOOGLE_ISSUER)
		expect(parseServerEnv({ ...production, NEXT_PUBLIC_SITE_URL: SITE }).googleIssuer).toBe(GOOGLE_ISSUER)
		expect(parseServerEnv({ ...valid, GOOGLE_OIDC_ISSUER: '  ' }).googleIssuer).toBe(GOOGLE_ISSUER)
	})

	test('Google written out is accepted everywhere, the site and its pre-production included', () => {
		for (const env of [valid, { ...production, NEXT_PUBLIC_SITE_URL: SITE }])
			expect(parseServerEnv({ ...env, GOOGLE_OIDC_ISSUER: GOOGLE_ISSUER }).googleIssuer).toBe(GOOGLE_ISSUER)
	})

	test.each([
		['a development server', valid],
		['a development server that states a local address', { ...valid, NEXT_PUBLIC_SITE_URL: 'http://localhost:3100' }],
		// The end-to-end tests run a production build on this machine, against the bench.
		['a production build served on this machine', { ...production, NEXT_PUBLIC_SITE_URL: 'http://localhost:3100' }],
	])('the fake Google of the bench is accepted on this machine: %s', (_case, env) => {
		expect(parseServerEnv({ ...env, GOOGLE_OIDC_ISSUER: FAKE }).googleIssuer).toBe(FAKE)
		expect(parseServerEnv({ ...env, GOOGLE_OIDC_ISSUER: 'http://localhost:7219' }).googleIssuer).toBe(
			'http://localhost:7219'
		)
	})

	test.each([
		['the site, in production', { ...production, NEXT_PUBLIC_SITE_URL: SITE }],
		['the pre-production, in production', { ...production, NEXT_PUBLIC_SITE_URL: PREPROD }],
		['the address of the site, whatever NODE_ENV says', { ...valid, NEXT_PUBLIC_SITE_URL: SITE }],
		[
			'the address of the pre-production, in development',
			{ ...valid, NEXT_PUBLIC_SITE_URL: PREPROD, NODE_ENV: 'development' },
		],
	])('a local provider is refused on a deployed site: %s', (_case, env) => {
		for (const issuer of [FAKE, 'http://localhost:7080']) {
			const error = refusal({ ...env, GOOGLE_OIDC_ISSUER: issuer })
			expect(error.variables).toEqual(['GOOGLE_OIDC_ISSUER'])
			expect(error.message).toContain(
				'- GOOGLE_OIDC_ISSUER : refusée, car elle désigne un fournisseur de ce poste alors que le site est déployé. Un site déployé ne parle qu’à Google : retire cette variable.'
			)
			expect(error.message).not.toContain('7080')
		}
	})

	test.each([
		'https://connexion.exemple.test',
		'https://accounts.google.com/',
		'http://accounts.google.com',
		'https://accounts.google.com.exemple.test',
		'https://ACCOUNTS.google.com',
		// A provider of the bench is reached over plain http, on a loopback name, and nowhere else.
		'https://127.0.0.1:7080',
		'http://127.0.0.1:7080/',
		'http://127.0.0.1:7080/o/oauth2/v2/auth',
		'http://localhost.exemple.test:7080',
		'http://192.168.1.20:7080',
		'http://faux-google:7080',
		'127.0.0.1:7080',
	])('any other provider is refused, deployed or not: %s', issuer => {
		for (const env of [valid, { ...production, NEXT_PUBLIC_SITE_URL: SITE }]) {
			const error = refusal({ ...env, GOOGLE_OIDC_ISSUER: issuer })
			expect(error.variables).toEqual(['GOOGLE_OIDC_ISSUER'])
			expect(error.message).toContain(
				'- GOOGLE_OIDC_ISSUER : refusée. Attendu : https://accounts.google.com, ou sur ce poste l’adresse du faux Google du banc de test'
			)
			expect(error.message).not.toContain('exemple.test')
		}
	})
})

describe('the server stops when it starts with an environment that is not valid', () => {
	/**
	 * What src/instrumentation.ts runs when a server starts, in a process of its own: the only
	 * variables it sees are the ones given here, and no `.env` file is read.
	 */
	function start(env: RawEnv) {
		const script =
			"import { stopOnInvalidEnv } from './src/instrumentation-node'; stopOnInvalidEnv(); console.log('started')"
		const run = Bun.spawnSync([process.execPath, '--no-env-file', '-e', script], {
			cwd: `${import.meta.dir}/../..`,
			env: { ...env, PATH: process.env.PATH },
			stderr: 'pipe',
			stdout: 'pipe',
		})
		return { exitCode: run.exitCode, stderr: run.stderr.toString(), stdout: run.stdout.toString() }
	}

	test('a short secret: exit code 1, the message on the error output, no value and no stack trace', () => {
		const run = start({ ...valid, PAYLOAD_SECRET: 'secret-temoin' })
		expect(run.exitCode).toBe(1)
		expect(run.stdout).toBe('')
		expect(run.stderr.trim().split('\n')).toEqual([
			'Configuration invalide : l’application ne démarre pas.',
			'- PAYLOAD_SECRET : trop courte. Attendu : au moins 32 caractères, par exemple la sortie de « openssl rand -hex 32 ».',
			'Aucune valeur n’est affichée ici. La liste des variables est dans .env.exemple.',
		])
	})

	test('no variable at all: exit code 1, both secrets named', () => {
		const run = start({})
		expect(run.exitCode).toBe(1)
		expect(run.stdout).toBe('')
		expect(run.stderr).toContain('- DATABASE_URI : absente.')
		expect(run.stderr).toContain('- PAYLOAD_SECRET : absente.')
	})

	test('a valid environment: the start goes on', () => {
		expect(start(valid)).toEqual({ exitCode: 0, stderr: '', stdout: 'started\n' })
	})

	test('the production configuration with a local Google provider: exit code 1, the variable named, no value', () => {
		const run = start({
			...valid,
			DATABASE_URI: REMOTE_URI,
			GOOGLE_OIDC_ISSUER: 'http://127.0.0.1:7080',
			NEXT_PUBLIC_SITE_URL: 'https://my-makeup.fr',
			NODE_ENV: 'production',
		})
		expect(run.exitCode).toBe(1)
		expect(run.stdout).toBe('')
		expect(run.stderr.trim().split('\n')).toEqual([
			'Configuration invalide : l’application ne démarre pas.',
			'- GOOGLE_OIDC_ISSUER : refusée, car elle désigne un fournisseur de ce poste alors que le site est déployé. Un site déployé ne parle qu’à Google : retire cette variable.',
			'Aucune valeur n’est affichée ici. La liste des variables est dans .env.exemple.',
		])
	})

	test('the same local provider with the bench address of the site: the start goes on', () => {
		const run = start({
			...valid,
			GOOGLE_OIDC_ISSUER: 'http://127.0.0.1:7080',
			NEXT_PUBLIC_SITE_URL: 'http://localhost:3100',
			NODE_ENV: 'production',
		})
		expect(run).toEqual({ exitCode: 0, stderr: '', stdout: 'started\n' })
	})

	test('next build is never stopped', () => {
		expect(start({ NEXT_PHASE: 'phase-production-build' })).toEqual({ exitCode: 0, stderr: '', stdout: 'started\n' })
	})
})

describe('next build needs no secret and no database', () => {
	const building: RawEnv = { NEXT_PHASE: 'phase-production-build', NODE_ENV: 'production' }

	test('nothing is checked while Next builds, and nothing is made up', () => {
		expect(serverEnv(building)).toEqual({
			databaseUri: '',
			googleIssuer: 'https://accounts.google.com',
			localDatabase: false,
			payloadSecret: '',
			trustedOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
		})
	})

	test('the same empty environment is refused once the build is over', () => {
		expect(() => serverEnv({ NODE_ENV: 'production' })).toThrow(EnvError)
		expect(() => serverEnv({ NEXT_PHASE: 'phase-production-server', NODE_ENV: 'production' })).toThrow(EnvError)
	})

	test('the list of trusted origins is never empty: for Payload, an empty list trusts every origin', () => {
		for (const env of [building, { ...building, NEXT_PUBLIC_SITE_URL: 'https://exemple.test' }, valid])
			expect(serverEnv(env).trustedOrigins.length).toBeGreaterThan(0)
	})
})

// The reading behind /api/health: which variable gives the label, which one gives the commit.
// What the label looks like is the business of src/lib/version.ts (tests/unit/version.test.ts).
describe('the version of /api/health is read here and never checked', () => {
	const BUILD_COMMIT = 'a'.repeat(40)
	const RUNTIME_COMMIT = 'b'.repeat(40)

	test('NEXT_PUBLIC_APP_VERSION is the label, SOURCE_COMMIT the commit', () => {
		expect(versionEnv({ NEXT_PUBLIC_APP_VERSION: 'v3.1.0', SOURCE_COMMIT: RUNTIME_COMMIT })).toEqual({
			buildVersion: 'v3.1.0',
			commit: RUNTIME_COMMIT,
		})
	})

	test('the commit frozen into the build wins over the one of the running container', () => {
		const sources = versionEnv({ BUILD_SOURCE_COMMIT: BUILD_COMMIT, SOURCE_COMMIT: RUNTIME_COMMIT })

		expect(sources.commit).toBe(BUILD_COMMIT)
		expect(deployedVersion({ ...sources, packageVersion: '3.0.0' })).toBe('aaaaaaa')
	})

	test('a build that had no commit leaves an empty text: the commit of the container is read', () => {
		// next.config.ts writes '' into BUILD_SOURCE_COMMIT when SOURCE_COMMIT was not given to the build.
		const sources = versionEnv({ BUILD_SOURCE_COMMIT: '', SOURCE_COMMIT: RUNTIME_COMMIT })

		expect(sources.commit).toBe(RUNTIME_COMMIT)
		expect(deployedVersion({ ...sources, packageVersion: '3.0.0' })).toBe('bbbbbbb')
	})

	test('nothing set: nothing is made up, and the version falls back to package.json', () => {
		expect(versionEnv({})).toEqual({ buildVersion: undefined, commit: undefined })
		expect(deployedVersion({ ...versionEnv({}), packageVersion: '3.0.0' })).toBe('3.0.0')
	})

	test('no value is refused: a blank label and a commit that is not a sha are given as they are', () => {
		expect(versionEnv({ NEXT_PUBLIC_APP_VERSION: '  ', SOURCE_COMMIT: 'pas un commit' })).toEqual({
			buildVersion: '  ',
			commit: 'pas un commit',
		})
	})

	test('the health route reads them through this file, and reads the environment nowhere else', () => {
		const route = readFileSync(path.resolve(import.meta.dir, '../../src/app/api/health/route.ts'), 'utf8')

		expect(route).toContain('...versionEnv()')
		expect(route).not.toContain('process.env')
	})
})
