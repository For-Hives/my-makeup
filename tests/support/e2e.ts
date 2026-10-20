/**
 * The end-to-end tests, described in one place: where they point, how Playwright is set, and
 * what `bun run test:e2e` gives to the programs it starts (docs/tests/e2e.md).
 *
 * Three readers: playwright.config.ts under Node, scripts/e2e.ts under bun, and
 * tests/unit/bench-e2e.test.ts. Nothing here starts a process or opens a connection.
 *
 * Only Node's own modules are used: Playwright loads this file in a runner that is not bun.
 */

import type { PlaywrightTestConfig } from '@playwright/test'
import { benchEnvironment, type Environment, type Instance, RefusedBench, readInstance, type Variables } from './bench'
import { type AcceptedEnvironment, checkTarget, readEnvironment } from './environment-guard'

/** The only folder Playwright looks into, and the only file names it takes there. */
export const TEST_FOLDER = './tests/e2e'
export const TEST_PATTERN = '**/*.spec.ts'

/**
 * The one test that needs the bench to itself (ticket 225): the real import of the fake Strapi source empties the
 * database, and refuses or counts in excess every account and slug another test wrote. It is a project of its own,
 * `import-final`, which `bun run test:e2e` plays in a second run, when the first one (the two screen sizes) is over:
 * Playwright's own way to order projects (`dependencies`) plays the whole suite again whenever a file is named,
 * and puts every test of a shard in the first one.
 */
export const TEST_ONLY_ON_BENCH = '**/tranche-profil-importe.spec.ts'
export const TEST_ONLY_PROJECT = 'import-final'

/** A test carries this tag to run at the phone width too. */
export const LABEL_MOBILE = '@mobile'

/** The two screen sizes of the tests. 390 px is the reference phone width of the v3 (docs/qualite.md). */
export const SCREENS = {
	chromium: { width: 1440, height: 900 },
	mobile: { width: 390, height: 844 },
} as const

/** Where the application says whether it can serve. */
export const HEALTH_PATH = '/api/health'

/** Everything a run leaves behind lives under these two folders, both ignored by git. */
export const REPORT_FOLDER = 'playwright-report'
export const RESULT_FOLDER = 'test-results'
/** Trace, video and screenshot of each failed test. Playwright empties this folder when a run starts. */
export const TRACES_FOLDER = `${RESULT_FOLDER}/essais`
/** The traces of the last run, the one that plays the test that has the bench to itself. */
export const TRACES_FINAL_FOLDER = `${RESULT_FOLDER}/essais-final`
/** The results of the last run, for the tools that read them. */
export const RESULT_FILE = `${RESULT_FOLDER}/resultats.json`

/** Longest wait for the application to say it is healthy, once Playwright has started it. */
export const STARTUP_DELAY_MS = 60_000

type ProcessEnvironment = Record<string, string>

export interface Target {
	/** The origin every test opens its paths on. */
	adresse: string
	environnement: AcceptedEnvironment
}

/** The address the application answers on when it runs against the bench of an instance. */
export function benchUrl(environnement: Environment): string {
	const url = environnement.NEXT_PUBLIC_SITE_URL
	if (!url) throw new RefusedBench('.env.test : NEXT_PUBLIC_SITE_URL manque.')
	return url
}

/**
 * Where the tests point: `BASE_URL` when the run gives one, else the application of the bench.
 * Throws `EnvironnementRefuse` on anything but a local address. Production is refused in every environment.
 */
export function testTarget(variables: Variables = process.env): Target {
	const environment = readEnvironment(variables.APP_ENV)
	const url = variables.BASE_URL || benchUrl(benchEnvironment(readInstance(variables)))
	checkTarget(url, environment)
	return { adresse: url, environnement: environment }
}

/* ------------------------------------------------------------------------------------------
 * The application of the tests: the production build, attached to the bench
 * ---------------------------------------------------------------------------------------- */

