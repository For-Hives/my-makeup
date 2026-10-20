import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { CONFIG_FILE, VALIDATOR_IMAGE, validatorArguments } from '../../scripts/ci/renovate-validate'
import { readWorkflow } from '../outils/garde-fous-ci'
import {
	allows,
	capProblems,
	type Followed,
	followedDependencies,
	followProblems,
	groupProblems,
	matchesPatterns,
	mergeProblems,
	outcomeFor,
	type PackageRule,
	type RenovateConfig,
	renovateProblems,
	ruleProblems,
	settingsProblems,
	UPDATE_TYPES,
	type UpdateType,
} from '../outils/renovate'

/**
 * The guard of renovate.json (ticket 035): the rules Renovate will follow once this branch
 * is the default one. Renovate reads its configuration on the default branch only, so nothing
 * here runs before the switch, and nobody would see a rule that went wrong: this test does.
 *
 * Every check is run on the real file, where it finds nothing, and on a faulty example made
 * from that file, where it must find the fault.
 *
 * The file itself is validated by Renovate with `bun run renovate:valide`, after every change
 * (docs/qualite.md, « Renovate »). What the guard answers was compared once with Renovate's
 * own engine, version 44.140.0, on 14/10/2026: the same answer for every dependency of the
 * repository and every kind of update.
 */

const ROOT = path.resolve(import.meta.dir, '../..')
const read = (file: string): string => readFileSync(path.join(ROOT, file), 'utf8')

const WORKFLOWS = '.github/workflows'
const COMPOSE_FILES = ['docker-compose.yml', 'compose.test.yml']

const config = JSON.parse(read(CONFIG_FILE)) as RenovateConfig
const packageJson = JSON.parse(read('package.json')) as Record<string, Record<string, string> | undefined>
const followed = followedDependencies({
	packageJson: read('package.json'),
	dockerfile: read('Dockerfile'),
	nvmrc: read('.nvmrc'),
	compose: Object.fromEntries(COMPOSE_FILES.map(file => [file, read(file)])),
	workflows: readdirSync(path.join(ROOT, WORKFLOWS))
		.filter(file => /\.ya?ml$/.test(file))
		.map(file => readWorkflow(`${WORKFLOWS}/${file}`, read(`${WORKFLOWS}/${file}`))),
})

/** The real configuration with one thing changed. Fails when the change changes nothing. */
function broken(change: (copy: RenovateConfig) => void): RenovateConfig {
	const copy = structuredClone(config)
	change(copy)
	if (JSON.stringify(copy) === JSON.stringify(config))
		throw new Error('faulty example out of date: the change changes nothing')
	return copy
}

const rules = (copy: RenovateConfig): PackageRule[] => copy.packageRules ?? []

/** A rule of the real file, found by what it says. Fails when it is gone: the faulty example is out of date. */
function rule(copy: RenovateConfig, find: (candidate: PackageRule) => boolean): PackageRule {
	const found = rules(copy).find(find)
	if (!found) throw new Error('faulty example out of date: the rule it changes is gone')
	return found
}
const group = (copy: RenovateConfig, name: string) => rule(copy, candidate => candidate.groupName === name)
const holding = (copy: RenovateConfig, key: string, value: string) =>
	rule(copy, candidate => JSON.stringify(candidate[key] ?? '').includes(value))
/** The first rule: the only one that lets something be merged alone. */
const merging = (copy: RenovateConfig) => rule(copy, candidate => candidate.automerge === true)
/** The rule of the majors: the one that asks for an approval on the dashboard. */
const majors = (copy: RenovateConfig) => rule(copy, candidate => candidate.dependencyDashboardApproval === true)

/** The dependency of the repository with this name, as it is written in this file. */
function dependency(name: string, file = 'package.json'): Followed {
	const found = followed.find(candidate => candidate.name === name && candidate.file === file)
	if (!found) throw new Error(`${name} is not in ${file} any more`)
	return found
}
const mergedAlone = (name: string, updateType: UpdateType, file?: string): boolean =>
	outcomeFor(config, dependency(name, file), updateType).automerge

