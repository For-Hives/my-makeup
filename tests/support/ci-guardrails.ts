/**
 * The guard rails of the CI and of the Docker image, as pure functions: each one reads the
 * text of a file of the repository and gives back what is wrong, in French, or nothing.
 *
 * tests/ci/ci-guardrails.test.ts runs each of them twice: on the real files, where it must
 * find nothing, and on a faulty example, where it must find the fault. A guard that was
 * never seen red proves nothing.
 */

import {
	citedVariables,
	dockerignoreRules,
	HEALTH_PATH,
	IMAGE_ENVIRONMENT,
	isPublicByName,
	PUBLIC_BUILD_VARIABLES,
	readDockerfile,
	runtimeVariables,
} from '../../scripts/image/rules'

/** The two images the Dockerfile may start from, and where the version of each one is written. */
const BASE_IMAGES = { bun: 'oven/bun', node: 'node' } as const
/** The Debian flavour of the Node image: glibc, as the prebuilt binaries of sharp and SWC expect. */
const NODE_FLAVOUR = 'bookworm-slim'

const EXACT_VERSION = /^\d+\.\d+\.\d+$/
const DIGEST = /^sha256:[0-9a-f]{64}$/

export interface PackageVersions {
	engines?: { node?: string }
	packageManager?: string
}

/**
 * C04, files of the repository: `.nvmrc`, `engines`, `packageManager` and every `FROM` of the
 * Dockerfile name the same Node and the same bun, exactly, and every image is pinned by its digest.
 */
export function misalignedVersions(files: {
	nvmrc: string
	packageJson: PackageVersions
	dockerfile: string
}): string[] {
	const problems: string[] = []
	const node = files.nvmrc.trim()
	const bun = /^bun@(.+)$/.exec(files.packageJson.packageManager ?? '')?.[1] ?? ''

	if (!EXACT_VERSION.test(node)) problems.push('.nvmrc doit donner une version exacte de Node, comme 24.21.0.')
	if (!EXACT_VERSION.test(bun)) problems.push('packageManager doit valoir « bun@ » suivi d’une version exacte.')
	const major = node.split('.')[0]
	if (files.packageJson.engines?.node !== `${major}.x`)
		problems.push(`engines.node doit valoir « ${major}.x », la ligne du Node de .nvmrc.`)

	const { stages } = readDockerfile(files.dockerfile)
	const expected: Record<string, string> = {
		[BASE_IMAGES.bun]: bun,
		[BASE_IMAGES.node]: `${node}-${NODE_FLAVOUR}`,
	}
	const stageNames: string[] = []
	for (const stage of stages) {
		const from = `FROM ${stage.image}${stage.tag ? `:${stage.tag}` : ''}`
		if (!stageNames.includes(stage.image)) {
			const tag = expected[stage.image]
			if (tag === undefined)
				problems.push(`${from} : seules les images ${Object.keys(expected).join(' et ')} sont admises.`)
			else if (stage.tag !== tag)
				problems.push(`${from} : attendu ${stage.image}:${tag}, comme .nvmrc et packageManager.`)
			if (!DIGEST.test(stage.digest ?? ''))
				problems.push(`${from} : l’image doit être figée par son digest (@sha256:…).`)
		}
		for (const source of stage.copiesFrom)
			if (!stageNames.includes(source))
				problems.push(`COPY --from=${source} : seule une étape précédente du Dockerfile est admise, jamais une image.`)
		if (stage.name) stageNames.push(stage.name)
	}
	if (stages.at(-1)?.image !== BASE_IMAGES.node && !problems.some(problem => problem.includes('seules les images')))
		problems.push('La dernière étape du Dockerfile doit partir de l’image Node : c’est elle qui sert le site.')
	return problems
}

/**
 * The image is built with public variables only, never runs as root, and carries a health
 * check on /api/health. `envExample` is the text of `.env.exemple`: every variable listed
 * there that is not a public build variable is a runtime one.
 */
export function imageProblems(dockerfile: string, envExample: string): string[] {
	const problems: string[] = []
	const { globalArgs, stages, unknown } = readDockerfile(dockerfile)
	const last = stages.at(-1)

	for (const line of unknown) problems.push(`Instruction que la garde ne sait pas lire : « ${line} ».`)

	const args = [...globalArgs, ...stages.flatMap(stage => stage.args)]
	for (const name of args)
		if (!PUBLIC_BUILD_VARIABLES.includes(name))
			problems.push(`ARG ${name} : seules les variables publiques de build sont admises (scripts/image/rules.ts).`)

	const instructions = dockerfile
		.split('\n')
		.filter(line => !line.trim().startsWith('#'))
		.join('\n')
	for (const name of citedVariables(instructions, runtimeVariables(envExample)))
		problems.push(`${name} est une variable d’exécution : elle se donne au conteneur, jamais au Dockerfile.`)

	for (const name of last?.env ?? [])
		if (!IMAGE_ENVIRONMENT.includes(name))
			problems.push(`ENV ${name} dans la dernière étape : hors de la liste admise (scripts/image/rules.ts).`)

	const user = last?.user?.split(':')[0]
	if (user === undefined || user === 'root' || user === '0')
		problems.push('La dernière étape doit finir sous un utilisateur sans droits (USER node), jamais root.')

	if (!last?.healthcheck?.some(part => part.includes(HEALTH_PATH)))
		problems.push(`La dernière étape doit porter un HEALTHCHECK … CMD ["…"] qui interroge ${HEALTH_PATH}.`)

	return problems
}

