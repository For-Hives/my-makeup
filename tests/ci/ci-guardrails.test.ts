import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
	absoluteNavigations,
	aggregatorProblems,
	benchJobProblems,
	buildContextProblems,
	cacheDependentSteps,
	durationProblems,
	fixedWaits,
	focusedOrSkippedTests,
	handWrittenJavaScript,
	imageProblems,
	misalignedSetups,
	misalignedVersions,
	type PackageVersions,
	type PlaywrightSettings,
	permissionProblems,
	playwrightConfigFileProblems,
	playwrightSettingsProblems,
	publicVariablesProblems,
	type RequiredCheck,
	readWorkflow,
	requiredCheckProblems,
	SHARDS,
	toleratedFailures,
	triggerProblems,
	unexpectedSecrets,
	unpinnedActions,
	type Workflow,
} from '../support/ci-guardrails'
import { testConfiguration } from '../support/e2e'

/**
 * The guard rails of the CI (plans, C01 to C08) and of the Docker image.
 *
 * Every guard is run on the real files of the repository, where it finds nothing, and on a
 * faulty example made from those same files, where it must find the fault.
 */

const ROOT = path.resolve(import.meta.dir, '../..')
const read = (file: string): string => readFileSync(path.join(ROOT, file), 'utf8')

const dockerfile = read('Dockerfile')
const envExample = read('.env.exemple')
const packageJson = JSON.parse(read('package.json')) as PackageVersions
const versions = { nvmrc: read('.nvmrc'), packageJson, dockerfile }

/** The real text with one thing changed. Fails when the text to change is not there any more. */
function broken(text: string, from: string | RegExp, to: string): string {
	const changed = text.replace(from, to)
	if (changed === text) throw new Error(`faulty example out of date: nothing to replace for ${String(from)}`)
	return changed
}

describe('C04: .nvmrc, engines, packageManager and the Dockerfile name the same versions', () => {
	test('the repository is aligned', () => {
		expect(misalignedVersions(versions)).toEqual([])
	})

	test('the Dockerfile really starts from the Node of .nvmrc and the bun of packageManager', () => {
		const node = versions.nvmrc.trim()
		const bun = packageJson.packageManager?.replace('bun@', '')

		expect(dockerfile).toContain(`FROM oven/bun:${bun}@sha256:`)
		expect(dockerfile.match(new RegExp(`^FROM node:${node}-bookworm-slim@sha256:[0-9a-f]{64} AS`, 'gm'))).toHaveLength(
			2
		)
	})

	test.each([
		['a floating Node in .nvmrc', { ...versions, nvmrc: '24\n' }, '.nvmrc doit donner une version exacte'],
		[
			'another Node in .nvmrc than in the Dockerfile',
			{ ...versions, nvmrc: '24.20.0\n' },
			'attendu node:24.20.0-bookworm-slim',
		],
		[
			'another Node line in engines',
			{ ...versions, packageJson: { ...packageJson, engines: { node: '22.x' } } },
			'engines.node doit valoir « 24.x »',
		],
		[
			'another bun in packageManager than in the Dockerfile',
			{ ...versions, packageJson: { ...packageJson, packageManager: 'bun@1.3.13' } },
			'attendu oven/bun:1.3.13',
		],
		[
			'a bun given as a range',
			{ ...versions, packageJson: { ...packageJson, packageManager: 'bun@^1.3.14' } },
			'packageManager doit valoir « bun@ » suivi d’une version exacte',
		],
		[
			'a floating tag on a stage',
			{
				...versions,
				dockerfile: broken(
					dockerfile,
					/FROM node:[\d.]+-bookworm-slim(@\S+) AS run/,
					'FROM node:24-bookworm-slim$1 AS run'
				),
			},
			'FROM node:24-bookworm-slim : attendu node:',
		],
		[
			'an image without its digest',
			{ ...versions, dockerfile: broken(dockerfile, /(FROM oven\/bun:[\d.]+)@\S+/, '$1') },
			'l’image doit être figée par son digest',
		],
		[
			'another base image',
			{ ...versions, dockerfile: broken(dockerfile, /FROM node:\S+ AS run/, 'FROM alpine:3.22 AS run') },
			'seules les images oven/bun et node sont admises',
		],
		[
			'a file copied from an image that no stage pins',
			{
				...versions,
				dockerfile: broken(
					dockerfile,
					'COPY --from=deps /usr/local/bin/bun',
					'COPY --from=oven/bun:1.3.14 /usr/local/bin/bun'
				),
			},
			'COPY --from=oven/bun:1.3.14 : seule une étape précédente',
		],
		[
			'a last stage that is not Node',
			{ ...versions, dockerfile: dockerfile.slice(0, dockerfile.indexOf('# 2. Build')) },
			'La dernière étape du Dockerfile doit partir de l’image Node',
		],
	])('red on %s', (_fault, files, expected) => {
		expect(misalignedVersions(files).join('\n')).toContain(expected)
	})
})

describe('the image is built with public variables only, runs without root and says if it is healthy', () => {
	test('the Dockerfile of the repository respects every rule', () => {
		expect(imageProblems(dockerfile, envExample)).toEqual([])
		expect(publicVariablesProblems()).toEqual([])
	})

	test('the variables the application needs to run are known as runtime variables', () => {
		// The two secrets of today. The list follows .env.exemple: this test only proves it is read.
		const faulty = `${dockerfile}\nARG DATABASE_URI\nARG PAYLOAD_SECRET\n`

		expect(imageProblems(faulty, envExample).join('\n')).toContain('DATABASE_URI est une variable d’exécution')
		expect(imageProblems(faulty, envExample).join('\n')).toContain('PAYLOAD_SECRET est une variable d’exécution')
	})

	test.each([
		[
			'a secret as a build argument',
			`${dockerfile}\nARG PAYLOAD_SECRET\n`,
			'ARG PAYLOAD_SECRET : seules les variables publiques',
		],
		[
			'a secret written in the image',
			broken(dockerfile, 'ENV NODE_ENV=production', 'ENV DATABASE_URI=postgres://exemple NODE_ENV=production'),
			'DATABASE_URI est une variable d’exécution',
		],
		[
			'a secret used in a command',
			broken(dockerfile, '&& bun run build', '&& PAYLOAD_SECRET=exemple bun run build'),
			'PAYLOAD_SECRET est une variable d’exécution',
		],
		[
			'a variable of a later ticket that .env.exemple would list',
			`${dockerfile}\nARG RESEND_API_KEY\n`,
			'ARG RESEND_API_KEY : seules les variables publiques',
		],
		[
			'a public variable nobody added to the list',
			`${dockerfile}\nARG NEXT_PUBLIC_AUTRE\n`,
			'ARG NEXT_PUBLIC_AUTRE : seules les variables publiques',
		],
		[
			'a build argument written in lower case',
			`${dockerfile}\nARG npm_token\n`,
			'ARG npm_token : seules les variables publiques',
		],
		[
			'a secret as a build argument, in mixed case',
			`${dockerfile}\nARG Payload_Secret=exemple\n`,
			'ARG Payload_Secret : seules les variables publiques',
		],
		[
			'a setting of the running image outside the list',
			broken(dockerfile, 'ENV NODE_ENV=production', 'ENV APP_ENV=prod NODE_ENV=production'),
			'ENV APP_ENV dans la dernière étape',
		],
		[
			'a setting of the running image outside the list, in lower case',
			broken(dockerfile, 'ENV NODE_ENV=production', 'ENV app_env=prod NODE_ENV=production'),
			'ENV app_env dans la dernière étape',
		],
		['no USER line', broken(dockerfile, /^USER node$/m, ''), 'utilisateur sans droits'],
		['root as the user', broken(dockerfile, /^USER node$/m, 'USER root'), 'utilisateur sans droits'],
		['uid 0 as the user', broken(dockerfile, /^USER node$/m, 'USER 0:0'), 'utilisateur sans droits'],
		['no health check', dockerfile.slice(0, dockerfile.indexOf('HEALTHCHECK')), 'doit porter un HEALTHCHECK'],
		['a health check on another path', broken(dockerfile, "'/api/health'", "'/'"), 'doit porter un HEALTHCHECK'],
		[
			'a health check the guard cannot read',
			broken(dockerfile, /CMD \["node", "-e", .*\]$/m, 'CMD curl -f http://127.0.0.1:3000/api/health'),
			'doit porter un HEALTHCHECK',
		],
		[
			'an instruction the guard does not read',
			`${dockerfile}\nONBUILD RUN true\n`,
			'ne sait pas lire : « ONBUILD RUN true »',
		],
	])('red on %s', (_fault, faulty, expected) => {
		expect(imageProblems(faulty, envExample).join('\n')).toContain(expected)
	})

	test('a runtime variable is recognised from .env.exemple alone, whatever the Dockerfile says', () => {
		const withMail = `${envExample}\nRESEND_API_KEY=\n`

		expect(imageProblems(`${dockerfile}\nRUN echo "$RESEND_API_KEY"\n`, envExample)).toEqual([])
		expect(imageProblems(`${dockerfile}\nRUN echo "$RESEND_API_KEY"\n`, withMail).join('\n')).toContain(
			'RESEND_API_KEY est une variable d’exécution'
		)
	})

	test('red on a build variable whose name does not say it is public', () => {
		expect(publicVariablesProblems(['NEXT_PUBLIC_SITE_URL', 'S3_BUCKET'])).toEqual([
			'S3_BUCKET n’a pas un nom de variable publique : elle n’a pas sa place dans le build.',
		])
	})
})

