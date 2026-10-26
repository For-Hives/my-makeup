/**
 * The guards of the publication of a version (ticket 036, docs/publication.md), as pure
 * functions: each one reads files of the repository and gives back what is wrong, in French.
 *
 * tests/ci/publication.test.ts runs each of them on the real files, where it finds nothing,
 * and on a faulty example, where it must find the fault.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Workflow } from './ci-guardrails'

/** The one branch a version is published from. */
const PUBLISHED_BRANCH = 'main'
/** The command the publication job runs, and nothing else. */
export const PUBLICATION_COMMAND = 'bun run release:publish --push'

/** The command the job that checks the deployment runs, and nothing else (scripts/release/deployment-check.ts). */
export const DEPLOYMENT_CHECK_COMMAND = 'bun run release:check-deployment'
/** An expression of GitHub Actions, `\${{ … }}`, written so that it is not read as a template of this file. */
const expression = (inner: string): string => `\${{ ${inner} }}`
/** The commit the publication starts from: the one whose CI ended green. */
const SOURCE = expression('github.event.workflow_run.head_sha')
/** The token of the run: the only secret the publication reads. */
const RUN_TOKEN = expression('github.token')
/**
 * The condition of the job, clause by clause: the CI ended green, it ran for a push (never for a
 * pull request, even from a branch named main), that push was made to this repository, and its
 * commit is not itself a publication: whatever token pushed it, a version never publishes a version.
 */
const CONDITIONS = [
	"github.event.workflow_run.conclusion == 'success'",
	"github.event.workflow_run.event == 'push'",
	'github.event.workflow_run.head_repository.full_name == github.repository',
	"!startsWith(github.event.workflow_run.head_commit.message, 'chore(release):')",
]

/** The release commit, from the publication job to the job that checks the deployment. */
const RELEASE_COMMIT_OUTPUT = expression('steps.publish.outputs.release-commit')
const RELEASE_COMMIT = expression('needs.publication.outputs.release-commit')
/** The actions the publication job may use: none of them is given the token explicitly. */
const ACTIONS = ['actions/checkout@', 'oven-sh/setup-bun@']

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const sameList = (value: unknown, expected: readonly string[]): boolean =>
	Array.isArray(value) && value.length === expected.length && expected.every((item, index) => value[index] === item)

const sameRecord = (value: unknown, expected: Record<string, string>): boolean =>
	isRecord(value) &&
	Object.keys(value).length === Object.keys(expected).length &&
	Object.entries(expected).every(([key, wanted]) => value[key] === wanted)

/** `${{ a }}` and `a` are the same condition. */
const condition = (value: unknown): string =>
	String(value)
		.replace(/^\$\{\{(.*)\}\}$/s, '$1')
		.trim()

/**
 * The publication workflow depends on ci-ok: it starts only when the workflow of ci-ok (`ci`)
 * has completed on main, for a push of this repository, with success, which ci-ok decides
 * (it runs always and fails when any job did not succeed). It runs one publication at a time,
 * gives the write permission to its one job, and that job runs the publication command alone.
 */