/** A public build variable must be public by its very name: `NEXT_PUBLIC_*`, or the commit. */
export function publicVariablesProblems(names: readonly string[] = PUBLIC_BUILD_VARIABLES): string[] {
	return names
		.filter(name => !isPublicByName(name))
		.map(name => `${name} n’a pas un nom de variable publique : elle n’a pas sa place dans le build.`)
}

/**
 * `.dockerignore` refuses everything, then lets through exactly the `allowed` paths: nothing
 * reaches the builder because nobody thought of excluding it.
 */
export function buildContextProblems(dockerignore: string, allowed: readonly string[]): string[] {
	const problems: string[] = []
	const [first, ...others] = dockerignoreRules(dockerignore)
	if (first !== '*') problems.push('.dockerignore doit commencer par « * » : tout est refusé, sauf ce qui est listé.')

	const letThrough = others.filter(rule => rule.startsWith('!')).map(rule => rule.slice(1))
	for (const rule of others.filter(rule => !rule.startsWith('!')))
		problems.push(`.dockerignore : « ${rule} » ne sert à rien après « * », ou cache une erreur.`)
	for (const entry of letThrough.filter(entry => !allowed.includes(entry)))
		problems.push(`.dockerignore laisse passer « ${entry} », qui n’est pas dans la liste admise.`)
	for (const entry of allowed.filter(entry => !letThrough.includes(entry)))
		problems.push(`.dockerignore ne laisse plus passer « ${entry} », dont le build a besoin.`)
	return problems
}

/* ------------------------------------------------------------------------------------------
 * Workflows of .github/workflows
 * ---------------------------------------------------------------------------------------- */

interface Step {
	name?: string
	id?: string
	uses?: string
	run?: string
	shell?: unknown
	if?: unknown
	with?: Record<string, unknown>
	env?: Record<string, unknown>
}

interface Job {
	name?: string
	if?: unknown
	needs?: string | string[]
	steps?: Step[]
	uses?: string
	permissions?: unknown
	defaults?: unknown
	strategy?: unknown
	'timeout-minutes'?: unknown
}

/** One file of .github/workflows: its text as written, and what YAML reads in it. */
export interface Workflow {
	file: string
	text: string
	/** The whole file as YAML reads it: comments are gone, the lines of a `run: |` block are not. */
	document: unknown
	on: unknown
	permissions: unknown
	defaults: unknown
	jobs: Record<string, Job>
}

/** A check the protection of the branch requires, as listed in ci/required-checks.json. */
export interface RequiredCheck {
	name: string
	/** `workflow`: a job of this repository. `github`: a check GitHub creates by itself. */
	source: string
	file?: string
	job?: string
}

/** The conditions that make a step run more often, never less. Any other one can skip it without anyone noticing. */
const RUNS_ANYWAY = ['always()', '!cancelled()']
/**
 * Runs only when an earlier step failed: for an action that sends a report (a trace, a
 * screenshot), never for a command. A command under this condition is skipped on a green job.
 */
const AFTER_A_FAILURE = 'failure()'
/** With `shell: bash`, GitHub runs `bash --noprofile --norc -eo pipefail`; without it, `bash -e`, and a pipe hides a failure. */
const RUN_SHELL = 'bash'
/** The only folder a workflow may cache: the compilation cache of Next, never a build output. */
const CACHED_FOLDER = '.next/cache'
const PINNED_ACTION = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/
const PINNED_ACTION_LINE = /uses:\s*\S+@[0-9a-f]{40}\s+#\s*v\d+(\.\d+){0,2}\s*$/
/** Where a shell command starts: a new line, after `;`, `&&`, `||`, `|`, `(`, `{`, or after `then`, `do`, `else`. */
const COMMAND_START = String.raw`(?:^|[;&|({]|\b(?:then|do|else)\b)[ \t]*`
/**
 * What makes a failed command pass in a shell, as far as a text can tell. The list is not
 * complete and cannot be: a shell has too many ways (docs/qualite.md says which ones are left).
 */
const SWALLOWED_FAILURES: readonly { trick: string; pattern: RegExp }[] = [
	// `cmd || anything` replaces the failure by whatever follows. Only a non-zero exit keeps it.
	{ trick: '« || » suivi d’autre chose que « exit 1 »', pattern: /\|\|(?!\s*exit\s+[1-9])/ },
	// `set`, as a command and not as a word of another one, with `+e` among its options.
	{
		trick: '« set +e »',
		pattern: new RegExp(String.raw`${COMMAND_START}set(?:[ \t]+[^\s;&|]+)*?[ \t]+\+[a-zA-Z]*e[a-zA-Z]*(?![\w-])`, 'm'),
	},
	{
		trick: '« set +o errexit » ou « set +o pipefail »',
		pattern: new RegExp(String.raw`${COMMAND_START}set(?:[ \t]+[^\s;&|]+)*?[ \t]+\+o[ \t]+(?:errexit|pipefail)\b`, 'm'),
	},
	// A command that is nothing but a success: `cmd; true`, a last line `exit 0`, a lone `:`.
	{
		trick: 'une commande « true », « : » ou « exit 0 » seule',
		pattern: new RegExp(String.raw`${COMMAND_START}(?:true|:|exit\s+0)[ \t]*(?:$|[;&|)}#])`, 'm'),
	},
]
/** `${{ … }}` in a command is replaced by GitHub before the shell reads it: its `||` is not a shell one. */
const EXPRESSION = /\$\{\{([\s\S]*?)\}\}/g

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

/** Reads a workflow. Throws when the text is not YAML: nothing can be checked on it. */
export function readWorkflow(file: string, text: string): Workflow {
	const yaml: unknown = Bun.YAML.parse(text)
	const root = isRecord(yaml) ? yaml : {}
	return {
		file,
		text,
		document: yaml,
		on: root.on,
		permissions: root.permissions,
		defaults: root.defaults,
		jobs: isRecord(root.jobs) ? (root.jobs as Record<string, Job>) : {},
	}
}

