/**
 * What the Docker image may and may not carry, as data and pure functions: no Docker, no
 * network, no file read here.
 *
 * Two readers, one set of rules:
 * - tests/ci reads the Dockerfile and .dockerignore as text, on every pull request;
 * - scripts/image/controle.ts reads the image that was really built.
 */

/**
 * The only variables `docker build` may receive. All of them are public: they end up in the
 * bundles, in the history of the build stage, and in what the browser downloads.
 * A name is added here by the ticket that adds its `ARG` line to the Dockerfile.
 */
export const PUBLIC_BUILD_VARIABLES: readonly string[] = [
	'NEXT_PUBLIC_SITE_URL',
	'NEXT_PUBLIC_APP_VERSION',
	'SOURCE_COMMIT',
]

/** A build variable is public by its name, or because it is one of these. */
const PUBLIC_WITHOUT_PREFIX: readonly string[] = ['SOURCE_COMMIT']

/**
 * The environment of the image that runs: what the Node base image sets, and the four
 * settings of the last stage of the Dockerfile. Anything else is a variable that should
 * have been given to the container instead.
 */
export const IMAGE_ENVIRONMENT: readonly string[] = [
	'PATH',
	'NODE_VERSION',
	'YARN_VERSION',
	'NODE_ENV',
	'NEXT_TELEMETRY_DISABLED',
	'PORT',
	'HOSTNAME',
]

/** Read by src/lib/env.ts without a line in `.env.exemple`: it must never be set, least of all in an image. */
const RUNTIME_ONLY_WITHOUT_EXAMPLE: readonly string[] = ['PAYLOAD_DROP_DATABASE']

/** The path the health check of the image must ask. */
export const HEALTH_PATH = '/api/health'

const VARIABLE_NAME = /^[A-Z][A-Z0-9_]*$/

/** True when the name says the variable is public: `NEXT_PUBLIC_*`, or the commit being built. */
export function isPublicByName(name: string): boolean {
	return name.startsWith('NEXT_PUBLIC_') || PUBLIC_WITHOUT_PREFIX.includes(name)
}

