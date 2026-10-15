/**
 * The end-to-end tests, described in one place: where they point, how Playwright is set, and
 * what `bun run test:e2e` gives to the programs it starts (docs/tests/e2e.md).
 *
 * Three readers: playwright.config.ts under Node, scripts/e2e.ts under bun, and
 * tests/unit/banc-e2e.test.ts. Nothing here starts a process or opens a connection.
 *
 * Only Node's own modules are used: Playwright loads this file in a runner that is not bun.
 */

import type { PlaywrightTestConfig } from '@playwright/test'
import {
	BancRefuse,
	type Environnement,
	environnementDuBanc,
	type Instance,
	lireInstance,
	type Variables,
} from './banc'
import { type EnvironnementAdmis, lireEnvironnement, verifierCible } from './garde-environnement'

/** The only folder Playwright looks into, and the only file names it takes there. */
export const DOSSIER_DES_ESSAIS = './tests/e2e'
export const MOTIF_DES_ESSAIS = '**/*.spec.ts'

/** A test carries this tag to run at the phone width too. */
export const ETIQUETTE_MOBILE = '@mobile'

/** The two screen sizes of the tests. 390 px is the reference phone width of the v3 (docs/qualite.md). */
export const ECRANS = {
	chromium: { width: 1440, height: 900 },
	mobile: { width: 390, height: 844 },
} as const

/** Where the application says whether it can serve. */
export const CHEMIN_DE_SANTE = '/api/health'

/** Everything a run leaves behind lives under these two folders, both ignored by git. */
export const DOSSIER_DU_RAPPORT = 'playwright-report'
export const DOSSIER_DES_RESULTATS = 'test-results'
/** Trace, video and screenshot of each failed test. Playwright empties this folder when a run starts. */
export const DOSSIER_DES_TRACES = `${DOSSIER_DES_RESULTATS}/essais`
/** The results of the last run, for the tools that read them. */
export const FICHIER_DES_RESULTATS = `${DOSSIER_DES_RESULTATS}/resultats.json`

/** Longest wait for the application to say it is healthy, once Playwright has started it. */
export const DELAI_DE_DEMARRAGE_MS = 60_000

type EnvironnementDeProcessus = Record<string, string>

export interface Cible {
	/** The origin every test opens its paths on. */
	adresse: string
	environnement: EnvironnementAdmis
}

/** The address the application answers on when it runs against the bench of an instance. */
export function adresseDuBanc(environnement: Environnement): string {
	const adresse = environnement.NEXT_PUBLIC_SITE_URL
	if (!adresse) throw new BancRefuse('.env.test : NEXT_PUBLIC_SITE_URL manque.')
	return adresse
}

/**
 * Where the tests point: `BASE_URL` when the run gives one, else the application of the bench.
 * Throws `EnvironnementRefuse` on anything but a local address, or the pre-production with
 * `APP_ENV=preprod`. Production is refused in every environment.
 */
export function cibleDesEssais(variables: Variables = process.env): Cible {
	const environnement = lireEnvironnement(variables.APP_ENV)
	const adresse = variables.BASE_URL || adresseDuBanc(environnementDuBanc(lireInstance(variables)))
	verifierCible(adresse, environnement)
	return { adresse, environnement }
}

/* ------------------------------------------------------------------------------------------
 * The application of the tests: the production build, attached to the bench
 * ---------------------------------------------------------------------------------------- */

/**
 * Next reads the `.env` files of its folder by itself, at build time as when it starts, and no
 * option turns that off. With this variable set, it takes them as already read and copies
 * nothing from them: neither the build nor the application of the tests receives a value of the
 * working `.env`. The variable is not documented by Next: tests/unit/banc-e2e.test.ts checks it
 * against the code of Next that is installed.
 */
export const SANS_FICHIER_ENV = { __NEXT_PROCESSED_ENV: 'true' } as const

/** Nothing leaves the bench, the usage statistics of Next included. */
const SANS_TELEMETRIE = { NEXT_TELEMETRY_DISABLED: '1' } as const

/** What Playwright needs to start the application itself: the shape of its `webServer` setting. */
export interface Application {
	command: string
	/** Playwright waits until this address answers, and refuses to start when it already does. */
	url: string
	/** Added to the environment of Playwright, and winning over it. */
	env: EnvironnementDeProcessus
	reuseExistingServer: false
	timeout: number
	stdout: 'pipe'
	stderr: 'pipe'
}