/** `${{ always() }}` and `always()` are the same condition. */
const condition = (value: unknown): string =>
	String(value)
		.replace(/^\$\{\{(.*)\}\}$/s, '$1')
		.trim()

const stepLabel = (step: Step, index: number): string => step.name ?? step.uses ?? `étape ${index + 1}`

/** Every step of every job, with where it is. */
function* allSteps(workflow: Workflow): Generator<{ job: string; step: Step; where: string }> {
	for (const [job, definition] of Object.entries(workflow.jobs))
		for (const [index, step] of (definition.steps ?? []).entries())
			yield { job, step, where: `${workflow.file}, job ${job}, « ${stepLabel(step, index)} »` }
}

/** Every place where a key is written, at any depth. */
function* keysNamed(value: unknown, key: string, trail: string[] = []): Generator<{ trail: string; value: unknown }> {
	if (Array.isArray(value)) {
		for (const [index, item] of value.entries()) yield* keysNamed(item, key, [...trail, String(index + 1)])
	} else if (isRecord(value)) {
		for (const [name, child] of Object.entries(value)) {
			if (name === key) yield { trail: trail.join(' › '), value: child }
			yield* keysNamed(child, key, [...trail, name])
		}
	}
}

/**
 * C01: no step and no job is allowed to fail, by `continue-on-error`, by a shell that does not
 * stop on a failure, or by one of the shell tricks this guard knows.
 */
export function toleratedFailures(workflows: readonly Workflow[]): string[] {
	const problems: string[] = []
	for (const workflow of workflows) {
		for (const found of keysNamed(workflow.jobs, 'continue-on-error'))
			if (found.value !== false)
				problems.push(`${workflow.file}, ${found.trail} : « continue-on-error » rend un échec invisible.`)

		const commands = [...allSteps(workflow)].filter(({ step }) => step.run !== undefined)
		const shell =
			isRecord(workflow.defaults) && isRecord(workflow.defaults.run) ? workflow.defaults.run.shell : undefined
		if (commands.length > 0 && shell !== RUN_SHELL)
			problems.push(
				`${workflow.file} doit déclarer « defaults: run: shell: ${RUN_SHELL} » : sans lui, GitHub lance bash sans « pipefail », et une commande qui échoue dans un tube passe.`
			)
		for (const [id, job] of Object.entries(workflow.jobs))
			if (job.defaults !== undefined)
				problems.push(`${workflow.file}, job ${id} : « defaults » ne se règle qu’une fois, en tête du fichier.`)

		for (const { step, where } of commands) {
			if (step.shell !== undefined)
				problems.push(`${where} : un « shell » propre à l’étape peut retirer l’arrêt sur échec (« -e », « pipefail »).`)
			const command = String(step.run).replace(EXPRESSION, '')
			for (const { trick, pattern } of SWALLOWED_FAILURES)
				if (pattern.test(command)) problems.push(`${where} : la commande avale son échec (${trick}).`)
		}
	}
	return problems
}

/**
 * C02: nothing depends on a cache. No condition reads `cache-hit`, and a cache step keeps
 * `.next/cache` only: a cached build output would make the build step lie.
 */
export function cacheDependentSteps(workflows: readonly Workflow[]): string[] {
	const problems: string[] = []
	for (const workflow of workflows) {
		for (const found of keysNamed(workflow.jobs, 'if'))
			if (String(found.value).includes('cache-hit'))
				problems.push(`${workflow.file}, ${found.trail} : une étape ne doit jamais dépendre de « cache-hit ».`)
		for (const { step, where } of allSteps(workflow))
			if (/^actions\/cache(\/|@)/.test(step.uses ?? '') && String(step.with?.path ?? '').trim() !== CACHED_FOLDER)
				problems.push(`${where} : seul « ${CACHED_FOLDER} » se met en cache, jamais une sortie de build.`)
	}
	return problems
}

/**
 * C03: every required check exists under its exact name, once. GitHub knows a required check
 * by its name alone, so a homonym satisfies the protection in its place: no other job may be
 * shown under the name of a check of a workflow, and no job at all under the name of a check
 * GitHub creates by itself (CodeQL, default setup).
 */
export function requiredCheckProblems(required: readonly RequiredCheck[], workflows: readonly Workflow[]): string[] {
	const problems: string[] = []
	const jobNames = workflows.flatMap(workflow =>
		Object.entries(workflow.jobs).map(([id, job]) => ({ file: workflow.file, id, name: String(job.name ?? id) }))
	)
	const sameName = (name: string, check: RequiredCheck) => name.toLowerCase() === check.name.toLowerCase()
	for (const check of required) {
		if (check.source === 'workflow') {
			// GitHub knows a required check by its name alone: any other job shown under it would do.
			for (const homonym of jobNames.filter(
				job => sameName(job.name, check) && !(job.file === check.file && job.id === check.job)
			))
				problems.push(
					`${homonym.file}, job ${homonym.id} : il s’affiche lui aussi sous le nom « ${homonym.name} », et passerait pour le check requis « ${check.name} ».`
				)
			const workflow = workflows.find(candidate => candidate.file === check.file)
			const job = workflow?.jobs[check.job ?? '']
			if (!workflow) problems.push(`Check requis « ${check.name} » : le fichier ${check.file} n’existe pas.`)
			else if (!job) problems.push(`Check requis « ${check.name} » : ${check.file} n’a pas de job « ${check.job} ».`)
			else if ((job.name ?? check.job) !== check.name)
				problems.push(`Check requis « ${check.name} » : le job s’affiche sous le nom « ${job.name} » dans GitHub.`)
			else if (job.strategy !== undefined)
				problems.push(`Check requis « ${check.name} » : une matrice change le nom du check.`)
		} else if (check.source === 'github') {
			for (const homonym of jobNames.filter(job => sameName(job.name, check)))
				problems.push(
					`${homonym.file} : un job nommé « ${homonym.name} » passerait pour le check « ${check.name} » de GitHub.`
				)
		} else problems.push(`Check requis « ${check.name} » : source « ${check.source} » inconnue.`)
	}
	if (required.some(check => check.name === 'CodeQL' && check.source === 'github'))
		for (const workflow of workflows)
			for (const { step, where } of allSteps(workflow))
				if (step.uses?.startsWith('github/codeql-action/'))
					problems.push(
						`${where} : GitHub refuse une analyse CodeQL écrite ici tant que sa configuration par défaut est active.`
					)
	return problems
}

