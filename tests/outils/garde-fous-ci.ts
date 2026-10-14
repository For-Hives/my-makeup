/**
 * The guard rails of the CI and of the Docker image, as pure functions: each one reads the
 * text of a file of the repository and gives back what is wrong, in French, or nothing.
 *
 * tests/ci/garde-fous-ci.test.ts runs each of them twice: on the real files, where it must
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
} from '../../scripts/image/regles'

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
			problems.push(`ARG ${name} : seules les variables publiques de build sont admises (scripts/image/regles.ts).`)

	const instructions = dockerfile
		.split('\n')
		.filter(line => !line.trim().startsWith('#'))
		.join('\n')
	for (const name of citedVariables(instructions, runtimeVariables(envExample)))
		problems.push(`${name} est une variable d’exécution : elle se donne au conteneur, jamais au Dockerfile.`)

	for (const name of last?.env ?? [])
		if (!IMAGE_ENVIRONMENT.includes(name))
			problems.push(`ENV ${name} dans la dernière étape : hors de la liste admise (scripts/image/regles.ts).`)

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
	uses?: string
	run?: string
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
	strategy?: unknown
	'timeout-minutes'?: unknown
}

/** One file of .github/workflows: its text as written, and what YAML reads in it. */
export interface Workflow {
	file: string
	text: string
	on: unknown
	permissions: unknown
	jobs: Record<string, Job>
}

/** A check the protection of the branch requires, as listed in ci/checks-requis.json. */
export interface RequiredCheck {
	nom: string
	/** `workflow`: a job of this repository. `github`: a check GitHub creates by itself. */
	source: string
	fichier?: string
	job?: string
}

/** The statuses a step may wait for. Any other condition can skip a step without anyone noticing. */
const STATUS_CONDITIONS = ['always()', '!cancelled()', 'failure()']
/** The only folder a workflow may cache: the compilation cache of Next, never a build output. */
const CACHED_FOLDER = '.next/cache'
const PINNED_ACTION = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/
const PINNED_ACTION_LINE = /uses:\s*\S+@[0-9a-f]{40}\s+#\s*v\d+(\.\d+){0,2}\s*$/
/** What makes a failed command pass in a shell. */
const SWALLOWED_FAILURE = /\|\|\s*(true|:|exit\s+0)(?![\w-])|\bset\s+\+e\b/

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