describe('.dockerignore refuses everything but what the build needs', () => {
	/** Frozen here: a path is let into the build context by changing this list too. */
	const ALLOWED = [
		'package.json',
		'bun.lock',
		// The patches bun applies to a dependency when it installs it (`patchedDependencies` of package.json).
		'patches',
		'next.config.ts',
		'tsconfig.json',
		'postcss.config.json',
		'src',
		'public',
		// The import and the fake Strapi source of the bench, all fictional: the import that runs in the
		// container of the site reads them (ticket 233).
		'scripts/migration/import',
		'tests/support/source-strapi/creation.ts',
		'tests/support/source-strapi/data.ts',
		'tests/support/source-strapi/images.ts',
		'tests/support/source-strapi/schema.ts',
		'tests/fixtures/import/bench-decisions.json',
		'tests/fixtures/import/bench-reference.json',
	]
	const dockerignore = read('.dockerignore')

	test('the file of the repository lets through exactly the frozen list', () => {
		expect(buildContextProblems(dockerignore, ALLOWED)).toEqual([])
	})

	test.each([
		[
			'a file that no longer refuses everything first',
			broken(dockerignore, /^\*$/m, 'node_modules'),
			'doit commencer par « * »',
		],
		['a local .env let through', `${dockerignore}!.env\n`, 'laisse passer « .env »'],
		['the working files of the migration let through', `${dockerignore}!.migration\n`, 'laisse passer « .migration »'],
		['a source folder that is no longer sent', broken(dockerignore, '!src\n', ''), 'ne laisse plus passer « src »'],
		['a line that excludes after everything was excluded', `${dockerignore}tests/\n`, '« tests/ » ne sert à rien'],
	])('red on %s', (_fault, faulty, expected) => {
		expect(buildContextProblems(faulty, ALLOWED).join('\n')).toContain(expected)
	})
})

/* ------------------------------------------------------------------------------------------
 * The workflows
 * ---------------------------------------------------------------------------------------- */

const WORKFLOWS = '.github/workflows'
const CI = `${WORKFLOWS}/ci.yml`
/** The job the protection of the branch requires. */
const AGGREGATOR = 'ci-ok'
/**
 * The time limits of the longest chain of jobs add up to less than this many minutes. While
 * the jobs run side by side, it is also the 15 minutes a green run must not reach.
 */
const CI_LIMIT_MINUTES = 15
/**
 * Each shard of the integration tests and of the end-to-end tests must take less than this many
 * minutes: it is the time limit of their jobs.
 */
const BENCH_LIMIT_MINUTES = 10

const workflows: Workflow[] = readdirSync(path.join(ROOT, WORKFLOWS))
	.filter(file => /\.ya?ml$/.test(file))
	.map(file => readWorkflow(`${WORKFLOWS}/${file}`, read(`${WORKFLOWS}/${file}`)))
const ciText = read(CI)
const ci = readWorkflow(CI, ciText)
/** The CI with one thing changed in its text. */
const brokenCi = (from: string | RegExp, to: string): Workflow => readWorkflow(CI, broken(ciText, from, to))

const required = (JSON.parse(read('ci/required-checks.json')) as { checks: RequiredCheck[] }).checks

const CHECKOUT = 'uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6.1.0'
/** An expression of GitHub Actions, `\${{ … }}`, written so that it is not read as a template of this file. */
const expression = (inner: string): string => `\${{ ${inner} }}`
/** A full commit that pins nothing real: forty times the same digit. */
const A_COMMIT = '1'.repeat(40)

test('the workflows of the repository are read: the CI is one of them', () => {
	expect(workflows.map(workflow => workflow.file)).toContain(CI)
	expect(Object.keys(ci.jobs)).toEqual(['qualite', 'unit', 'build', 'integration', 'e2e', AGGREGATOR])
})

describe('C01: no step and no job is allowed to fail', () => {
	test('no workflow tolerates a failure', () => {
		expect(toleratedFailures(workflows)).toEqual([])
	})

	test.each([
		[
			'a step with continue-on-error',
			brokenCi('      - name: Biome\n', '      - name: Biome\n        continue-on-error: true\n'),
		],
		['a job with continue-on-error', brokenCi('  unit:\n', '  unit:\n    continue-on-error: true\n')],
		[
			'continue-on-error behind an expression',
			brokenCi('  unit:\n', `  unit:\n    continue-on-error: ${expression("github.event_name == 'pull_request'")}\n`),
		],
	])('red on %s', (_fault, faulty) => {
		expect(toleratedFailures([faulty]).join('\n')).toContain('« continue-on-error » rend un échec invisible')
	})

	test.each([
		['|| true', 'run: bun run ci:biome || true'],
		['|| :', 'run: "bun run ci:biome || :"'],
		['|| exit 0', 'run: bun run ci:biome || exit 0'],
		['|| and a message', 'run: bun run ci:biome || echo "ignoré"'],
		['|| and a group that ends well', 'run: bun run ci:biome || { echo "ignoré"; }'],
		['set +e', 'run: set +e; bun run ci:biome'],
		['set +e among other options', 'run: set -u +e; bun run ci:biome'],
		['set +o errexit', 'run: set +o errexit; bun run ci:biome'],
		['set +o pipefail', 'run: set +o pipefail; bun run ci:biome | cat'],
		['; true', 'run: bun run ci:biome; true'],
		['a last line that is a success', 'run: |\n          bun run ci:biome\n          exit 0'],
		['a lone colon', 'run: |\n          bun run ci:biome\n          :'],
		['an early exit in a branch', 'run: if [ -n "$CI" ]; then exit 0; fi; bun run ci:biome'],
	])('red on a command that swallows its failure with %s', (_trick, run) => {
		expect(toleratedFailures([brokenCi('run: bun run ci:biome', run)]).join('\n')).toContain(
			'job qualite, « Biome » : la commande avale son échec'
		)
	})

	test.each([
		['a command that fails on purpose', 'run: bun run ci:biome || exit 1'],
		['an « or » inside an expression of GitHub', `run: echo "${expression('github.head_ref || github.ref_name')}"`],
		['a loop that waits', 'run: while true; do bun run ci:biome && break; done'],
		['a file emptied with a colon', 'run: |\n          : > rapport.txt\n          bun run ci:biome'],
		['tracing switched off', 'run: set +x; bun run ci:biome'],
		['the word « set » inside another command', 'run: gh variable set LOT --body "a+be"'],
	])('%s is not a swallowed failure', (_case, run) => {
		expect(toleratedFailures([brokenCi('run: bun run ci:biome', run)])).toEqual([])
	})

	describe('a failure in a pipe', () => {
		const DEFAULT_SHELL = 'defaults:\n  run:\n    shell: bash\n'
		/** `false | cat`, run by bash with the given options: the exit code GitHub would read. */
		const piped = (...options: string[]): number =>
			Bun.spawnSync(['bash', '--noprofile', '--norc', ...options, '-c', 'false | cat'], {
				env: { PATH: process.env.PATH ?? '' },
			}).exitCode

		test('the trap: without pipefail a failed command in a pipe passes, with it the step fails', () => {
			// What GitHub runs when no shell is named, then what it runs under « shell: bash ».
			expect(piped('-e')).toBe(0)
			expect(piped('-eo', 'pipefail')).toBe(1)
		})

		test('red on a workflow that does not ask for bash, so for pipefail', () => {
			expect(toleratedFailures([brokenCi(DEFAULT_SHELL, '')]).join('\n')).toContain(
				'doit déclarer « defaults: run: shell: bash »'
			)
			expect(toleratedFailures([brokenCi(DEFAULT_SHELL, 'defaults:\n  run:\n    shell: sh\n')]).join('\n')).toContain(
				'doit déclarer « defaults: run: shell: bash »'
			)
		})

		test.each([
			[
				'a step with its own shell',
				'        run: bun run ci:biome\n',
				'        shell: bash {0}\n        run: bun run ci:biome\n',
				'job qualite, « Biome » : un « shell » propre à l’étape',
			],
			[
				'a job with its own defaults',
				'  unit:\n',
				'  unit:\n    defaults:\n      run:\n        shell: bash {0}\n',
				'job unit : « defaults » ne se règle qu’une fois',
			],
		])('red on %s', (_fault, from, to, expected) => {
			expect(toleratedFailures([brokenCi(from, to)]).join('\n')).toContain(expected)
		})
	})
})