/** C04, workflows: Node and bun are installed from `.nvmrc` and `package.json`, never from a version written here. */
export function misalignedSetups(workflows: readonly Workflow[]): string[] {
	const problems: string[] = []
	const setups = [
		{ action: 'oven-sh/setup-bun@', file: 'bun-version-file', expected: 'package.json', literal: 'bun-version' },
		{ action: 'actions/setup-node@', file: 'node-version-file', expected: '.nvmrc', literal: 'node-version' },
	]
	for (const workflow of workflows)
		for (const { step, where } of allSteps(workflow))
			for (const setup of setups)
				if (
					step.uses?.startsWith(setup.action) &&
					(step.with?.[setup.file] !== setup.expected || setup.literal in (step.with ?? {}))
				)
					problems.push(
						`${where} : la version se lit dans ${setup.expected} (« ${setup.file}: ${setup.expected} »), sans « ${setup.literal} ».`
					)
	return problems
}

/** Every action is pinned by a full commit, with its version in a comment on the same line. */
export function unpinnedActions(workflows: readonly Workflow[]): string[] {
	const problems: string[] = []
	for (const workflow of workflows) {
		const used = [
			...[...allSteps(workflow)].map(({ step, where }) => ({ uses: step.uses, where })),
			...Object.entries(workflow.jobs).map(([id, job]) => ({ uses: job.uses, where: `${workflow.file}, job ${id}` })),
		]
		for (const { uses, where } of used)
			if (uses !== undefined && !PINNED_ACTION.test(uses))
				problems.push(`${where} : « ${uses} » n’est pas figée par un commit complet (40 caractères).`)
		for (const line of workflow.text.split('\n'))
			if (/^\s*(-\s*)?uses:/.test(line) && !PINNED_ACTION_LINE.test(line))
				problems.push(
					`${workflow.file} : « ${line.trim()} » doit finir par sa version en commentaire, comme « # v1.2.3 ».`
				)
	}
	return [...new Set(problems)]
}

/** Every text of a YAML document, with the key it is the value of. */
function* textsOf(value: unknown, key = ''): Generator<{ key: string; text: string }> {
	if (typeof value === 'string') yield { key, text: value }
	else if (Array.isArray(value)) for (const item of value) yield* textsOf(item, key)
	else if (isRecord(value)) for (const [name, child] of Object.entries(value)) yield* textsOf(child, name)
}

/**
 * The expressions GitHub evaluates in a workflow: every `${{ … }}`, wherever it is written
 * (GitHub replaces it even on a commented line of a `run: |` block), and every `if`, which
 * needs no braces.
 */
function expressionsOf(workflow: Workflow): string[] {
	const found: string[] = []
	for (const { key, text } of textsOf(workflow.document)) {
		found.push(...[...text.matchAll(EXPRESSION)].map(match => match[1] ?? ''))
		if (key === 'if') found.push(text)
	}
	return found
}

/**
 * How an expression reads a context such as `secrets`: by a name written in full
 * (`secrets.NAME`, `secrets['NAME']`), or `whole`, any other way: the context itself
 * (`toJSON(secrets)`, `secrets.*`) or a name computed when the workflow runs
 * (`secrets[format(…)]`). Nobody can tell from the file what a `whole` read gives.
 */
function contextReads(expression: string, context: string): { names: string[]; whole: boolean } {
	// A text between quotes is not code: `'secrets'` reads nothing. Its length is kept.
	const code = expression.replace(/'(?:[^']|'')*'/g, quoted => `'${'_'.repeat(quoted.length - 2)}'`)
	const names: string[] = []
	let whole = false
	// Names of GitHub expressions are not case-sensitive. `needs.secrets` is a property, not the context.
	for (const match of code.matchAll(new RegExp(String.raw`(?<![\w.-])${context}(?![\w-])`, 'gi'))) {
		const after = expression.slice(match.index + context.length)
		const name = /^\s*\.\s*([A-Za-z_][\w-]*)/.exec(after)?.[1] ?? /^\s*\[\s*'([^']+)'\s*\]/.exec(after)?.[1]
		if (name === undefined) whole = true
		else names.push(name)
	}
	return { names, whole }
}

/** The name the token of the run has among the secrets: `github.token` is the same value. */
const RUN_TOKEN = 'GITHUB_TOKEN'

/**
 * The secrets a workflow reads. Anything outside `allowed` is refused, and so is every read
 * that does not name its secret in full: the whole `secrets` context, a computed name,
 * `secrets: inherit`. The token of the run counts as a secret under both its names,
 * `secrets.GITHUB_TOKEN` and `github.token`.
 */
