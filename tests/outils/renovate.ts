/**
 * The guard of renovate.json, as pure functions: each one reads the configuration and what
 * the repository asks Renovate to follow, and gives back what is wrong, in French, or nothing.
 *
 * The guard does not ask Renovate anything. It reads the package rules the way Renovate
 * applies them (every rule that matches, in the order of the file, the later one wins) and
 * asks, for every dependency of the repository and every kind of update: would this be merged
 * without anyone, does it wait its 7 days, does it move with what must move with it?
 *
 * A matcher or a setting this file does not know is a fault by itself: a rule the guard
 * cannot read is a rule it cannot vouch for. tests/ci/renovate.test.ts runs every check on
 * the real file, then on a faulty example made from it.
 */

import { readDockerfile } from '../../scripts/image/rules'
import type { Workflow } from './garde-fous-ci'

/* ------------------------------------------------------------------------------------------
 * What Renovate follows in this repository
 * ---------------------------------------------------------------------------------------- */

/** One dependency as the package rules of Renovate see it. */
export interface Followed {
	/** Where it is written, for the messages. */
	file: string
	/** The name the rules match: `next`, `oven/bun`, `actions/checkout`. */
	name: string
	manager: string
	datasource: string
	/** The place in the file: `dependencies`, `overrides`, `engines`, `action`… Empty when the manager gives none. */
	depType: string
	/** The version written today. */
	version: string
}

/** The kinds of update Renovate proposes. A rule is asked about each of them. */
export const UPDATE_TYPES = [
	'major',
	'minor',
	'patch',
	'pin',
	'pinDigest',
	'digest',
	'rollback',
	'bump',
	'replacement',
	'lockFileMaintenance',
] as const
export type UpdateType = (typeof UPDATE_TYPES)[number]