/** The port the application of the tests listens on, read in its address. */
export function portDeLApplication(adresse: string): number {
	const port = Number(URL.canParse(adresse) ? new URL(adresse).port : Number.NaN)
	if (!(port > 0)) throw new BancRefuse('.env.test : NEXT_PUBLIC_SITE_URL doit écrire son port.')
	return port
}

/**
 * What the application of the tests receives besides the environment of Playwright: the bench,
 * and the production mode of the build it serves.
 */
export function environnementDeLApplication(environnement: Environnement): EnvironnementDeProcessus {
	return {
		...environnement,
		...imagesDuBanc(environnement),
		...communesDuBanc(environnement),
		...SANS_FICHIER_ENV,
		...SANS_TELEMETRIE,
		NODE_ENV: 'production',
	}
}

/**
 * How Playwright starts the application, or nothing when it must not start one.
 *
 * It starts one only when the run is the one `bun run test:e2e` prepares: the environment is
 * the bench of this instance, and the target is its application. Started by hand in a bare
 * shell, or pointed at the pre-production, Playwright starts nothing: the global setup then
 * says whether something healthy answers.
 */
export function applicationDesEssais(variables: Variables = process.env): Application | undefined {
	const environnement = environnementDuBanc(lireInstance(variables))
	const adresse = adresseDuBanc(environnement)
	const surLeBanc = Boolean(variables.DATABASE_URI) && variables.DATABASE_URI === environnement.DATABASE_URI
	const versLeBanc = !variables.BASE_URL || variables.BASE_URL === adresse
	if (!surLeBanc || !versLeBanc) return undefined
	return {
		// The script of package.json, on the loopback interface only, like `bun run dev`.
		command: `bun --no-env-file run start -p ${portDeLApplication(adresse)} -H 127.0.0.1`,
		url: `${adresse}${CHEMIN_DE_SANTE}`,
		env: environnementDeLApplication(environnement),
		// Never an application that was already there: nobody knows which database it is attached to.
		reuseExistingServer: false,
		timeout: DELAI_DE_DEMARRAGE_MS,
		stdout: 'pipe',
		stderr: 'pipe',
	}
}

/* ------------------------------------------------------------------------------------------
 * Playwright
 * ---------------------------------------------------------------------------------------- */

/**
 * The whole configuration of Playwright. playwright.config.ts gives it as it is: what the
 * guard rails of the CI check (C07, tests/ci/garde-fous-ci.test.ts) is what Playwright runs with.
 */