export function unexpectedSecrets(workflows: readonly Workflow[], allowed: readonly string[] = []): string[] {
	const problems: string[] = []
	const isAllowed = (name: string) => allowed.some(known => known.toUpperCase() === name.toUpperCase())
	for (const workflow of workflows) {
		// The text itself, comment lines left out: a name is refused even outside an expression.
		const written = workflow.text
			.split('\n')
			.filter(line => !line.trim().startsWith('#'))
			.join('\n')
		const names = [...written.matchAll(/\bsecrets\s*(?:\.\s*([A-Za-z_]\w*)|\[\s*['"]([^'"]+)['"]\s*\])/gi)].map(
			match => match[1] ?? match[2] ?? ''
		)
		let whole = false
		for (const expression of expressionsOf(workflow)) {
			const secrets = contextReads(expression, 'secrets')
			names.push(...secrets.names)
			whole ||= secrets.whole
			const github = contextReads(expression, 'github')
			if (github.whole || github.names.some(name => name.toLowerCase() === 'token')) names.push(RUN_TOKEN)
		}
		for (const name of new Set(names))
			if (!isAllowed(name))
				problems.push(`${workflow.file} lit le secret « ${name} », qui n’est pas dans la liste admise.`)
		if (whole)
			problems.push(
				`${workflow.file} lit les secrets sans nommer lequel (« toJSON(secrets) », « secrets[…] » calculé) : chaque secret se lit par son nom, écrit en toutes lettres.`
			)
		if (/\bsecrets\s*:\s*inherit\b/.test(written))
			problems.push(`${workflow.file} transmet tous les secrets (« secrets: inherit »).`)
	}
	return problems
}

/**
 * The workflow of a required check runs for every pull request and every push on the
 * integration branch: no path filter, no branch filter on pull requests, no trigger that
 * gives a fork the secrets of the repository.
 */
export function triggerProblems(workflow: Workflow, branch: string): string[] {
	const problems: string[] = []
	const on = isRecord(workflow.on) ? workflow.on : {}
	for (const filter of ['paths', 'paths-ignore'])
		for (const found of keysNamed(on, filter))
			problems.push(
				`${workflow.file}, ${found.trail} : « ${filter} » laisse le check requis en attente sur les PR qu’il écarte.`
			)
	if (!('pull_request' in on))
		problems.push(`${workflow.file} doit tourner sur chaque pull request (« pull_request: »).`)
	else if (isRecord(on.pull_request) && Object.keys(on.pull_request).length > 0)
		problems.push(
			`${workflow.file} : « pull_request » ne doit porter aucun filtre (${Object.keys(on.pull_request).join(', ')}).`
		)
	const push = isRecord(on.push) ? on.push : {}
	if (!Array.isArray(push.branches) || !push.branches.includes(branch))
		problems.push(`${workflow.file} doit tourner à chaque poussée sur ${branch} (« push: branches »).`)
	for (const trigger of ['pull_request_target', 'workflow_run'])
		if (trigger in on) problems.push(`${workflow.file} : « ${trigger} » donne les secrets du dépôt à du code non relu.`)
	return problems
}

/** The workflow of a required check only reads the repository. */
export function permissionProblems(workflow: Workflow): string[] {
	const problems: string[] = []
	const granted = isRecord(workflow.permissions) ? workflow.permissions : undefined
	if (granted === undefined || Object.keys(granted).join() !== 'contents' || granted.contents !== 'read')
		problems.push(`${workflow.file} doit déclarer « permissions: contents: read » et rien d’autre.`)
	for (const [id, job] of Object.entries(workflow.jobs))
		if (job.permissions !== undefined)
			problems.push(`${workflow.file}, job ${id} : aucun job n’élargit les permissions.`)
	return problems
}

/**
 * The aggregator is what the protection requires. It always runs and waits for every other
 * job; no other job is under a condition, and no command can be skipped by one: a `run` step
 * may only carry a condition that makes it run more often. `failure()` is left to the actions
 * that send a report, where being skipped on a green job is the point.
 */
export function aggregatorProblems(workflow: Workflow, aggregator: string): string[] {
	const problems: string[] = []
	const job = workflow.jobs[aggregator]
	if (!job) return [`${workflow.file} n’a pas de job « ${aggregator} ».`]

	if (condition(job.if) !== 'always()')
		problems.push(
			`${workflow.file}, job ${aggregator} : sans « if: always() », il serait sauté quand un job échoue, et GitHub compte un check sauté comme réussi.`
		)
	const others = Object.keys(workflow.jobs).filter(id => id !== aggregator)
	const needed = [job.needs ?? []].flat()
	for (const id of others.filter(other => !needed.includes(other)))
		problems.push(`${workflow.file}, job ${aggregator} : il n’attend pas le job « ${id} » (« needs »).`)
	for (const id of needed.filter(need => !others.includes(need)))
		problems.push(`${workflow.file}, job ${aggregator} : il attend « ${id} », qui n’existe pas.`)

	const [verdict, ...extra] = job.steps ?? []
	if (verdict?.run === undefined || extra.length > 0 || condition(verdict.env?.RESULTS) !== "join(needs.*.result, ' ')")
		problems.push(
			`${workflow.file}, job ${aggregator} : une seule étape, qui reçoit RESULTS = join(needs.*.result, ' ').`
		)

	for (const id of others)
		if (workflow.jobs[id]?.if !== undefined)
			problems.push(`${workflow.file}, job ${id} : un job sous condition peut être sauté.`)
	for (const { step, where } of allSteps(workflow)) {
		if (step.if === undefined || RUNS_ANYWAY.includes(condition(step.if))) continue
		const reports = step.uses !== undefined && step.run === undefined
		if (condition(step.if) !== AFTER_A_FAILURE)
			problems.push(
				`${where} : seules les conditions ${RUNS_ANYWAY.join(' et ')} sont admises (et ${AFTER_A_FAILURE} sur une action qui envoie un rapport), pas « ${condition(step.if)} ».`
			)
		else if (!reports)
			problems.push(
				`${where} : sous « ${AFTER_A_FAILURE} », la commande est sautée quand tout va bien, et le job reste vert sans elle. Cette condition est réservée aux actions (« uses ») qui envoient un rapport.`
			)
	}
	return problems
}