describe('C02: no step depends on a cache, and only .next/cache is cached', () => {
	const cacheStep = (folder: string) =>
		`      - uses: actions/cache@${A_COMMIT} # v5.0.5\n        with:\n          path: ${folder}\n          key: next\n      - name: Build the image\n`

	test('no workflow depends on a cache', () => {
		expect(cacheDependentSteps(workflows)).toEqual([])
	})

	test('the compilation cache of Next is the one thing a workflow may cache', () => {
		expect(cacheDependentSteps([brokenCi('      - name: Build the image\n', cacheStep('.next/cache'))])).toEqual([])
	})

	test.each([
		['the whole build output in the cache', cacheStep('.next'), 'seul « .next/cache » se met en cache'],
		[
			'the dependencies and the build in one cache',
			cacheStep('|\n            node_modules\n            .next/cache'),
			'seul « .next/cache » se met en cache',
		],
		[
			'a build skipped when the cache was hit',
			"      - name: Build the image\n        if: steps.cache.outputs.cache-hit != 'true'\n",
			'ne doit jamais dépendre de « cache-hit »',
		],
	])('red on %s', (_fault, replacement, expected) => {
		expect(cacheDependentSteps([brokenCi('      - name: Build the image\n', replacement)]).join('\n')).toContain(
			expected
		)
	})
})

describe('C03: the required checks exist under their exact names', () => {
	test('ci/required-checks.json lists ci-ok and CodeQL, and both are what they say', () => {
		expect(required.map(check => [check.name, check.source])).toEqual([
			['ci-ok', 'workflow'],
			['CodeQL', 'github'],
		])
		expect(requiredCheckProblems(required, workflows)).toEqual([])
	})

	test.each([
		[
			'a required job shown under another name',
			[brokenCi('    name: ci-ok\n', '    name: CI OK\n')],
			's’affiche sous le nom « CI OK »',
		],
		['a required job that was renamed', [brokenCi('  ci-ok:\n', '  verdict:\n')], 'n’a pas de job « ci-ok »'],
		['a required workflow that is gone', [], 'le fichier .github/workflows/ci.yml n’existe pas'],
		[
			'a required job behind a matrix',
			[brokenCi('    name: ci-ok\n', '    name: ci-ok\n    strategy: { matrix: { lot: [1, 2] } }\n')],
			'une matrice change le nom du check',
		],
		[
			'a job named like the check of GitHub',
			[brokenCi('  unit:\n    name: unit\n', '  unit:\n    name: CodeQL\n')],
			'un job nommé « CodeQL » passerait pour le check « CodeQL » de GitHub',
		],
		[
			'a job whose identifier is the name of the check of GitHub',
			[brokenCi('  unit:\n    name: unit\n', '  codeql:\n')],
			'un job nommé « codeql » passerait pour le check « CodeQL » de GitHub',
		],
		[
			'a CodeQL analysis written in a workflow',
			[
				brokenCi(
					'      - name: Unit tests\n',
					`      - uses: github/codeql-action/analyze@${A_COMMIT} # v4.0.0\n      - name: Unit tests\n`
				),
			],
			'GitHub refuse une analyse CodeQL écrite ici',
		],
	])('red on %s', (_fault, faulty, expected) => {
		expect(requiredCheckProblems(required, faulty).join('\n')).toContain(expected)
	})

	test.each([
		[
			'a job of another workflow shown under the name of the required check',
			readWorkflow(
				`${WORKFLOWS}/autre.yml`,
				'on:\n  pull_request:\njobs:\n  ci-ok:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: echo vert\n'
			),
			'.github/workflows/autre.yml, job ci-ok : il s’affiche lui aussi sous le nom « ci-ok »',
		],
		[
			'a job of another workflow named like it, whatever its identifier',
			readWorkflow(
				`${WORKFLOWS}/autre.yml`,
				'on:\n  pull_request:\njobs:\n  verdict:\n    name: CI-OK\n    runs-on: ubuntu-24.04\n    steps:\n      - run: echo vert\n'
			),
			'.github/workflows/autre.yml, job verdict : il s’affiche lui aussi sous le nom « CI-OK »',
		],
	])('red on %s', (_fault, homonym, expected) => {
		expect(requiredCheckProblems(required, [ci, homonym]).join('\n')).toContain(expected)
	})

	test('red on a second job of the CI itself shown under the name of the required check', () => {
		const faulty = brokenCi('  unit:\n    name: unit\n', '  unit:\n    name: ci-ok\n')

		expect(requiredCheckProblems(required, [faulty])).toEqual([
			'.github/workflows/ci.yml, job unit : il s’affiche lui aussi sous le nom « ci-ok », et passerait pour le check requis « ci-ok ».',
		])
	})

	test('red on a required check of an unknown kind', () => {
		expect(requiredCheckProblems([{ name: 'autre', source: 'ailleurs' }], workflows)).toEqual([
			'Check requis « autre » : source « ailleurs » inconnue.',
		])
	})
})

describe('C04: the workflows install the Node of .nvmrc and the bun of package.json', () => {
	test('every setup step reads its version in the repository', () => {
		expect(misalignedSetups(workflows)).toEqual([])
		expect(ciText.match(/node-version-file: \.nvmrc/g)).toHaveLength(2)
		expect(ciText.match(/bun-version-file: package\.json/g)).toHaveLength(5)
	})

	test.each([
		[
			'a bun version written in the workflow',
			'bun-version-file: package.json',
			'bun-version: 1.3.14',
			'bun-version-file: package.json',
		],
		['the latest bun', 'bun-version-file: package.json', 'bun-version: latest', 'bun-version-file: package.json'],
		[
			'a bun version next to the file',
			'bun-version-file: package.json',
			'bun-version-file: package.json\n          bun-version: 1.3.14',
			'sans « bun-version »',
		],
		[
			'a Node version written in the workflow',
			'node-version-file: .nvmrc',
			'node-version: 24',
			'node-version-file: .nvmrc',
		],
		[
			'another file for the Node version',
			'node-version-file: .nvmrc',
			'node-version-file: package.json',
			'node-version-file: .nvmrc',
		],
	])('red on %s', (_fault, from, to, expected) => {
		expect(misalignedSetups([brokenCi(from, to)]).join('\n')).toContain(expected)
	})
})

describe('every action is pinned by its commit', () => {
	test('no workflow uses a tag or a branch', () => {
		expect(unpinnedActions(workflows)).toEqual([])
	})

	test.each([
		['a tag', 'uses: actions/checkout@v6 # v6.1.0', 'n’est pas figée par un commit complet'],
		['a branch', 'uses: actions/checkout@main', 'n’est pas figée par un commit complet'],
		['a short commit', 'uses: actions/checkout@d23441a # v6.1.0', 'n’est pas figée par un commit complet'],
		['a commit without its version', `uses: actions/checkout@${A_COMMIT}`, 'doit finir par sa version en commentaire'],
		['a container image as an action', 'uses: docker://alpine:3.22', 'n’est pas figée par un commit complet'],
	])('red on %s', (_fault, uses, expected) => {
		expect(unpinnedActions([brokenCi(CHECKOUT, uses)]).join('\n')).toContain(expected)
	})
})