/**
 * Next reads the `.env` files of its folder by itself, at build time as when it starts, and no
 * option turns that off. With this variable set, it takes them as already read and copies
 * nothing from them: neither the build nor the application of the tests receives a value of the
 * working `.env`. The variable is not documented by Next: tests/unit/bench-e2e.test.ts checks it
 * against the code of Next that is installed.
 */
export const WITHOUT_FILE_ENV = { __NEXT_PROCESSED_ENV: 'true' } as const

/** Nothing leaves the bench, the usage statistics of Next included. */
const WITHOUT_TELEMETRY = { NEXT_TELEMETRY_DISABLED: '1' } as const

/** What Playwright needs to start the application itself: the shape of its `webServer` setting. */
export interface Application {
	command: string
	/** Playwright waits until this address answers, and refuses to start when it already does. */
	url: string
	/** Added to the environment of Playwright, and winning over it. */
	env: ProcessEnvironment
	reuseExistingServer: false
	timeout: number
	stdout: 'pipe'
	stderr: 'pipe'
}

/** The port the application of the tests listens on, read in its address. */
export function applicationPort(adresse: string): number {
	const port = Number(URL.canParse(adresse) ? new URL(adresse).port : Number.NaN)
	if (!(port > 0)) throw new RefusedBench('.env.test : NEXT_PUBLIC_SITE_URL doit écrire son port.')
	return port
}

/**
 * What the application of the tests receives besides the environment of Playwright: the bench,
 * and the production mode of the build it serves.
 */
export function applicationEnvironment(environnement: Environment): ProcessEnvironment {
	return {
		...environnement,
		...benchImages(environnement),
		...benchCities(environnement),
		...WITHOUT_FILE_ENV,
		...WITHOUT_TELEMETRY,
		NODE_ENV: 'production',
	}
}

/**
 * How Playwright starts the application, or nothing when it must not start one.
 *
 * It starts one only when the run is the one `bun run test:e2e` prepares: the environment is
 * the bench of this instance, and the target is its application. Started by hand in a bare
 * shell, or pointed at another address, Playwright starts nothing: the global setup then
 * says whether something healthy answers.
 */
export function testApplication(variables: Variables = process.env): Application | undefined {
	const environment = benchEnvironment(readInstance(variables))
	const url = benchUrl(environment)
	const onBench = Boolean(variables.DATABASE_URI) && variables.DATABASE_URI === environment.DATABASE_URI
	const toBench = !variables.BASE_URL || variables.BASE_URL === url
	if (!onBench || !toBench) return undefined
	return {
		// The script of package.json, on the loopback interface only, like `bun run dev`.
		command: `bun --no-env-file run start -p ${applicationPort(url)} -H 127.0.0.1`,
		url: `${url}${HEALTH_PATH}`,
		env: applicationEnvironment(environment),
		// Never an application that was already there: nobody knows which database it is attached to.
		reuseExistingServer: false,
		timeout: STARTUP_DELAY_MS,
		stdout: 'pipe',
		stderr: 'pipe',
	}
}

/* ------------------------------------------------------------------------------------------
 * Playwright
 * ---------------------------------------------------------------------------------------- */

/**
 * The whole configuration of Playwright. playwright.config.ts gives it as it is: what the
 * guard rails of the CI check (C07, tests/ci/ci-guardrails.test.ts) is what Playwright runs with.
 */