/**
 * Every job has a time limit, and the limits of the longest chain of jobs add up to less than
 * `limit` minutes: a run cannot take longer, green or not.
 *
 * A limit is a circuit breaker, not the usual duration of a job. The sum only stays under a
 * tight `limit` while the jobs run side by side: the day a job is chained after another one
 * (end-to-end tests after the build), `limit` becomes the bound of the circuit breakers, and
 * the duration of a green run is read on GitHub instead (docs/qualite.md, « Durée de la CI »).
 */
export function durationProblems(workflow: Workflow, limit: number): string[] {
	const problems: string[] = []
	const minutes = (id: string): number => {
		const value = workflow.jobs[id]?.['timeout-minutes']
		return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : Number.NaN
	}
	for (const id of Object.keys(workflow.jobs))
		if (Number.isNaN(minutes(id)))
			problems.push(`${workflow.file}, job ${id} : il lui faut une limite « timeout-minutes ».`)
	if (problems.length > 0) return problems

	const longest = (id: string, seen: string[] = []): number => {
		if (seen.includes(id)) return Number.POSITIVE_INFINITY
		const before = [workflow.jobs[id]?.needs ?? []].flat().filter(need => need in workflow.jobs)
		return minutes(id) + Math.max(0, ...before.map(need => longest(need, [...seen, id])))
	}
	const total = Math.max(0, ...Object.keys(workflow.jobs).map(id => longest(id)))
	if (total >= limit)
		problems.push(
			`${workflow.file} : la plus longue chaîne de jobs peut durer ${total} minutes, il en faut moins de ${limit} (docs/qualite.md, « Durée de la CI », dit quoi faire quand un job s’enchaîne après un autre).`
		)
	return problems
}

/**
 * The shards of the two jobs of the test bench: `matrix.shard` runs from 1 to this number, the name of
 * the job shows it, and the command of the tests divides by it. A matrix and a divisor that differ
 * would drop tests without a word (`--shard=3/2` runs nothing) or run some twice.
 */
export const SHARDS = { integration: 3, e2e: 4 } as const
/** An expression of GitHub Actions, written so that it is not read as a template here. */
const SHARD = '${{ matrix.shard }}'
/** The two jobs that run on the test bench, and the commands each one runs, in this order, one per step. */
export const BENCH_JOBS = {
	integration: [
		'bun install --frozen-lockfile',
		'bun run bench:up',
		`bun run test:integration --shard=${SHARD}/${SHARDS.integration}`,
	],
	e2e: [
		'bun install --frozen-lockfile',
		'bun run browser:install',
		'bun run bench:up',
		`bun run test:e2e --shard=${SHARD}/${SHARDS.e2e}`,
	],
} as const

/**
 * The integration and end-to-end tests run on the test bench, in the CI as on a developer's
 * machine. Each job starts the bench before its tests, and runs in shards side by side, each with
 * its own bench: `matrix: shard: [1, …, N]` and nothing else, the name `<job> (shard/N)`, the
 * command divided by the same N, and a failed shard that does not cancel the others. The
 * end-to-end tests run under Node. A green shard lasts less than `limit` minutes: its time limit
 * is that bound.
 */
export function benchJobProblems(workflow: Workflow, limit: number): string[] {
	const problems: string[] = []
	for (const [id, commands] of Object.entries(BENCH_JOBS) as [keyof typeof BENCH_JOBS, readonly string[]][]) {
		const job = workflow.jobs[id]
		if (!job) {
			problems.push(`${workflow.file} n’a pas de job « ${id} » : le banc de test n’y tournerait plus.`)
			continue
		}
		const steps = job.steps ?? []
		const ran = steps.map(step => (typeof step.run === 'string' ? step.run.trim() : undefined))
		const found = commands.map(command => ran.indexOf(command))
		for (const [rank, command] of commands.entries()) {
			const at = found[rank] ?? -1
			const before = rank > 0 ? (found[rank - 1] ?? -1) : -1
			if (at === -1) problems.push(`${workflow.file}, job ${id} : il doit lancer « ${command} », seule dans son étape.`)
			else if (at < before)
				problems.push(`${workflow.file}, job ${id} : « ${command} » doit venir après « ${commands[rank - 1]} ».`)
		}

		const shards = SHARDS[id]
		const expected = Array.from({ length: shards }, (_, rank) => rank + 1)
		const strategy = isRecord(job.strategy) ? job.strategy : {}
		const matrix = isRecord(strategy.matrix) ? strategy.matrix : {}
		if (Object.keys(matrix).join() !== 'shard' || JSON.stringify(matrix.shard) !== JSON.stringify(expected))
			problems.push(
				`${workflow.file}, job ${id} : les tests tournent en ${shards} lots, « matrix: shard: [${expected.join(', ')}] », et rien d’autre.`
			)
		if (job.name !== `${id} (${SHARD}/${shards})`)
			problems.push(`${workflow.file}, job ${id} : son nom dit ses lots, « ${id} (${SHARD}/${shards}) ».`)
		if (strategy['fail-fast'] !== false)
			problems.push(`${workflow.file}, job ${id} : « fail-fast: false », sinon un lot en échec annule les autres.`)
		const minutes = job['timeout-minutes']
		if (typeof minutes === 'number' && minutes > limit)
			problems.push(
				`${workflow.file}, job ${id} : sa limite est de ${minutes} minutes ; chaque lot doit tenir en ${limit}.`
			)
		if (id !== 'e2e') continue

		const lastCommand = found.at(-1) ?? -1
		const node = steps.findIndex(step => step.uses?.startsWith('actions/setup-node@'))
		if (node === -1 || (lastCommand !== -1 && node > lastCommand))
			problems.push(`${workflow.file}, job ${id} : Playwright tourne sous Node, installé avant les essais.`)
	}
	return problems
}