describe('there is no pre-production workflow (ticket 232)', () => {
	test('the two workflows of the pre-production are gone, and no remaining workflow, script or file names it', () => {
		for (const name of ['preprod.yml', 'preprod-controles.yml'])
			expect(existsSync(path.join(ROOT, WORKFLOWS, name)), name).toBe(false)
		const texts = workflows.map(workflow => readFileSync(path.join(ROOT, workflow.file), 'utf8')).join('\n')
		expect(texts).not.toMatch(/preprod|préprod/i)
		expect(read('package.json')).not.toMatch(/preprod|préprod/i)
	})
})

describe('the CI reads no secret', () => {
	/** Frozen here: a workflow reads a secret only when its name is added to this list, in the same commit. */
	const ALLOWED_SECRETS: string[] = [
		// release.yml pushes the publication on main with the token of its own run (ticket 036).
		'GITHUB_TOKEN',
		// sonde-continue.yml (ticket 277): the protected access of the v3, the key of the email
		// service for the alert, and the address that receives it. Never printed by the script.
		'WATCH_ACCESS_USER',
		'WATCH_ACCESS_PASSWORD',
		'WATCH_RESEND_KEY',
		'WATCH_ALERT_TO',
	]

	test('the CI reads none, and the other workflows only the ones of the allowed list', () => {
		expect(unexpectedSecrets([ci])).toEqual([])
		expect(unexpectedSecrets(workflows, ALLOWED_SECRETS)).toEqual([])
	})

	test.each([
		[
			'a secret in an environment variable',
			'run: bun run test:unit',
			`run: bun run test:unit\n        env:\n          JETON: ${expression('secrets.JETON_EXEMPLE')}`,
			'lit le secret « JETON_EXEMPLE »',
		],
		[
			'a secret read by its index',
			'run: bun run test:unit',
			`run: echo ${expression("secrets['JETON_EXEMPLE']")}`,
			'lit le secret « JETON_EXEMPLE »',
		],
		[
			'the token of the run',
			'run: bun run test:unit',
			`run: echo ${expression('secrets.GITHUB_TOKEN')}`,
			'lit le secret « GITHUB_TOKEN »',
		],
		[
			'the token of the run, under its other name',
			'run: bun run test:unit',
			`run: echo ${expression('github.token')}`,
			'lit le secret « GITHUB_TOKEN »',
		],
		[
			'the token of the run, taken with the whole github context',
			'run: bun run test:unit',
			`run: bun run test:unit\n        env:\n          CONTEXTE: ${expression('toJSON(github)')}`,
			'lit le secret « GITHUB_TOKEN »',
		],
		[
			'a secret named in a condition, which needs no braces',
			'      - name: Unit tests\n',
			"      - name: Unit tests\n        if: always() && secrets.JETON_EXEMPLE != ''\n",
			'lit le secret « JETON_EXEMPLE »',
		],
		[
			'a secret on a commented line of a command, which GitHub replaces all the same',
			'run: bun run test:unit',
			`run: |\n          # ${expression('secrets.JETON_EXEMPLE')}\n          bun run test:unit`,
			'lit le secret « JETON_EXEMPLE »',
		],
		[
			'every secret handed to a called workflow',
			'    timeout-minutes: 12\n',
			'    timeout-minutes: 12\n    secrets: inherit\n',
			'transmet tous les secrets',
		],
	])('red on %s', (_fault, from, to, expected) => {
		expect(unexpectedSecrets([brokenCi(from, to)]).join('\n')).toContain(expected)
	})

	test.each([
		['every secret at once', 'toJSON(secrets)'],
		['every secret at once, in upper case', 'toJSON(SECRETS)'],
		['every secret, as a list of values', 'join(secrets.*, 0)'],
		['a secret whose name is computed', "secrets[format('JETON_{0}', matrix.cible)]"],
		['a secret whose name comes from another context', 'secrets[inputs.nom]'],
	])('red on %s, even when a list of names is allowed', (_fault, read) => {
		const faulty = brokenCi(
			'run: bun run test:unit',
			`run: bun run test:unit\n        env:\n          TOUT: ${expression(read)}`
		)

		expect(unexpectedSecrets([faulty], ['JETON_EXEMPLE']).join('\n')).toContain('lit les secrets sans nommer lequel')
	})

	test.each([
		['the word between quotes', "contains(github.event_name, 'secrets')"],
		['a property of another context that bears the name', 'needs.build.outputs.secrets'],
		['a property of the github context that is not the token', 'github.ref_name'],
		['a text that only mentions the token', "format('{0}', 'github.token')"],
	])('%s reads no secret', (_case, read) => {
		expect(unexpectedSecrets([brokenCi('run: bun run test:unit', `run: echo ${expression(read)}`)])).toEqual([])
	})

	test('a secret of the allowed list passes, a comment about secrets too', () => {
		const faulty = brokenCi(
			'run: bun run test:unit',
			`run: echo ${expression('secrets.JETON_EXEMPLE')}\n      # never secrets.AUTRE`
		)

		expect(unexpectedSecrets([faulty], ['JETON_EXEMPLE'])).toEqual([])
	})

	test('the name of a secret is not case-sensitive, for GitHub and for the allowed list', () => {
		const faulty = brokenCi('run: bun run test:unit', `run: echo ${expression('secrets.jeton_exemple')}`)

		expect(unexpectedSecrets([faulty], ['JETON_EXEMPLE'])).toEqual([])
		expect(unexpectedSecrets([faulty], ['AUTRE']).join('\n')).toContain('lit le secret « jeton_exemple »')
	})
})

describe('the CI runs on every pull request and every push on v3, without any path filter', () => {
	test('the triggers of the CI', () => {
		expect(triggerProblems(ci, 'v3')).toEqual([])
		expect(permissionProblems(ci)).toEqual([])
	})

	test.each([
		[
			'paths-ignore on pull requests',
			'  pull_request:\n',
			"  pull_request:\n    paths-ignore: ['docs/**']\n",
			'« paths-ignore » laisse le check requis en attente',
		],
		[
			'paths on pushes',
			'    branches: [main, v3]\n',
			"    branches: [main, v3]\n    paths: ['src/**']\n",
			'« paths » laisse le check requis en attente',
		],
		[
			'a branch filter on pull requests',
			'  pull_request:\n',
			'  pull_request:\n    branches: [main]\n',
			'« pull_request » ne doit porter aucun filtre (branches)',
		],
		[
			'a type filter on pull requests',
			'  pull_request:\n',
			'  pull_request:\n    types: [opened]\n',
			'« pull_request » ne doit porter aucun filtre (types)',
		],
		['no pull request trigger', '  pull_request:\n', '', 'doit tourner sur chaque pull request'],
		[
			'pushes on v3 left out',
			'    branches: [main, v3]\n',
			'    branches: [main]\n',
			'doit tourner à chaque poussée sur v3',
		],
		[
			'pull_request_target',
			'  pull_request:\n',
			'  pull_request:\n  pull_request_target:\n',
			'« pull_request_target » donne les secrets du dépôt',
		],
	])('red on %s', (_fault, from, to, expected) => {
		expect(triggerProblems(brokenCi(from, to), 'v3').join('\n')).toContain(expected)
	})

	test.each([
		[
			'a write permission',
			'  contents: read\n',
			'  contents: write\n',
			'doit déclarer « permissions: contents: read »',
		],
		[
			'one more permission',
			'  contents: read\n',
			'  contents: read\n  pull-requests: write\n',
			'doit déclarer « permissions: contents: read »',
		],
		['no permissions block', 'permissions:\n  contents: read\n', '', 'doit déclarer « permissions: contents: read »'],
		[
			'a job that widens the permissions',
			'  unit:\n',
			'  unit:\n    permissions: write-all\n',
			'job unit : aucun job n’élargit les permissions',
		],
	])('red on %s', (_fault, from, to, expected) => {
		expect(permissionProblems(brokenCi(from, to)).join('\n')).toContain(expected)
	})
})

