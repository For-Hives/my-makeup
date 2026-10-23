import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
	DEPLOYED_ORIGINS,
	EnvError,
	GOOGLE_ISSUER,
	isLocalDatabase,
	MEDIA_ORIGIN_DEFAULT,
	mediaBaseUrl,
	parseServerEnv,
	type RawEnv,
	RENAMED_VARIABLES,
	renamedVariableProblems,
	SECRET_MIN_LENGTH,
	serverEnv,
	statsTokenFromEnv,
	versionEnv,
} from '@/lib/env'
import { deployedVersion } from '@/lib/version'

// Made-up values only. The remote address ends in `.test`, a name that never resolves.
const LOCAL_URI = 'postgres://banc:banc@127.0.0.1:5442/mymakeup_test'
const REMOTE_URI = 'postgres://banc:MOT-DE-PASSE-TEMOIN@base.exemple.test:5432/mymakeup_test'
const SECRET = 'k'.repeat(64)
const valid: RawEnv = { DATABASE_URI: LOCAL_URI, PAYLOAD_SECRET: SECRET }
/** What the site itself must also hold since ticket 073: a relay with its login, and a sender. */
const SITE_RELAY: RawEnv = {
	EMAIL_FROM: 'My Makeup <ne-pas-repondre@example.test>',
	SMTP_HOST: 'relais.exemple.test',
	SMTP_PASSWORD: 'MOT-DE-PASSE-DU-RELAIS-TEMOIN',
	SMTP_PORT: '465',
	SMTP_USER: 'resend',
}

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
			authVerify: true,
			contactTo: 'contact@example.test',
			databasePool: { max: 10, timeoutMs: 5000 },
			databaseUri: LOCAL_URI,
			googleIssuer: 'https://accounts.google.com',
			localDatabase: true,
			payloadSecret: SECRET,
			activityCheck: false,
			remindersSend: false,
			quoteRequests: false,
			photoLimits: {
				uploadBytes: 12 * 1024 * 1024,
				profileCount: 45,
				profileBytes: 60 * 1024 * 1024,
				webpQuality: 82,
				sidePx: 2000,
			},
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

describe('trusted origins: the site and this machine, each for itself', () => {
	const production: RawEnv = { ...valid, ...SITE_RELAY, DATABASE_URI: REMOTE_URI, NODE_ENV: 'production' }
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

	test('in production: the site trusts itself only', () => {
		expect(origins({ ...production, NEXT_PUBLIC_SITE_URL: 'https://my-makeup.fr' })).toEqual(['https://my-makeup.fr'])
	})

	test('issue 1004: the activity check may call the business registry on the site only', () => {
		const activity = (raw: RawEnv) => parseServerEnv(raw).activityCheck
		expect(activity({ ...production, NEXT_PUBLIC_SITE_URL: 'https://my-makeup.fr' })).toBe(true)
		expect(activity({ ...valid, NEXT_PUBLIC_SITE_URL: 'https://my-makeup.fr' })).toBe(false)
		expect(activity({ ...production, NEXT_PUBLIC_SITE_URL: 'http://localhost:3123' })).toBe(false)
		expect(activity(valid)).toBe(false)
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
		// The temporary address of the production application before the swap of the domains: the
		// build is made for https://my-makeup.fr directly (PLAN-PROD-DIRECT.md), so this stays refused.
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
			expect(error.message).toContain('- NEXT_PUBLIC_SITE_URL : refusée. Attendu : https://my-makeup.fr ou ')
		}
	})
})

