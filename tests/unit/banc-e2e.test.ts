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

const RACINE = path.resolve(import.meta.dir, '../..')

/** An instance beside the default one: every port moved by 20. */
const INSTANCE = { BENCH_INSTANCE: 'essai-e2e', BENCH_OFFSET: '20' }
const instance = readInstance(INSTANCE)
const banc = benchEnvironment(instance)
/** The environment `bun run test:e2e` gives to Playwright for that instance, from an empty shell. */
const SOUS_LE_BANC = playwrightEnvironment({ PATH: '/usr/bin' }, instance, banc)

const messageDuRefus = (action: () => unknown): string => {
	try {
		action()
	} catch (erreur) {
		if (erreur instanceof RefusedEnvironment || erreur instanceof RefusedBench) return erreur.message
		throw erreur
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
		expect(messageDuRefus(() => testTarget({ BASE_URL: adresse }))).toContain('BASE_URL vise la prod')
		// The configuration of Playwright is not even built: nothing is left to run a test with.
		expect(() => testConfiguration({ BASE_URL: adresse })).toThrow(RefusedEnvironment)
	})

	test('la préprod n’existe plus : son hôte est de la prod, et APP_ENV=preprod est inconnu (ticket 232)', () => {
		const preprod = 'https://preprod.my-makeup.fr'

		expect(messageDuRefus(() => testTarget({ BASE_URL: preprod }))).toContain('BASE_URL vise la prod')
		expect(messageDuRefus(() => testTarget({ APP_ENV: 'preprod', BASE_URL: preprod }))).toContain(
			'environnement inconnu'
		)
	})

	test('un environnement de prod est refusé, même vers une adresse locale', () => {
		expect(messageDuRefus(() => testTarget({ APP_ENV: 'prod', BASE_URL: 'http://localhost:3100' }))).toContain(
			'aucun test ne tourne en environnement de prod'
		)
	})
})

describe('U86 : « bun run test:e2e » s’arrête avant de rien construire quand la cible est la prod', () => {
	test('code de sortie 1, le refus de la garde, et rien d’autre', async () => {
		const enfant = Bun.spawn([process.execPath, '--no-env-file', 'scripts/e2e.ts'], {
			cwd: RACINE,
			env: { PATH: process.env.PATH ?? '', BASE_URL: 'https://my-makeup.fr' },
			stdout: 'pipe',
			stderr: 'pipe',
		})
		const [code, sortie, erreurs] = await Promise.all([
			enfant.exited,
			new Response(enfant.stdout).text(),
			new Response(enfant.stderr).text(),
		])

		expect(code).toBe(1)
		expect(erreurs).toContain('BASE_URL vise la prod (« my-makeup.fr ») : aucun test ne vise la prod.')
		// The command announces the build on its standard output before it starts it: nothing was built.
		expect(sortie).toBe('')
	})
})