describe('ci-ok is red when a job failed, was cancelled or was skipped', () => {
	/** The very script of the ci-ok job, run by bash as GitHub runs it, with the given results. */
	function verdict(results: string): { code: number; output: string } {
		const script = ci.jobs[AGGREGATOR]?.steps?.[0]?.run
		if (script === undefined) throw new Error('the ci-ok job has no script')
		// The command line of « shell: bash », the default of the workflow.
		const ran = Bun.spawnSync(['bash', '--noprofile', '--norc', '-eo', 'pipefail', '-c', script], {
			env: { PATH: process.env.PATH ?? '', RESULTS: results, DETAIL: '{}' },
		})
		return { code: ran.exitCode, output: ran.stdout.toString() }
	}

	/** The results of the five jobs, in the order of `needs`: every one a success, but the ones given. */
	const results = (changed: Partial<Record<'qualite' | 'unit' | 'build' | 'integration' | 'e2e', string>> = {}) =>
		(['qualite', 'unit', 'build', 'integration', 'e2e'] as const).map(job => changed[job] ?? 'success').join(' ')

	test('green when every job succeeded', () => {
		expect(verdict(results())).toMatchObject({ code: 0 })
		expect(verdict(results()).output).toContain('ci-ok est vert')
	})

	test.each([
		['failed', results({ unit: 'failure' })],
		['was cancelled', results({ qualite: 'cancelled' })],
		['was skipped', results({ build: 'skipped' })],
		['has a result nobody knows', results({ build: 'neutral' })],
		['failed, last of the list', results({ e2e: 'failure' })],
		// The two jobs of the test bench, alone. A shard of the end-to-end tests that failed makes the
		// whole matrix « failure »; one that hit its time limit makes it « cancelled ».
		['of the test bench failed: the integration tests', results({ integration: 'failure' })],
		['of the test bench failed: a shard of the end-to-end tests', results({ e2e: 'failure' })],
		['of the test bench was cancelled: a shard that hit its time limit', results({ e2e: 'cancelled' })],
		['of the test bench was skipped', results({ integration: 'skipped' })],
	])('red when a job %s', (_fault, results) => {
		const { code, output } = verdict(results)

		expect(code).toBe(1)
		expect(output).toContain('::error::')
		expect(output).not.toContain('ci-ok est vert')
	})

	test('red when it received no result at all', () => {
		expect(verdict('')).toMatchObject({ code: 1 })
	})

	test('it always runs, waits for every other job, and nothing can be skipped by a condition', () => {
		expect(aggregatorProblems(ci, AGGREGATOR)).toEqual([])
		expect(ci.jobs[AGGREGATOR]?.needs).toEqual(['qualite', 'unit', 'build', 'integration', 'e2e'])
	})

	test.each([
		['a ci-ok that is skipped when a job fails', '    if: always()\n', '', 'sans « if: always() »'],
		['a ci-ok that runs on success only', '    if: always()\n', '    if: success()\n', 'sans « if: always() »'],
		[
			'a job ci-ok does not wait for',
			'needs: [qualite, unit, build, integration, e2e]',
			'needs: [qualite, unit, build, integration]',
			'il n’attend pas le job « e2e »',
		],
		[
			'the integration tests left out of ci-ok',
			'needs: [qualite, unit, build, integration, e2e]',
			'needs: [qualite, unit, build, e2e]',
			'il n’attend pas le job « integration »',
		],
		[
			'a job added without being needed',
			'  unit:\n',
			'  autre:\n    runs-on: ubuntu-24.04\n    steps: []\n  unit:\n',
			'il n’attend pas le job « autre »',
		],
		[
			'a needed job that does not exist',
			'needs: [qualite, unit, build, integration, e2e]',
			'needs: [qualite, unit, build, integration, e2e, lighthouse]',
			'il attend « lighthouse », qui n’existe pas',
		],
		[
			'results read another way',
			`RESULTS: ${expression("join(needs.*.result, ' ')")}`,
			`RESULTS: ${expression('needs.build.result')}`,
			'une seule étape, qui reçoit RESULTS',
		],
		[
			'a job under a condition',
			'  unit:\n',
			"  unit:\n    if: github.event_name == 'push'\n",
			'job unit : un job sous condition peut être sauté',
		],
		[
			'a step under a condition',
			'      - name: Unit tests\n',
			"      - name: Unit tests\n        if: github.ref == 'refs/heads/v3'\n",
			'seules les conditions always() et !cancelled() sont admises',
		],
		[
			'a step that runs on success of a cache',
			'      - name: Unit tests\n',
			'      - name: Unit tests\n        if: success()\n',
			'seules les conditions always() et !cancelled() sont admises',
		],
		[
			'the unit tests run only when an earlier step failed',
			'      - name: Unit tests\n',
			'      - name: Unit tests\n        if: failure()\n',
			'job unit, « Unit tests » : sous « failure() », la commande est sautée quand tout va bien',
		],
		[
			'the image built only when an earlier step failed',
			'      - name: Build the image\n',
			`      - name: Build the image\n        if: ${expression('failure()')}\n`,
			'job build, « Build the image » : sous « failure() », la commande est sautée quand tout va bien',
		],
		[
			'a condition that looks like an allowed one',
			'      - name: Unit tests\n',
			'      - name: Unit tests\n        if: always() && false\n',
			'pas « always() && false »',
		],
	])('red on %s', (_fault, from, to, expected) => {
		expect(aggregatorProblems(brokenCi(from, to), AGGREGATOR).join('\n')).toContain(expected)
	})

	test('an action that sends a report may wait for a failure: it has nothing to send on a green job', () => {
		const report = `      - name: Unit tests\n        run: bun run test:unit\n      - uses: actions/upload-artifact@${A_COMMIT} # v7.0.0\n        if: failure()\n`

		expect(
			aggregatorProblems(brokenCi('      - name: Unit tests\n        run: bun run test:unit\n', report), AGGREGATOR)
		).toEqual([])
	})
})

describe('the time limits of the CI: no run lasts 15 minutes', () => {
	test('every job has a time limit, and the limits of the longest chain add up to less than 15 minutes', () => {
		expect(durationProblems(ci, CI_LIMIT_MINUTES)).toEqual([])
	})

	test('a job chained after the build does not fit: the message says where to read what to do', () => {
		// The end-to-end tests waiting for the build, as the plan first had them: build, then e2e, then ci-ok.
		const withIt = brokenCi('    name: e2e (', '    needs: [build]\n    name: e2e (')

		expect(durationProblems(withIt, CI_LIMIT_MINUTES)).toEqual([
			'.github/workflows/ci.yml : la plus longue chaîne de jobs peut durer 24 minutes, il en faut moins de 15 (docs/qualite.md, « Durée de la CI », dit quoi faire quand un job s’enchaîne après un autre).',
		])
		expect(durationProblems(withIt, 30)).toEqual([])
		// The section the message sends to exists (the whole document is not printed on a failure).
		expect(read('docs/qualite.md').includes('\n### Durée de la CI\n')).toBe(true)
	})

	test.each([
		[
			'a job without a time limit',
			'    timeout-minutes: 12\n',
			'',
			'job build : il lui faut une limite « timeout-minutes »',
		],
		[
			'a job that may run 20 minutes',
			'timeout-minutes: 12',
			'timeout-minutes: 20',
			'peut durer 22 minutes, il en faut moins de 15',
		],
		[
			'a chain of jobs that adds up',
			'  unit:\n',
			'  unit:\n    needs: [qualite]\n',
			'peut durer 22 minutes, il en faut moins de 15',
		],
		[
			'a limit that is not a number of minutes',
			'timeout-minutes: 12',
			'timeout-minutes: beaucoup',
			'job build : il lui faut une limite',
		],
	])('red on %s', (_fault, from, to, expected) => {
		expect(durationProblems(brokenCi(from, to), CI_LIMIT_MINUTES).join('\n')).toContain(expected)
	})
})