export function publicationWorkflowProblems(workflow: Workflow, ci: Workflow): string[] {
	const problems: string[] = []
	const where = workflow.file
	const root = isRecord(workflow.document) ? workflow.document : {}
	const ciName = isRecord(ci.document) ? ci.document.name : undefined

	const on = isRecord(workflow.on) ? workflow.on : {}
	if (Object.keys(on).join() !== 'workflow_run')
		problems.push(`${where} ne démarre qu’à la fin de la CI (« workflow_run »), sur aucun autre déclencheur.`)
	const run = isRecord(on.workflow_run) ? on.workflow_run : {}
	if (typeof ciName !== 'string' || !sameList(run.workflows, [ciName]))
		problems.push(
			`${where} attend le workflow « ${String(ciName)} » de ${ci.file}, sous son nom exact : sinon il ne démarre jamais.`
		)
	if (!sameList(run.types, ['completed']))
		problems.push(`${where} démarre quand la CI est terminée (« types: [completed] »).`)
	if (!sameList(run.branches, [PUBLISHED_BRANCH]))
		problems.push(`${where} ne publie que depuis ${PUBLISHED_BRANCH} (« branches: [${PUBLISHED_BRANCH}] »).`)

	if (!sameRecord(workflow.permissions, { contents: 'read' }))
		problems.push(`${where} déclare « permissions: contents: read » en tête : seul le job de publication écrit.`)
	const concurrency = isRecord(root.concurrency) ? root.concurrency : {}
	if (
		typeof concurrency.group !== 'string' ||
		/\$\{\{/.test(concurrency.group) ||
		concurrency['cancel-in-progress'] !== false
	)
		problems.push(
			`${where} : une publication à la fois, jamais coupée en route (« concurrency », un groupe fixe et « cancel-in-progress: false »).`
		)

	const ids = Object.keys(workflow.jobs)
	if (!sameList([...ids].sort(), ['deployment', 'publication']))
		problems.push(`${where} a deux jobs, et deux seulement : « publication », puis « deployment » qui vérifie la prod.`)
	const deployment = workflow.jobs.deployment
	if (deployment !== undefined) problems.push(...deploymentJobProblems(`${where}, job deployment`, deployment))
	for (const [id, job] of Object.entries(workflow.jobs).filter(([id]) => id === 'publication')) {
		const at = `${where}, job ${id}`
		const clauses = condition(job.if)
			.split('&&')
			.map(clause => clause.trim())
		if (condition(job.if).includes('||') || !sameList([...clauses].sort(), [...CONDITIONS].sort()))
			problems.push(`${at} : la condition est exactement « ${CONDITIONS.join(' && ')} ».`)
		if (!sameRecord(job.permissions, { contents: 'write', checks: 'read' }))
			problems.push(`${at} : les permissions sont « contents: write » et « checks: read », rien d’autre.`)
		if (!sameRecord(job.outputs, { 'release-commit': RELEASE_COMMIT_OUTPUT }))
			problems.push(
				`${at} : une seule sortie, « release-commit: ${RELEASE_COMMIT_OUTPUT} », pour le job qui vérifie la prod.`
			)

		const steps = job.steps ?? []
		for (const step of steps.filter(candidate => candidate.uses !== undefined))
			if (!ACTIONS.some(action => step.uses?.startsWith(action)))
				problems.push(`${at} : l’action « ${step.uses} » recevrait le jeton qui pousse sur ${PUBLISHED_BRANCH}.`)
		const checkout = steps.find(step => step.uses?.startsWith('actions/checkout@'))
		if (checkout?.with?.ref !== SOURCE || checkout.with['persist-credentials'] !== false)
			problems.push(
				`${at} : le checkout extrait « ref: ${SOURCE} », le commit dont la CI est verte, avec « persist-credentials: false ».`
			)
		const commands = steps.filter(step => step.run !== undefined)
		if (commands.length !== 1 || String(commands[0]?.run).trim() !== PUBLICATION_COMMAND)
			problems.push(
				`${at} : une seule commande, « ${PUBLICATION_COMMAND} ». Pas de « bun install » : aucun code d’une dépendance ne tourne à côté du jeton.`
			)
		else if (!sameRecord(commands[0]?.env, { GITHUB_TOKEN: RUN_TOKEN, SOURCE_COMMIT: SOURCE }))
			problems.push(
				`${at} : la commande reçoit GITHUB_TOKEN = ${RUN_TOKEN} et SOURCE_COMMIT = ${SOURCE}, rien d’autre.`
			)
		else if (commands[0]?.id !== 'publish')
			problems.push(`${at} : l’étape de la commande porte « id: publish » : sa sortie donne le commit de la version.`)
	}
	return problems
}

/**
 * The job that checks the production serves the version: after the publication, only when it gave a release
 * commit, reading only (« contents: read », no token in its environment), and its one command is the check,
 * with the release commit and nothing else. Like the publication, it installs nothing.
 */
function deploymentJobProblems(at: string, job: Workflow['jobs'][string]): string[] {
	const problems: string[] = []
	if (job.needs !== 'publication')
		problems.push(`${at} : « needs: publication », il vérifie ce que la publication a poussé.`)
	if (condition(job.if) !== "needs.publication.outputs.release-commit != ''")
		problems.push(`${at} : la condition est exactement « needs.publication.outputs.release-commit != '' ».`)
	if (!sameRecord(job.permissions, { contents: 'read' }))
		problems.push(`${at} : la permission est « contents: read », rien d’autre : il ne fait que lire.`)
	const steps = job.steps ?? []
	for (const step of steps.filter(candidate => candidate.uses !== undefined))
		if (!ACTIONS.some(action => step.uses?.startsWith(action)))
			problems.push(`${at} : l’action « ${step.uses} » n’a rien à faire dans la vérification.`)
	const checkout = steps.find(step => step.uses?.startsWith('actions/checkout@'))
	if (checkout?.with?.ref !== SOURCE || checkout.with['persist-credentials'] !== false)
		problems.push(`${at} : le checkout extrait « ref: ${SOURCE} », avec « persist-credentials: false ».`)
	const commands = steps.filter(step => step.run !== undefined)
	if (commands.length !== 1 || String(commands[0]?.run).trim() !== DEPLOYMENT_CHECK_COMMAND)
		problems.push(`${at} : une seule commande, « ${DEPLOYMENT_CHECK_COMMAND} », sans « bun install ».`)
	else if (!sameRecord(commands[0]?.env, { RELEASE_COMMIT }))
		problems.push(`${at} : la commande reçoit RELEASE_COMMIT = ${RELEASE_COMMIT}, aucun jeton ni secret.`)
	return problems
}

/** Every module specifier a TypeScript source imports, statically or not. */
function specifiers(source: string): string[] {
	const found = [
		...source.matchAll(/^\s*(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/gm),
		...source.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm),
		...source.matchAll(/\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]/g),
	]
	return found.map(match => match[1] ?? '')
}

/** Reads a file of the repository, from its root; nothing when it does not exist. */
export type SourceReader = (file: string) => string | undefined

const fromDisk =
	(root: string): SourceReader =>
	file =>
		existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), 'utf8') : undefined