/* ------------------------------------------------------------------------------------------
 * Test files and tracked files
 * ---------------------------------------------------------------------------------------- */

/**
 * A call of the test runner up to the dot of its last modifier. A line break may come before
 * a dot (a chained call written on several lines), never a space after it (a sentence).
 */
const TEST_CALL = String.raw`\b(?:describe|test|it)(?:\s*\.\w+)*?\s*\.`
const LITERAL = (value: string) => String.raw`\s*\(\s*${value}\s*\)`
const FOCUSED = new RegExp(String.raw`${TEST_CALL}only\b|\b(?:fdescribe|fit)\s*\(`, 'g')
/**
 * Skipped for good: the plain modifiers, a test left to write, and a condition that is
 * written as a constant. A condition that reads something (a variable, a function) is a
 * real condition and is left alone.
 */
const SKIPPED = new RegExp(
	[
		String.raw`${TEST_CALL}(?:skip|fixme|todo)\b`,
		`${TEST_CALL}(?:skipIf|todoIf)${LITERAL('true')}`,
		`${TEST_CALL}if${LITERAL('false')}`,
		String.raw`\b(?:xdescribe|xtest|xit)\s*\(`,
	].join('|'),
	'g'
)
const ISSUE = /\/\/\s*issue #\d+/

/**
 * C05: no focused test, and no skipped test without the issue that explains it, written
 * `// issue #N` on a line of the call or on the line above.
 */
export function focusedOrSkippedTests(files: readonly { file: string; text: string }[]): string[] {
	const problems: { file: string; line: number; message: string }[] = []
	for (const { file, text } of files) {
		const lines = text.split('\n')
		/** The line of a position in the text, counted from 1. */
		const lineAt = (index: number): number => text.slice(0, index).split('\n').length
		const focused: number[] = []
		for (const match of text.matchAll(FOCUSED)) {
			focused.push(lineAt(match.index))
			problems.push({ file, line: lineAt(match.index), message: 'un test en « .only » fait sauter tous les autres.' })
		}
		for (const match of text.matchAll(SKIPPED)) {
			const first = lineAt(match.index)
			const last = lineAt(match.index + match[0].length)
			// From the line above the call to its last line.
			const explained = lines.slice(Math.max(0, first - 2), last).some(line => ISSUE.test(line))
			if (!explained && !focused.includes(first))
				problems.push({ file, line: first, message: 'un test sauté doit citer son ticket, « // issue #N ».' })
		}
	}
	return problems
		.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
		.map(({ file, line, message }) => `${file}:${line} : ${message}`)
}

const JAVASCRIPT = /\.(?:js|jsx|cjs|mjs)$/

/** C08: the only JavaScript files git tracks are the ones of `allowed`. Everything else is TypeScript. */
export function handWrittenJavaScript(tracked: readonly string[], allowed: readonly string[]): string[] {
	return tracked
		.filter(file => JAVASCRIPT.test(file) && !allowed.includes(file))
		.map(file => `${file} : un fichier JavaScript écrit à la main. Le dépôt est en TypeScript.`)
}

/* ------------------------------------------------------------------------------------------
 * End-to-end tests
 * ---------------------------------------------------------------------------------------- */