/** Reads a workflow. Throws when the text is not YAML: nothing can be checked on it. */
export function readWorkflow(file: string, text: string): Workflow {
	const yaml: unknown = Bun.YAML.parse(text)
	const root = isRecord(yaml) ? yaml : {}
	return {
		file,
		text,
		on: root.on,
		permissions: root.permissions,
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

/** C01: no step and no job is allowed to fail, by `continue-on-error` or by a shell trick. */
export function toleratedFailures(workflows: readonly Workflow[]): string[] {
	const problems: string[] = []
	for (const workflow of workflows) {
		for (const found of keysNamed(workflow.jobs, 'continue-on-error'))
			if (found.value !== false)
				problems.push(`${workflow.file}, ${found.trail} : « continue-on-error » rend un échec invisible.`)
		for (const { step, where } of allSteps(workflow))
			if (SWALLOWED_FAILURE.test(step.run ?? ''))
				problems.push(`${where} : la commande avale son échec (« || true », « set +e »…).`)
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
 * C03: every required check exists under its exact name. A check GitHub creates by itself
 * (CodeQL, default setup) must not be imitated by a job: the homonym would satisfy the
 * protection without any analysis.
 */
export function requiredCheckProblems(required: readonly RequiredCheck[], workflows: readonly Workflow[]): string[] {
	const problems: string[] = []
	const jobNames = workflows.flatMap(workflow =>
		Object.entries(workflow.jobs).map(([id, job]) => ({ file: workflow.file, name: job.name ?? id }))
	)
	for (const check of required) {
		if (check.source === 'workflow') {
			const workflow = workflows.find(candidate => candidate.file === check.fichier)
			const job = workflow?.jobs[check.job ?? '']
			if (!workflow) problems.push(`Check requis « ${check.nom} » : le fichier ${check.fichier} n’existe pas.`)
			else if (!job) problems.push(`Check requis « ${check.nom} » : ${check.fichier} n’a pas de job « ${check.job} ».`)
			else if ((job.name ?? check.job) !== check.nom)
				problems.push(`Check requis « ${check.nom} » : le job s’affiche sous le nom « ${job.name} » dans GitHub.`)
			else if (job.strategy !== undefined)
				problems.push(`Check requis « ${check.nom} » : une matrice change le nom du check.`)
		} else if (check.source === 'github') {
			for (const homonym of jobNames.filter(job => job.name.toLowerCase() === check.nom.toLowerCase()))
				problems.push(
					`${homonym.file} : un job nommé « ${homonym.name} » passerait pour le check « ${check.nom} » de GitHub.`
				)
		} else problems.push(`Check requis « ${check.nom} » : source « ${check.source} » inconnue.`)
	}
	if (required.some(check => check.nom === 'CodeQL' && check.source === 'github'))
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

/** The secrets a workflow reads, comments left out. Anything outside `allowed` is refused. */
export function unexpectedSecrets(workflows: readonly Workflow[], allowed: readonly string[] = []): string[] {
	const problems: string[] = []
	for (const workflow of workflows) {
		const written = workflow.text
			.split('\n')
			.filter(line => !line.trim().startsWith('#'))
			.join('\n')
		const names = [...written.matchAll(/\bsecrets\s*(?:\.\s*([A-Za-z_]\w*)|\[\s*['"]([^'"]+)['"]\s*\])/g)].map(
			match => match[1] ?? match[2] ?? ''
		)
		for (const name of new Set(names))
			if (!allowed.includes(name))
				problems.push(`${workflow.file} lit le secret « ${name} », qui n’est pas dans la liste admise.`)
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
 * The aggregator is what the protection requires. It always runs, waits for every other job,
 * and no other job or step can be skipped by a condition.
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
	for (const { step, where } of allSteps(workflow))
		if (step.if !== undefined && !STATUS_CONDITIONS.includes(condition(step.if)))
			problems.push(
				`${where} : seules les conditions ${STATUS_CONDITIONS.join(', ')} sont admises, pas « ${condition(step.if)} ».`
			)
	return problems
}

/**
 * Every job has a time limit, and the longest chain of jobs ends under `limit` minutes: a
 * green run cannot take longer.
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
			`${workflow.file} : la plus longue chaîne de jobs peut durer ${total} minutes, il en faut moins de ${limit}.`
		)
	return problems
}

/* ------------------------------------------------------------------------------------------
 * Test files and tracked files
 * ---------------------------------------------------------------------------------------- */

const TEST_CALL = String.raw`\b(?:describe|test|it)(?:\.\w+)*`
const FOCUSED = new RegExp(String.raw`${TEST_CALL}\.only\b|\b(?:fdescribe|fit)\s*\(`)
const SKIPPED = new RegExp(String.raw`${TEST_CALL}\.(?:skip|fixme)\b|\b(?:xdescribe|xtest|xit)\s*\(`)
const ISSUE = /\/\/\s*issue #\d+/

/**
 * C05: no focused test, and no skipped test without the issue that explains it, written
 * `// issue #N` on the same line or on the line above.
 */
export function focusedOrSkippedTests(files: readonly { file: string; text: string }[]): string[] {
	const problems: string[] = []
	for (const { file, text } of files) {
		const lines = text.split('\n')
		for (const [index, line] of lines.entries()) {
			const where = `${file}:${index + 1}`
			if (FOCUSED.test(line)) problems.push(`${where} : un test en « .only » fait sauter tous les autres.`)
			else if (SKIPPED.test(line) && !ISSUE.test(line) && !ISSUE.test(lines[index - 1] ?? ''))
				problems.push(`${where} : un test sauté doit citer son ticket, « // issue #N ».`)
		}
	}
	return problems
}

const JAVASCRIPT = /\.(?:js|jsx|cjs|mjs)$/

/** C08: the only JavaScript files git tracks are the ones of `allowed`. Everything else is TypeScript. */
export function handWrittenJavaScript(tracked: readonly string[], allowed: readonly string[]): string[] {
	return tracked
		.filter(file => JAVASCRIPT.test(file) && !allowed.includes(file))
		.map(file => `${file} : un fichier JavaScript écrit à la main. Le dépôt est en TypeScript.`)
}