describe('the client of the Google sign-in is both halves or nothing (ticket 090)', () => {
	const ID = 'client-factice-du-banc'
	const CLIENT_SECRET = 'secret-factice-du-banc-de-test'

	test('neither: no Google client, and the site still starts', () => {
		expect(parseServerEnv(valid).google).toBeUndefined()
		expect(parseServerEnv({ ...valid, GOOGLE_CLIENT_ID: ' ', GOOGLE_CLIENT_SECRET: '' }).google).toBeUndefined()
	})

	test('both: the client is read, trimmed', () => {
		const env = parseServerEnv({ ...valid, GOOGLE_CLIENT_ID: ` ${ID} `, GOOGLE_CLIENT_SECRET: CLIENT_SECRET })
		expect(env.google).toEqual({ clientId: ID, clientSecret: CLIENT_SECRET })
	})

	test.each([
		['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
		['GOOGLE_CLIENT_SECRET', 'GOOGLE_CLIENT_ID'],
	] as const)('%s alone: refused, naming the one that is missing and never a value', (present, absente) => {
		const error = (() => {
			try {
				parseServerEnv({ ...valid, [present]: 'valeur-que-personne-ne-doit-lire' })
			} catch (e) {
				return e as EnvError
			}
			throw new Error('should have thrown')
		})()
		expect(error.variables).toEqual([absente])
		expect(error.message).not.toContain('valeur-que-personne-ne-doit-lire')
	})
})

describe('the Google sign-in talks to Google, or on this machine to the fake Google of the test bench', () => {
	const FAKE = 'http://127.0.0.1:7080'
	const production: RawEnv = { ...valid, ...SITE_RELAY, DATABASE_URI: REMOTE_URI, NODE_ENV: 'production' }
	const SITE = 'https://my-makeup.fr'

	test('nothing set: Google itself, in production or not', () => {
		expect(GOOGLE_ISSUER).toBe('https://accounts.google.com')
		expect(parseServerEnv(valid).googleIssuer).toBe(GOOGLE_ISSUER)
		expect(parseServerEnv({ ...production, NEXT_PUBLIC_SITE_URL: SITE }).googleIssuer).toBe(GOOGLE_ISSUER)
		expect(parseServerEnv({ ...valid, GOOGLE_OIDC_ISSUER: '  ' }).googleIssuer).toBe(GOOGLE_ISSUER)
	})

	test('Google written out is accepted everywhere, the site included', () => {
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
		['the address of the site, whatever NODE_ENV says', { ...valid, NEXT_PUBLIC_SITE_URL: SITE }],
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
		'http://fake-google:7080',
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
			...SITE_RELAY,
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

describe('the confirmation of a new email is on, unless the operating switch says off (ticket 082)', () => {
	test('absent, empty or « on »: a new account must confirm its email', () => {
		for (const AUTH_VERIFY of [undefined, '', '  ', 'on', 'ON', ' on '])
			expect(parseServerEnv({ ...valid, AUTH_VERIFY }).authVerify).toBe(true)
	})

	test('« off » is the switch, whatever its case or its spaces', () => {
		for (const AUTH_VERIFY of ['off', 'OFF', ' off '])
			expect(parseServerEnv({ ...valid, AUTH_VERIFY }).authVerify).toBe(false)
	})

	test('any other value stops the start, and the message names the variable, not the value', () => {
		for (const AUTH_VERIFY of ['false', '0', 'non', 'desactive-12345']) {
			const errorValue = refusal({ ...valid, AUTH_VERIFY })
			expect(errorValue.variables).toEqual(['AUTH_VERIFY'])
			expect(errorValue.message).not.toContain(AUTH_VERIFY)
		}
	})

	test('the build keeps the default, whatever the variable says', () => {
		expect(serverEnv({ NEXT_PHASE: 'phase-production-build', AUTH_VERIFY: 'off' }).authVerify).toBe(true)
	})
})

describe('next build needs no secret and no database', () => {
	const building: RawEnv = { NEXT_PHASE: 'phase-production-build', NODE_ENV: 'production' }

	test('nothing is checked while Next builds, and nothing is made up', () => {
		expect(serverEnv(building)).toEqual({
			authVerify: true,
			contactTo: 'contact@example.test',
			databasePool: { max: 10, timeoutMs: 5000 },
			databaseUri: '',
			googleIssuer: 'https://accounts.google.com',
			localDatabase: false,
			payloadSecret: '',
			activityCheck: false,
			remindersSend: false,
			quoteRequests: false,
			photoLimits: {
				uploadBytes: 12 * 1024 * 1024,
				profileCount: 45,
				profileBytes: 60 * 1024 * 1024,
				webpQuality: 82,
				sidePx: 2000,
			},
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

describe('the mails leave through the relay the environment names, or not at all', () => {
	const relay: RawEnv = {
		...valid,
		EMAIL_FROM: 'My Makeup <ne-pas-repondre@example.test>',
		SMTP_HOST: '127.0.0.1',
		SMTP_PORT: '1025',
	}

	test('CONTACT_TO: the team on the site, a reserved domain elsewhere, and a value that is kept', () => {
		expect(parseServerEnv(valid).contactTo).toBe('contact@example.test')
		expect(parseServerEnv({ ...valid, NEXT_PUBLIC_SITE_URL: 'http://localhost:3100' }).contactTo).toBe(
			'contact@example.test'
		)
		// On the site itself the relay is mandatory: the team's public address is the default there.
		expect(
			parseServerEnv({
				...valid,
				...SITE_RELAY,
				NODE_ENV: 'production',
				NEXT_PUBLIC_SITE_URL: 'https://my-makeup.fr',
			}).contactTo
		).toBe('contact@my-makeup.fr')
		expect(parseServerEnv({ ...valid, CONTACT_TO: ' equipe@example.test ' }).contactTo).toBe('equipe@example.test')
		expect(() => parseServerEnv({ ...valid, CONTACT_TO: 'pas une adresse' })).toThrow(EnvError)
		let error: EnvError | undefined
		try {
			parseServerEnv({ ...valid, CONTACT_TO: 'Equipe <equipe@example.test>' })
		} catch (caught) {
			error = caught as EnvError
		}
		expect(error?.variables).toEqual(['CONTACT_TO'])
		expect(error?.message).not.toContain('equipe@example.test')
	})

	test('STATS_TOKEN: absent is fine, short is refused by name, long is kept', () => {
		const base = { DATABASE_URI: 'postgres://u:p@localhost:5432/base', PAYLOAD_SECRET: 'x'.repeat(40) }
		expect(parseServerEnv(base).statsToken).toBeUndefined()
		expect(parseServerEnv({ ...base, STATS_TOKEN: ' ' }).statsToken).toBeUndefined()
		expect(parseServerEnv({ ...base, STATS_TOKEN: 'y'.repeat(32) }).statsToken).toBe('y'.repeat(32))
		const error = (() => {
			try {
				parseServerEnv({ ...base, STATS_TOKEN: 'court-secret' })
			} catch (e) {
				return e as EnvError
			}
		})()
		expect(error?.variables).toEqual(['STATS_TOKEN'])
		expect(error?.message).not.toContain('court-secret')
		expect(statsTokenFromEnv('court')).toBeUndefined()
		expect(statsTokenFromEnv(` ${'z'.repeat(32)} `)).toBe('z'.repeat(32))
	})

	test('Turnstile: both keys or none, nothing without the secret, and a test key never on the site (ticket 1000)', () => {
		const base = { DATABASE_URI: 'postgres://u:p@localhost:5432/base', PAYLOAD_SECRET: 'x'.repeat(40) }
		expect(parseServerEnv(base).turnstile).toBeUndefined()
		expect(parseServerEnv({ ...base, NEXT_PUBLIC_TURNSTILE_SITE_KEY: '0x4AAAAAAexample' }).turnstile).toBeUndefined()
		expect(
			parseServerEnv({
				...base,
				TURNSTILE_SECRET_KEY: '0x4AAAAAAsecret-fictive',
				NEXT_PUBLIC_TURNSTILE_SITE_KEY: '0x4AAAAAAexample',
			}).turnstile
		).toEqual({ secret: '0x4AAAAAAsecret-fictive', siteKey: '0x4AAAAAAexample' })
		// One half alone is refused, by name, and the value is never in the message.
		const alone = refusal({ ...base, TURNSTILE_SECRET_KEY: '0x4AAAAAAsecret-fictive' })
		expect(alone.variables).toEqual(['NEXT_PUBLIC_TURNSTILE_SITE_KEY'])
		expect(alone.message).not.toContain('secret-fictive')
		// Cloudflare’s published test keys work on this machine and the bench…
		const testKeys = {
			TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
			NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
		}
		expect(parseServerEnv({ ...base, ...testKeys }).turnstile?.siteKey).toBe(testKeys.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
		// … and stop the start of the site itself.
		const site = {
			...base,
			...SITE_RELAY,
			NODE_ENV: 'production',
			NEXT_PUBLIC_SITE_URL: 'https://my-makeup.fr',
		} as RawEnv
		expect(refusal({ ...site, ...testKeys }).variables.sort()).toEqual([
			'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
			'TURNSTILE_SECRET_KEY',
		])
		expect(
			parseServerEnv({
				...site,
				TURNSTILE_SECRET_KEY: '0x4AAAAAAsecret-fictive',
				NEXT_PUBLIC_TURNSTILE_SITE_KEY: '0x4AAAAAAexample',
			}).turnstile
		).toBeDefined()
	})

	test('SMTP_HOST, SMTP_PORT and EMAIL_FROM give the relay and the sender', () => {
		expect(parseServerEnv(relay).mail).toEqual({
			fromAddress: 'ne-pas-repondre@example.test',
			fromName: 'My Makeup',
			host: '127.0.0.1',
			port: 1025,
		})
	})

	test.each([
		['missing', undefined],
		['empty', ''],
		['blank', '  '],
	])('SMTP_HOST %s: no relay, whatever the two others hold, and nothing is refused', (_case, host) => {
		expect(parseServerEnv({ ...relay, SMTP_HOST: host })).toStrictEqual(parseServerEnv(valid))
		expect(parseServerEnv({ ...relay, SMTP_HOST: host, SMTP_PORT: 'pas un port', EMAIL_FROM: 'personne' }).mail).toBe(
			undefined
		)
	})

	test.each([
		['a name between quotes', '"Équipe My Makeup" <equipe@example.test>', 'Équipe My Makeup', 'equipe@example.test'],
		['spaces around', '  Léa   <lea@example.test>  ', 'Léa', 'lea@example.test'],
		[
			'an address alone: the name of the site',
			'ne-pas-repondre@example.test',
			'My Makeup',
			'ne-pas-repondre@example.test',
		],
		['an address between brackets, without a name', '<lea@example.test>', 'My Makeup', 'lea@example.test'],
	])('EMAIL_FROM with %s', (_case, from, fromName, fromAddress) => {
		expect(parseServerEnv({ ...relay, EMAIL_FROM: from }).mail).toMatchObject({ fromAddress, fromName })
	})

	test.each([
		'mailpit',
		'relais.exemple.test',
		'RELAIS.exemple.test',
		'::1',
		'2001:db8::25',
	])('SMTP_HOST accepted: %s', host => {
		expect(parseServerEnv({ ...relay, SMTP_HOST: host }).mail?.host).toBe(host)
	})

	test('SMTP_HOST set alone: the port and the sender are asked for, in one message', () => {
		const error = refusal({ ...valid, SMTP_HOST: '127.0.0.1' })

		expect(error.variables).toEqual(['SMTP_PORT', 'EMAIL_FROM'])
		expect(error.message).toContain(
			'- SMTP_PORT : absente, alors que SMTP_HOST est réglée. Attendu : un numéro de port, de 1 à 65535.'
		)
		expect(error.message).toContain(
			'- EMAIL_FROM : absente, alors que SMTP_HOST est réglée. Attendu : « Nom <adresse@domaine> », ou une adresse seule.'
		)
	})

	test.each([
		['a protocol', 'smtp://relais.exemple.test'],
		['a port', 'relais.exemple.test:587'],
		['a path', 'relais.exemple.test/boite'],
		['a space', 'relais exemple'],
		['brackets', '[::1]'],
		['a login', 'utilisateur@relais.exemple.test'],
	])('SMTP_HOST with %s: refused as « illisible »', (_case, host) => {
		const error = refusal({ ...relay, SMTP_HOST: host })

		expect(error.variables).toEqual(['SMTP_HOST'])
		expect(error.message).toContain('- SMTP_HOST : illisible. Attendu : un nom d’hôte seul, sans protocole ni port.')
	})

	test.each([
		'0',
		'65536',
		'100000',
		'25a',
		'-1',
		'1.5',
		'smtp',
	])('SMTP_PORT « %s »: refused as « illisible »', port => {
		const error = refusal({ ...relay, SMTP_PORT: port })

		expect(error.variables).toEqual(['SMTP_PORT'])
		expect(error.message).toContain('- SMTP_PORT : illisible. Attendu : un numéro de port, de 1 à 65535.')
	})

	test('SMTP_PORT at both ends of the range is accepted', () => {
		expect(parseServerEnv({ ...relay, SMTP_PORT: '1' }).mail?.port).toBe(1)
		expect(parseServerEnv({ ...relay, SMTP_PORT: '65535' }).mail?.port).toBe(65_535)
	})

	test.each([
		['a name without an address', 'My Makeup'],
		['an address without a domain', 'My Makeup <ne-pas-repondre>'],
		['two addresses', 'lea@example.test, zoe@example.test'],
		['text after the address', 'My Makeup <lea@example.test> suite'],
		['an address with two « @ »', 'lea@example.test@example.test'],
		// A line break in a sender would write a header of its own into every mail.
		['a line break in the name', 'My Makeup\r\nBcc: zoe@example.test <lea@example.test>'],
		['a line break in the address', 'My Makeup <lea@example.test\nBcc:zoe@example.test>'],
	])('EMAIL_FROM with %s: refused as « illisible »', (_case, from) => {
		const error = refusal({ ...relay, EMAIL_FROM: from })

		expect(error.variables).toEqual(['EMAIL_FROM'])
		expect(error.message).toContain(
			'- EMAIL_FROM : illisible. Attendu : « Nom <adresse@domaine> », ou une adresse seule.'
		)
	})

	test('the message names the three variables and never shows a value', () => {
		const error = refusal({
			...valid,
			EMAIL_FROM: 'Expéditeur Témoin <temoin',
			SMTP_HOST: 'smtp://relais-temoin.exemple.test',
			SMTP_PORT: '99999',
		})

		expect(error.variables).toEqual(['SMTP_HOST', 'SMTP_PORT', 'EMAIL_FROM'])
		for (const part of ['émoin', 'temoin', 'exemple.test', 'smtp://', '99999'])
			expect(error.message).not.toContain(part)
	})

	test('next build gets no relay, whatever its environment holds', () => {
		const built = serverEnv({ ...relay, NEXT_PHASE: 'phase-production-build', NODE_ENV: 'production' })

		expect(built.mail).toBeUndefined()
		expect(serverEnv({ ...relay, NEXT_PHASE: 'phase-production-server' }).mail?.host).toBe('127.0.0.1')
	})
})

describe('the site itself sends through an authenticated relay, or does not start (ticket 073)', () => {
	const site: RawEnv = {
		...valid,
		...SITE_RELAY,
		DATABASE_URI: REMOTE_URI,
		NEXT_PUBLIC_SITE_URL: 'https://my-makeup.fr',
		NODE_ENV: 'production',
	}
	const withoutRelay: RawEnv = {
		...site,
		EMAIL_FROM: undefined,
		SMTP_HOST: undefined,
		SMTP_PASSWORD: undefined,
		SMTP_PORT: undefined,
		SMTP_USER: undefined,
	}

	test('the relay, its login and the sender are read, and the login stays in the mail setting only', () => {
		expect(parseServerEnv(site).mail).toEqual({
			auth: { pass: 'MOT-DE-PASSE-DU-RELAIS-TEMOIN', user: 'resend' },
			fromAddress: 'ne-pas-repondre@example.test',
			fromName: 'My Makeup',
			host: 'relais.exemple.test',
			port: 465,
		})
	})

	test('the site in production without a relay: refused, the variable named', () => {
		const error = refusal(withoutRelay)
		expect(error.variables).toEqual(['SMTP_HOST'])
		expect(error.message).toContain('- SMTP_HOST : absente, alors qu’elle est obligatoire sur le site en ligne')
	})

	test('without a login: both variables named, with the relay set', () => {
		const error = refusal({ ...site, SMTP_USER: undefined, SMTP_PASSWORD: undefined })
		expect(error.variables).toEqual(['SMTP_USER', 'SMTP_PASSWORD'])
	})

	test('a relay of this machine is refused on the site', () => {
		for (const host of [
			'127.0.0.1',
			'localhost',
			'LOCALHOST',
			'::1',
			'127.0.0.2',
			'127.1',
			'0.0.0.0',
			'0:0:0:0:0:0:0:1',
			'::',
			'::ffff:7f00:1',
		]) {
			const error = refusal({ ...site, SMTP_HOST: host })
			expect(error.variables).toEqual(['SMTP_HOST'])
			expect(error.message).toContain('relais de ce poste alors que le site est déployé')
		}
	})

	test('a relay of the network is not taken for this machine', () => {
		for (const host of ['relais.exemple.test', '10.0.0.5', '128.0.0.1', '2001:db8::1']) {
			expect(parseServerEnv({ ...site, SMTP_HOST: host }).mail?.host).toBe(host)
		}
	})

	test('a work station and the bench may go without a relay', () => {
		expect(parseServerEnv(valid).mail).toBeUndefined()
		expect(parseServerEnv({ ...withoutRelay, NEXT_PUBLIC_SITE_URL: 'http://localhost:3100' }).mail).toBeUndefined()
	})

	test('SMTP_USER and SMTP_PASSWORD go together', () => {
		const relayValue: RawEnv = { ...valid, ...SITE_RELAY, SMTP_PORT: '587' }
		expect(refusal({ ...relayValue, SMTP_PASSWORD: undefined }).variables).toEqual(['SMTP_PASSWORD'])
		expect(refusal({ ...relayValue, SMTP_USER: undefined }).variables).toEqual(['SMTP_USER'])
		expect(parseServerEnv({ ...relayValue, SMTP_USER: undefined, SMTP_PASSWORD: undefined }).mail?.auth).toBeUndefined()
	})

	test('no message of a refusal holds the password of the relay', () => {
		const error = refusal({ ...site, SMTP_HOST: 'smtp://x', EMAIL_FROM: 'personne', SMTP_PORT: '99999' })
		expect(error.message).not.toContain('MOT-DE-PASSE-DU-RELAIS-TEMOIN')
		expect(error.message).not.toContain('relais.exemple.test')
	})

	test('next build asks for nothing and gets no relay', () => {
		const built = serverEnv({ ...withoutRelay, NEXT_PHASE: 'phase-production-build' })
		expect(built.mail).toBeUndefined()
	})
})

describe('the photos go to the object storage the environment names, or nowhere (ticket 043)', () => {
	// Made up: a bench address, and an R2 account that does not exist.
	const bench: RawEnv = {
		...valid,
		S3_ENDPOINT: 'http://127.0.0.1:9090',
		S3_BUCKET: 'mymakeup-test',
		S3_ACCESS_KEY_ID: 'cle-temoin',
		S3_SECRET_ACCESS_KEY: 'secret-temoin',
	}
	const r2: RawEnv = { ...bench, S3_ENDPOINT: 'https://compte-temoin.r2.cloudflarestorage.com', S3_BUCKET: 'my-makeup' }

	test('nothing set: no storage, and nothing else changes', () => {
		expect(parseServerEnv(valid).storage).toBeUndefined()
	})

	test('the four variables give the storage; the bench is local, R2 is not', () => {
		expect(parseServerEnv(bench).storage).toEqual({
			endpoint: 'http://127.0.0.1:9090',
			bucket: 'mymakeup-test',
			accessKeyId: 'cle-temoin',
			secretAccessKey: 'secret-temoin',
			local: true,
		})
		expect(parseServerEnv(r2).storage).toMatchObject({
			endpoint: 'https://compte-temoin.r2.cloudflarestorage.com',
			local: false,
		})
	})

	test('S3_ENDPOINT set alone: the bucket and the key are asked for, in one message', () => {
		expect(refusal({ ...valid, S3_ENDPOINT: 'http://127.0.0.1:9090' }).variables).toEqual([
			'S3_BUCKET',
			'S3_ACCESS_KEY_ID',
			'S3_SECRET_ACCESS_KEY',
		])
	})

	test.each([
		['plain http away from this machine', 'http://stockage-temoin.exemple.test'],
		['a path', 'https://compte-temoin.r2.cloudflarestorage.com/my-makeup'],
		['a final slash', 'https://compte-temoin.r2.cloudflarestorage.com/'],
		['no protocol', 'compte-temoin.r2.cloudflarestorage.com'],
	])('S3_ENDPOINT with %s: refused', (_case, endpoint) => {
		expect(refusal({ ...bench, S3_ENDPOINT: endpoint }).variables).toEqual(['S3_ENDPOINT'])
	})

	test.each([['Majuscules'], ['ab'], ['espace dedans'], ['-tiret-devant']])('S3_BUCKET « %s »: refused', bucket => {
		expect(refusal({ ...bench, S3_BUCKET: bucket }).variables).toEqual(['S3_BUCKET'])
	})

	test('the storage of this machine is refused when the site is deployed', () => {
		const error = refusal({ ...bench, NEXT_PUBLIC_SITE_URL: 'https://my-makeup.fr' })
		expect(error.variables).toEqual(['S3_ENDPOINT'])
		expect(parseServerEnv({ ...bench, NEXT_PUBLIC_SITE_URL: 'http://localhost:3100' }).storage?.local).toBe(true)
	})

	test('the message names the variables and never shows a key', () => {
		const error = refusal({ ...valid, S3_ENDPOINT: 'http://stockage-temoin.exemple.test', S3_BUCKET: 'Mauvais' })
		for (const part of ['stockage-temoin', 'Mauvais']) expect(error.message).not.toContain(part)
		expect(refusal({ ...bench, S3_BUCKET: 'X' }).message).not.toContain('secret-temoin')
	})

	test('next build gets no storage, whatever its environment holds', () => {
		expect(serverEnv({ ...r2, NEXT_PHASE: 'phase-production-build', NODE_ENV: 'production' }).storage).toBeUndefined()
	})

	test('the base of the photos: R2_PUBLIC_URL, else the bucket of the bench, else the photos of the site', () => {
		const storage = parseServerEnv(bench).storage
		expect(mediaBaseUrl(undefined, storage)).toBe('http://127.0.0.1:9090/mymakeup-test')
		expect(mediaBaseUrl('', storage)).toBe('http://127.0.0.1:9090/mymakeup-test')
		expect(mediaBaseUrl('https://photos.exemple.test', storage)).toBe('https://photos.exemple.test')
		expect(mediaBaseUrl(undefined, parseServerEnv(r2).storage)).toBe(MEDIA_ORIGIN_DEFAULT)
		expect(mediaBaseUrl(undefined, undefined)).toBe(MEDIA_ORIGIN_DEFAULT)
		expect(() => mediaBaseUrl('http://photos.exemple.test', storage)).toThrow(EnvError)
	})
})

describe('there is no pre-production: APP_ENV knows the bench and the site only (ticket 232)', () => {
	const SITE = 'https://my-makeup.fr'

	test('« preprod » is refused whatever the address, and the message names the variable, never the value', () => {
		for (const env of [
			{ ...valid, APP_ENV: 'preprod' },
			{ ...valid, APP_ENV: 'preprod', NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: SITE },
			{ ...valid, APP_ENV: 'preprod', NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://preprod.my-makeup.fr' },
		] satisfies RawEnv[]) {
			const error = refusal(env)
			expect(error.variables).toContain('APP_ENV')
			expect(error.message).toContain('- APP_ENV : illisible. Attendu : « test » sur le banc de test, « prod »')
			expect(error.message).not.toContain('preprod')
		}
	})

	test('test, prod and nothing are accepted', () => {
		for (const appEnv of ['test', 'prod', undefined])
			expect(() => parseServerEnv({ ...valid, APP_ENV: appEnv })).not.toThrow()
	})

	test('the address of the former pre-production is not a deployed origin any more', () => {
		expect(DEPLOYED_ORIGINS).toEqual([SITE])
		expect(
			refusal({ ...valid, NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://preprod.my-makeup.fr' }).variables
		).toContain('NEXT_PUBLIC_SITE_URL')
	})

	test('the reset token of the former pre-production is not a variable of the application any more', () => {
		const env = parseServerEnv({ ...valid, PREPROD_REMISE_A_ZERO: '2026-10-15-matin' } as RawEnv)
		expect(env).not.toHaveProperty('preprod')
	})
})

describe('the import of the old site runs on the site only, once per token (ticket 233)', () => {
	const SOURCE = 'postgres://lecture_strapi:MOT-DE-PASSE-TEMOIN@base-strapi.exemple.test:5432/strapi'
	const site: RawEnv = {
		...valid,
		...SITE_RELAY,
		APP_ENV: 'prod',
		DATABASE_URI: REMOTE_URI,
		NEXT_PUBLIC_SITE_URL: 'https://my-makeup.fr',
		NODE_ENV: 'production',
		STRAPI_SOURCE_URI: SOURCE,
	}
	const request: RawEnv = { ...site, IMPORT_TOKEN: '2026-11-05-passage-a' }

	test('STRAPI_SOURCE_URI is known to the application: read as an address, kept apart, never refused for being local', () => {
		expect(parseServerEnv(site).sourceStrapi).toBe(SOURCE)
		expect(parseServerEnv(site).importation).toBeUndefined()
		// The bench sets it to its fake source, on this machine.
		const benchValue = 'postgres://lecture_strapi_test:x@127.0.0.1:5443/strapi_source_test'
		expect(parseServerEnv({ ...valid, STRAPI_SOURCE_URI: benchValue }).sourceStrapi).toBe(benchValue)
		expect(parseServerEnv(valid).sourceStrapi).toBeUndefined()
		const error = refusal({ ...valid, STRAPI_SOURCE_URI: 'pas une adresse' })
		expect(error.variables).toEqual(['STRAPI_SOURCE_URI'])
		expect(error.message).not.toContain('pas une adresse')
	})

	test('a token alone is a dry run, read with the defaults', () => {
		expect(parseServerEnv(request).importation).toEqual({
			token: '2026-11-05-passage-a',
			mode: 'dry-run',
			targetInService: false,
		})
	})

	test('every variable is read', () => {
		const decisions = JSON.stringify({ emailsPartages: [], profilsEcartes: [29] })
		expect(
			parseServerEnv({
				...request,
				IMPORT_TARGET_IN_SERVICE: 'oui',
				IMPORT_CITIES: '[]',
				IMPORT_CONSENT_DATE: '2026-11-02T08:00:00Z',
				IMPORT_DECISIONS: decisions,
				IMPORT_MODE: 'real',
			}).importation
		).toEqual({
			targetInService: true,
			cities: '[]',
			consentDate: '2026-11-02T08:00:00Z',
			decisions,
			token: '2026-11-05-passage-a',
			mode: 'real',
		})
	})

	test.each([
		['a work station', { ...request, NODE_ENV: undefined, NEXT_PUBLIC_SITE_URL: undefined, APP_ENV: undefined }],
		['a development server with the site address', { ...request, NODE_ENV: 'development' }],
		[
			'a production build served from this machine',
			{ ...request, NEXT_PUBLIC_SITE_URL: 'http://localhost:3000', DATABASE_URI: LOCAL_URI },
		],
		['the site without APP_ENV', { ...request, APP_ENV: undefined }],
		['the test bench', { ...request, APP_ENV: 'test' }],
	])('refused on %s, naming the variable and never its value', (_cas, env) => {
		const error = refusal(env)
		expect(error.variables).toContain('IMPORT_TOKEN')
		expect(error.message).toContain('- IMPORT_TOKEN : refusée, car ce n’est pas le site')
		expect(error.message).not.toContain('2026-11-05-passage-a')
		expect(error.message).not.toContain('MOT-DE-PASSE-TEMOIN')
	})

	test('any other IMPORT_* variable is refused off the site too, token or not', () => {
		for (const [variable, value] of [
			['IMPORT_MODE', 'real'],
			['IMPORT_DECISIONS', '{}'],
			['IMPORT_CONSENT_DATE', '2026-11-02'],
			['IMPORT_CITIES', '[]'],
			['IMPORT_TARGET_IN_SERVICE', 'oui'],
		] as const)
			expect(refusal({ ...valid, [variable]: value }).variables, variable).toEqual([variable])
	})

	test('a variable without the token is refused on the site: it would do nothing', () => {
		const error = refusal({ ...site, IMPORT_MODE: 'real' })
		expect(error.variables).toEqual(['IMPORT_MODE'])
		expect(error.message).toContain('IMPORT_TOKEN est absente')
	})

	test.each([
		['IMPORT_TOKEN', 'court'],
		['IMPORT_TOKEN', 'MAJUSCULES-INTERDITES'],
		['IMPORT_TOKEN', `${'a'.repeat(65)}`],
		['IMPORT_MODE', 'sec'],
		['IMPORT_TARGET_IN_SERVICE', 'true'],
		['IMPORT_CONSENT_DATE', 'demain'],
		['IMPORT_CONSENT_DATE', '2026-13-45'],
		['IMPORT_DECISIONS', '{pas du json'],
		['IMPORT_CITIES', 'pas du json'],
	])('%s = « %s » is unreadable', (variable, valeur) => {
		const error = refusal({ ...request, [variable]: valeur })
		expect(error.variables).toEqual([variable])
		expect(error.message).not.toContain(valeur)
	})

	test('a check does not go with a target left as it is', () => {
		const error = refusal({ ...request, IMPORT_MODE: 'check', IMPORT_TARGET_IN_SERVICE: 'oui' })
		expect(error.variables).toEqual(['IMPORT_TARGET_IN_SERVICE'])
	})

	test('the token needs a source to read', () => {
		const error = refusal({ ...request, STRAPI_SOURCE_URI: undefined })
		expect(error.variables).toEqual(['STRAPI_SOURCE_URI'])
	})

	test('an old variable name is refused at the start, with the new name, and its value is never shown', () => {
		expect(RENAMED_VARIABLES.map(([old]) => old).sort()).toEqual([
			'BASCULE_LE',
			'IMPORT_CIBLE_EN_SERVICE',
			'IMPORT_COMMUNES',
			'IMPORT_CONSENTEMENT_LE',
			'IMPORT_JETON',
		])
		for (const [old, current] of RENAMED_VARIABLES) {
			const problems = renamedVariableProblems({ [old]: 'valeur-temoin' })
			expect(problems.map(({ variable }) => variable)).toEqual([old])
			expect(problems[0]?.problem).toContain(current)
			expect(problems[0]?.problem).not.toContain('valeur-temoin')
			let error: unknown
			try {
				serverEnv(valid, { [old]: 'valeur-temoin' })
			} catch (thrown) {
				error = thrown
			}
			expect(error).toBeInstanceOf(EnvError)
			expect((error as EnvError).variables).toEqual([old])
			expect((error as EnvError).message).toContain(current)
			expect((error as EnvError).message).not.toContain('valeur-temoin')
		}
		expect(renamedVariableProblems({})).toEqual([])
	})

	test('an old variable name left empty, or with spaces only, is ignored; a filled one is refused', () => {
		for (const [old] of RENAMED_VARIABLES) {
			for (const blank of ['', '   ', '\t']) {
				expect(renamedVariableProblems({ [old]: blank })).toEqual([])
				expect(() => serverEnv(valid, { [old]: blank })).not.toThrow()
			}
			expect(renamedVariableProblems({ [old]: ' x ' }).map(({ variable }) => variable)).toEqual([old])
		}
	})

	test.each([
		['a-blanc', 'dry-run'],
		['reel', 'real'],
		['controle', 'check'],
	])('the old IMPORT_MODE value « %s » is refused and the message gives « %s »', (old, current) => {
		const error = refusal({ ...request, IMPORT_MODE: old })
		expect(error.variables).toEqual(['IMPORT_MODE'])
		expect(error.message).toContain(`« ${current} »`)
	})

	test('next build reads no import: nothing runs while Next builds', () => {
		const construction = serverEnv({ ...request, NEXT_PHASE: 'phase-production-build' })
		expect(construction.importation).toBeUndefined()
		expect(construction.sourceStrapi).toBeUndefined()
	})
})

describe('the size of the connection pool is set by the environment, with a safe default (ticket 268)', () => {
	test('absent, blank or empty: 10 connections and 5 seconds, the default for one container', () => {
		expect(parseServerEnv(valid).databasePool).toEqual({ max: 10, timeoutMs: 5000 })
		expect(parseServerEnv({ ...valid, DATABASE_POOL_MAX: '  ', DATABASE_POOL_TIMEOUT_MS: '' }).databasePool).toEqual({
			max: 10,
			timeoutMs: 5000,
		})
	})

	test('both are read, spaces around the digits cut', () => {
		expect(
			parseServerEnv({ ...valid, DATABASE_POOL_MAX: ' 20 ', DATABASE_POOL_TIMEOUT_MS: '8000' }).databasePool
		).toEqual({
			max: 20,
			timeoutMs: 8000,
		})
	})

	test('the bounds are accepted, what is outside them is refused by name, with no value in the message', () => {
		for (const [variable, accepted] of [
			['DATABASE_POOL_MAX', ['1', '50']],
			['DATABASE_POOL_TIMEOUT_MS', ['1000', '30000']],
		] as const)
			for (const value of accepted) expect(() => parseServerEnv({ ...valid, [variable]: value })).not.toThrow()

		for (const [variable, refused] of [
			['DATABASE_POOL_MAX', ['0', '51', '-1', '10.5', '1e1', '0x10', 'dix', '99999999']],
			// 0 would mean « wait for ever » to pg: the hang the wait limit exists to prevent.
			['DATABASE_POOL_TIMEOUT_MS', ['0', '999', '30001', '-5', '5s', '5e3']],
		] as const)
			for (const value of refused) {
				const error = refusal({ ...valid, [variable]: value })
				expect(error.variables).toEqual([variable])
				expect(error.message).toContain(`- ${variable} : illisible.`)
				expect(error.message).not.toContain(`« ${value} »`)
			}
	})
})

describe('what a profile may store is set by the environment, with a default (ticket 309)', () => {
	test('absent or blank: 12 Mo per send, 45 photos and 60 Mo per profile, WebP at 82, 2000 px', () => {
		const expected = {
			uploadBytes: 12 * 1024 * 1024,
			profileCount: 45,
			profileBytes: 60 * 1024 * 1024,
			webpQuality: 82,
			sidePx: 2000,
		}
		expect(parseServerEnv(valid).photoLimits).toEqual(expected)
		expect(parseServerEnv({ ...valid, PHOTO_UPLOAD_MAX_MB: ' ', PHOTO_PROFILE_MAX_COUNT: '' }).photoLimits).toEqual(
			expected
		)
	})

	test('the five are read, spaces around the digits cut', () => {
		expect(
			parseServerEnv({
				...valid,
				PHOTO_UPLOAD_MAX_MB: ' 5 ',
				PHOTO_PROFILE_MAX_COUNT: '20',
				PHOTO_PROFILE_MAX_MB: '30',
				PHOTO_WEBP_QUALITY: '70',
				PHOTO_SIDE_MAX_PX: '1600',
			}).photoLimits
		).toEqual({
			uploadBytes: 5 * 1024 * 1024,
			profileCount: 20,
			profileBytes: 30 * 1024 * 1024,
			webpQuality: 70,
			sidePx: 1600,
		})
	})

	test('the bounds are accepted, what is outside them is refused by name, with no value in the message', () => {
		for (const [variable, accepted, refused] of [
			['PHOTO_UPLOAD_MAX_MB', ['1', '50'], ['0', '51', '-1', '2.5', '1e1', 'douze']],
			['PHOTO_PROFILE_MAX_COUNT', ['1', '500'], ['0', '501', '-3', '4.2']],
			['PHOTO_PROFILE_MAX_MB', ['1', '2000'], ['0', '2001', '1e3']],
			['PHOTO_WEBP_QUALITY', ['40', '95'], ['39', '96', '0', '82.5']],
			['PHOTO_SIDE_MAX_PX', ['800', '4000'], ['799', '4001', '2000px']],
		] as const) {
			for (const value of accepted) expect(() => parseServerEnv({ ...valid, [variable]: value })).not.toThrow()
			for (const value of refused) {
				const error = refusal({ ...valid, [variable]: value })
				expect(error.variables).toEqual([variable])
				expect(error.message).toContain(`- ${variable} : illisible.`)
				expect(error.message).not.toContain(`« ${value} »`)
			}
		}
	})
})