describe('la configuration de Playwright', () => {
	const configuration = testConfiguration({})
	const projets = configuration.projects ?? []

	test('les essais sont les fichiers *.spec.ts de tests/e2e, et eux seuls', () => {
		expect(configuration.testDir).toBe('./tests/e2e')
		expect(configuration.testMatch).toBe('**/*.spec.ts')
		expect(configuration.globalSetup).toBe('./tests/support/e2e-server.ts')
	})

	test('deux tailles d’écran : 1440 px pour tous les essais, 390 px pour ceux qui portent @mobile', () => {
		expect(projets.map(({ name, use }) => [name, use?.viewport?.width, use?.browserName])).toEqual([
			['chromium', 1440, 'chromium'],
			['mobile', 390, 'chromium'],
			['import-final', 1440, 'chromium'],
		])
		const [bureau, mobile] = projets

		expect(bureau?.grep).toBeUndefined()
		expect(mobile?.grep).toBeInstanceOf(RegExp)
		const retenu = (titre: string) => (mobile?.grep as RegExp).test(titre)
		expect(retenu('coquille.spec.ts Essai coquille @mobile l’accueil s’ouvre')).toBe(true)
		expect(retenu('admin.spec.ts Liste des profils')).toBe(false)
		expect(mobile?.use).toMatchObject({ isMobile: true, hasTouch: true })
	})

	test('l’import réel veut le banc pour lui : un projet à part, que ni l’une ni l’autre des deux tailles ne joue', () => {
		const [bureau, mobile, seul] = projets

		expect(seul?.dependencies).toBeUndefined()
		expect(seul?.testMatch).toBe(TEST_ONLY_ON_BENCH)
		expect(bureau?.testIgnore).toBe(TEST_ONLY_ON_BENCH)
		expect(mobile?.testIgnore).toBe(TEST_ONLY_ON_BENCH)
		expect(seul?.testMatch).toMatch(/tranche-profil-importe\.spec\.ts$/)
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
		const application = testApplication(SOUS_LE_BANC)

		expect(application).toMatchObject({
			command: 'bun --no-env-file run start -p 3120 -H 127.0.0.1',
			url: 'http://localhost:3120/api/health',
			reuseExistingServer: false,
		})
		expect(testConfiguration(SOUS_LE_BANC).webServer).toEqual(application)
	})

	test('elle reçoit le banc, le mode production, et ne lit aucun fichier .env', () => {
		const { env = {} } = testApplication(SOUS_LE_BANC) ?? {}

		expect(env).toMatchObject({ ...banc, ...WITHOUT_FILE_ENV, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' })
		expect(env.DATABASE_URI).toEndWith(':5463/mymakeup_test')
		expect(env.NEXT_PUBLIC_SITE_URL).toBe('http://localhost:3120')
		// The fake list of the communes of the instance, never geo.api.gouv.fr (docs/tests/banc.md).
		expect(env.BENCH_CITIES).toBe('http://127.0.0.1:2070')
	})

	test('le script « start » de package.json est bien celui qui sert le build', () => {
		const { scripts } = JSON.parse(readFileSync(path.join(RACINE, 'package.json'), 'utf8')) as {
			scripts: Record<string, string>
		}

		expect(scripts.start).toBe('next start')
		expect(scripts['test:e2e']).toBe('bun --no-env-file scripts/e2e.ts')
	})

	test.each([
		['un shell nu : aucune base réglée', {}],
		['la base d’un autre banc', { ...SOUS_LE_BANC, BENCH_OFFSET: '40' }],
		['la base de développement', { ...SOUS_LE_BANC, DATABASE_URI: 'postgres://u:p@127.0.0.1:5442/mymakeup_dev' }],
		['une autre cible locale', { ...SOUS_LE_BANC, BASE_URL: 'http://localhost:4000' }],
	])('Playwright ne démarre rien hors du lancement préparé : %s', (_cas, variables) => {
		expect(testApplication(variables)).toBeUndefined()
		expect(testConfiguration(variables)).not.toHaveProperty('webServer')
	})

	test('le port se lit dans l’adresse, qui doit l’écrire', () => {
		expect(applicationPort('http://localhost:3213')).toBe(3213)
		expect(messageDuRefus(() => applicationPort('http://localhost'))).toContain('doit écrire son port')
	})
})

describe('ce que « bun run test:e2e » donne au build et à Playwright', () => {
	const DU_POSTE = {
		PATH: '/usr/bin',
		CI: 'true',
		BASE_URL: 'http://localhost:3120',
		DATABASE_URI: 'postgres://mymakeup:local-dev-only@127.0.0.1:5442/mymakeup_dev',
		NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
		NODE_ENV: 'test',
		PAS_REGLEE: undefined,
	}

	test('le build ne reçoit ni base, ni secret, ni adresse : il est celui de la CI', () => {
		const build = buildEnvironment(DU_POSTE, banc)

		expect(build).toEqual({
			PATH: '/usr/bin',
			CI: 'true',
			// The one public setting of the bench the pages freeze: the hostnames Umami counts on.
			NEXT_PUBLIC_UMAMI_DOMAINS: 'localhost,127.0.0.1',
			// Where the image optimizer may fetch the photos of the bench from (ticket 103).
			BENCH_IMAGES: `${banc.S3_ENDPOINT}/${banc.S3_BUCKET}`,
			...WITHOUT_FILE_ENV,
			NEXT_TELEMETRY_DISABLED: '1',
			NODE_ENV: 'production',
		})
		for (const nom of Object.keys(banc).filter(nom => nom !== 'NEXT_PUBLIC_UMAMI_DOMAINS'))
			expect(build, nom).not.toHaveProperty(nom)
	})

	test('Playwright reçoit le banc de l’instance, qui l’emporte sur ce que le poste réglait', () => {
		const playwright = playwrightEnvironment(DU_POSTE, instance, banc)

		expect(playwright).toEqual({
			PATH: '/usr/bin',
			CI: 'true',
			...banc,
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
		const { principale, finale } = playwrightPhases(['tests/e2e/coquille.spec.ts', '--workers=1', '--shard=2/4'])

		expect(principale).toEqual([
			'test',
			'tests/e2e/coquille.spec.ts',
			'--workers=1',
			'--shard=2/4',
			'--project=chromium',
			'--project=mobile',
			'--pass-with-no-tests',
		])
		expect(finale?.slice(0, 4)).toEqual(['test', 'tests/e2e/coquille.spec.ts', '--workers=1', '--shard=2/4'])
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
		const seul = playwrightPhases(['--project=import-final'])
		expect(seul.principale).toBeUndefined()
		expect(seul.finale).toContain('--project=import-final')
		const lesDeux = playwrightPhases(['--project=mobile', '--project=import-final'])
		expect(lesDeux.principale).toContain('--project=mobile')
		expect(lesDeux.finale).toContain('--project=import-final')
		expect(lesDeux.finale).not.toContain('--project=mobile')
	})

	test('le passage de l’import réel garde ses traces à part : il n’efface ni le rapport ni les traces du premier', () => {
		const { finale } = playwrightPhases([])

		expect(finale).toContain(`--output=${TRACES_FINAL_FOLDER}`)
		expect(TRACES_FINAL_FOLDER.startsWith(`${RESULT_FOLDER}/`)).toBe(true)
		expect(TRACES_FINAL_FOLDER).not.toBe(TRACES_FOLDER)
		expect(finale).toContain('--reporter=list')
	})

	test('une BASE_URL qui n’est pas l’application du banc est refusée, pas remplacée', () => {
		expect(requireBenchTarget({}, banc)).toBe('http://localhost:3120')
		expect(requireBenchTarget({ BASE_URL: 'http://localhost:3120' }, banc)).toBe('http://localhost:3120')
		expect(messageDuRefus(() => requireBenchTarget({ BASE_URL: 'http://127.0.0.1:3120' }, banc))).toBe(
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
		const dossier = mkdtempSync(path.join(tmpdir(), 'my-makeup-e2e-env-'))
		const lu = (variables: Record<string, string>): string => {
			const programme = [
				"const { loadEnvConfig } = require('@next/env')",
				`loadEnvConfig(${JSON.stringify(dossier)}, false, { info() {}, error() {} })`,
				'console.log(String(process.env.ENV_FILE_SENTINEL))',
			].join('\n')
			const enfant = Bun.spawnSync([process.execPath, '--no-env-file', '-e', programme], {
				cwd: RACINE,
				env: { PATH: process.env.PATH ?? '', ...variables },
			})
			return enfant.stdout.toString().trim()
		}
		try {
			writeFileSync(path.join(dossier, '.env'), 'ENV_FILE_SENTINEL=lu\n')

			expect(lu({})).toBe('lu')
			expect(lu(WITHOUT_FILE_ENV)).toBe('undefined')
		} finally {
			rmSync(dossier, { recursive: true })
		}
	})
})

describe('avant le premier essai', () => {
	const repondre = (status: number, corps: unknown) =>
		(async () => Response.json(corps, { status })) as unknown as typeof fetch

	test('une application saine : 200 et « ok », avec sa version', async () => {
		const demandees: string[] = []
		const demander = (async (adresse: string) => {
			demandees.push(adresse)
			return Response.json({ ok: true, version: 'abc1234' })
		}) as unknown as typeof fetch

		expect(await readHealth('http://localhost:3120', demander)).toEqual({
			saine: true,
			constat: 'saine',
			version: 'abc1234',
		})
		expect(demandees).toEqual(['http://localhost:3120/api/health'])
	})

	test.each([
		['la base ne répond pas', 503, { ok: false }, 'réponse 503'],
		['un autre serveur répond à cette adresse', 200, { message: 'bonjour' }, 'réponse 200'],
		['la route n’existe pas', 404, 'Not found', 'réponse 404'],
	])('pas saine : %s', async (_cas, status, corps, constat) => {
		expect(await readHealth('http://localhost:3120', repondre(status, corps))).toMatchObject({
			saine: false,
			constat,
		})
	})

	test('pas saine : rien n’écoute', async () => {
		const injoignable = (async () => {
			throw new TypeError('fetch failed')
		}) as unknown as typeof fetch

		expect(await readHealth('http://localhost:3120', injoignable)).toEqual({
			saine: false,
			constat: 'aucune réponse',
		})
	})

	test('un arrêt du processus pendant le branchement de Payload devient une erreur, pas un lancement vert', async () => {
		const sortir = process.exit
		const arret = withoutQuestion(async () => {
			// What Payload does when a question about data it could lose cannot be answered.
			process.exit(0)
		})

		await expect(arret).rejects.toBeInstanceOf(RefusedBench)
		await expect(arret).rejects.toThrow(SCHEMA_IN_MISMATCH_MESSAGE)
		expect(process.exit).toBe(sortir)
	})

	test('une question qui attend sa réponse devient une erreur au bout du délai, pas un lancement bloqué', async () => {
		const sortir = process.exit
		// What drizzle-kit does when a column was renamed: it asks on the terminal, and waits.
		const attente = withoutQuestion(() => new Promise<never>(() => undefined), 20)

		await expect(attente).rejects.toThrow(SCHEMA_IN_MISMATCH_MESSAGE)
		expect(process.exit).toBe(sortir)
	})

	test('sans question, l’action rend son résultat et la sortie du processus est rendue intacte', async () => {
		const sortir = process.exit

		expect(await withoutQuestion(async () => 'branché')).toBe('branché')
		expect(process.exit).toBe(sortir)
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
		const gardees = keepSevere([
			violation('image-alt', 'critical', [['img']]),
			violation('region', 'moderate', [['div']]),
			violation('color-contrast', 'serious', [['p.pale'], ['a']]),
			violation('meta-viewport', 'minor', [['meta']]),
			violation('sans-niveau', null, [['span']]),
		])

		expect(gardees).toEqual([
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
		const [dansUnCadre] = keepSevere([violation('label', 'critical', [['iframe#carte', ['mon-champ', 'input']]])])

		expect(dansUnCadre?.elements).toEqual(['iframe#carte mon-champ input'])
	})

	test('aucune violation : une liste vide', () => {
		expect(keepSevere([])).toEqual([])
	})
})
