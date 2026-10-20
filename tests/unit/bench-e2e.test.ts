import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { keepSevere } from '../support/axe'
import { benchEnvironment, RefusedBench, readInstance } from '../support/bench'
import {
	applicationPort,
	applicationSilentMessage,
	buildEnvironment,
	playwrightEnvironment,
	playwrightPhases,
	portTakenMessage,
	RESULT_FOLDER,
	requireBenchTarget,
	TEST_ONLY_ON_BENCH,
	TRACES_FINAL_FOLDER,
	TRACES_FOLDER,
	testApplication,
	testConfiguration,
	testTarget,
	WITHOUT_FILE_ENV,
	withoutBenchMessage,
} from '../support/e2e'
import { readHealth, SCHEMA_IN_MISMATCH_MESSAGE, withoutQuestion } from '../support/e2e-server'
import { RefusedEnvironment } from '../support/environment-guard'

/**
 * The end-to-end bench, without a browser and without an application: where the tests point,
 * what Playwright is given, and what `bun run test:e2e` gives to the programs it starts.
 * The tests themselves live in tests/e2e and run by `bun run test:e2e`.
 */

const ROOT = path.resolve(import.meta.dir, '../..')

/** An instance beside the default one: every port moved by 20. */
const INSTANCE = { BENCH_INSTANCE: 'essai-e2e', BENCH_OFFSET: '20' }
const instance = readInstance(INSTANCE)
const bench = benchEnvironment(instance)
/** The environment `bun run test:e2e` gives to Playwright for that instance, from an empty shell. */
const UNDER_BENCH = playwrightEnvironment({ PATH: '/usr/bin' }, instance, bench)

const refusalMessage = (action: () => unknown): string => {
	try {
		action()
	} catch (error) {
		if (error instanceof RefusedEnvironment || error instanceof RefusedBench) return error.message
		throw error
	}
	throw new Error('rien n’a été refusé')
}

describe('la cible des essais', () => {
	test('sans rien de réglé, c’est l’application du banc, sur le port de l’instance', () => {
		expect(testTarget({})).toEqual({ adresse: 'http://localhost:3100', environnement: 'test' })
		expect(testTarget(INSTANCE).adresse).toBe('http://localhost:3120')
	})

	test('BASE_URL l’emporte quand elle est locale', () => {
		expect(testTarget({ BASE_URL: 'http://127.0.0.1:4000' }).adresse).toBe('http://127.0.0.1:4000')
	})

	test.each([
		'https://my-makeup.fr',
		'https://www.my-makeup.fr/auth/signin',
		'https://api.my-makeup.fr',
	])('U86 : la prod est refusée dans tout environnement : %s', adresse => {
		expect(refusalMessage(() => testTarget({ BASE_URL: adresse }))).toContain('BASE_URL vise la prod')
		// The configuration of Playwright is not even built: nothing is left to run a test with.
		expect(() => testConfiguration({ BASE_URL: adresse })).toThrow(RefusedEnvironment)
	})

	test('la préprod n’existe plus : son hôte est de la prod, et APP_ENV=preprod est inconnu (ticket 232)', () => {
		const preprod = 'https://preprod.my-makeup.fr'

		expect(refusalMessage(() => testTarget({ BASE_URL: preprod }))).toContain('BASE_URL vise la prod')
		expect(refusalMessage(() => testTarget({ APP_ENV: 'preprod', BASE_URL: preprod }))).toContain(
			'environnement inconnu'
		)
	})

	test('un environnement de prod est refusé, même vers une adresse locale', () => {
		expect(refusalMessage(() => testTarget({ APP_ENV: 'prod', BASE_URL: 'http://localhost:3100' }))).toContain(
			'aucun test ne tourne en environnement de prod'
		)
	})
})

describe('U86 : « bun run test:e2e » s’arrête avant de rien construire quand la cible est la prod', () => {
	test('code de sortie 1, le refus de la garde, et rien d’autre', async () => {
		const child = Bun.spawn([process.execPath, '--no-env-file', 'scripts/e2e.ts'], {
			cwd: ROOT,
			env: { PATH: process.env.PATH ?? '', BASE_URL: 'https://my-makeup.fr' },
			stdout: 'pipe',
			stderr: 'pipe',
		})
		const [code, output, errors] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		])

		expect(code).toBe(1)
		expect(errors).toContain('BASE_URL vise la prod (« my-makeup.fr ») : aucun test ne vise la prod.')
		// The command announces the build on its standard output before it starts it: nothing was built.
		expect(output).toBe('')
	})
})