describe('the CI runs the integration tests and the end-to-end tests on the test bench, in shards', () => {
	const SETUP_NODE_OF_E2E =
		'      # Playwright runs under Node, not bun.\n      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6.5.0\n        with:\n          node-version-file: .nvmrc\n          package-manager-cache: false\n'
	const BENCH_OF_INTEGRATION =
		'      - name: Start the test bench\n        run: bun run bench:up\n      - name: Integration tests\n'
	const SHARD = expression('matrix.shard')
	const INTEGRATION_TESTS = `run: bun run test:integration --shard=${SHARD}/3`
	const E2E_TESTS = `run: bun run test:e2e --shard=${SHARD}/4`

	test('each job starts the bench before its tests; three shards of integration tests, four of end-to-end tests, each in less than 10 minutes', () => {
		expect(SHARDS).toEqual({ integration: 3, e2e: 4 })
		expect(benchJobProblems(ci, BENCH_LIMIT_MINUTES)).toEqual([])
		expect(ci.jobs.integration?.['timeout-minutes']).toBeLessThanOrEqual(BENCH_LIMIT_MINUTES)
		expect(ci.jobs.e2e?.['timeout-minutes']).toBeLessThanOrEqual(BENCH_LIMIT_MINUTES)
	})

	test.each([
		[
			'no integration job any more',
			'  integration:\n    name: integration',
			'  integ:\n    name: integ',
			'n’a pas de job « integration » : le banc de test n’y tournerait plus',
		],
		[
			'integration tests without the bench',
			BENCH_OF_INTEGRATION,
			'      - name: Integration tests\n',
			'job integration : il doit lancer « bun run bench:up », seule dans son étape',
		],
		[
			'integration tests started before the bench',
			`${BENCH_OF_INTEGRATION}        ${INTEGRATION_TESTS}\n`,
			`      - name: Integration tests\n        ${INTEGRATION_TESTS}\n      - name: Start the test bench\n        run: bun run bench:up\n`,
			`job integration : « bun run test:integration --shard=${SHARD}/3 » doit venir après « bun run bench:up »`,
		],
		[
			'one integration file instead of its shard of the folder',
			INTEGRATION_TESTS,
			'run: bun run test:integration tests/integration/bench-base.test.ts',
			`job integration : il doit lancer « bun run test:integration --shard=${SHARD}/3 », seule dans son étape`,
		],
		[
			'every integration test in each shard',
			INTEGRATION_TESTS,
			'run: bun run test:integration',
			`job integration : il doit lancer « bun run test:integration --shard=${SHARD}/3 »`,
		],
		[
			'integration tests divided by another number than their shards',
			INTEGRATION_TESTS,
			`run: bun run test:integration --shard=${SHARD}/2`,
			`job integration : il doit lancer « bun run test:integration --shard=${SHARD}/3 »`,
		],
		[
			'the bench and the tests in one script',
			`        run: bun run bench:up\n      - name: Integration tests\n        ${INTEGRATION_TESTS}\n`,
			`        run: |\n          bun run bench:up\n          bun run test:integration --shard=${SHARD}/3\n`,
			`job integration : il doit lancer « bun run test:integration --shard=${SHARD}/3 », seule dans son étape`,
		],
		[
			'an integration shard left out of the matrix',
			'shard: [1, 2, 3]\n',
			'shard: [1, 2]\n',
			'job integration : les tests tournent en 3 lots, « matrix: shard: [1, 2, 3] », et rien d’autre',
		],
		[
			'integration tests without their shards',
			`    name: integration (${SHARD}/3)`,
			'    name: integration',
			`job integration : son nom dit ses lots, « integration (${SHARD}/3) »`,
		],
		[
			'a failed integration shard that cancels the others',
			'      fail-fast: false\n      matrix:\n        shard: [1, 2, 3]\n',
			'      fail-fast: true\n      matrix:\n        shard: [1, 2, 3]\n',
			'job integration : « fail-fast: false », sinon un lot en échec annule les autres',
		],
		[
			'integration tests allowed 15 minutes',
			'    timeout-minutes: 10\n    strategy:\n      # A failed shard does not stop the others: one push shows every failed test.\n      fail-fast: false\n      matrix:\n        shard: [1, 2, 3]',
			'    timeout-minutes: 15\n    strategy:\n      # A failed shard does not stop the others: one push shows every failed test.\n      fail-fast: false\n      matrix:\n        shard: [1, 2, 3]',
			'job integration : sa limite est de 15 minutes ; chaque lot doit tenir en 10',
		],
		[
			'every end-to-end test in each shard',
			E2E_TESTS,
			'run: bun run test:e2e',
			`job e2e : il doit lancer « bun run test:e2e --shard=${SHARD}/4 »`,
		],
		[
			'end-to-end tests divided by another number than their shards',
			E2E_TESTS,
			`run: bun run test:e2e --shard=${SHARD}/2`,
			`job e2e : il doit lancer « bun run test:e2e --shard=${SHARD}/4 »`,
		],
		[
			'end-to-end tests without their browser',
			'      - name: Browser of Playwright\n        run: bunx playwright install chromium\n',
			'',
			'job e2e : il doit lancer « bunx playwright install chromium »',
		],
		[
			'end-to-end tests without Node',
			SETUP_NODE_OF_E2E,
			'',
			'job e2e : Playwright tourne sous Node, installé avant les essais',
		],
		['a single shard', 'shard: [1, 2, 3, 4]', 'shard: [1]', 'job e2e : les tests tournent en 4 lots'],
		[
			'five shards for a command that cuts in four',
			'shard: [1, 2, 3, 4]',
			'shard: [1, 2, 3, 4, 5]',
			'job e2e : les tests tournent en 4 lots',
		],
		[
			'a shard counted from zero',
			'shard: [1, 2, 3, 4]',
			'shard: [0, 1, 2, 3]',
			'job e2e : les tests tournent en 4 lots',
		],
		[
			'a second dimension that runs every shard twice',
			'        shard: [1, 2, 3, 4]\n',
			'        shard: [1, 2, 3, 4]\n        navigateur: [chromium, firefox]\n',
			'job e2e : les tests tournent en 4 lots, « matrix: shard: [1, 2, 3, 4] », et rien d’autre',
		],
		[
			'a name that says another number of shards',
			`    name: e2e (${SHARD}/4)`,
			`    name: e2e (${SHARD}/2)`,
			`job e2e : son nom dit ses lots, « e2e (${SHARD}/4) »`,
		],
		[
			'a failed shard that cancels the others',
			'      fail-fast: false\n      matrix:\n        shard: [1, 2, 3, 4]\n',
			'      fail-fast: true\n      matrix:\n        shard: [1, 2, 3, 4]\n',
			'job e2e : « fail-fast: false », sinon un lot en échec annule les autres',
		],
		[
			'the default of GitHub, which cancels the other shards',
			'      fail-fast: false\n      matrix:\n        shard: [1, 2, 3, 4]\n',
			'      matrix:\n        shard: [1, 2, 3, 4]\n',
			'job e2e : « fail-fast: false », sinon un lot en échec annule les autres',
		],
		[
			'end-to-end tests allowed 15 minutes',
			'    timeout-minutes: 10\n    strategy:\n      # A failed shard does not stop the others: one push shows every failed test.\n      fail-fast: false\n      matrix:\n        shard: [1, 2, 3, 4]',
			'    timeout-minutes: 15\n    strategy:\n      # A failed shard does not stop the others: one push shows every failed test.\n      fail-fast: false\n      matrix:\n        shard: [1, 2, 3, 4]',
			'job e2e : sa limite est de 15 minutes ; chaque lot doit tenir en 10',
		],
	])('red on %s', (_fault, from, to, expected) => {
		expect(benchJobProblems(brokenCi(from, to), BENCH_LIMIT_MINUTES).join('\n')).toContain(expected)
	})
})

/* ------------------------------------------------------------------------------------------
 * Test files and tracked files
 * ---------------------------------------------------------------------------------------- */

/** What git tracks, under the given patterns. */
function tracked(...patterns: string[]): string[] {
	const ran = Bun.spawnSync(['git', 'ls-files', '-z', '--', ...patterns], { cwd: ROOT })
	if (ran.exitCode !== 0) throw new Error(`git ls-files failed: ${ran.stderr.toString()}`)
	return ran.stdout.toString().split('\0').filter(Boolean)
}