/**
 * The imports, from `entry` and every file it imports in turn, that are neither a module of the
 * runtime (`node:…`) nor a file of the repository: code that a `bun install` would have to bring.
 */
export function dependencyImports(entry: string, read: SourceReader): string[] {
	const problems: string[] = []
	const seen = new Set<string>()
	const visit = (file: string, source: string) => {
		if (seen.has(file)) return
		seen.add(file)
		for (const specifier of specifiers(source)) {
			if (specifier.startsWith('node:')) continue
			if (!specifier.startsWith('.')) {
				problems.push(`${file} importe « ${specifier} », que seul un « bun install » apporterait.`)
				continue
			}
			const base = path.posix.join(path.posix.dirname(file), specifier)
			const target = [base, `${base}.ts`, `${base}/index.ts`]
				.filter(candidate => candidate.endsWith('.ts'))
				.map(candidate => ({ candidate, text: read(candidate) }))
				.find(({ text }) => text !== undefined)
			if (target?.text === undefined) problems.push(`${file} importe « ${specifier} », introuvable.`)
			else visit(target.candidate, target.text)
		}
	}
	const source = read(entry)
	if (source === undefined) return [`${entry} est introuvable.`]
	visit(entry, source)
	return problems
}

/** The same, on the files of the repository under `root`. */
export const dependencyImportsOnDisk = (root: string, entry: string): string[] =>
	dependencyImports(entry, fromDisk(root))