export function configurationDesEssais(variables: Variables = process.env): PlaywrightTestConfig {
	const { adresse } = cibleDesEssais(variables)
	const enCi = Boolean(variables.CI)
	const application = applicationDesEssais(variables)
	return {
		testDir: DOSSIER_DES_ESSAIS,
		// Without it Playwright would also pick up the `*.test.ts` files of bun, and die on `bun:test`.
		testMatch: MOTIF_DES_ESSAIS,
		// Started before the global setup, stopped with its whole process tree when the run ends.
		...(application ? { webServer: application } : {}),
		// Before the first test: the target is checked again, and the application must be healthy.
		globalSetup: './tests/outils/serveur-e2e.ts',
		outputDir: DOSSIER_DES_TRACES,
		// In the CI, a test left in `.only` fails the run instead of hiding every other test.
		forbidOnly: enCi,
		fullyParallel: true,
		retries: enCi ? 2 : 0,
		reporter: [
			['list'],
			// `never`: after a failure, the default serves the report and keeps the command waiting.
			['html', { open: 'never', outputFolder: DOSSIER_DU_RAPPORT }],
			['json', { outputFile: FICHIER_DES_RESULTATS }],
		],
		use: {
			baseURL: adresse,
			locale: 'fr-FR',
			timezoneId: 'Europe/Paris',
			// Kept for every failed attempt, the first one included: on a developer's machine there is no retry.
			trace: 'retain-on-failure',
			video: 'retain-on-failure',
			screenshot: 'only-on-failure',
		},
		projects: [
			{ name: 'chromium', use: { browserName: 'chromium', viewport: ECRANS.chromium } },
			{
				name: 'mobile',
				grep: new RegExp(ETIQUETTE_MOBILE),
				use: { browserName: 'chromium', viewport: ECRANS.mobile, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
			},
		],
	}
}

/* ------------------------------------------------------------------------------------------
 * What `bun run test:e2e` starts: the build, then Playwright
 * ---------------------------------------------------------------------------------------- */

const definies = (variables: Variables): EnvironnementDeProcessus =>
	Object.fromEntries(Object.entries(variables).filter((entree): entree is [string, string] => entree[1] !== undefined))

/**
 * The address of the storage of the bench for the image optimizer (next.config.ts): the build freezes
 * it, and the server reads it again. Nothing when the bench has no storage.
 */
function imagesDuBanc(environnement: Environnement): EnvironnementDeProcessus {
	const { S3_ENDPOINT: point, S3_BUCKET: espace } = environnement
	return point && espace ? { IMAGES_DU_BANC: `${point}/${espace}` } : {}
}

/**
 * The fake list of the communes of the bench, which the application asks instead of geo.api.gouv.fr:
 * no test of a browser calls the Internet. Only the application of the tests receives it; the
 * integration tests simulate the official list itself (docs/tests/http-sortant.md).
 */
function communesDuBanc(environnement: Environnement): EnvironnementDeProcessus {
	const adresse = environnement.FAUSSES_COMMUNES
	return adresse ? { COMMUNES_DU_BANC: adresse } : {}
}

/**
 * The environment of `next build`: no database, no secret, no `.env`, as in the CI. The address
 * of the site is left out on purpose: present at build time it would be frozen into the build,
 * absent it is read when the application starts.
 */
export function environnementDuBuild(variables: Variables, environnement: Environnement): EnvironnementDeProcessus {
	const duBanc = [...Object.keys(environnement), 'BASE_URL']
	return {
		...Object.fromEntries(Object.entries(definies(variables)).filter(([nom]) => !duBanc.includes(nom))),
		// The one public setting of the bench the pages freeze: the hostnames Umami counts on.
		...(environnement.NEXT_PUBLIC_UMAMI_DOMAINS && {
			NEXT_PUBLIC_UMAMI_DOMAINS: environnement.NEXT_PUBLIC_UMAMI_DOMAINS,
		}),
		// The storage of the bench, where the image optimizer may fetch photos from (ticket 103).
		...imagesDuBanc(environnement),
		...SANS_FICHIER_ENV,
		...SANS_TELEMETRIE,
		NODE_ENV: 'production',
	}
}

/**
 * The environment of Playwright: the bench of the instance, which the account factory needs and
 * which makes Playwright start the application, and the address the tests open.
 */
export function environnementDePlaywright(
	variables: Variables,
	instance: Instance,
	environnement: Environnement
): EnvironnementDeProcessus {
	return {
		...definies(variables),
		...environnement,
		BANC_INSTANCE: instance.nom,
		BANC_DECALAGE: String(instance.decalage),
		BASE_URL: adresseDuBanc(environnement),
		NODE_ENV: 'test',
	}
}

/** The arguments of `playwright test`: what was asked for goes through as it is, a file like an option. */
export function argumentsDePlaywright(demandes: readonly string[]): string[] {
	return ['test', ...demandes]
}

/**
 * `bun run test:e2e` only ever opens the application of the bench. A `BASE_URL` that points
 * elsewhere is refused rather than replaced without a word: the person asked for another target.
 */
export function exigerCibleDuBanc(variables: Variables, environnement: Environnement): string {
	const adresse = adresseDuBanc(environnement)
	if (variables.BASE_URL && variables.BASE_URL !== adresse)
		throw new BancRefuse(
			`BASE_URL est réglée, et ce n’est pas l’adresse de l’application du banc (${adresse}) : « bun run test:e2e » n’ouvre que celle-là. Retire BASE_URL.`
		)
	return adresse
}

/** What to say when something already listens where the application of the tests must start. */
export function messagePortPris(port: number): string {
	return [
		`Le port ${port} est déjà pris sur ce poste : une application y tourne, peut-être celle d’un autre banc.`,
		'Arrête-la, ou donne à ce banc son nom et son décalage de ports, par exemple : BANC_INSTANCE=mon-banc BANC_DECALAGE=20 bun run banc:up',
	].join('\n')
}

const COMMENT_LANCER =
	'Les essais de bout en bout se lancent par « bun run test:e2e », qui construit l’application et la démarre contre le banc de test.'

/** What the global setup says when the application does not answer as a healthy one. */
export function messageApplicationMuette(adresse: string, constat: string): string {
	return [`L’application ne répond pas sur ${adresse} (${CHEMIN_DE_SANTE} : ${constat}).`, COMMENT_LANCER].join('\n')
}

/** What the global setup says when Playwright was started on a local address without the bench. */
export function messageSansBanc(): string {
	return ['Aucun banc de test n’est réglé pour ces essais (DATABASE_URI manque).', COMMENT_LANCER].join('\n')
}