describe('what Renovate follows in this repository', () => {
	test('every package of package.json is read, with the forced versions, bun and the Node line', () => {
		const inFile = (depType: string) =>
			followed.filter(found => found.file === 'package.json' && found.depType === depType).map(found => found.name)

		for (const section of ['dependencies', 'devDependencies', 'overrides'])
			expect(inFile(section)).toEqual(Object.keys(packageJson[section] ?? {}))
		expect(inFile('overrides').length).toBeGreaterThan(0)
		expect(dependency('bun')).toMatchObject({ depType: 'packageManager', datasource: 'npm', version: '1.3.14' })
		expect(dependency('node')).toMatchObject({ depType: 'engines', datasource: 'node-version', version: '24.x' })
	})

	test('the images, the Node of .nvmrc, the actions and the runner are read too', () => {
		const names = (file: string) => [...new Set(followed.filter(found => found.file === file).map(found => found.name))]

		expect(names('Dockerfile')).toEqual(['oven/bun', 'node'])
		expect(names('docker-compose.yml')).toEqual(['postgres'])
		expect(names('compose.test.yml')).toEqual(['postgres', 'axllent/mailpit', 'adobe/s3mock', 'oven/bun'])
		expect(names('.nvmrc')).toEqual(['node'])
		expect(names(`${WORKFLOWS}/ci.yml`)).toEqual([
			'actions/checkout',
			'actions/setup-node',
			'oven-sh/setup-bun',
			'actions/upload-artifact',
			'ubuntu',
		])
		expect(dependency('node', 'Dockerfile').version).toBe(`${read('.nvmrc').trim()}-bookworm-slim`)
		expect(dependency('axllent/mailpit', 'compose.test.yml').version).toMatch(/^v\d+\.\d+\.\d+$/)
	})
})

describe('the guard reads a rule the way Renovate applies it', () => {
	test.each([
		['an exact name', 'next', ['next', '@next/**'], true],
		['a scope', '@payloadcms/db-postgres', ['payload', '@payloadcms/**'], true],
		['a name that only starts the same', 'next-auth', ['next', '@next/**'], false],
		['another scope', '@nextui/react', ['next', '@next/**'], false],
		['a name with a slash, for one star', 'oven/bun', ['oven/*'], true],
		['two segments, for one star', 'a/b/c', ['a/*'], false],
		['an expression', '24.22.0', ['/^(24|26)\\./'], true],
		['an expression that does not match', '25.1.0', ['/^(24|26)\\./'], false],
		['a negated expression', '0.35.5', ['!/^v?0\\./'], false],
		['a negated expression, on a version with its v', 'v0.9.0', ['!/^v?0\\./'], false],
		['a negated expression that lets through', 'v1.31.4', ['!/^v?0\\./'], true],
		['a positive pattern and an exclusion', 'node', ['/node$/', '!kindest/node'], true],
		['the exclusion itself', 'kindest/node', ['/node$/', '!kindest/node'], false],
		['case is ignored, as Renovate does', 'Next', ['next'], true],
		['an empty list', 'next', [], false],
	])('%s', (_case, input, patterns, expected) => {
		expect(matchesPatterns(input, patterns)).toBe(expected)
	})

	test('every rule that matches is applied, in the order of the file: the later one wins', () => {
		const zod = dependency('zod')
		const first = { description: 'un', matchPackageNames: ['zod'], automerge: true, groupName: 'un' }
		const second = { description: 'deux', matchUpdateTypes: ['patch'], automerge: false }

		expect(outcomeFor({ packageRules: [first, second] }, zod, 'patch')).toMatchObject({
			automerge: false,
			groupName: 'un',
		})
		expect(outcomeFor({ packageRules: [second, first] }, zod, 'patch')).toMatchObject({
			automerge: true,
			groupName: 'un',
		})
		expect(outcomeFor({ packageRules: [first, second] }, zod, 'minor')).toMatchObject({ automerge: true })
		expect(outcomeFor({ packageRules: [] }, zod, 'patch')).toMatchObject({ automerge: false, enabled: true })
	})

	test('a rule needs all its matchers, and a matcher finds nothing on a dependency that lacks what it reads', () => {
		const both = { description: 'x', matchDatasources: ['docker'], matchPackageNames: ['node'], groupName: 'node' }
		const byPlace = { description: 'x', matchDepTypes: ['overrides'], groupName: 'forcees' }

		expect(outcomeFor({ packageRules: [both] }, dependency('node', 'Dockerfile'), 'minor').groupName).toBe('node')
		expect(outcomeFor({ packageRules: [both] }, dependency('@types/node'), 'minor').groupName).toBeUndefined()
		expect(outcomeFor({ packageRules: [byPlace] }, dependency('undici'), 'minor').groupName).toBe('forcees')
		// An image of a compose file has no place (`depType`): a rule that names one does not hold it.
		expect(outcomeFor({ packageRules: [byPlace] }, dependency('postgres', 'compose.test.yml'), 'minor').groupName).toBe(
			undefined
		)
		// The monthly refresh of the lockfile is no dependency: a rule that names packages does not hold it.
		expect(outcomeFor({ packageRules: [both] }, undefined, 'lockFileMaintenance').groupName).toBeUndefined()
	})
})