describe('C05: no focused test, no skipped test without its issue', () => {
	// Written in pieces, so that this file does not contain what it looks for.
	const call = (name: string, modifier: string) => `${name}.${modifier}('un cas', () => {})`
	/** A condition written as a constant: `name.modifier(true)(…)`. */
	const always = (name: string, modifier: string, value: boolean) => `${name}.${modifier}(${value})('un cas', () => {})`

	test('no test file of the repository focuses or skips a test', () => {
		const files = tracked('tests/**/*.ts', 'tests/**/*.tsx')

		expect(files).toContain('tests/ci/ci-guardrails.test.ts')
		expect(focusedOrSkippedTests(files.map(file => ({ file, text: read(file) })))).toEqual([])
	})

	test.each([
		['a focused test', call('test', 'only'), 'un test en « .only »'],
		['a focused group', call('describe', 'only'), 'un test en « .only »'],
		['a focused group of an end-to-end file', call('test.describe', 'only'), 'un test en « .only »'],
		['a focused test, even with an issue', `${call('it', 'only')} // issue #12`, 'un test en « .only »'],
		['a skipped test', call('test', 'skip'), 'un test sauté doit citer son ticket'],
		['a skipped group', call('describe', 'skip'), 'un test sauté doit citer son ticket'],
		['a test to fix', call('test', 'fixme'), 'un test sauté doit citer son ticket'],
		['a skipped test, jest style', `${'x'}it('un cas', () => {})`, 'un test sauté doit citer son ticket'],
		[
			'a skipped test with a comment that names no issue',
			`${call('test', 'skip')} // plus tard`,
			'un test sauté doit citer son ticket',
		],
		['a test left to write', `${['test', 'todo'].join('.')}('un cas')`, 'un test sauté doit citer son ticket'],
		['a group skipped by a condition that is always true', always('describe', 'skipIf', true), 'un test sauté'],
		['a test left to write by a condition that is always true', always('test', 'todoIf', true), 'un test sauté'],
		['a test run by a condition that is always false', always('test', 'if', false), 'un test sauté'],
		['a focused test written on two lines', `test\n\t.${'only'}('un cas', () => {})`, 'un test en « .only »'],
		['a skipped test written on two lines', `it\n\t.${'skip'}('un cas', () => {})`, 'un test sauté'],
	])('red on %s', (_fault, line, expected) => {
		const problems = focusedOrSkippedTests([
			{ file: 'tests/unit/exemple.test.ts', text: `import 'bun:test'\n${line}\n` },
		])

		expect(problems).toHaveLength(1)
		expect(problems[0]).toContain(`tests/unit/exemple.test.ts:2 : ${expected}`)
	})

	test('a skipped test that names its issue passes, on its line or on the line above', () => {
		const text = `${call('test', 'skip')} // issue #42\n// issue #7\n${call('test', 'fixme')}\n`

		expect(focusedOrSkippedTests([{ file: 'tests/unit/exemple.test.ts', text }])).toEqual([])
	})

	test('a skipped test written on several lines may name its issue above the call or on any of its lines', () => {
		const text = `// issue #7\nit\n\t.${'skip'}('un cas', () => {})\nit\n\t.${'skip'}('un cas', () => {}) // issue #8\n`

		expect(focusedOrSkippedTests([{ file: 'tests/unit/exemple.test.ts', text }])).toEqual([])
	})

	test('a condition that reads something is not a skip, and ordinary words are left alone', () => {
		const text = [
			"test.skipIf(sansBase)('un cas', () => {})",
			"test.if(avecBase)('un cas', () => {})",
			"describe.skipIf(!process.env.CI)('un groupe', () => {})",
			'const only = attempts.only',
			'const todo = liste.todo',
			'// The guard is not a test. only the faulty examples are, and we never skip it. todo: nothing.',
			"exit('x')",
			'',
		].join('\n')

		expect(focusedOrSkippedTests([{ file: 'tests/unit/exemple.test.ts', text }])).toEqual([])
	})

	test('several faults of one file come out in the order of its lines', () => {
		const text = `${call('test', 'skip')}\n${call('test', 'only')}\n${call('it', 'fixme')}\n`

		expect(focusedOrSkippedTests([{ file: 'a.test.ts', text }]).map(problem => problem.slice(0, 11))).toEqual([
			'a.test.ts:1',
			'a.test.ts:2',
			'a.test.ts:3',
		])
	})
})

describe('C08: the only JavaScript git tracks is generated', () => {
	/** Frozen here: Payload writes this file, nobody edits it. A new entry is a decision. */
	const ALLOWED = ['src/app/(payload)/admin/importMap.js']

	test('the repository tracks no hand-written JavaScript', () => {
		const files = tracked('*.js', '*.jsx', '*.cjs', '*.mjs')

		expect(files).toEqual(ALLOWED)
		expect(handWrittenJavaScript(files, ALLOWED)).toEqual([])
	})

	test.each([
		'src/lib/ancien.js',
		'src/components/Bouton.jsx',
		'next.config.mjs',
		'scripts/outil.cjs',
		'public/sw.js',
	])('red on %s', file => {
		expect(handWrittenJavaScript([...ALLOWED, file, 'src/lib/slug.ts'], ALLOWED)).toEqual([
			`${file} : un fichier JavaScript écrit à la main. Le dépôt est en TypeScript.`,
		])
	})
})

/* ------------------------------------------------------------------------------------------
 * End-to-end tests
 * ---------------------------------------------------------------------------------------- */

const E2E = 'tests/e2e'

/** Every file of tests/e2e, tracked by git or not: a test that is not committed yet is checked too. */
function e2eFiles(): { file: string; text: string }[] {
	return readdirSync(path.join(ROOT, E2E), { encoding: 'utf8', recursive: true })
		.filter(file => /\.tsx?$/.test(file))
		.sort()
		.map(file => ({ file: `${E2E}/${file}`, text: read(`${E2E}/${file}`) }))
}

/** One line of a test file, at line 2 of a file that is otherwise sound. */
const specWith = (line: string) => [
	{ file: `${E2E}/exemple.spec.ts`, text: `import { expect, test } from '@playwright/test'\n${line}\n` },
]

describe('C06: no end-to-end test waits for a fixed time', () => {
	test('no file of tests/e2e waits for a duration', () => {
		const files = e2eFiles()

		expect(files.map(({ file }) => file)).toContain(`${E2E}/shell.spec.ts`)
		expect(fixedWaits(files)).toEqual([])
	})

	test.each([
		['the fixed wait of Playwright', 'await page.waitForTimeout(500)', 'waitForTimeout'],
		['a timer wrapped in a promise', 'await new Promise(resolve => setTimeout(resolve, 500))', 'setTimeout'],
		[
			'a timer of the page',
			'await page.evaluate(() => new Promise(fin => window.setTimeout (fin, 500)))',
			'setTimeout',
		],
		['the promise form of the timer', "import { scheduler } from 'node:timers/promises'", 'timers/promises'],
		[
			'the same, loaded on the fly',
			'const { setTimeout: attendre } = await import("timers/promises")',
			'timers/promises',
		],
	])('red on %s', (_fault, line, name) => {
		expect(fixedWaits(specWith(line))).toEqual([
			`${E2E}/exemple.spec.ts:2 : attente fixe (« ${name} »). Un essai attend un état, jamais une durée : « await expect(…) » ou « expect.poll ».`,
		])
	})

	test('waiting for a state passes, and a time limit is not a wait', () => {
		const text = [
			"await expect(page.getByRole('heading', { level: 1 })).toBeVisible()",
			'await expect.poll(() => compter()).toBe(3)',
			"await page.waitForURL('/admin')",
			'await expect(page).toHaveURL(/admin/, { timeout: 10_000 })',
			'test.setTimeout(60_000)',
		].join('\n')

		expect(fixedWaits([{ file: `${E2E}/exemple.spec.ts`, text }])).toEqual([])
	})

	test('several waits come out file by file, in the order of the lines', () => {
		const waits = fixedWaits([
			{ file: `${E2E}/b.spec.ts`, text: 'await page.waitForTimeout(1)\n' },
			{ file: `${E2E}/a.spec.ts`, text: '\nsetTimeout(suite, 1)\nawait page.waitForTimeout(1)\n' },
		])

		expect(waits.map(wait => wait.split(' : ')[0])).toEqual([
			`${E2E}/a.spec.ts:2`,
			`${E2E}/a.spec.ts:3`,
			`${E2E}/b.spec.ts:1`,
		])
	})
})

