import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { RELEASE_FILE } from '../../scripts/release/publication'
import {
	cacheDependentSteps,
	type RequiredCheck,
	readWorkflow,
	requiredCheckProblems,
	toleratedFailures,
	type Workflow,
} from '../support/ci-guardrails'
import {
	DEPLOYMENT_CHECK_COMMAND,
	dependencyImports,
	dependencyImportsOnDisk,
	PUBLICATION_COMMAND,
	publicationWorkflowProblems,
} from '../support/publication-guard'

/**
 * The publication workflow (ticket 036): it depends on ci-ok and passes the guard rails C01 to
 * C03 of every workflow. Each guard is run on the real file, where it finds nothing, then on a
 * faulty example made from that file, where it must find the fault.
 */

const ROOT = path.resolve(import.meta.dir, '../..')
const read = (file: string): string => readFileSync(path.join(ROOT, file), 'utf8')

const RELEASE = '.github/workflows/release.yml'
const CI = '.github/workflows/ci.yml'
const releaseText = read(RELEASE)
const release = readWorkflow(RELEASE, releaseText)
const ci = readWorkflow(CI, read(CI))
const required = (JSON.parse(read('ci/required-checks.json')) as { checks: RequiredCheck[] }).checks

/** The publication workflow with one thing changed in its text. Fails when the text to change is gone. */
function broken(from: string | RegExp, to: string): Workflow {
	const changed = releaseText.replace(from, to)
	if (changed === releaseText) throw new Error(`faulty example out of date: nothing to replace for ${String(from)}`)
	return readWorkflow(RELEASE, changed)
}
const expression = (inner: string): string => `\${{ ${inner} }}`
const RUN_LINE = `        run: ${PUBLICATION_COMMAND}\n`

describe('the publication workflow passes the guard rails of every workflow', () => {
	test('C01: it tolerates no failure', () => {
		expect(toleratedFailures([release])).toEqual([])
	})

	test.each([
		[
			'a step allowed to fail',
			'      - name: Publish the version\n',
			'      - name: Publish the version\n        continue-on-error: true\n',
		],
		['a command that swallows its failure', RUN_LINE, `        run: ${PUBLICATION_COMMAND} || true\n`],
		['no bash, so no pipefail', 'defaults:\n  run:\n    shell: bash\n', ''],
	])('C01 red on %s', (_fault, from, to) => {
		expect(toleratedFailures([broken(from, to)])).not.toEqual([])
	})

	test('C02: nothing depends on a cache', () => {
		expect(cacheDependentSteps([release])).toEqual([])
		const cached = broken(
			'      - name: Publish the version\n',
			`      - uses: actions/cache@${'1'.repeat(40)} # v5.0.5\n        with:\n          path: node_modules\n          key: modules\n      - name: Publish the version\n`
		)
		expect(cacheDependentSteps([cached]).join('\n')).toContain('seul « .next/cache » se met en cache')
	})

	test('C03: no job of it can pass for a required check', () => {
		expect(requiredCheckProblems(required, [ci, release])).toEqual([])
		expect(
			requiredCheckProblems(required, [ci, broken('    name: publication\n', '    name: ci-ok\n')]).join('\n')
		).toContain('il s’affiche lui aussi sous le nom « ci-ok »')
		expect(
			requiredCheckProblems(required, [ci, broken('    name: publication\n', '    name: CodeQL\n')]).join('\n')
		).toContain('passerait pour le check « CodeQL » de GitHub')
	})
})