describe('renovate.json: the rules Renovate will follow', () => {
	test('the configuration of the repository holds every rule', () => {
		expect(renovateProblems(config, followed)).toEqual([])
		expect(rules(config).length).toBeGreaterThan(10)
	})

	describe('the settings: 7 days of wait, pinned versions, a quiet schedule', () => {
		test('they are the frozen ones', () => {
			expect(settingsProblems(config)).toEqual([])
		})

		test.each([
			[
				'a shorter wait',
				(copy: RenovateConfig) => {
					copy.minimumReleaseAge = '3 days'
				},
				'« minimumReleaseAge » doit valoir "7 days", pas "3 days"',
			],
			[
				'no wait at all',
				(copy: RenovateConfig) => {
					delete copy.minimumReleaseAge
				},
				'« minimumReleaseAge » doit valoir "7 days", pas rien',
			],
			[
				'a version proposed before its wait is over',
				(copy: RenovateConfig) => {
					copy.internalChecksFilter = 'none'
				},
				'« internalChecksFilter » doit valoir "strict"',
			],
			[
				'a version without a date let through',
				(copy: RenovateConfig) => {
					copy.minimumReleaseAgeBehaviour = 'timestamp-optional'
				},
				'« minimumReleaseAgeBehaviour » : une version sans date de publication doit attendre',
			],
			[
				'ranges instead of exact versions',
				(copy: RenovateConfig) => {
					copy.rangeStrategy = 'bump'
				},
				'« rangeStrategy » doit valoir "pin"',
			],
			[
				'one more preset',
				(copy: RenovateConfig) => {
					copy.extends = [...(copy.extends as string[]), ':automergeMinor']
				},
				'« extends » doit valoir ["config:recommended",":semanticCommits","helpers:pinGitHubActionDigests"]',
			],
			[
				'actions that are no longer pinned by their commit',
				(copy: RenovateConfig) => {
					copy.extends = ['config:recommended', ':semanticCommits']
				},
				'« extends » doit valoir',
			],
			[
				'updates at any time of the week',
				(copy: RenovateConfig) => {
					copy.schedule = ['at any time']
				},
				'« schedule » doit valoir ["before 7am on monday"]',
			],
			[
				'more pull requests at once',
				(copy: RenovateConfig) => {
					copy.prConcurrentLimit = 10
				},
				'« prConcurrentLimit » doit valoir 3, pas 10',
			],
			[
				'everything merged alone',
				(copy: RenovateConfig) => {
					copy.automerge = true
				},
				'« automerge » : la fusion automatique ne se règle pas pour tout le dépôt',
			],
			[
				'merges that do not wait for the checks',
				(copy: RenovateConfig) => {
					copy.ignoreTests = true
				},
				'« ignoreTests » : Renovate fusionnerait sans attendre les checks',
			],
			[
				'another branch followed',
				(copy: RenovateConfig) => {
					copy.baseBranchPatterns = ['main', 'v3']
				},
				'« baseBranchPatterns » : Renovate ne suit que la branche par défaut',
			],
			[
				'a package left out',
				(copy: RenovateConfig) => {
					copy.ignoreDeps = ['next']
				},
				'« ignoreDeps » : un paquet ignoré ne reçoit plus ses correctifs',
			],
			[
				'a setting nobody added to the guard',
				(copy: RenovateConfig) => {
					copy.separateMinorPatch = true
				},
				'« separateMinorPatch » : un réglage que la garde ne connaît pas',
			],
		])('red on %s', (_fault, change, expected) => {
			expect(renovateProblems(broken(change), followed).join('\n')).toContain(expected)
		})
	})

	describe('security fixes come at once, and the lockfile is refreshed once a month', () => {
		const alerts = (copy: RenovateConfig) => copy.vulnerabilityAlerts as Record<string, unknown>
		const lockFile = (copy: RenovateConfig) => copy.lockFileMaintenance as Record<string, unknown>

		test('a security fix skips the 7 days, at any time, and is never merged alone', () => {
			expect(alerts(config)).toMatchObject({ enabled: true, minimumReleaseAge: null, automerge: false })
			expect(config.osvVulnerabilityAlerts).toBe(true)
			expect(outcomeFor(config, undefined, 'lockFileMaintenance').automerge).toBe(false)
		})

		test.each([
			[
				'security fixes switched off',
				(copy: RenovateConfig) => {
					alerts(copy).enabled = false
				},
				'vulnerabilityAlerts : « enabled » doit valoir true',
			],
			[
				'a security fix that waits 7 days',
				(copy: RenovateConfig) => {
					delete alerts(copy).minimumReleaseAge
				},
				'vulnerabilityAlerts : « minimumReleaseAge » doit valoir null, pas rien',
			],
			[
				'a security fix kept for monday',
				(copy: RenovateConfig) => {
					alerts(copy).schedule = ['before 7am on monday']
				},
				'vulnerabilityAlerts : « schedule » doit valoir ["at any time"]',
			],
			[
				'a security fix merged alone, hours after its release',
				(copy: RenovateConfig) => {
					alerts(copy).automerge = true
				},
				'vulnerabilityAlerts : « automerge » doit valoir false, pas true',
			],
			[
				'the alerts of the second database switched off',
				(copy: RenovateConfig) => {
					copy.osvVulnerabilityAlerts = false
				},
				'« osvVulnerabilityAlerts » doit valoir true',
			],
			[
				'no security block at all',
				(copy: RenovateConfig) => {
					delete copy.vulnerabilityAlerts
				},
				'vulnerabilityAlerts : « automerge » doit valoir false, pas rien',
			],
			[
				'the monthly refresh of the lockfile merged alone',
				(copy: RenovateConfig) => {
					lockFile(copy).automerge = true
				},
				'Le recalcul mensuel de bun.lock serait fusionné seul',
			],
			[
				'the monthly refresh merged alone by a rule',
				(copy: RenovateConfig) => {
					rules(copy).push({
						description: 'x',
						matchUpdateTypes: ['lockFileMaintenance'],
						automerge: true,
						automergeType: 'pr',
						platformAutomerge: true,
					})
				},
				'Le recalcul mensuel de bun.lock serait fusionné seul',
			],
			[
				'no refresh of the lockfile',
				(copy: RenovateConfig) => {
					lockFile(copy).enabled = false
				},
				'lockFileMaintenance : « enabled » doit valoir true',
			],
		])('red on %s', (_fault, change, expected) => {
			expect(renovateProblems(broken(change), followed).join('\n')).toContain(expected)
		})
	})

	describe('every rule can be read by the guard', () => {
		test('each rule says why it exists, and only uses what the guard knows', () => {
			expect(ruleProblems(config)).toEqual([])
			for (const candidate of rules(config)) expect(String(candidate.description).length).toBeGreaterThan(20)
		})

		test.each([
			[
				'a rule without its reason',
				(copy: RenovateConfig) => {
					delete group(copy, 'react').description
				},
				'règle « react » : une règle dit pourquoi elle existe',
			],
			[
				'a rule that applies to everything',
				(copy: RenovateConfig) => {
					rules(copy).push({ description: 'tout', automerge: false })
				},
				'sans « match… », elle s’applique à tout ce que Renovate suit',
			],
			[
				'a matcher the guard cannot read',
				(copy: RenovateConfig) => {
					rules(copy).push({ description: 'par dossier', matchFileNames: ['compose.test.yml'], automerge: false })
				},
				'« matchFileNames » est un filtre que la garde ne sait pas lire',
			],
			[
				'a kind of update Renovate does not know',
				(copy: RenovateConfig) => {
					;(merging(copy).matchUpdateTypes as string[]).push('mineure')
				},
				'« matchUpdateTypes » ne connaît pas « mineure », qui ne correspondrait à rien',
			],
			[
				'a place Renovate does not know',
				(copy: RenovateConfig) => {
					holding(copy, 'matchDepTypes', 'overrides').matchDepTypes = ['override']
				},
				'« matchDepTypes » ne connaît pas « override », qui ne correspondrait à rien',
			],
			[
				'a manager that reads no file of the repository',
				(copy: RenovateConfig) => {
					holding(copy, 'matchManagers', 'github-actions').matchManagers = ['github']
				},
				'« matchManagers » ne connaît pas « github », qui ne correspondrait à rien',
			],
			[
				'a version filter written as a range',
				(copy: RenovateConfig) => {
					merging(copy).matchCurrentVersion = '>=1.0.0'
				},
				'« matchCurrentVersion » s’écrit comme une expression entre barres obliques',
			],
			[
				'a setting of a rule nobody added to the guard',
				(copy: RenovateConfig) => {
					group(copy, 'react').minimumReleaseAge = null
				},
				'règle « react » : « minimumReleaseAge » : un réglage que la garde ne connaît pas',
			],
			[
				'a rule that merges without waiting for the checks',
				(copy: RenovateConfig) => {
					merging(copy).ignoreTests = true
				},
				'« ignoreTests » : Renovate fusionnerait sans attendre les checks',
			],
			[
				'a rule that merges by pushing on the branch, without a pull request',
				(copy: RenovateConfig) => {
					merging(copy).automergeType = 'branch'
				},
				'une fusion automatique passe par une pull request que GitHub fusionne derrière les checks requis',
			],
			[
				'a rule that does not leave the merge to GitHub',
				(copy: RenovateConfig) => {
					delete merging(copy).platformAutomerge
				},
				'une fusion automatique passe par une pull request que GitHub fusionne derrière les checks requis',
			],
		])('red on %s', (_fault, change, expected) => {
			expect(renovateProblems(broken(change), followed).join('\n')).toContain(expected)
		})

		test('a rule the guard cannot read is the only thing reported: every other answer would be a guess', () => {
			const faulty = broken(copy => {
				rules(copy).unshift({
					description: 'x',
					matchSourceUrls: ['https://github.com/vercel/next.js'],
					enabled: false,
				})
			})

			expect(renovateProblems(faulty, followed)).toEqual([
				'règle n° 1 : « matchSourceUrls » est un filtre que la garde ne sait pas lire.',
			])
		})
	})

	describe('what is merged alone: a minor, a patch or a digest, behind the required check', () => {
		test('an ordinary package is, through a pull request GitHub merges', () => {
			expect(outcomeFor(config, dependency('zod'), 'patch')).toMatchObject({
				automerge: true,
				automergeType: 'pr',
				platformAutomerge: true,
			})
			expect(mergedAlone('react', 'minor')).toBe(true)
			expect(mergedAlone('node', 'digest', 'Dockerfile')).toBe(true)
			expect(mergedAlone('node', 'minor', '.nvmrc')).toBe(true)
			expect(mergedAlone('axllent/mailpit', 'patch', 'compose.test.yml')).toBe(true)
		})

		test('a major never is, and waits for an approval on the dashboard', () => {
			for (const found of followed.filter(candidate => candidate.depType !== 'engines'))
				expect(outcomeFor(config, found, 'major'), found.name).toMatchObject({
					automerge: false,
					dependencyDashboardApproval: true,
				})
		})

		test('a 0.x version never is: sharp', () => {
			expect(dependency('sharp').version).toMatch(/^0\./)
			for (const updateType of UPDATE_TYPES) expect(mergedAlone('sharp', updateType), updateType).toBe(false)
		})

		test('nothing else than a minor, a patch or a digest is', () => {
			const merged = UPDATE_TYPES.filter(updateType => mergedAlone('zod', updateType))

			expect(merged).toEqual(['minor', 'patch', 'digest'])
		})

		test.each([
			[
				'a major merged alone',
				(copy: RenovateConfig) => {
					;(merging(copy).matchUpdateTypes as string[]).push('major')
					delete majors(copy).automerge
				},
				'zod (package.json) serait fusionné seul (major) : seuls une mineure, un correctif ou une empreinte peuvent l’être',
			],
			[
				'a major proposed without an approval',
				(copy: RenovateConfig) => {
					delete majors(copy).dependencyDashboardApproval
				},
				'zod (package.json) : une version majeure serait proposée sans approbation au tableau de bord',
			],
			[
				'the rule of the majors placed before a rule that undoes it',
				(copy: RenovateConfig) => {
					rules(copy).push({
						description: 'x',
						matchPackageNames: ['msw'],
						dependencyDashboardApproval: false,
					})
				},
				'msw (package.json) : une version majeure serait proposée sans approbation au tableau de bord',
			],
			[
				'a 0.x version merged alone',
				(copy: RenovateConfig) => {
					delete merging(copy).matchCurrentVersion
				},
				'sharp (package.json) serait fusionné seul (minor) : une version 0.x peut casser à chaque mineure',
			],
			[
				'a pinned range merged alone',
				(copy: RenovateConfig) => {
					;(merging(copy).matchUpdateTypes as string[]).push('pin')
				},
				'zod (package.json) serait fusionné seul (pin)',
			],
		])('red on %s', (_fault, change, expected) => {
			expect(renovateProblems(broken(change), followed).join('\n')).toContain(expected)
		})
	})

	describe('Payload, Next, Biome and Playwright are never merged alone', () => {
		const NEVER_ALONE: [name: string, file: string][] = [
			['payload', 'package.json'],
			['@payloadcms/next', 'package.json'],
			['@payloadcms/db-postgres', 'package.json'],
			['next', 'package.json'],
			['@biomejs/biome', 'package.json'],
			['@playwright/test', 'package.json'],
			['@axe-core/playwright', 'package.json'],
			// Not in the ticket, and never merged alone either: each rule of renovate.json says why.
			['bun', 'package.json'],
			['oven/bun', 'Dockerfile'],
			['oven/bun', 'compose.test.yml'],
			['undici', 'package.json'],
			['postgres', 'compose.test.yml'],
			['actions/checkout', `${WORKFLOWS}/ci.yml`],
			['ubuntu', `${WORKFLOWS}/ci.yml`],
		]

		test.each(NEVER_ALONE)('%s, whatever the update', (name, file) => {
			for (const updateType of UPDATE_TYPES) expect(mergedAlone(name, updateType, file), updateType).toBe(false)
		})

		test('the four families of the ticket are in package.json: the cases above are not empty', () => {
			const names = followed.map(found => found.name)

			for (const name of ['payload', '@payloadcms/ui', 'next', '@biomejs/biome', '@playwright/test'])
				expect(names).toContain(name)
		})

		test.each([
			[
				'Payload merged alone',
				(copy: RenovateConfig) => {
					delete group(copy, 'payload').automerge
				},
				'payload (package.json) serait fusionné seul (minor) : Payload change le schéma et les fichiers générés',
			],
			[
				'a package of Payload left out of its rule',
				(copy: RenovateConfig) => {
					group(copy, 'payload').matchPackageNames = ['payload']
				},
				'@payloadcms/next (package.json) serait fusionné seul (patch)',
			],
			[
				'a package of Payload that does not exist yet',
				(copy: RenovateConfig) => {
					group(copy, 'payload').matchPackageNames = ['payload', '@payloadcms/next', '@payloadcms/ui']
				},
				'@payloadcms/plugin-seo (exemple) serait fusionné seul (minor)',
			],
			[
				'Next merged alone',
				(copy: RenovateConfig) => {
					delete group(copy, 'next').automerge
				},
				'next (package.json) serait fusionné seul (patch) : Next porte tout le rendu du site',
			],
			[
				'Biome merged alone',
				(copy: RenovateConfig) => {
					group(copy, 'biome').automerge = true
				},
				'@biomejs/biome (package.json) serait fusionné seul',
			],
			[
				'Playwright merged alone',
				(copy: RenovateConfig) => {
					delete group(copy, 'playwright').automerge
				},
				'@playwright/test (package.json) serait fusionné seul (minor) : Playwright reste à la version du dépôt de référence',
			],
			[
				'axe left out of the rule of Playwright',
				(copy: RenovateConfig) => {
					group(copy, 'playwright').matchPackageNames = ['@playwright/**']
				},
				'@axe-core/playwright (package.json) serait fusionné seul (minor)',
			],
			[
				'the rule that merges alone moved to the end of the file, where it wins',
				(copy: RenovateConfig) => {
					rules(copy).push(...rules(copy).splice(0, 1))
				},
				'payload (package.json) serait fusionné seul (minor)',
			],
			[
				'a later rule that gives the merge back to one package',
				(copy: RenovateConfig) => {
					rules(copy).push({
						description: 'x',
						matchPackageNames: ['next'],
						matchUpdateTypes: ['patch'],
						automerge: true,
					})
				},
				'next (package.json) serait fusionné seul (patch)',
			],
			[
				'bun merged alone',
				(copy: RenovateConfig) => {
					delete group(copy, 'bun').automerge
				},
				'oven/bun (Dockerfile) serait fusionné seul (minor) : bun installe, construit et teste',
			],
			[
				'a forced version merged alone',
				(copy: RenovateConfig) => {
					delete holding(copy, 'matchDepTypes', 'overrides').automerge
				},
				'undici (package.json) serait fusionné seul (minor) : une version forcée sort de la plage que Payload déclare',
			],
			[
				'an action merged alone',
				(copy: RenovateConfig) => {
					delete holding(copy, 'matchManagers', 'github-actions').automerge
				},
				`actions/checkout (${WORKFLOWS}/ci.yml) serait fusionné seul (minor) : les avis de sécurité du dépôt d’une action se relisent à la main`,
			],
			[
				'PostgreSQL merged alone',
				(copy: RenovateConfig) => {
					delete group(copy, 'postgres').automerge
				},
				'postgres (docker-compose.yml) serait fusionné seul (minor) : la version de PostgreSQL est celle de la base de prod',
			],
		])('red on %s', (_fault, change, expected) => {
			expect(mergeProblems(broken(change), followed).join('\n')).toContain(expected)
		})
	})

	describe('what must move together moves in one pull request', () => {
		const groupOf = (name: string, file?: string) => outcomeFor(config, dependency(name, file), 'minor').groupName

		test('Node of .nvmrc and of the Dockerfile, bun of packageManager and of the Dockerfile, Payload and its packages', () => {
			expect(groupProblems(config, followed)).toEqual([])
			expect([groupOf('node', '.nvmrc'), groupOf('node', 'Dockerfile')]).toEqual(['node', 'node'])
			expect([
				groupOf('bun'),
				groupOf('oven/bun', 'Dockerfile'),
				groupOf('oven/bun', 'compose.test.yml'),
				groupOf('@types/bun'),
			]).toEqual(['bun', 'bun', 'bun', 'bun'])
			expect([groupOf('postgres', 'docker-compose.yml'), groupOf('postgres', 'compose.test.yml')]).toEqual([
				'postgres',
				'postgres',
			])
			for (const name of Object.keys(packageJson.dependencies ?? {}).filter(key => key.startsWith('@payloadcms/')))
				expect(groupOf(name), name).toBe('payload')
			// The types of Node follow their own releases: they are not the Node that runs.
			expect(groupOf('@types/node')).toBeUndefined()
		})

		test.each([
			[
				'the Node of .nvmrc left alone',
				(copy: RenovateConfig) => {
					group(copy, 'node').matchDatasources = ['docker']
				},
				'node (.nvmrc) doit monter dans le groupe « node », pas seul : la garde C04 exige le même Node',
			],
			[
				'the image of bun left out of its group',
				(copy: RenovateConfig) => {
					group(copy, 'bun').matchPackageNames = ['bun', '@types/bun']
				},
				'oven/bun (Dockerfile) doit monter dans le groupe « bun », pas seul : la garde C04 exige le même bun',
			],
			[
				'no group for Payload',
				(copy: RenovateConfig) => {
					delete group(copy, 'payload').groupName
				},
				'@payloadcms/ui (package.json) doit monter dans le groupe « payload », pas seul',
			],
			[
				'the plugin of Tailwind in another group',
				(copy: RenovateConfig) => {
					rules(copy).push({ description: 'x', matchPackageNames: ['@tailwindcss/**'], groupName: 'postcss' })
				},
				'@tailwindcss/postcss (package.json) doit monter dans le groupe « tailwind », pas dans « postcss »',
			],
			[
				'a stranger in a group',
				(copy: RenovateConfig) => {
					;(group(copy, 'react').matchPackageNames as string[]).push('zod')
				},
				'zod (package.json) monte dans le groupe « react » sans en faire partie',
			],
		])('red on %s', (_fault, change, expected) => {
			expect(groupProblems(broken(change), followed).join('\n')).toContain(expected)
		})
	})

	describe('everything is followed, except the Node line of engines', () => {
		test('no dependency of the repository is switched off', () => {
			expect(followProblems(config, followed)).toEqual([])
			expect(outcomeFor(config, dependency('node'), 'pin').enabled).toBe(false)
		})

		test.each([
			[
				'a package switched off',
				(copy: RenovateConfig) => {
					rules(copy).push({ description: 'x', matchPackageNames: ['next'], enabled: false })
				},
				'next (package.json) n’est plus suivi par Renovate',
			],
			[
				'every image switched off',
				(copy: RenovateConfig) => {
					rules(copy).push({ description: 'x', matchDatasources: ['docker'], enabled: false })
				},
				'postgres (compose.test.yml) n’est plus suivi par Renovate',
			],
			[
				'one kind of update switched off',
				(copy: RenovateConfig) => {
					rules(copy).push({ description: 'x', matchUpdateTypes: ['patch'], enabled: false })
				},
				'zod (package.json) n’est plus suivi par Renovate',
			],
			[
				'the Node line of engines followed, so pinned',
				(copy: RenovateConfig) => {
					delete holding(copy, 'matchDepTypes', 'engines').enabled
				},
				'node (package.json) : « engines » ne doit pas être suivi',
			],
		])('red on %s', (_fault, change, expected) => {
			expect(followProblems(broken(change), followed).join('\n')).toContain(expected)
		})
	})

	describe('the version limits: Next stays in 16.3, TypeScript in 6, Node on a long-term line', () => {
		test('each limit stops what it is there to stop, and nothing else', () => {
			expect(capProblems(config)).toEqual([])
			expect(outcomeFor(config, dependency('next'), 'minor').allowedVersions).toBe('<16.4.0')
			expect(outcomeFor(config, dependency('zod'), 'minor').allowedVersions).toBeUndefined()
		})

		test.each([
			['a range lets a version of its line through', '<16.4.0', '16.3.9', true],
			['a range stops the next line', '<16.4.0', '16.4.0', false],
			['an expression lets its lines through', '/^(24|26)\\./', '26.1.0', true],
			['an expression stops the others', '/^(24|26)\\./', '25.0.0', false],
			['no limit lets everything through', undefined, '99.0.0', true],
		])('%s', (_case, limit, version, expected) => {
			expect(allows(limit, version)).toBe(expected)
		})

		test.each([
			[
				'Next 16.4 let through',
				(copy: RenovateConfig) => {
					rules(copy).splice(rules(copy).indexOf(holding(copy, 'allowedVersions', '<16.4.0')), 1)
				},
				'next (bun) : la version 16.4.0 passerait. Next reste en 16.3',
			],
			[
				'a limit that only holds next itself',
				(copy: RenovateConfig) => {
					holding(copy, 'allowedVersions', '<16.4.0').matchPackageNames = ['next']
				},
				'@next/third-parties (bun) : la version 16.4.0 passerait',
			],
			[
				'a limit of Next that stops its own line',
				(copy: RenovateConfig) => {
					holding(copy, 'allowedVersions', '<16.4.0').allowedVersions = '<=16.3.8'
				},
				'next (bun) : la version 16.3.9 serait refusée, sans raison',
			],
			[
				'TypeScript 7 let through',
				(copy: RenovateConfig) => {
					holding(copy, 'allowedVersions', '<7').allowedVersions = '<8'
				},
				'typescript (bun) : la version 7.0.0 passerait. TypeScript reste en 6',
			],
			[
				'an odd line of Node let through',
				(copy: RenovateConfig) => {
					delete group(copy, 'node').allowedVersions
				},
				'node (dockerfile) : la version 25.0.0 passerait. Node reste sur une ligne à support long',
			],
			[
				'a limit that depends on the kind of update, which Renovate does not know when it applies it',
				(copy: RenovateConfig) => {
					holding(copy, 'allowedVersions', '<7').matchUpdateTypes = ['major']
				},
				'typescript (bun) : la limite de version ne doit pas dépendre du type de mise à jour',
			],
		])('red on %s', (_fault, change, expected) => {
			expect(capProblems(broken(change)).join('\n')).toContain(expected)
		})
	})
})

describe('bun run renovate:valide asks Renovate itself, in a container that sees nothing of this machine', () => {
	const args = validatorArguments()

	test('the image of the validator is pinned by its exact version and its digest', () => {
		expect(VALIDATOR_IMAGE).toMatch(/^ghcr\.io\/renovatebot\/renovate:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/)
		expect(args).toContain(VALIDATOR_IMAGE)
	})

	test('the container has no network and no folder of this machine: the file comes on its standard input', () => {
		expect(args.slice(0, 5)).toEqual(['run', '--rm', '--interactive', '--network', 'none'])
		for (const forbidden of ['-v', '--volume', '--mount', '--env', '-e', '--env-file', '--privileged'])
			expect(args).not.toContain(forbidden)
	})

	test('the file is validated as the configuration of a repository, in strict mode', () => {
		expect(args.at(-1)).toContain(`renovate-config-validator --strict --no-global ${CONFIG_FILE}`)
		expect(CONFIG_FILE).toBe('renovate.json')
	})

	test('the command is a script of package.json', () => {
		expect(packageJson.scripts?.['renovate:valide']).toBe('bun --no-env-file scripts/ci/renovate-valide.ts')
	})
})