describe('C07: Playwright cannot point at production, and the CI cannot skip tests', () => {
	const CONFIG = 'playwright.config.ts'
	const GIVEN_AS_IT_IS = 'export default defineConfig(testConfiguration())'
	/** The configuration as the CI evaluates it: `CI` set, and nothing else. */
	const inCi: PlaywrightSettings = testConfiguration({ CI: 'true' })
	const [firstProject] = inCi.projects ?? []

	test('the configuration of the repository: no `.only` in the CI, `*.spec.ts` files only, a local address', () => {
		expect(playwrightSettingsProblems(inCi)).toEqual([])
		expect(inCi.testMatch).toBe('**/*.spec.ts')
		expect(new URL(inCi.use?.baseURL ?? '').hostname).toBe('localhost')
		// On a developer's machine `.only` is a tool: the CI alone forbids it.
		expect(testConfiguration({}).forbidOnly).toBe(false)
	})

	test('playwright.config.ts gives that configuration as it is, and sets nothing itself', () => {
		expect(playwrightConfigFileProblems(read(CONFIG), GIVEN_AS_IT_IS)).toEqual([])
	})

	test.each<[string, PlaywrightSettings, string]>([
		['a run that tolerates `.only`', { forbidOnly: false }, 'forbidOnly doit être vrai en CI'],
		['a configuration that says nothing about `.only`', { forbidOnly: undefined }, 'forbidOnly doit être vrai en CI'],
		['no pattern at all', { testMatch: undefined }, 'testMatch doit se limiter aux fichiers « *.spec.ts »'],
		['every TypeScript file', { testMatch: '**/*.ts' }, 'testMatch doit se limiter aux fichiers « *.spec.ts »'],
		['the test files of bun too', { testMatch: ['**/*.spec.ts', '**/*.test.ts'] }, 'testMatch doit se limiter'],
		['a pattern written as an expression', { testMatch: /\.spec\.ts$/ }, 'testMatch doit se limiter'],
		['an empty list of patterns', { testMatch: [] }, 'testMatch doit se limiter'],
		['the site', { use: { baseURL: 'https://my-makeup.fr' } }, 'baseURL vise le site en ligne (my-makeup.fr).'],
		[
			'the www host',
			{ use: { baseURL: 'https://WWW.my-makeup.fr/auth' } },
			'baseURL vise le site en ligne (www.my-makeup.fr).',
		],
		[
			'the old API',
			{ use: { baseURL: 'https://api.my-makeup.fr' } },
			'baseURL vise le site en ligne (api.my-makeup.fr).',
		],
		['no address at all', { use: {} }, 'baseURL manque'],
		['an address that is not one', { use: { baseURL: 'my-makeup' } }, 'baseURL n’est pas une adresse lisible.'],
	])('red on %s', (_fault, change, expected) => {
		const problems = playwrightSettingsProblems({ ...inCi, ...change })

		expect(problems).toHaveLength(1)
		expect(problems[0]).toStartWith(expected)
	})

	test('red on a project that widens the pattern or points at the site by itself', () => {
		const problems = playwrightSettingsProblems({
			...inCi,
			projects: [
				{ ...firstProject, name: 'large', testMatch: '**/*' },
				{ ...firstProject, name: 'prod', use: { baseURL: 'https://www.my-makeup.fr' } },
			],
		})

		expect(problems).toEqual([
			'projet « large » : testMatch doit se limiter aux fichiers « *.spec.ts ».',
			'projet « prod » : baseURL vise le site en ligne (www.my-makeup.fr).',
		])
	})

	test('a domain that only looks like the site is not production, an address of this machine neither', () => {
		for (const baseURL of ['https://not-my-makeup.fr', 'http://127.0.0.1:3100'])
			expect(playwrightSettingsProblems({ ...inCi, use: { baseURL } }), baseURL).toEqual([])
	})

	test('the former pre-production host is production like any other subdomain of the site', () => {
		expect(playwrightSettingsProblems({ ...inCi, use: { baseURL: 'https://preprod.my-makeup.fr' } })).toEqual([
			'baseURL vise le site en ligne (preprod.my-makeup.fr).',
		])
	})

	test.each([
		['a setting added after the checked ones', 'defineConfig({ ...testConfiguration(), forbidOnly: false })'],
		[
			'a configuration written in the file',
			"defineConfig({ testDir: './tests', use: { baseURL: 'https://my-makeup.fr' } })",
		],
		[
			'a variable given to the checked function',
			"defineConfig(testConfiguration({ BASE_URL: 'https://my-makeup.fr' }))",
		],
	])('red on %s', (_fault, exported) => {
		const text = broken(read(CONFIG), 'defineConfig(testConfiguration())', exported)

		expect(playwrightConfigFileProblems(text, GIVEN_AS_IT_IS)).toEqual([
			`playwright.config.ts doit se réduire à « ${GIVEN_AS_IT_IS} » : un réglage écrit dans ce fichier échapperait aux garde-fous.`,
		])
	})

	test('red on a second statement in playwright.config.ts', () => {
		const text = `${read(CONFIG)}\nprocess.env.BASE_URL = 'https://my-makeup.fr'\n`

		expect(playwrightConfigFileProblems(text, GIVEN_AS_IT_IS)).toHaveLength(1)
	})

	test('no file of tests/e2e opens a full address', () => {
		expect(absoluteNavigations(e2eFiles())).toEqual([])
	})

	test.each([
		['a page opened on the site', "await page.goto('https://my-makeup.fr/')", 'goto'],
		['a page opened on another local port', 'await page.goto("http://localhost:3000/admin")', 'goto'],
		[
			'a request sent to the old API',
			"await request.post('https://api.my-makeup.fr/api/auth/local', { data })",
			'post',
		],
		[
			'a request read from the site',
			"const reponse = await request.get(\n\t'https://www.my-makeup.fr/sitemap.xml'\n)",
			'get',
		],
		['an address built from a host written in the test', `await page.goto(\`https://\${hote}/admin\`)`, 'goto'],
		['a wait for a full address', "await page.waitForURL('http://127.0.0.1:3100/admin')", 'waitForURL'],
	])('red on %s', (_fault, line, call) => {
		expect(absoluteNavigations(specWith(line))).toEqual([
			`${E2E}/exemple.spec.ts:2 : « ${call} » reçoit une adresse complète. Un essai ouvre un chemin, comme « /admin » : l’hôte est celui de baseURL, vérifié par la garde.`,
		])
	})

	test('a path passes, and so does a full address that is only compared', () => {
		const text = [
			"await page.goto('/admin')",
			"await request.get('/api/health')",
			`await page.goto(\`/profil/\${slug}\`)`,
			"await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://my-makeup.fr/')",
			"expect(liens.get('accueil')).toBe('https://my-makeup.fr/')",
		].join('\n')

		expect(absoluteNavigations([{ file: `${E2E}/exemple.spec.ts`, text }])).toEqual([])
	})

	describe('Playwright itself, started as the CI starts it', () => {
		/** Runs `playwright test` under Node with one target, and gives back its exit code and all it printed. */
		async function playwright(baseURL: string, ...options: string[]) {
			const child = Bun.spawn(['node', 'node_modules/@playwright/test/cli.js', 'test', ...options], {
				cwd: ROOT,
				env: { ...process.env, BASE_URL: baseURL },
				stderr: 'pipe',
				stdout: 'pipe',
			})
			const [code, out, err] = await Promise.all([
				child.exited,
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
			])
			return { code, printed: out + err }
		}

		test('it stops before the first test when the target is production', async () => {
			const { code, printed } = await playwright('https://www.my-makeup.fr')

			expect(code).toBe(1)
			expect(printed).toContain('BASE_URL vise la prod (« www.my-makeup.fr ») : aucun test ne vise la prod.')
			// Neither a test nor the application was started: Playwright had not finished reading its configuration.
			expect(printed).not.toContain('Running')
			expect(printed).not.toContain('.spec.ts')
			expect(printed).not.toContain('WebServer')
		}, 30_000)

		// The witness: with a local target the same command reads the configuration and finds the tests.
		test('with a local target it reads its configuration and lists the tests at both screen sizes', async () => {
			const { code, printed } = await playwright('http://localhost:3100', '--list')

			expect(printed).toContain('[chromium] › shell.spec.ts')
			expect(printed).toContain('[mobile] › shell.spec.ts')
			expect(code).toBe(0)
		}, 30_000)
	})
})

describe('Ticket 137: the reconciliation of the storage and the database runs after the journeys', () => {
	const steps = (workflow: Workflow) => workflow.jobs.e2e?.steps ?? []
	const indexOf = (workflow: Workflow, morceau: string) =>
		steps(workflow).findIndex(etape => etape.run?.includes(morceau))

	test('the e2e job runs `bench:reconcile` right after the end-to-end tests, and the aggregator waits for that job', () => {
		const tests = indexOf(ci, 'bun run test:e2e')
		expect(tests).toBeGreaterThan(-1)
		expect(indexOf(ci, 'bun run bench:reconcile')).toBeGreaterThan(tests)
		expect(ci.jobs[AGGREGATOR]?.needs).toContain('e2e')
	})

	test('red on a CI that drops the step', () => {
		const withoutStep = brokenCi('        run: bun run bench:reconcile --outside-import\n', '        run: echo rien\n')
		expect(indexOf(withoutStep, 'bun run bench:reconcile')).toBe(-1)
	})

	test('red on a step that tolerates a failure: C01 finds it', () => {
		const tolerant = brokenCi(
			'        run: bun run bench:reconcile --outside-import\n',
			'        continue-on-error: true\n        run: bun run bench:reconcile --outside-import\n'
		)
		expect(toleratedFailures([tolerant]).length).toBeGreaterThan(0)
	})
})