describe('la configuration de Playwright', () => {
	const configuration = testConfiguration({})
	const projects = configuration.projects ?? []

	test('les essais sont les fichiers *.spec.ts de tests/e2e, et eux seuls', () => {
		expect(configuration.testDir).toBe('./tests/e2e')
		expect(configuration.testMatch).toBe('**/*.spec.ts')
		expect(configuration.globalSetup).toBe('./tests/support/e2e-server.ts')
	})

	test('deux tailles d’écran : 1440 px pour tous les essais, 390 px pour ceux qui portent @mobile', () => {
		expect(projects.map(({ name, use }) => [name, use?.viewport?.width, use?.browserName])).toEqual([
			['chromium', 1440, 'chromium'],
			['mobile', 390, 'chromium'],
			['import-final', 1440, 'chromium'],
		])
		const [bureau, mobile] = projects

		expect(bureau?.grep).toBeUndefined()
		expect(mobile?.grep).toBeInstanceOf(RegExp)
		const kept = (titre: string) => (mobile?.grep as RegExp).test(titre)
		expect(kept('shell.spec.ts Essai coquille @mobile l’accueil s’ouvre')).toBe(true)
		expect(kept('admin.spec.ts Liste des profils')).toBe(false)
		expect(mobile?.use).toMatchObject({ isMobile: true, hasTouch: true })
	})

	test('l’import réel veut le banc pour lui : un projet à part, que ni l’une ni l’autre des deux tailles ne joue', () => {
		const [bureau, mobile, only] = projects

		expect(only?.dependencies).toBeUndefined()
		expect(only?.testMatch).toBe(TEST_ONLY_ON_BENCH)
		expect(bureau?.testIgnore).toBe(TEST_ONLY_ON_BENCH)
		expect(mobile?.testIgnore).toBe(TEST_ONLY_ON_BENCH)
		expect(only?.testMatch).toMatch(/imported-profile-slice\.spec\.ts$/)
	})

	test('trace, vidéo et capture sont gardées pour un essai en échec, dès la première tentative', () => {
		expect(configuration.use).toMatchObject({
			trace: 'retain-on-failure',
			video: 'retain-on-failure',
			screenshot: 'only-on-failure',
		})
		expect(configuration.outputDir).toBe('test-results/essais')
	})

	test('français, heure de Paris, et l’adresse de la cible', () => {
		expect(configuration.use).toMatchObject({
			baseURL: 'http://localhost:3100',
			locale: 'fr-FR',
			timezoneId: 'Europe/Paris',
		})
		expect(testConfiguration(INSTANCE).use?.baseURL).toBe('http://localhost:3120')
	})

	test('trois rapports : la liste, le rapport HTML qui ne s’ouvre jamais tout seul, les résultats en JSON', () => {
		expect(configuration.reporter).toEqual([
			['list'],
			['html', { open: 'never', outputFolder: 'playwright-report' }],
			['json', { outputFile: 'test-results/resultats.json' }],
		])
	})

	test('en CI : aucun .only, deux nouvelles tentatives ; sur un poste : ni l’un ni l’autre', () => {
		expect(testConfiguration({ CI: 'true' })).toMatchObject({ forbidOnly: true, retries: 2 })
		expect(configuration).toMatchObject({ forbidOnly: false, retries: 0 })
	})
})