export function testConfiguration(variables: Variables = process.env): PlaywrightTestConfig {
	const { adresse: url } = testTarget(variables)
	const inCi = Boolean(variables.CI)
	const application = testApplication(variables)
	return {
		testDir: TEST_FOLDER,
		// Without it Playwright would also pick up the `*.test.ts` files of bun, and die on `bun:test`.
		testMatch: TEST_PATTERN,
		// Started before the global setup, stopped with its whole process tree when the run ends.
		...(application ? { webServer: application } : {}),
		// Before the first test: the target is checked again, and the application must be healthy.
		globalSetup: './tests/support/e2e-server.ts',
		outputDir: TRACES_FOLDER,
		// In the CI, a test left in `.only` fails the run instead of hiding every other test.
		forbidOnly: inCi,
		fullyParallel: true,
		retries: inCi ? 2 : 0,
		reporter: [
			['list'],
			// `never`: after a failure, the default serves the report and keeps the command waiting.
			['html', { open: 'never', outputFolder: REPORT_FOLDER }],
			['json', { outputFile: RESULT_FILE }],
		],
		use: {
			baseURL: url,
			locale: 'fr-FR',
			timezoneId: 'Europe/Paris',
			// Kept for every failed attempt, the first one included: on a developer's machine there is no retry.
			trace: 'retain-on-failure',
			video: 'retain-on-failure',
			screenshot: 'only-on-failure',
		},
		projects: [
			{
				name: 'chromium',
				testIgnore: TEST_ONLY_ON_BENCH,
				use: { browserName: 'chromium', viewport: SCREENS.chromium },
			},
			{
				name: 'mobile',
				grep: new RegExp(LABEL_MOBILE),
				testIgnore: TEST_ONLY_ON_BENCH,
				use: {
					browserName: 'chromium',
					viewport: SCREENS.mobile,
					isMobile: true,
					hasTouch: true,
					deviceScaleFactor: 3,
				},
			},
			{
				name: TEST_ONLY_PROJECT,
				testMatch: TEST_ONLY_ON_BENCH,
				use: { browserName: 'chromium', viewport: SCREENS.chromium },
			},
		],
	}
}

/* ------------------------------------------------------------------------------------------
 * What `bun run test:e2e` starts: the build, then Playwright
 * ---------------------------------------------------------------------------------------- */

const defined = (variables: Variables): ProcessEnvironment =>
	Object.fromEntries(Object.entries(variables).filter((entree): entree is [string, string] => entree[1] !== undefined))

/**
 * The address of the storage of the bench for the image optimizer (next.config.ts): the build freezes
 * it, and the server reads it again. Nothing when the bench has no storage.
 */
function benchImages(environnement: Environment): ProcessEnvironment {
	const { S3_ENDPOINT: point, S3_BUCKET: dashboard } = environnement
	return point && dashboard ? { BENCH_IMAGES: `${point}/${dashboard}` } : {}
}

/**
 * The fake list of the communes of the bench, which the application asks instead of geo.api.gouv.fr:
 * no test of a browser calls the Internet. Only the application of the tests receives it; the
 * integration tests simulate the official list itself (docs/tests/http-sortant.md).
 */
function benchCities(environnement: Environment): ProcessEnvironment {
	const url = environnement.FAKE_CITIES
	return url ? { BENCH_CITIES: url } : {}
}

/**
 * The environment of `next build`: no database, no secret, no `.env`, as in the CI. The address
 * of the site is left out on purpose: present at build time it would be frozen into the build,
 * absent it is read when the application starts.
 */
export function buildEnvironment(variables: Variables, environnement: Environment): ProcessEnvironment {
	const bench = [...Object.keys(environnement), 'BASE_URL']
	return {
		...Object.fromEntries(Object.entries(defined(variables)).filter(([nom]) => !bench.includes(nom))),
		// The one public setting of the bench the pages freeze: the hostnames Umami counts on.
		...(environnement.NEXT_PUBLIC_UMAMI_DOMAINS && {
			NEXT_PUBLIC_UMAMI_DOMAINS: environnement.NEXT_PUBLIC_UMAMI_DOMAINS,
		}),
		// The storage of the bench, where the image optimizer may fetch photos from (ticket 103).
		...benchImages(environnement),
		...WITHOUT_FILE_ENV,
		...WITHOUT_TELEMETRY,
		NODE_ENV: 'production',
	}
}

/**
 * The environment of Playwright: the bench of the instance, which the account factory needs and
 * which makes Playwright start the application, and the address the tests open.
 */
export function playwrightEnvironment(
	variables: Variables,
	instance: Instance,
	environnement: Environment
): ProcessEnvironment {
	return {
		...defined(variables),
		...environnement,
		BENCH_INSTANCE: instance.nom,
		BENCH_OFFSET: String(instance.decalage),
		BASE_URL: benchUrl(environnement),
		NODE_ENV: 'test',
	}
}