describe('the publication depends on ci-ok', () => {
	test('it starts at the end of the CI of a push on main, when the CI is green, and publishes alone', () => {
		expect(publicationWorkflowProblems(release, ci)).toEqual([])
	})

	test('the workflow it waits for is the one that holds ci-ok, under its exact name', () => {
		const [check] = required.filter(candidate => candidate.source === 'workflow')

		expect(check?.file).toBe(CI)
		expect(ci.jobs[check?.job ?? '']).toBeDefined()
		expect((ci.document as { name?: string }).name).toBe('CI')
	})

	test('the command of the job is the publication script, run by bun alone', () => {
		const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts

		expect(scripts['release:publish']).toBe('bun --no-env-file scripts/release/publication.ts')
		expect(scripts['release:check-deployment']).toBe('bun --no-env-file scripts/release/deployment-check.ts')
	})

	test.each([
		['another workflow to wait for', 'workflows: [CI]', 'workflows: [Tests]', 'attend le workflow « CI »'],
		['a start on every push as well', 'on:\n', 'on:\n  push:\n    branches: [main]\n', 'sur aucun autre déclencheur'],
		['a start by hand as well', 'on:\n', 'on:\n  workflow_dispatch:\n', 'sur aucun autre déclencheur'],
		['a start when the CI is only requested', 'types: [completed]', 'types: [requested]', 'types: [completed]'],
		['a publication from v3', 'branches: [main]', 'branches: [v3]', 'ne publie que depuis main'],
		[
			'a red CI that publishes all the same',
			"github.event.workflow_run.conclusion == 'success' && ",
			'',
			'la condition est exactement',
		],
		[
			'a condition that lets a failure through',
			"github.event.workflow_run.conclusion == 'success'",
			"github.event.workflow_run.conclusion != 'cancelled'",
			'la condition est exactement',
		],
		[
			'a pull request that publishes',
			"github.event.workflow_run.event == 'push' && ",
			'',
			'la condition est exactement',
		],
		[
			'a push from a fork that publishes',
			' && github.event.workflow_run.head_repository.full_name == github.repository',
			'',
			'la condition est exactement',
		],
		[
			'an alternative that skips the checks',
			"github.event.workflow_run.conclusion == 'success' && ",
			"github.event.workflow_run.conclusion == 'success' || ",
			'la condition est exactement',
		],
		['write access for every job', 'permissions:\n  contents: read\n', 'permissions:\n  contents: write\n', 'en tête'],
		['a wider job', '      checks: read\n', '      checks: read\n      actions: write\n', 'rien d’autre'],
		['two publications at once', 'cancel-in-progress: false', 'cancel-in-progress: true', 'une publication à la fois'],
		[
			'no queue at all',
			'concurrency:\n  group: publication\n  cancel-in-progress: false\n',
			'',
			'une publication à la fois',
		],
		[
			'a queue per commit, which is no queue',
			'group: publication',
			`group: publication-${expression('github.sha')}`,
			'une publication à la fois',
		],
		[
			'the tip of main instead of the commit whose CI is green',
			`ref: ${expression('github.event.workflow_run.head_sha')}`,
			'ref: main',
			'le checkout extrait',
		],
		[
			'a checkout that keeps the token',
			'persist-credentials: false',
			'persist-credentials: true',
			'le checkout extrait',
		],
		[
			'the dependencies installed next to the token',
			'      - name: Publish the version\n',
			'      - name: Install\n        run: bun install --frozen-lockfile\n      - name: Publish the version\n',
			'une seule commande',
		],
		['another command', RUN_LINE, '        run: bun scripts/release/publication.ts --push\n', 'une seule commande'],
		[
			'another action given the token',
			'      - name: Publish the version\n',
			`      - uses: some/action@${'1'.repeat(40)} # v1.0.0\n      - name: Publish the version\n`,
			'recevrait le jeton',
		],
		[
			'another commit published than the one whose CI is green',
			`SOURCE_COMMIT: ${expression('github.event.workflow_run.head_sha')}`,
			`SOURCE_COMMIT: ${expression('github.sha')}`,
			'SOURCE_COMMIT',
		],
		[
			'a third job',
			'jobs:\n',
			'jobs:\n  autre:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 1\n',
			'a deux jobs, et deux seulement',
		],
		[
			'no check of the deployment',
			/\n {2}# The production serves the version[\s\S]*$/,
			'\n',
			'a deux jobs, et deux seulement',
		],
		[
			'a release commit that publishes again',
			" && !startsWith(github.event.workflow_run.head_commit.message, 'chore(release):')",
			'',
			'la condition est exactement',
		],
		[
			'a publication that gives no release commit to check',
			`      release-commit: ${expression('steps.publish.outputs.release-commit')}\n`,
			`      version: ${expression('steps.publish.outputs.version')}\n`,
			'une seule sortie',
		],
		['a step whose output nobody reads', '        id: publish\n', '', 'id: publish'],
		['a check that runs before the publication', '    needs: publication\n', '', 'needs: publication'],
		[
			'a check that runs when nothing was published',
			"    if: needs.publication.outputs.release-commit != ''\n",
			'    if: always()\n',
			"la condition est exactement « needs.publication.outputs.release-commit != '' »",
		],
		[
			'a check that may write',
			'    timeout-minutes: 25\n    permissions:\n      contents: read\n',
			'    timeout-minutes: 25\n    permissions:\n      contents: write\n',
			'la permission est « contents: read »',
		],
		[
			'a check given the token',
			`          RELEASE_COMMIT: ${expression('needs.publication.outputs.release-commit')}\n`,
			`          RELEASE_COMMIT: ${expression('needs.publication.outputs.release-commit')}\n          GITHUB_TOKEN: ${expression('github.token')}\n`,
			'aucun jeton ni secret',
		],
		[
			'the dependencies installed for the check',
			'      - name: Wait for the production to serve the version\n',
			'      - name: Install\n        run: bun install --frozen-lockfile\n      - name: Wait for the production to serve the version\n',
			`une seule commande, « ${DEPLOYMENT_CHECK_COMMAND} »`,
		],
		[
			'another action in the check',
			'      - name: Wait for the production to serve the version\n',
			`      - uses: some/action@${'1'.repeat(40)} # v1.0.0\n      - name: Wait for the production to serve the version\n`,
			'n’a rien à faire dans la vérification',
		],
	])('red on %s', (_fault, from, to, expected) => {
		expect(publicationWorkflowProblems(broken(from, to), ci).join('\n')).toContain(expected)
	})

	test('red when the CI is renamed and the publication still waits for the old name', () => {
		const renamed = readWorkflow(CI, read(CI).replace(/^name: CI$/m, 'name: Intégration'))

		expect(publicationWorkflowProblems(release, renamed).join('\n')).toContain('attend le workflow « Intégration »')
	})
})

