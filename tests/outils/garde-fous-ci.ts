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