/** The managers that read the files of this repository, as Renovate names them. */
const MANAGERS = ['bun', 'dockerfile', 'docker-compose', 'github-actions', 'nvm'] as const
const DATASOURCES = ['npm', 'node-version', 'docker', 'github-tags', 'github-runners'] as const
const DEP_TYPES = [
	'dependencies',
	'devDependencies',
	'overrides',
	'packageManager',
	'engines',
	'stage',
	'final',
	'action',
	'github-runner',
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const strings = (value: unknown): string[] =>
	Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

const IMAGE = /^(?<name>[^:@\s]+):(?<tag>[^@\s]+)(?:@sha256:[0-9a-f]{64})?$/
const PINNED_ACTION = /uses:\s*(?<name>[\w.-]+\/[\w./-]+)@[0-9a-f]{40}\s+#\s*(?<version>v\d+(?:\.\d+){0,2})/g
const RUNNER = /^(?<name>[a-z]+)-(?<version>\d+\.\d+)$/

export interface RepositoryFiles {
	packageJson: string
	dockerfile: string
	nvmrc: string
	/** The compose files, by name. */
	compose: Record<string, string>
	workflows: readonly Workflow[]
}

/**
 * Everything the repository gives Renovate to follow: the packages of package.json, with the
 * forced versions, the package manager and the Node line; the images of the Dockerfile and of
 * the compose files; the Node of .nvmrc; the actions and the runners of the workflows.
 */
export function followedDependencies(files: RepositoryFiles): Followed[] {
	const followed: Followed[] = []
	const manifest: unknown = JSON.parse(files.packageJson)
	const section = (name: string): [string, string][] => {
		const entries = isRecord(manifest) && isRecord(manifest[name]) ? Object.entries(manifest[name]) : []
		return entries.flatMap(([key, value]): [string, string][] => (typeof value === 'string' ? [[key, value]] : []))
	}

	for (const depType of ['dependencies', 'devDependencies', 'overrides'])
		for (const [name, version] of section(depType))
			followed.push({ file: 'package.json', name, manager: 'bun', datasource: 'npm', depType, version })
	const packageManager = isRecord(manifest) ? /^([^@]+)@(.+)$/.exec(String(manifest.packageManager ?? '')) : null
	if (packageManager)
		followed.push({
			file: 'package.json',
			name: packageManager[1] ?? '',
			manager: 'bun',
			datasource: 'npm',
			depType: 'packageManager',
			version: packageManager[2] ?? '',
		})
	for (const [name, version] of section('engines'))
		followed.push({
			file: 'package.json',
			name,
			manager: 'bun',
			datasource: name === 'node' ? 'node-version' : 'npm',
			depType: 'engines',
			version,
		})

	const { stages } = readDockerfile(files.dockerfile)
	const stageNames = stages.flatMap(stage => (stage.name ? [stage.name] : []))
	for (const [index, stage] of stages.entries())
		if (!stageNames.includes(stage.image))
			followed.push({
				file: 'Dockerfile',
				name: stage.image,
				manager: 'dockerfile',
				datasource: 'docker',
				depType: index === stages.length - 1 ? 'final' : 'stage',
				version: stage.tag ?? '',
			})

	for (const [file, text] of Object.entries(files.compose)) {
		const document: unknown = Bun.YAML.parse(text)
		const services = isRecord(document) && isRecord(document.services) ? Object.values(document.services) : []
		for (const service of services) {
			const image = isRecord(service) ? IMAGE.exec(String(service.image ?? ''))?.groups : undefined
			if (image)
				followed.push({
					file,
					name: image.name ?? '',
					manager: 'docker-compose',
					datasource: 'docker',
					depType: '',
					version: image.tag ?? '',
				})
		}
	}

	const node = files.nvmrc.trim()
	if (node !== '')
		followed.push({
			file: '.nvmrc',
			name: 'node',
			manager: 'nvm',
			datasource: 'node-version',
			depType: '',
			version: node,
		})

	for (const workflow of files.workflows) {
		for (const { groups } of workflow.text.matchAll(PINNED_ACTION))
			followed.push({
				file: workflow.file,
				name: groups?.name ?? '',
				manager: 'github-actions',
				datasource: 'github-tags',
				depType: 'action',
				version: groups?.version ?? '',
			})
		const jobs = isRecord(workflow.document) && isRecord(workflow.document.jobs) ? workflow.document.jobs : {}
		for (const job of Object.values(jobs)) {
			const runner = RUNNER.exec(isRecord(job) ? String(job['runs-on'] ?? '') : '')?.groups
			if (runner)
				followed.push({
					file: workflow.file,
					name: runner.name ?? '',
					manager: 'github-actions',
					datasource: 'github-runners',
					depType: 'github-runner',
					version: runner.version ?? '',
				})
		}
	}
	return followed
}

/* ------------------------------------------------------------------------------------------
 * Reading the package rules the way Renovate applies them
 * ---------------------------------------------------------------------------------------- */

export type PackageRule = Record<string, unknown>
export type RenovateConfig = Record<string, unknown> & { packageRules?: PackageRule[] }

/** `!/^0/` and `/^(24|26)\./i`: a pattern written between slashes is a regular expression, `!` negates it. */
const REGEX_PATTERN = /^(?<negated>!?)\/(?<source>.*)\/(?<flags>i?)$/s

function regexPredicate(pattern: string): ((input: string) => boolean) | undefined {
	const parts = REGEX_PATTERN.exec(pattern)?.groups
	if (!parts) return undefined
	const expression = new RegExp(parts.source ?? '', parts.flags)
	return input => expression.test(input) !== (parts.negated === '!')
}

/** A glob as Renovate reads one: `*` stays inside a path segment, `**` crosses them, and case is ignored. */
function globPredicate(pattern: string): (input: string) => boolean {
	const negated = pattern.startsWith('!')
	const source = (negated ? pattern.slice(1) : pattern)
		.split(/(\*\*|\*)/)
		.map(part => (part === '**' ? '.*' : part === '*' ? '[^/]*' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')))
		.join('')
	const expression = new RegExp(`^${source}$`, 'i')
	return input => expression.test(input) !== negated
}

/**
 * Renovate's own rule for a list of patterns: one of the positive patterns matches, when
 * there is any, and none of the negated ones excludes.
 */
export function matchesPatterns(input: string, patterns: readonly string[]): boolean {
	if (patterns.length === 0) return false
	const test = (pattern: string) => pattern === '*' || (regexPredicate(pattern) ?? globPredicate(pattern))(input)
	const positive = patterns.filter(pattern => !pattern.startsWith('!'))
	const negative = patterns.filter(pattern => pattern.startsWith('!'))
	return (positive.length === 0 || positive.some(test)) && negative.every(test)
}

/** What a matcher needs to know about one update. `dependency` is absent for the monthly refresh of the lockfile. */
interface Update {
	dependency: Followed | undefined
	updateType: UpdateType
}

/**
 * The matchers the guard knows how to read, each one as Renovate evaluates it: a dependency
 * that lacks what the matcher looks at does not match.
 */
const MATCHERS: Record<string, (value: unknown, update: Update) => boolean> = {
	matchPackageNames: (value, { dependency }) =>
		dependency !== undefined && matchesPatterns(dependency.name, strings(value)),
	matchDatasources: (value, { dependency }) =>
		dependency !== undefined && matchesPatterns(dependency.datasource, strings(value)),
	matchManagers: (value, { dependency }) =>
		dependency !== undefined && matchesPatterns(dependency.manager, strings(value)),
	matchDepTypes: (value, { dependency }) =>
		dependency !== undefined && dependency.depType !== '' && matchesPatterns(dependency.depType, strings(value)),
	matchUpdateTypes: (value, { updateType }) => matchesPatterns(updateType, strings(value)),
	matchCurrentVersion: (value, { dependency }) =>
		dependency !== undefined && (regexPredicate(String(value))?.(dependency.version) ?? false),
}

/** What a package rule may set. Anything else must be added here, with its check, before it is used. */
const RULE_SETTINGS = [
	'description',
	'groupName',
	'automerge',
	'automergeType',
	'platformAutomerge',
	'dependencyDashboardApproval',
	'allowedVersions',
	'addLabels',
	'enabled',
] as const

/** The values each matcher may hold: a name Renovate does not know matches nothing, and nobody notices. */
const MATCHER_VALUES: Record<string, readonly string[] | undefined> = {
	matchUpdateTypes: UPDATE_TYPES,
	matchManagers: MANAGERS,
	matchDatasources: DATASOURCES,
	matchDepTypes: DEP_TYPES,
}

const rulesOf = (config: RenovateConfig): PackageRule[] =>
	Array.isArray(config.packageRules) ? config.packageRules.filter(isRecord) : []

const ruleLabel = (rule: PackageRule, index: number): string =>
	typeof rule.groupName === 'string' ? `règle « ${rule.groupName} »` : `règle n° ${index + 1}`

/** True when every matcher of the rule matches the update. A matcher the guard cannot read matches nothing. */
function ruleMatches(rule: PackageRule, update: Update): boolean {
	return Object.entries(rule)
		.filter(([key]) => key.startsWith('match'))
		.every(([key, value]) => MATCHERS[key]?.(value, update) ?? false)
}

/** What Renovate would do with one update, once every matching rule has been applied in order. */
export interface Outcome {
	automerge: boolean
	automergeType: unknown
	platformAutomerge: unknown
	dependencyDashboardApproval: boolean
	enabled: boolean
	groupName: string | undefined
	allowedVersions: string | undefined
}

/**
 * The settings of one update. Renovate starts from the settings of the file (nothing is merged
 * alone unless a rule says so), then applies every package rule that matches, in the order of
 * the file: a later rule overrides an earlier one. The monthly refresh of the lockfile also
 * takes the settings of `lockFileMaintenance`, before the rules.
 */
export function outcomeFor(config: RenovateConfig, dependency: Followed | undefined, updateType: UpdateType): Outcome {
	const settings: Record<string, unknown> = { ...config }
	if (updateType === 'lockFileMaintenance' && isRecord(config.lockFileMaintenance))
		Object.assign(settings, config.lockFileMaintenance)
	for (const rule of rulesOf(config))
		if (ruleMatches(rule, { dependency, updateType }))
			for (const [key, value] of Object.entries(rule)) if (!key.startsWith('match')) settings[key] = value
	return {
		automerge: settings.automerge === true,
		automergeType: settings.automergeType,
		platformAutomerge: settings.platformAutomerge,
		dependencyDashboardApproval: settings.dependencyDashboardApproval === true,
		enabled: settings.enabled !== false,
		groupName: typeof settings.groupName === 'string' ? settings.groupName : undefined,
		allowedVersions: typeof settings.allowedVersions === 'string' ? settings.allowedVersions : undefined,
	}
}

/* ------------------------------------------------------------------------------------------
 * The frozen settings
 * ---------------------------------------------------------------------------------------- */

/**
 * The settings of the file, frozen here: changing one is changing this table in the same
 * commit. The presets are frozen as a whole: a preset can set anything, and the guard only
 * reads this file.
 */
export const FROZEN_SETTINGS: Readonly<Record<string, unknown>> = {
	$schema: 'https://docs.renovatebot.com/renovate-schema.json',
	extends: ['config:recommended', ':semanticCommits', 'helpers:pinGitHubActionDigests'],
	timezone: 'Europe/Paris',
	schedule: ['before 7am on monday'],
	minimumReleaseAge: '7 days',
	internalChecksFilter: 'strict',
	prConcurrentLimit: 3,
	prHourlyLimit: 2,
	rangeStrategy: 'pin',
	dependencyDashboard: true,
	osvVulnerabilityAlerts: true,
}

/** What a security fix gets: proposed at once, without the 7 days, and never merged alone. */
export const FROZEN_VULNERABILITY_ALERTS: Readonly<Record<string, unknown>> = {
	enabled: true,
	schedule: ['at any time'],
	minimumReleaseAge: null,
	automerge: false,
	labels: ['securite'],
}

/** The monthly refresh of bun.lock. It has no `automerge`: indirect dependencies skip the 7 days. */
export const FROZEN_LOCK_FILE_MAINTENANCE: Readonly<Record<string, unknown>> = {
	enabled: true,
	schedule: ['before 7am on the first day of the month'],
}

/** Why a setting that looks harmless is refused, for the ones worth a sentence. */
const REFUSED_SETTINGS: Readonly<Record<string, string>> = {
	automerge:
		'la fusion automatique ne se règle pas pour tout le dépôt : seule la première règle la donne, aux mineures, correctifs et empreintes',
	ignoreTests: 'Renovate fusionnerait sans attendre les checks',
	baseBranchPatterns:
		'Renovate ne suit que la branche par défaut : cette configuration reste sans effet tant que main porte l’ancien site',
	ignoreDeps: 'un paquet ignoré ne reçoit plus ses correctifs',
	ignorePaths: 'un fichier ignoré n’est plus suivi',
	enabledManagers: 'un fichier hors de la liste n’est plus suivi',
	minimumReleaseAgeBehaviour: 'une version sans date de publication doit attendre, c’est le réglage par défaut',
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
const written = (value: unknown): string => (value === undefined ? 'rien' : JSON.stringify(value))

function frozenProblems(
	where: string,
	actual: Record<string, unknown>,
	frozen: Readonly<Record<string, unknown>>,
	otherKeys: readonly string[]
): string[] {
	const problems: string[] = []
	for (const [key, expected] of Object.entries(frozen))
		if (!(key in actual) || !same(actual[key], expected))
			problems.push(`${where}« ${key} » doit valoir ${written(expected)}, pas ${written(actual[key])}.`)
	for (const key of Object.keys(actual))
		if (!(key in frozen) && !otherKeys.includes(key))
			problems.push(
				`${where}« ${key} » : ${REFUSED_SETTINGS[key] ?? 'un réglage que la garde ne connaît pas. L’ajouter à la garde avec son contrôle, dans le même commit'}.`
			)
	return problems
}

/**
 * The settings of the file are the frozen ones, no more and no less: the 7 days, the pinned
 * versions, the schedule, the limits, the security fixes, the monthly refresh of the lockfile.
 */
export function settingsProblems(config: RenovateConfig): string[] {
	const alerts = isRecord(config.vulnerabilityAlerts) ? config.vulnerabilityAlerts : {}
	const lockFile = isRecord(config.lockFileMaintenance) ? config.lockFileMaintenance : {}
	return [
		...frozenProblems('', config, FROZEN_SETTINGS, [
			'description',
			'vulnerabilityAlerts',
			'lockFileMaintenance',
			'packageRules',
		]),
		...frozenProblems('vulnerabilityAlerts : ', alerts, FROZEN_VULNERABILITY_ALERTS, ['description']),
		...frozenProblems('lockFileMaintenance : ', lockFile, FROZEN_LOCK_FILE_MAINTENANCE, ['description']),
	]
}

/**
 * Every package rule can be read by the guard: it says why it exists, it only uses the
 * matchers and the settings this file knows, and a rule that merges alone does it through a
 * pull request GitHub merges behind the required checks.
 */
export function ruleProblems(config: RenovateConfig): string[] {
	const problems: string[] = []
	if (!Array.isArray(config.packageRules) || config.packageRules.some(rule => !isRecord(rule)))
		return ['« packageRules » doit être une liste de règles.']

	for (const [index, rule] of rulesOf(config).entries()) {
		const label = ruleLabel(rule, index)
		if (typeof rule.description !== 'string' || rule.description.trim() === '')
			problems.push(`${label} : une règle dit pourquoi elle existe (« description »).`)

		const matchers = Object.keys(rule).filter(key => key.startsWith('match'))
		if (matchers.length === 0) problems.push(`${label} : sans « match… », elle s’applique à tout ce que Renovate suit.`)
		for (const key of matchers) {
			if (!(key in MATCHERS)) {
				problems.push(`${label} : « ${key} » est un filtre que la garde ne sait pas lire.`)
				continue
			}
			if (key === 'matchCurrentVersion') {
				if (regexPredicate(String(rule[key])) === undefined)
					problems.push(`${label} : « matchCurrentVersion » s’écrit comme une expression entre barres obliques.`)
				continue
			}
			const values = strings(rule[key])
			if (!Array.isArray(rule[key]) || values.length === 0)
				problems.push(`${label} : « ${key} » doit être une liste de noms.`)
			const known = MATCHER_VALUES[key]
			for (const value of values)
				if (known !== undefined && !known.includes(value))
					problems.push(`${label} : « ${key} » ne connaît pas « ${value} », qui ne correspondrait à rien.`)
		}

		for (const key of Object.keys(rule))
			if (!key.startsWith('match') && !(RULE_SETTINGS as readonly string[]).includes(key))
				problems.push(
					`${label} : « ${key} » : ${REFUSED_SETTINGS[key] ?? 'un réglage que la garde ne connaît pas. L’ajouter à la garde avec son contrôle, dans le même commit'}.`
				)

		if (rule.automerge === true && (rule.automergeType !== 'pr' || rule.platformAutomerge !== true))
			problems.push(
				`${label} : une fusion automatique passe par une pull request que GitHub fusionne derrière les checks requis (« automergeType: pr », « platformAutomerge: true »).`
			)
	}
	return problems
}

/* ------------------------------------------------------------------------------------------
 * What is never merged alone
 * ---------------------------------------------------------------------------------------- */

/** The only updates a rule may merge alone, behind the required check. */
const MERGED_ALONE: readonly UpdateType[] = ['minor', 'patch', 'digest']

/** A family of packages that moves together, under one group name. */
interface Family {
	group: string
	/** The patterns of the names, written as in renovate.json. */
	names: readonly string[]
	/** Limits the family to these datasources, when a name alone would say too much (`node`, `postgres`). */
	datasources?: readonly string[]
	/** Why the family is never merged alone. Absent: it may be, behind the required check. */
	neverAlone?: string
	/** Why its members move together. */
	together: string
}

/** The families of the repository. A dependency that belongs to one is checked against it. */
export const FAMILIES: readonly Family[] = [
	{
		group: 'payload',
		names: ['payload', '@payloadcms/**'],
		neverAlone: 'Payload change le schéma et les fichiers générés',
		together: 'chaque paquet @payloadcms exige la version exacte de payload',
	},
	{
		group: 'next',
		names: ['next', '@next/**'],
		neverAlone: 'Next porte tout le rendu du site',
		together: 'les paquets de Next suivent sa version',
	},
	{
		group: 'biome',
		names: ['@biomejs/**'],
		neverAlone: 'Biome monte en même temps que dans le dépôt de référence',
		together: 'une seule version de Biome',
	},
	{
		group: 'playwright',
		names: ['@playwright/**', 'playwright', 'playwright-core', '@axe-core/playwright', 'mcr.microsoft.com/playwright'],
		neverAlone: 'Playwright reste à la version du dépôt de référence',
		together: 'les navigateurs sont ceux de la version de @playwright/test',
	},
	{
		group: 'postgres',
		names: ['postgres'],
		datasources: ['docker'],
		neverAlone: 'la version de PostgreSQL est celle de la base de prod',
		together: 'la base de développement et celle du banc de test sont la même image',
	},
	{
		group: 'react',
		names: ['react', 'react-dom', '@types/react', '@types/react-dom'],
		together: 'react-dom exige la version de react',
	},
	{
		group: 'tailwind',
		names: ['tailwindcss', '@tailwindcss/**'],
		together: 'le plugin PostCSS exige la version exacte de tailwindcss',
	},
	{
		group: 'node',
		names: ['node'],
		datasources: ['docker', 'node-version'],
		together: 'la garde C04 exige le même Node dans .nvmrc et dans le Dockerfile',
	},
	{
		group: 'bun',
		names: ['bun', 'oven/bun', '@types/bun'],
		neverAlone: 'bun installe, construit et teste, et Payload ne le nomme pas parmi ses outils',
		together: 'la garde C04 exige le même bun dans packageManager et dans le Dockerfile',
	},
]

/** Members a family will have one day, checked today: a rule must hold for the next package too. */
export const FUTURE_MEMBERS: readonly Followed[] = [
	{
		file: 'exemple',
		name: '@payloadcms/plugin-seo',
		manager: 'bun',
		datasource: 'npm',
		depType: 'dependencies',
		version: '3.90.2',
	},
	{
		file: 'exemple',
		name: '@next/third-parties',
		manager: 'bun',
		datasource: 'npm',
		depType: 'dependencies',
		version: '16.3.8',
	},
	{
		file: 'exemple',
		name: 'mcr.microsoft.com/playwright',
		manager: 'dockerfile',
		datasource: 'docker',
		depType: 'stage',
		version: 'v1.59.1-noble',
	},
	// A package nobody has a rule for: it shows what the rules do by default.
	{
		file: 'exemple',
		name: 'paquet-sans-regle',
		manager: 'bun',
		datasource: 'npm',
		depType: 'dependencies',
		version: '1.2.3',
	},
]

const familyOf = (dependency: Followed): Family | undefined =>
	FAMILIES.find(
		family =>
			matchesPatterns(dependency.name, family.names) &&
			(family.datasources === undefined || family.datasources.includes(dependency.datasource))
	)

/** Why this dependency is never merged alone, whatever the update, or nothing when it may be. */
function neverAlone(dependency: Followed): string | undefined {
	if (dependency.depType === 'engines') return undefined
	if (dependency.depType === 'overrides') return 'une version forcée sort de la plage que Payload déclare'
	if (dependency.manager === 'github-actions') return 'les avis de sécurité du dépôt d’une action se relisent à la main'
	return familyOf(dependency)?.neverAlone
}

const label = (dependency: Followed): string => `${dependency.name} (${dependency.file})`

/**
 * Nothing is merged without anyone, except a minor, a patch or a digest of a package that has
 * no reason to wait, at a version that is not a 0.x. Payload, Next, Biome and Playwright never
 * are, nor a major, nor the monthly refresh of the lockfile.
 */
export function mergeProblems(config: RenovateConfig, followed: readonly Followed[]): string[] {
	const problems = new Set<string>()
	for (const dependency of [...followed, ...FUTURE_MEMBERS])
		for (const updateType of UPDATE_TYPES) {
			if (updateType === 'lockFileMaintenance') continue
			const outcome = outcomeFor(config, dependency, updateType)
			if (!outcome.enabled) continue

			if (updateType === 'major' && !outcome.dependencyDashboardApproval)
				problems.add(`${label(dependency)} : une version majeure serait proposée sans approbation au tableau de bord.`)
			if (!outcome.automerge) continue

			const reason = neverAlone(dependency)
			if (reason !== undefined)
				problems.add(
					`${label(dependency)} serait fusionné seul (${updateType}) : ${reason}, il n’est jamais fusionné seul.`
				)
			else if (!MERGED_ALONE.includes(updateType))
				problems.add(
					`${label(dependency)} serait fusionné seul (${updateType}) : seuls une mineure, un correctif ou une empreinte peuvent l’être.`
				)
			else if (/^v?0\./.test(dependency.version))
				problems.add(
					`${label(dependency)} serait fusionné seul (${updateType}) : une version 0.x peut casser à chaque mineure.`
				)
			if (outcome.automergeType !== 'pr' || outcome.platformAutomerge !== true)
				problems.add(
					`${label(dependency)} serait fusionné seul (${updateType}) sans passer par une pull request que GitHub fusionne derrière les checks requis.`
				)
		}

	const lockFile = outcomeFor(config, undefined, 'lockFileMaintenance')
	if (lockFile.automerge)
		problems.add(
			'Le recalcul mensuel de bun.lock serait fusionné seul : les dépendances indirectes y montent sans les 7 jours d’attente.'
		)
	return [...problems]
}

/* ------------------------------------------------------------------------------------------
 * What moves together, what is followed, what is capped
 * ---------------------------------------------------------------------------------------- */

/**
 * Every dependency of a family is in the group of its family: one pull request moves them
 * all. Without it, the Node of .nvmrc and the Node of the Dockerfile would come in two pull
 * requests, each one red on the guard C04.
 */
export function groupProblems(config: RenovateConfig, followed: readonly Followed[]): string[] {
	const problems = new Set<string>()
	for (const dependency of [...followed, ...FUTURE_MEMBERS]) {
		if (dependency.depType === 'engines') continue
		const family = familyOf(dependency)
		const group = outcomeFor(config, dependency, 'minor').groupName
		if (family !== undefined && group !== family.group)
			problems.add(
				`${label(dependency)} doit monter dans le groupe « ${family.group} », pas ${group === undefined ? 'seul' : `dans « ${group} »`} : ${family.together}.`
			)
		if (family === undefined && group !== undefined && FAMILIES.some(known => known.group === group))
			problems.add(`${label(dependency)} monte dans le groupe « ${group} » sans en faire partie.`)
	}
	return [...problems]
}

/**
 * Everything the repository holds is followed. One exception, on purpose: `engines.node` is
 * a line (« 24.x ») the guard C04 keeps in step with .nvmrc, and Renovate would pin it.
 */
export function followProblems(config: RenovateConfig, followed: readonly Followed[]): string[] {
	const problems = new Set<string>()
	for (const dependency of [...followed, ...FUTURE_MEMBERS]) {
		const types = UPDATE_TYPES.filter(updateType => updateType !== 'lockFileMaintenance')
		const followedFor = types.filter(updateType => outcomeFor(config, dependency, updateType).enabled)
		if (dependency.depType === 'engines') {
			if (followedFor.length > 0)
				problems.add(
					`${label(dependency)} : « engines » ne doit pas être suivi. Renovate le figerait sur une version exacte, et la garde C04 attend une ligne (« 24.x »).`
				)
		} else if (followedFor.length < types.length) problems.add(`${label(dependency)} n’est plus suivi par Renovate.`)
	}
	return [...problems]
}

/** A version limit, as the versions it must let through and the ones it must stop. */
interface Cap {
	/** Who the limit holds: a name, and where Renovate reads it. */
	holds: readonly Pick<Followed, 'name' | 'manager' | 'datasource'>[]
	allowed: readonly string[]
	refused: readonly string[]
	why: string
}

/** The version limits of the repository. Lifting one means removing its line here, with the reason gone. */
export const CAPS: readonly Cap[] = [
	{
		holds: [
			{ name: 'next', manager: 'bun', datasource: 'npm' },
			{ name: '@next/third-parties', manager: 'bun', datasource: 'npm' },
		],
		allowed: ['16.3.9', '16.3.20'],
		refused: ['16.4.0', '16.4.7', '17.0.0'],
		why: 'Next reste en 16.3 tant qu’une version 3.x de Payload ne porte pas le correctif des noms d’erreurs (registre, repère next-16-3)',
	},
	{
		holds: [{ name: 'typescript', manager: 'bun', datasource: 'npm' }],
		allowed: ['6.0.4', '6.1.0'],
		refused: ['7.0.0', '7.0.2'],
		why: 'TypeScript reste en 6',
	},
	{
		holds: [
			{ name: 'node', manager: 'dockerfile', datasource: 'docker' },
			{ name: 'node', manager: 'nvm', datasource: 'node-version' },
		],
		allowed: ['24.22.0', '26.1.0'],
		refused: ['25.0.0', '27.0.0'],
		why: 'Node reste sur une ligne à support long',
	},
]

/** True when the limit lets the version through. No limit lets everything through. */
export function allows(allowedVersions: string | undefined, version: string): boolean {
	if (allowedVersions === undefined) return true
	return regexPredicate(allowedVersions)?.(version) ?? Bun.semver.satisfies(version, allowedVersions)
}

/** Every version limit is in place, and stops what it is there to stop without stopping the rest. */
export function capProblems(config: RenovateConfig): string[] {
	const problems: string[] = []
	for (const cap of CAPS)
		for (const held of cap.holds) {
			const dependency: Followed = { ...held, file: 'exemple', depType: '', version: '' }
			const who = `${held.name} (${held.manager})`
			// A limit is applied before Renovate knows the kind of update: a rule that names one would not hold it.
			const limits = new Set(UPDATE_TYPES.map(updateType => outcomeFor(config, dependency, updateType).allowedVersions))
			if (limits.size > 1) problems.push(`${who} : la limite de version ne doit pas dépendre du type de mise à jour.`)
			for (const limit of limits) {
				for (const version of cap.refused)
					if (allows(limit, version)) problems.push(`${who} : la version ${version} passerait. ${cap.why}.`)
				for (const version of cap.allowed)
					if (!allows(limit, version)) problems.push(`${who} : la version ${version} serait refusée, sans raison.`)
			}
		}
	return [...new Set(problems)]
}

/** Everything that is wrong with the configuration: empty when Renovate may be given this file. */
export function renovateProblems(config: RenovateConfig, followed: readonly Followed[]): string[] {
	const unreadable = ruleProblems(config)
	// A rule the guard cannot read makes every answer below a guess: it is reported with the settings, and nothing else.
	if (unreadable.length > 0) return [...settingsProblems(config), ...unreadable]
	return [
		...settingsProblems(config),
		...mergeProblems(config, followed),
		...groupProblems(config, followed),
		...followProblems(config, followed),
		...capProblems(config),
	]
}