/** The ways of waiting for a duration instead of a state, each with the name it is reported under. */
const FIXED_WAITS: readonly (readonly [name: string, written: RegExp])[] = [
	['waitForTimeout', /\bwaitForTimeout\s*\(/g],
	// The timer itself, bare or on the page. `test.setTimeout(…)` is something else: the time limit of a test.
	['setTimeout', /(?:(?<![.\w$])|\b(?:window|globalThis|self)\s*\.\s*)setTimeout\s*\(/g],
	// The promise form of setTimeout: `import { setTimeout } from 'node:timers/promises'`.
	['timers/promises', /['"](?:node:)?timers\/promises['"]/g],
]

/**
 * C06: no end-to-end test waits for a fixed time. A wait that is long enough on one machine is
 * too short on another: a test waits for a state, with the assertions of Playwright.
 */
export function fixedWaits(files: readonly { file: string; text: string }[]): string[] {
	const problems: { file: string; line: number; name: string }[] = []
	for (const { file, text } of files)
		for (const [name, written] of FIXED_WAITS)
			for (const match of text.matchAll(written))
				problems.push({ file, line: text.slice(0, match.index).split('\n').length, name })
	return problems
		.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
		.map(
			({ file, line, name }) =>
				`${file}:${line} : attente fixe (« ${name} »). Un essai attend un état, jamais une durée : « await expect(…) » ou « expect.poll ».`
		)
}

/** What C07 reads in the configuration of Playwright, once evaluated. */
export interface PlaywrightSettings {
	forbidOnly?: boolean
	testMatch?: unknown
	use?: { baseURL?: string }
	projects?: readonly { name?: string; testMatch?: unknown; use?: { baseURL?: string } }[]
}

const SITE_DOMAIN = 'my-makeup.fr'
const SPEC_FILES = /\.spec\.ts$/

/** True when the pattern can only match `*.spec.ts` files: a text, or texts, that end that way. */
const onlySpecFiles = (testMatch: unknown): boolean => {
	const patterns = Array.isArray(testMatch) ? (testMatch as unknown[]) : [testMatch]
	return patterns.length > 0 && patterns.every(pattern => typeof pattern === 'string' && SPEC_FILES.test(pattern))
}

/** Why an address must not be the one the tests open, or nothing. */
function baseUrlDefect(baseURL: string | undefined): string | undefined {
	if (baseURL === undefined) return 'manque : chaque essai ouvrirait une adresse écrite dans son propre fichier.'
	if (!URL.canParse(baseURL)) return 'n’est pas une adresse lisible.'
	const host = new URL(baseURL).hostname.toLowerCase()
	const ofTheSite = host === SITE_DOMAIN || host.endsWith(`.${SITE_DOMAIN}`)
	return ofTheSite ? `vise le site en ligne (${host}).` : undefined
}

/**
 * C07, the configuration as the CI evaluates it: a test left in `.only` fails the run, only
 * `*.spec.ts` files are tests, and no address of production is what the tests open.
 */
export function playwrightSettingsProblems(settings: PlaywrightSettings): string[] {
	const problems: string[] = []
	if (settings.forbidOnly !== true)
		problems.push('forbidOnly doit être vrai en CI : un essai laissé en « .only » ferait sauter tous les autres.')
	const projects = settings.projects ?? []
	if (!onlySpecFiles(settings.testMatch))
		problems.push(
			'testMatch doit se limiter aux fichiers « *.spec.ts » : sinon Playwright ramasse aussi les tests de bun.'
		)
	for (const { name = '?', testMatch } of projects)
		if (testMatch !== undefined && !onlySpecFiles(testMatch))
			problems.push(`projet « ${name} » : testMatch doit se limiter aux fichiers « *.spec.ts ».`)
	const defect = baseUrlDefect(settings.use?.baseURL)
	if (defect) problems.push(`baseURL ${defect}`)
	for (const { name = '?', use } of projects) {
		const ownDefect = use?.baseURL === undefined ? undefined : baseUrlDefect(use.baseURL)
		if (ownDefect) problems.push(`projet « ${name} » : baseURL ${ownDefect}`)
	}
	return problems
}

/**
 * C07, the file itself: playwright.config.ts gives the checked configuration as it is. A
 * setting written in the file would be read by Playwright and by none of the checks above.
 */
export function playwrightConfigFileProblems(text: string, expected: string): string[] {
	const code = text
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.split('\n')
		.map(line => line.replace(/\/\/.*$/, '').trim())
		.filter(line => line !== '' && !line.startsWith('import '))
	return code.length === 1 && code[0] === expected
		? []
		: [
				`playwright.config.ts doit se réduire à « ${expected} » : un réglage écrit dans ce fichier échapperait aux garde-fous.`,
			]
}

/** A call that opens an address, given a literal that starts with a protocol. */
const ABSOLUTE_NAVIGATION =
	/\.(goto|get|post|put|patch|delete|head|fetch|waitForURL)\s*\(\s*(['"`])(https?:\/\/[^'"`\s$]*)/g

/**
 * C07, the tests: a test opens a path, never a full address. The host is the one of `baseURL`,
 * which the guard of the tests has checked; an address written in a test would go around it.
 */
export function absoluteNavigations(files: readonly { file: string; text: string }[]): string[] {
	const problems: { file: string; line: number; call: string }[] = []
	for (const { file, text } of files)
		for (const match of text.matchAll(ABSOLUTE_NAVIGATION))
			problems.push({ file, line: text.slice(0, match.index).split('\n').length, call: match[1] ?? '' })
	return problems
		.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
		.map(
			({ file, line, call }) =>
				`${file}:${line} : « ${call} » reçoit une adresse complète. Un essai ouvre un chemin, comme « /admin » : l’hôte est celui de baseURL, vérifié par la garde.`
		)
}

/* ------------------------------------------------------------------------------------------
 * The schema drift check
 * ---------------------------------------------------------------------------------------- */

/** The job that checks the schema, and the command that does it (docs/qualite.md, « La dérive de schéma »). */
export const SCHEMA_DRIFT = { job: 'qualite', command: 'bun run schema:drift', after: 'bun install --frozen-lockfile' }

/**
 * Since the `init` migration (ticket 049), a collection changed without its migration makes the
 * CI red: the job `qualite` runs `bun run schema:drift`, alone in its step, once the dependencies
 * are installed, under no condition that could skip it.
 */
export function schemaDriftProblems(workflow: Workflow): string[] {
	const { job: id, command, after } = SCHEMA_DRIFT
	const steps = workflow.jobs[id]?.steps ?? []
	const ran = steps.map(step => (typeof step.run === 'string' ? step.run.trim() : undefined))
	const at = ran.indexOf(command)
	if (at === -1)
		return [
			`${workflow.file}, job ${id} : il doit lancer « ${command} », seule dans son étape : sans elle, une collection changée sans sa migration passerait.`,
		]
	const problems: string[] = []
	if (at < ran.indexOf(after))
		problems.push(`${workflow.file}, job ${id} : « ${command} » doit venir après « ${after} ».`)
	const step = steps[at]
	if (step?.if !== undefined && !RUNS_ANYWAY.includes(condition(step.if)))
		problems.push(
			`${workflow.file}, job ${id} : « ${command} » ne tourne que sous « ${condition(step.if)} » ; seules ${RUNS_ANYWAY.join(' et ')} sont admises.`
		)
	return problems
}