/** The variables listed in `.env.exemple`: one `NAME=` per line, comments left out. */
export function declaredVariables(envExample: string): string[] {
	return envExample
		.split('\n')
		.map(line => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
		.filter((name): name is string => name !== undefined)
}

/**
 * The variables given to the container when it starts, never to the build: every variable
 * of `.env.exemple` that is not a public build variable. The list follows the file: a ticket
 * that adds a secret there has it refused in the image without touching this code.
 */
export function runtimeVariables(envExample: string): string[] {
	const names = [...declaredVariables(envExample), ...RUNTIME_ONLY_WITHOUT_EXAMPLE]
	return [...new Set(names)].filter(name => !PUBLIC_BUILD_VARIABLES.includes(name))
}

/** The names of `names` written in `text` as whole words, in the order of `names`. */
export function citedVariables(text: string, names: readonly string[]): string[] {
	return names.filter(name => new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`).test(text))
}

/** One `FROM` line. */
export interface DockerfileStage {
	/** `oven/bun`, `node`, or the name of an earlier stage. */
	image: string
	tag: string | undefined
	/** `sha256:…`, when the line pins one. */
	digest: string | undefined
	/** The name given by `AS`. */
	name: string | undefined
	/** Names declared by `ARG` in this stage. */
	args: string[]
	/** Names set by `ENV` in this stage. */
	env: string[]
	/** Values of `COPY --from=`. */
	copiesFrom: string[]
	/** Value of the last `USER`. */
	user: string | undefined
	/** The command of `HEALTHCHECK … CMD`, when it is written as a JSON array. */
	healthcheck: string[] | undefined
	/** The command of `CMD`, when it is written as a JSON array. */
	command: string[] | undefined
}

export interface Dockerfile {
	/** Names declared by `ARG` before the first `FROM`. */
	globalArgs: string[]
	stages: DockerfileStage[]
	/** Instructions this reader does not know: a rule cannot be checked on what is not read. */
	unknown: string[]
}

const KNOWN_WITHOUT_EFFECT = new Set([
	'WORKDIR',
	'RUN',
	'EXPOSE',
	'LABEL',
	'ENTRYPOINT',
	'VOLUME',
	'STOPSIGNAL',
	'SHELL',
])

/** `["a", "b"]` as an array of texts, or nothing when the text is not one. */
function jsonCommand(text: string): string[] | undefined {
	try {
		const parsed: unknown = JSON.parse(text)
		return Array.isArray(parsed) && parsed.every(part => typeof part === 'string') ? parsed : undefined
	} catch {
		return undefined
	}
}

/** `ARG A B=default` declares `A` and `B`. */
function declaredNames(rest: string): string[] {
	return rest
		.split(/\s+/)
		.map(word => word.split('=')[0] ?? '')
		.filter(name => VARIABLE_NAME.test(name))
}

/** `ENV A=1 B=2` sets `A` and `B`; the old form `ENV A value` sets `A`. */
function assignedNames(rest: string): string[] {
	const words = rest.split(/\s+/).filter(Boolean)
	const pairs = words.filter(word => word.includes('='))
	const names = pairs.length > 0 ? pairs.map(word => word.slice(0, word.indexOf('='))) : words.slice(0, 1)
	return names.filter(name => VARIABLE_NAME.test(name))
}

function stageFrom(rest: string): DockerfileStage {
	const [reference = '', ...after] = rest.split(/\s+/).filter(word => !word.startsWith('--'))
	const [named, digest] = reference.split('@')
	const colon = (named ?? '').lastIndexOf(':')
	const asIndex = after.findIndex(word => word.toUpperCase() === 'AS')
	return {
		image: colon === -1 ? (named ?? '') : (named ?? '').slice(0, colon),
		tag: colon === -1 ? undefined : (named ?? '').slice(colon + 1),
		digest,
		name: asIndex === -1 ? undefined : after[asIndex + 1],
		args: [],
		env: [],
		copiesFrom: [],
		user: undefined,
		healthcheck: undefined,
		command: undefined,
	}
}

/**
 * Reads the instructions a rule needs from a Dockerfile: stages, `ARG`, `ENV`, `COPY --from`,
 * `USER`, `HEALTHCHECK` and `CMD`. Comments and line continuations are handled; a shell is not.
 */
export function readDockerfile(text: string): Dockerfile {
	// Comment lines go first: Docker drops them even in the middle of a continued instruction.
	const lines = text
		.split('\n')
		.filter(line => !line.trim().startsWith('#'))
		.join('\n')
		.replace(/\\\r?\n/g, ' ')
		.split('\n')
		.map(line => line.trim())
		.filter(line => line !== '')

	const dockerfile: Dockerfile = { globalArgs: [], stages: [], unknown: [] }
	for (const line of lines) {
		const [, word = '', rest = ''] = /^(\S+)\s*(.*)$/.exec(line) ?? []
		const instruction = word.toUpperCase()
		const stage = dockerfile.stages.at(-1)

		if (instruction === 'FROM') dockerfile.stages.push(stageFrom(rest))
		else if (instruction === 'ARG') (stage?.args ?? dockerfile.globalArgs).push(...declaredNames(rest))
		else if (stage === undefined) dockerfile.unknown.push(line)
		else if (instruction === 'ENV') stage.env.push(...assignedNames(rest))
		else if (instruction === 'USER') stage.user = rest
		else if (instruction === 'CMD') stage.command = jsonCommand(rest)
		else if (instruction === 'HEALTHCHECK') stage.healthcheck = jsonCommand(rest.slice(rest.indexOf('CMD') + 3).trim())
		else if (instruction === 'COPY' || instruction === 'ADD') {
			const from = /--from=(\S+)/.exec(rest)?.[1]
			if (from !== undefined) stage.copiesFrom.push(from)
		} else if (!KNOWN_WITHOUT_EFFECT.has(instruction)) dockerfile.unknown.push(line)
	}
	return dockerfile
}

/** The lines of `.dockerignore` that count: no comment, no blank line. */
export function dockerignoreRules(text: string): string[] {
	return text
		.split('\n')
		.map(line => line.trim())
		.filter(line => line !== '' && !line.startsWith('#'))
}