describe('l’application des essais, démarrée par Playwright', () => {
	test('sous l’environnement du banc : le build de production, sur le port de l’instance et sur ce poste seulement', () => {
		const application = testApplication(UNDER_BENCH)

		expect(application).toMatchObject({
			command: 'bun --no-env-file run start -p 3120 -H 127.0.0.1',
			url: 'http://localhost:3120/api/health',
			reuseExistingServer: false,
		})
		expect(testConfiguration(UNDER_BENCH).webServer).toEqual(application)
	})

	test('elle reçoit le banc, le mode production, et ne lit aucun fichier .env', () => {
		const { env = {} } = testApplication(UNDER_BENCH) ?? {}

		expect(env).toMatchObject({ ...bench, ...WITHOUT_FILE_ENV, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' })
		expect(env.DATABASE_URI).toEndWith(':5463/mymakeup_test')
		expect(env.NEXT_PUBLIC_SITE_URL).toBe('http://localhost:3120')
		// The fake list of the communes of the instance, never geo.api.gouv.fr (docs/tests/banc.md).
		expect(env.BENCH_CITIES).toBe('http://127.0.0.1:2070')
	})

	test('le script « start » de package.json est bien celui qui sert le build', () => {
		const { scripts } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
			scripts: Record<string, string>
		}

		expect(scripts.start).toBe('next start')
		expect(scripts['test:e2e']).toBe('bun --no-env-file scripts/e2e.ts')
	})

	test.each([
		['un shell nu : aucune base réglée', {}],
		['la base d’un autre banc', { ...UNDER_BENCH, BENCH_OFFSET: '40' }],
		['la base de développement', { ...UNDER_BENCH, DATABASE_URI: 'postgres://u:p@127.0.0.1:5442/mymakeup_dev' }],
		['une autre cible locale', { ...UNDER_BENCH, BASE_URL: 'http://localhost:4000' }],
	])('Playwright ne démarre rien hors du lancement préparé : %s', (_cas, variables) => {
		expect(testApplication(variables)).toBeUndefined()
		expect(testConfiguration(variables)).not.toHaveProperty('webServer')
	})

	test('le port se lit dans l’adresse, qui doit l’écrire', () => {
		expect(applicationPort('http://localhost:3213')).toBe(3213)
		expect(refusalMessage(() => applicationPort('http://localhost'))).toContain('doit écrire son port')
	})
})

describe('ce que « bun run test:e2e » donne au build et à Playwright', () => {
	const MACHINE = {
		PATH: '/usr/bin',
		CI: 'true',
		BASE_URL: 'http://localhost:3120',
		DATABASE_URI: 'postgres://mymakeup:local-dev-only@127.0.0.1:5442/mymakeup_dev',
		NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
		NODE_ENV: 'test',
		PAS_REGLEE: undefined,
	}

	test('le build ne reçoit ni base, ni secret, ni adresse : il est celui de la CI', () => {
		const build = buildEnvironment(MACHINE, bench)

		expect(build).toEqual({
			PATH: '/usr/bin',
			CI: 'true',
			// The one public setting of the bench the pages freeze: the hostnames Umami counts on.
			NEXT_PUBLIC_UMAMI_DOMAINS: 'localhost,127.0.0.1',
			// Where the image optimizer may fetch the photos of the bench from (ticket 103).
			BENCH_IMAGES: `${bench.S3_ENDPOINT}/${bench.S3_BUCKET}`,
			...WITHOUT_FILE_ENV,
			NEXT_TELEMETRY_DISABLED: '1',
			NODE_ENV: 'production',
		})
		for (const nameValue of Object.keys(bench).filter(nom => nom !== 'NEXT_PUBLIC_UMAMI_DOMAINS'))
			expect(build, nameValue).not.toHaveProperty(nameValue)
	})

	test('Playwright reçoit le banc de l’instance, qui l’emporte sur ce que le poste réglait', () => {
		const playwright = playwrightEnvironment(MACHINE, instance, bench)

		expect(playwright).toEqual({
			PATH: '/usr/bin',
			CI: 'true',
			...bench,
			BENCH_INSTANCE: 'essai-e2e',
			BENCH_OFFSET: '20',
			BASE_URL: 'http://localhost:3120',
			NODE_ENV: 'test',
		})
	})

	test('sans demande, deux passages : tous les essais aux deux tailles, puis l’import réel seul (ticket 225)', () => {
		expect(playwrightPhases([])).toEqual({
			principale: ['test', '--project=chromium', '--project=mobile', '--pass-with-no-tests'],
			finale: [
				'test',
				'--project=import-final',
				'--pass-with-no-tests',
				'--reporter=list',
				'--output=test-results/essais-final',
			],
		})
	})

	test('ce qui est demandé passe tel quel dans les deux passages : un fichier, une option, un quart', () => {
		const { principale: main, finale } = playwrightPhases(['tests/e2e/shell.spec.ts', '--workers=1', '--shard=2/4'])

		expect(main).toEqual([
			'test',
			'tests/e2e/shell.spec.ts',
			'--workers=1',
			'--shard=2/4',
			'--project=chromium',
			'--project=mobile',
			'--pass-with-no-tests',
		])
		expect(finale?.slice(0, 4)).toEqual(['test', 'tests/e2e/shell.spec.ts', '--workers=1', '--shard=2/4'])
	})

	test('un projet demandé, sous ses deux écritures, choisit son passage et ne se répète pas dans l’autre', () => {
		expect(playwrightPhases(['--project=mobile', '--headed'])).toEqual({
			principale: ['test', '--headed', '--project=mobile', '--pass-with-no-tests'],
		})
		expect(playwrightPhases(['--project', 'chromium', '-g', 'un titre']).principale).toEqual([
			'test',
			'-g',
			'un titre',
			'--project=chromium',
			'--pass-with-no-tests',
		])
		const only = playwrightPhases(['--project=import-final'])
		expect(only.principale).toBeUndefined()
		expect(only.finale).toContain('--project=import-final')
		const both = playwrightPhases(['--project=mobile', '--project=import-final'])
		expect(both.principale).toContain('--project=mobile')
		expect(both.finale).toContain('--project=import-final')
		expect(both.finale).not.toContain('--project=mobile')
	})

	test('le passage de l’import réel garde ses traces à part : il n’efface ni le rapport ni les traces du premier', () => {
		const { finale } = playwrightPhases([])

		expect(finale).toContain(`--output=${TRACES_FINAL_FOLDER}`)
		expect(TRACES_FINAL_FOLDER.startsWith(`${RESULT_FOLDER}/`)).toBe(true)
		expect(TRACES_FINAL_FOLDER).not.toBe(TRACES_FOLDER)
		expect(finale).toContain('--reporter=list')
	})

	test('une BASE_URL qui n’est pas l’application du banc est refusée, pas remplacée', () => {
		expect(requireBenchTarget({}, bench)).toBe('http://localhost:3120')
		expect(requireBenchTarget({ BASE_URL: 'http://localhost:3120' }, bench)).toBe('http://localhost:3120')
		expect(refusalMessage(() => requireBenchTarget({ BASE_URL: 'http://127.0.0.1:3120' }, bench))).toBe(
			'BASE_URL est réglée, et ce n’est pas l’adresse de l’application du banc (http://localhost:3120) : « bun run test:e2e » n’ouvre que celle-là. Retire BASE_URL.'
		)
	})

	test('les messages disent quoi faire', () => {
		expect(portTakenMessage(3120)).toContain('Le port 3120 est déjà pris sur ce poste')
		expect(portTakenMessage(3120)).toContain('BENCH_INSTANCE=mon-banc BENCH_OFFSET=20')
		expect(applicationSilentMessage('http://localhost:3120', 'réponse 503')).toContain(
			'L’application ne répond pas sur http://localhost:3120 (/api/health : réponse 503).'
		)
		for (const message of [applicationSilentMessage('http://localhost:3120', 'aucune réponse'), withoutBenchMessage()])
			expect(message).toContain('« bun run test:e2e »')
	})
})

describe('Next ne lit aucun fichier .env quand le banc le lui demande', () => {
	// The variable is not documented by Next. This test asks the code of Next that is installed:
	// the day it stops reading the variable, the application of the tests would read the working
	// `.env` again, and this test says so.
	test('avec la variable, rien n’est repris du fichier ; sans elle, le fichier est lu', () => {
		const folder = mkdtempSync(path.join(tmpdir(), 'my-makeup-e2e-env-'))
		const wasRead = (variables: Record<string, string>): string => {
			const program = [
				"const { loadEnvConfig } = require('@next/env')",
				`loadEnvConfig(${JSON.stringify(folder)}, false, { info() {}, error() {} })`,
				'console.log(String(process.env.ENV_FILE_SENTINEL))',
			].join('\n')
			const child = Bun.spawnSync([process.execPath, '--no-env-file', '-e', program], {
				cwd: ROOT,
				env: { PATH: process.env.PATH ?? '', ...variables },
			})
			return child.stdout.toString().trim()
		}
		try {
			writeFileSync(path.join(folder, '.env'), 'ENV_FILE_SENTINEL=lu\n')

			expect(wasRead({})).toBe('lu')
			expect(wasRead(WITHOUT_FILE_ENV)).toBe('undefined')
		} finally {
			rmSync(folder, { recursive: true })
		}
	})
})

describe('avant le premier essai', () => {
	const respond = (status: number, corps: unknown) =>
		(async () => Response.json(corps, { status })) as unknown as typeof fetch

	test('une application saine : 200 et « ok », avec sa version', async () => {
		const requested: string[] = []
		const makeRequest = (async (adresse: string) => {
			requested.push(adresse)
			return Response.json({ ok: true, version: 'abc1234' })
		}) as unknown as typeof fetch

		expect(await readHealth('http://localhost:3120', makeRequest)).toEqual({
			saine: true,
			constat: 'saine',
			version: 'abc1234',
		})
		expect(requested).toEqual(['http://localhost:3120/api/health'])
	})

	test.each([
		['la base ne répond pas', 503, { ok: false }, 'réponse 503'],
		['un autre serveur répond à cette adresse', 200, { message: 'bonjour' }, 'réponse 200'],
		['la route n’existe pas', 404, 'Not found', 'réponse 404'],
	])('pas saine : %s', async (_cas, status, corps, constat) => {
		expect(await readHealth('http://localhost:3120', respond(status, corps))).toMatchObject({
			saine: false,
			constat,
		})
	})

	test('pas saine : rien n’écoute', async () => {
		const unreachable = (async () => {
			throw new TypeError('fetch failed')
		}) as unknown as typeof fetch

		expect(await readHealth('http://localhost:3120', unreachable)).toEqual({
			saine: false,
			constat: 'aucune réponse',
		})
	})

	test('un arrêt du processus pendant le branchement de Payload devient une erreur, pas un lancement vert', async () => {
		const exit = process.exit
		const stop = withoutQuestion(async () => {
			// What Payload does when a question about data it could lose cannot be answered.
			process.exit(0)
		})

		await expect(stop).rejects.toBeInstanceOf(RefusedBench)
		await expect(stop).rejects.toThrow(SCHEMA_IN_MISMATCH_MESSAGE)
		expect(process.exit).toBe(exit)
	})

	test('une question qui attend sa réponse devient une erreur au bout du délai, pas un lancement bloqué', async () => {
		const exit = process.exit
		// What drizzle-kit does when a column was renamed: it asks on the terminal, and waits.
		const waiting = withoutQuestion(() => new Promise<never>(() => undefined), 20)

		await expect(waiting).rejects.toThrow(SCHEMA_IN_MISMATCH_MESSAGE)
		expect(process.exit).toBe(exit)
	})

	test('sans question, l’action rend son résultat et la sortie du processus est rendue intacte', async () => {
		const exit = process.exit

		expect(await withoutQuestion(async () => 'branché')).toBe('branché')
		expect(process.exit).toBe(exit)
	})
})

describe('le contrôle d’accessibilité ne garde que les niveaux « serious » et « critical »', () => {
	const violation = (id: string, impact: string | null, cibles: unknown[][]) => ({
		id,
		impact,
		help: `Aide de ${id}`,
		helpUrl: `https://dequeuniversity.com/rules/axe/4.13/${id}`,
		nodes: cibles.map(target => ({ target })),
	})

	test('les deux niveaux graves passent, les autres non', () => {
		const keptList = keepSevere([
			violation('image-alt', 'critical', [['img']]),
			violation('region', 'moderate', [['div']]),
			violation('color-contrast', 'serious', [['p.pale'], ['a']]),
			violation('meta-viewport', 'minor', [['meta']]),
			violation('sans-niveau', null, [['span']]),
		])

		expect(keptList).toEqual([
			{
				regle: 'image-alt',
				niveau: 'critical',
				aide: 'Aide de image-alt',
				lien: 'https://dequeuniversity.com/rules/axe/4.13/image-alt',
				elements: ['img'],
			},
			{
				regle: 'color-contrast',
				niveau: 'serious',
				aide: 'Aide de color-contrast',
				lien: 'https://dequeuniversity.com/rules/axe/4.13/color-contrast',
				elements: ['p.pale', 'a'],
			},
		])
	})

	test('un élément dans un cadre ou dans une ombre est donné par son chemin', () => {
		const [inFrame] = keepSevere([violation('label', 'critical', [['iframe#carte', ['mon-champ', 'input']]])])

		expect(inFrame?.elements).toEqual(['iframe#carte mon-champ input'])
	})

	test('aucune violation : une liste vide', () => {
		expect(keepSevere([])).toEqual([])
	})
})