describe('nothing but the publication changes the version file', () => {
	const step = ci.jobs.qualite?.steps?.find(candidate => candidate.name === 'Version file untouched')

	test('the job qualite compares the version file of the pull request, or of the push, with its base', () => {
		expect(step?.if).toBe(expression('!cancelled()'))
		expect(step?.env).toEqual({ BASE: expression('github.event.pull_request.base.sha || github.event.before') })
		expect(String(step?.run)).toContain('git diff --quiet "$BASE" HEAD -- .release/version.json')
		expect(String(step?.run)).toContain('exit 1')
	})

	test('it watches the file Coolify watches', () => {
		expect(String(step?.run)).toContain(RELEASE_FILE)
	})
})

describe('no code of a dependency runs next to the token that pushes on main', () => {
	test('the publication script imports nothing but the runtime and files of the repository', () => {
		expect(dependencyImportsOnDisk(ROOT, 'scripts/release/publication.ts')).toEqual([])
	})

	test('neither does the check of the deployment, which runs without any installation', () => {
		expect(dependencyImportsOnDisk(ROOT, 'scripts/release/deployment-check.ts')).toEqual([])
	})

	/** A small repository, in memory: each file and what it holds. */
	const files: Record<string, string> = {
		'scripts/direct.ts': "import { readFileSync } from 'node:fs'\nimport { z } from 'zod'\n",
		'scripts/indirect.ts': "export { slugifier } from '../src/lib/slug'\nexport * from './direct'\n",
		'scripts/dynamique.ts': "export const charger = () => import('payload')\n",
		'scripts/perdu.ts': "import { rien } from './absent'\n",
		'src/lib/slug.ts': 'export const slugifier = (texte: string) => texte\n',
	}
	const read = (file: string) => files[file]

	test.each([
		['a package imported directly', 'scripts/direct.ts', 'scripts/direct.ts importe « zod »'],
		['a package imported by a file it imports', 'scripts/indirect.ts', 'scripts/direct.ts importe « zod »'],
		['a package loaded when the script runs', 'scripts/dynamique.ts', 'scripts/dynamique.ts importe « payload »'],
		['a file that does not exist', 'scripts/perdu.ts', 'scripts/perdu.ts importe « ./absent », introuvable'],
	])('red on %s', (_fault, entry, expected) => {
		expect(dependencyImports(entry, read).join('\n')).toContain(expected)
	})

	test('a file of the repository and a module of the runtime are not dependencies', () => {
		expect(dependencyImports('src/lib/slug.ts', read)).toEqual([])
		expect(dependencyImports('scripts/indirect.ts', read)).toEqual([
			'scripts/direct.ts importe « zod », que seul un « bun install » apporterait.',
		])
	})
})