/** The two runs of a `bun run test:e2e`: the arguments of `playwright test` for each, or nothing for a run not asked for. */
export interface PlaywrightPhases {
	/** Everything but the test that has the bench to itself, at the screen sizes asked for. */
	principale?: string[]
	/** That test, alone, once the first run is over. */
	finale?: string[]
}

/**
 * Splits what was asked for (`bun run test:e2e …`) into the two runs of `playwright test`. Everything goes through as
 * it is, a file like an option (`--shard`, `--workers`, `-g`), except the projects, which each run takes for itself:
 * the first one plays `chromium` and `mobile`, the second plays `import-final` (PROJET_DE_L_ESSAI_SEUL). Asked for
 * nothing, both run; `--project=mobile` runs the first one only; `--project=import-final` the second one only.
 *
 * Each run passes when it finds no test: a file, a title or a shard that belongs to the other run leaves this one empty.
 * The second one reads its results on screen and keeps its traces in a folder of its own, so that it does not erase the
 * report and the traces of the first.
 */
export function playwrightPhases(demandes: readonly string[]): PlaywrightPhases {
	const projects: string[] = []
	const rest: string[] = []
	for (let i = 0; i < demandes.length; i += 1) {
		const argument = demandes[i] ?? ''
		if (argument.startsWith('--project=')) projects.push(argument.slice('--project='.length))
		else if ((argument === '--project' || argument === '-p') && i + 1 < demandes.length)
			projects.push(demandes[++i] ?? '')
		else rest.push(argument)
	}
	const screen = projects.filter(projet => projet !== TEST_ONLY_PROJECT)
	const main = projects.length === 0 ? ['chromium', 'mobile'] : screen
	const finale = projects.length === 0 || projects.includes(TEST_ONLY_PROJECT)
	return {
		...(main.length > 0 && {
			principale: ['test', ...rest, ...main.map(projet => `--project=${projet}`), '--pass-with-no-tests'],
		}),
		...(finale && {
			finale: [
				'test',
				...rest,
				`--project=${TEST_ONLY_PROJECT}`,
				'--pass-with-no-tests',
				'--reporter=list',
				`--output=${TRACES_FINAL_FOLDER}`,
			],
		}),
	}
}

/**
 * `bun run test:e2e` only ever opens the application of the bench. A `BASE_URL` that points
 * elsewhere is refused rather than replaced without a word: the person asked for another target.
 */
export function requireBenchTarget(variables: Variables, environnement: Environment): string {
	const url = benchUrl(environnement)
	if (variables.BASE_URL && variables.BASE_URL !== url)
		throw new RefusedBench(
			`BASE_URL est réglée, et ce n’est pas l’adresse de l’application du banc (${url}) : « bun run test:e2e » n’ouvre que celle-là. Retire BASE_URL.`
		)
	return url
}

/** What to say when something already listens where the application of the tests must start. */
export function portTakenMessage(port: number): string {
	return [
		`Le port ${port} est déjà pris sur ce poste : une application y tourne, peut-être celle d’un autre banc.`,
		'Arrête-la, ou donne à ce banc son nom et son décalage de ports, par exemple : BENCH_INSTANCE=mon-banc BENCH_OFFSET=20 bun run bench:up',
	].join('\n')
}

const COMMENT_LAUNCH =
	'Les essais de bout en bout se lancent par « bun run test:e2e », qui construit l’application et la démarre contre le banc de test.'

/** What the global setup says when the application does not answer as a healthy one. */
export function applicationSilentMessage(adresse: string, constat: string): string {
	return [`L’application ne répond pas sur ${adresse} (${HEALTH_PATH} : ${constat}).`, COMMENT_LAUNCH].join('\n')
}

/** What the global setup says when Playwright was started on a local address without the bench. */
export function withoutBenchMessage(): string {
	return ['Aucun banc de test n’est réglé pour ces essais (DATABASE_URI manque).', COMMENT_LAUNCH].join('\n')
}
