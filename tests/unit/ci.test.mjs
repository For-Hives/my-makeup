// URG-12 (plans/01, plans/02 §7.7 C01, C02, C04): guards on the CI itself.
// The audit found a CI that let broken builds through (`continue-on-error`,
// the build skipped when the cache existed): this test reads every workflow
// and fails as soon as one of these patterns comes back, or when the Node
// versions of the CI, the Docker image, .nvmrc and engines drift apart.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const RACINE = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../..'
)
const DOSSIER = path.join(RACINE, '.github/workflows')

// the checks to make required on main (plans/01 URG-12, plans/02 §8.1)
const JOBS_REQUIS = ['build', 'auth', 'regression']

function lireWorkflow(fichier, texte) {
	return { fichier, texte, doc: parse(texte) ?? {} }
}

function workflowsDuDepot() {
	return readdirSync(DOSSIER)
		.filter(f => /\.ya?ml$/.test(f))
		.sort()
		.map(f => lireWorkflow(f, readFileSync(path.join(DOSSIER, f), 'utf8')))
}

const jobs = ({ doc }) => Object.entries(doc.jobs ?? {})
const etapes = job => (Array.isArray(job?.steps) ? job.steps : [])
const nomEtape = (etape, i) => etape.name ?? etape.uses ?? `étape ${i + 1}`

/** C01: `continue-on-error` anywhere, in the keys or in the text. */
function continueOnError(workflow) {
	const erreurs = []
	for (const [id, job] of jobs(workflow)) {
		if (job && 'continue-on-error' in job)
			erreurs.push(`${workflow.fichier} : job ${id} a continue-on-error`)
		etapes(job).forEach((etape, i) => {
			if (etape && 'continue-on-error' in etape)
				erreurs.push(
					`${workflow.fichier} : ${id} › ${nomEtape(etape, i)} a continue-on-error`
				)
		})
	}
	// anywhere else (matrix, expression…): the line, outside comments
	if (erreurs.length === 0)
		workflow.texte.split('\n').forEach((ligne, i) => {
			if (
				!ligne.trimStart().startsWith('#') &&
				ligne.includes('continue-on-error')
			)
				erreurs.push(`${workflow.fichier}:${i + 1} : continue-on-error`)
		})
	return erreurs
}

/** C02: a step that builds or tests, skipped or not depending on cache-hit. */
function buildSurCacheHit(workflow) {
	const erreurs = []
	for (const [id, job] of jobs(workflow)) {
		etapes(job).forEach((etape, i) => {
			const condition = String(etape?.if ?? '')
			const quoi = [etape?.name, etape?.run, etape?.uses].join(' ')
			if (/cache-hit/.test(condition) && /build|test/i.test(quoi))
				erreurs.push(
					`${workflow.fichier} : ${id} › ${nomEtape(etape, i)} dépend de cache-hit (${condition})`
				)
		})
	}
	return erreurs
}

/** A required job that may be skipped: it would never turn red. */
function jobsRequisConditionnes(workflow, requis = JOBS_REQUIS) {
	return jobs(workflow)
		.filter(([id, job]) => requis.includes(id) && job && 'if' in job)
		.map(([id, job]) => `${workflow.fichier} : job ${id} a if: ${job.if}`)
}

const majeure = valeur => {
	const m = /(\d+)/.exec(String(valeur ?? ''))
	return m ? Number(m[1]) : null
}

/**
 * C04: every Node version declared in the repository, with where it comes
 * from: actions/setup-node of each job, FROM of the Dockerfile, .nvmrc,
 * engines.node, nixpacks.toml (NIXPACKS_NODE_VERSION lives in Coolify, not
 * here).
 */
function versionsNode(workflows, fichiers) {
	const versions = []
	for (const workflow of workflows)
		for (const [id, job] of jobs(workflow))
			etapes(job).forEach((etape, i) => {
				if (!String(etape?.uses ?? '').startsWith('actions/setup-node')) return
				versions.push({
					source: `${workflow.fichier} › ${id} › ${nomEtape(etape, i)}`,
					valeur: etape.with?.['node-version'],
					ci: true,
				})
			})
	const { dockerfile, nvmrc, packageJson, nixpacks } = fichiers
	if (dockerfile)
		for (const [, image] of dockerfile.matchAll(
			/^FROM\s+(?:--\S+\s+)*(\S+)/gim
		))
			if (/^node:/.test(image))
				versions.push({ source: `Dockerfile ${image}`, valeur: image.slice(5) })
	if (nvmrc !== undefined)
		versions.push({ source: '.nvmrc', valeur: nvmrc.trim() })
	const engines = packageJson?.engines?.node
	if (engines !== undefined)
		versions.push({ source: 'engines.node', valeur: engines })
	if (nixpacks) {
		const m = /NIXPACKS_NODE_VERSION\s*=\s*["']?([^"'\s]+)/.exec(nixpacks)
		if (m) versions.push({ source: 'nixpacks.toml', valeur: m[1] })
	}
	return versions
}

/** Versions without a major, or majors that differ. */
function versionsIncoherentes(versions) {
	const erreurs = versions
		.filter(v => majeure(v.valeur) === null)
		.map(v => `${v.source} : version Node absente ou illisible (${v.valeur})`)
	const majeures = new Set(
		versions.map(v => majeure(v.valeur)).filter(m => m !== null)
	)
	if (majeures.size > 1)
		erreurs.push(
			`versions Node différentes : ${versions.map(v => `${v.source} = ${v.valeur}`).join(' ; ')}`
		)
	return erreurs
}

const lireSiPresent = fichier =>
	existsSync(path.join(RACINE, fichier))
		? readFileSync(path.join(RACINE, fichier), 'utf8')
		: undefined

describe('URG-12 : workflows du dépôt', () => {
	const workflows = workflowsDuDepot()

	test('au moins un workflow lu', () => {
		assert.ok(workflows.length > 0)
	})

	test('C01 : aucun continue-on-error', () => {
		assert.deepEqual(workflows.flatMap(continueOnError), [])
	})

	test('C02 : aucune étape de build ou de test conditionnée par cache-hit', () => {
		assert.deepEqual(workflows.flatMap(buildSurCacheHit), [])
	})

	test('les jobs requis existent, sur les pull requests, sans if:', () => {
		const surPr = workflows.filter(w => w.doc.on?.pull_request !== undefined)
		const presents = surPr.flatMap(w => jobs(w).map(([id]) => id))
		for (const id of JOBS_REQUIS) assert.ok(presents.includes(id), id)
		assert.deepEqual(
			workflows.flatMap(w => jobsRequisConditionnes(w)),
			[]
		)
	})

	test('C04 : une seule version majeure de Node (CI, Dockerfile, .nvmrc, engines)', () => {
		const versions = versionsNode(workflows, {
			dockerfile: lireSiPresent('Dockerfile'),
			nvmrc: lireSiPresent('.nvmrc'),
			packageJson: JSON.parse(lireSiPresent('package.json')),
			nixpacks: lireSiPresent('nixpacks.toml'),
		})
		assert.ok(
			versions.some(v => v.ci),
			'la CI fixe sa version de Node'
		)
		assert.deepEqual(versionsIncoherentes(versions), [])
	})
})

// The guards must see what they guard: each one on a workflow that breaks it.
describe('URG-12 : les gardes refusent un workflow fautif', () => {
	const fautif = lireWorkflow(
		'fautif.yml',
		`
on:
  pull_request:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    if: github.actor != 'renovate[bot]'
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: 20.x
      - name: Cache next.js build
        id: cache-npm
        uses: actions/cache@v4
        with:
          path: .next/
          key: next
      - name: Build the app
        if: steps.cache-npm.outputs.cache-hit != 'true'
        run: npm run build
      - name: Unit tests
        continue-on-error: true
        run: npm test
  auth:
    runs-on: ubuntu-latest
    continue-on-error: true
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: 22.x
`
	)

	test('continue-on-error, au niveau du job comme de l’étape', () => {
		assert.equal(continueOnError(fautif).length, 2)
		const texteSeul = lireWorkflow(
			'expression.yml',
			'jobs:\n  a:\n    continue-on-error: ${{ matrix.experimental }}\n'
		)
		assert.equal(continueOnError(texteSeul).length, 1)
		const commentaire = lireWorkflow(
			'commentaire.yml',
			'jobs:\n  a:\n    # continue-on-error: true\n    runs-on: x\n'
		)
		assert.deepEqual(continueOnError(commentaire), [])
	})

	test('build sauté quand le cache existe', () => {
		assert.deepEqual(buildSurCacheHit(fautif), [
			"fautif.yml : build › Build the app dépend de cache-hit (steps.cache-npm.outputs.cache-hit != 'true')",
		])
	})

	test('job requis conditionné', () => {
		assert.deepEqual(jobsRequisConditionnes(fautif), [
			"fautif.yml : job build a if: github.actor != 'renovate[bot]'",
		])
	})

	test('versions de Node différentes ou absentes', () => {
		const versions = versionsNode([fautif], {
			dockerfile: 'FROM node:22-alpine AS build\nFROM node:24-slim\n',
			nvmrc: '22\n',
			packageJson: { engines: { node: '>=20' } },
			nixpacks: '[variables]\nNIXPACKS_NODE_VERSION = "18"\n',
		})
		assert.deepEqual(
			versions.map(v => v.source),
			[
				'fautif.yml › build › actions/setup-node@v4',
				'fautif.yml › auth › actions/setup-node@v4',
				'Dockerfile node:22-alpine',
				'Dockerfile node:24-slim',
				'.nvmrc',
				'engines.node',
				'nixpacks.toml',
			]
		)
		assert.equal(versionsIncoherentes(versions).length, 1)
		assert.deepEqual(
			versionsIncoherentes([{ source: 'setup-node', valeur: undefined }]),
			['setup-node : version Node absente ou illisible (undefined)']
		)
		assert.deepEqual(
			versionsIncoherentes([
				{ source: 'setup-node', valeur: '22.x' },
				{ source: 'Dockerfile', valeur: '22-alpine' },
				{ source: '.nvmrc', valeur: 'v22.11.0' },
			]),
			[]
		)
	})
})

// URG-11 (plans/01, INVENTAIRE NOUVEAU-05): Cypress, bun.lockb, pg and the
// SonarQube job are gone, the build tools sit in devDependencies, Renovate
// opens security fixes only and the README links the site.
const OUTILS_DE_BUILD = [
	'eslint',
	'eslint-config-next',
	'typescript',
	'prettier-plugin-tailwindcss',
	'node-gyp',
	'node-addon-api',
]

/**
 * Root entries of the tracked files (git ls-files, as the done_when of
 * URG-11): ignored local leftovers (cypress.env.json, old cypress/videos)
 * do not count. Without git (an archive), the folder itself.
 */
function entreesSuivies() {
	try {
		const fichiers = execFileSync('git', ['ls-files', '-z'], {
			cwd: RACINE,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		})
		return [
			...new Set(
				fichiers
					.split('\0')
					.filter(Boolean)
					.map(f => f.split('/')[0])
			),
		]
	} catch {
		return readdirSync(RACINE)
	}
}

/** Root entries that must not come back. */
const entreesInterdites = entrees =>
	entrees.filter(
		e =>
			/^cypress/i.test(e) ||
			e === 'bun.lockb' ||
			e === 'sonar-project.properties'
	)

/** Workflow lines naming Cypress or Sonar, comments included. */
const lignesCypressOuSonar = workflows =>
	workflows.flatMap(({ fichier, texte }) =>
		texte
			.split('\n')
			.flatMap((ligne, i) =>
				/cypress|sonar/i.test(ligne)
					? [`${fichier}:${i + 1} : ${ligne.trim()}`]
					: []
			)
	)

/** package-lock.json: Cypress (any scope or plugin), puppeteer or pg installed. */
const verrouillesInterdits = texte =>
	[
		...texte.matchAll(
			/"node_modules\/(@cypress\/[^"]+|(@[^/"]+\/)?(cypress[^/"]*|pg|puppeteer))"/g
		),
	].map(m => m[1])

// libvips advisories in the Next image optimizer (decisions 2026-10-09)
const SHARP_MINIMUM = '0.35.5'

/** True when the x.y.z version is at least the minimum. */
function auMoins(version, minimum) {
	const a = String(version).split(/[.+-]/).slice(0, 3).map(Number)
	const b = minimum.split('.').map(Number)
	for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
	return true
}

/** package-lock.json: sharp below the minimum, or a copy nested in a package. */
function sharpsVulnerables(lock) {
	const erreurs = []
	const paquets = lock.packages ?? {}
	if (!paquets['node_modules/sharp']) erreurs.push('sharp absent du lock')
	for (const [cle, { version }] of Object.entries(paquets)) {
		if (!/(^|\/)node_modules\/sharp$/.test(cle)) continue
		if (cle !== 'node_modules/sharp') erreurs.push(`sharp imbriqué : ${cle}`)
		else if (!auMoins(version, SHARP_MINIMUM))
			erreurs.push(`sharp ${version} < ${SHARP_MINIMUM}`)
	}
	return erreurs
}

/** Version of the sharp that next/image loads, resolved from next as it does. */
function versionSharpDeNext() {
	const depuisNext = createRequire(
		createRequire(import.meta.url).resolve('next/package.json')
	)
	// sharp exports no package.json: walk up from its entry point
	let dossier = path.dirname(depuisNext.resolve('sharp'))
	while (dossier !== path.dirname(dossier)) {
		const fichier = path.join(dossier, 'package.json')
		if (existsSync(fichier)) {
			const pkg = JSON.parse(readFileSync(fichier, 'utf8'))
			if (pkg.name === 'sharp') return pkg.version
		}
		dossier = path.dirname(dossier)
	}
	return null
}

/** package.json: Cypress anywhere, pg installed, a build tool in dependencies. */
function paquetsInterdits(texte) {
	const pkg = JSON.parse(texte)
	const erreurs = []
	if (/cypress/i.test(texte)) erreurs.push('package.json mentionne cypress')
	if ('pg' in { ...pkg.dependencies, ...pkg.devDependencies })
		erreurs.push('pg est encore installé')
	for (const nom of OUTILS_DE_BUILD)
		if (nom in (pkg.dependencies ?? {}))
			erreurs.push(`${nom} est dans dependencies`)
	return erreurs
}

const GARDE_FOUS = [
	['next', '<16'],
	['tailwindcss', '<4'],
]

/** renovate.json: anything that would open a non-security pull request. */
function renovateHorsSecurite(config) {
	const erreurs = []
	const alertes = config.vulnerabilityAlerts ?? {}
	if (alertes.enabled !== true)
		erreurs.push('vulnerabilityAlerts.enabled n’est pas true')
	if (alertes.automerge !== false)
		erreurs.push('vulnerabilityAlerts.automerge n’est pas false')
	if (config.automerge !== false) erreurs.push('automerge n’est pas false')
	if (config.osvVulnerabilityAlerts !== true)
		erreurs.push('osvVulnerabilityAlerts n’est pas true')
	for (const preset of config.extends ?? [])
		if (/automerge/i.test(preset))
			erreurs.push(`preset qui fusionne seul : ${preset}`)
	const regles = config.packageRules ?? []
	// one rule for every package: no match* key besides the update types
	const coupeTout = regles.some(
		r =>
			r.enabled === false &&
			Object.keys(r).every(
				k => !k.startsWith('match') || k === 'matchUpdateTypes'
			) &&
			['major', 'minor', 'patch'].every(t => r.matchUpdateTypes?.includes(t))
	)
	if (!coupeTout)
		erreurs.push(
			'aucune règle ne coupe les mises à jour majeures, mineures et de patch'
		)
	regles
		.filter(r => r.enabled === true || r.automerge === true)
		.forEach(r =>
			erreurs.push(
				`règle qui rallume des mises à jour : ${r.description ?? '?'}`
			)
		)
	for (const [paquet, borne] of GARDE_FOUS)
		if (
			!regles.some(
				r =>
					r.matchPackageNames?.includes(paquet) && r.allowedVersions === borne
			)
		)
			erreurs.push(`${paquet} sans garde-fou ${borne}`)
	return erreurs
}

describe('URG-11 ménage', () => {
	test('package.json : ni Cypress, ni pg, ni outil de build en dependencies', () => {
		assert.deepEqual(paquetsInterdits(lireSiPresent('package.json')), [])
		assert.deepEqual(
			verrouillesInterdits(lireSiPresent('package-lock.json')),
			[]
		)
	})

	test(`sharp ${SHARP_MINIMUM} au moins, celui que charge next/image`, () => {
		const lock = JSON.parse(lireSiPresent('package-lock.json'))
		assert.deepEqual(sharpsVulnerables(lock), [])
		const version = versionSharpDeNext()
		assert.ok(
			version !== null && auMoins(version, SHARP_MINIMUM),
			`next charge sharp ${version}`
		)
	})

	test('aucun fichier suivi cypress*, bun.lockb ni sonar-project.properties à la racine', () => {
		assert.deepEqual(entreesInterdites(entreesSuivies()), [])
	})

	test('aucun workflow ne nomme Cypress ni Sonar, commentaires compris', () => {
		assert.deepEqual(lignesCypressOuSonar(workflowsDuDepot()), [])
	})

	// The guards cap GitHub alerts only: an OSV alert sets its own
	// allowedVersions after them (see renovate.json)
	test('Renovate : correctifs de sécurité seulement, garde-fous next <16 et tailwindcss <4', () => {
		const config = JSON.parse(lireSiPresent('renovate.json'))
		assert.deepEqual(renovateHorsSecurite(config), [])
		assert.equal(config.vulnerabilityAlerts.enabled, true)
		assert.equal(config.automerge, false)
	})

	// the origin of each link, parsed: a substring would also accept
	// https://my-makeup.fr.example.com
	test('le README renvoie vers le site', () => {
		const origines = [
			...lireSiPresent('README.md').matchAll(/https?:\/\/[^\s)\]>"']+/g),
		].map(([lien]) => {
			try {
				return new URL(lien).origin
			} catch {
				return null
			}
		})
		const site = new URL('https://my-makeup.fr').origin
		assert.ok(origines.some(origine => origine === site))
	})
})

// The guards must see what they guard: each one on what main had before.
describe('URG-11 ménage : les gardes refusent l’ancien état', () => {
	test('racine', () => {
		assert.deepEqual(
			entreesInterdites([
				'cypress',
				'cypress.config.js',
				'cypress.env.json.exemple',
				'bun.lockb',
				'sonar-project.properties',
				'src',
				'package.json',
			]),
			[
				'cypress',
				'cypress.config.js',
				'cypress.env.json.exemple',
				'bun.lockb',
				'sonar-project.properties',
			]
		)
	})

	test('lock : Cypress, ses plugins, puppeteer et pg', () => {
		const ancien = [
			'"node_modules/cypress"',
			'"node_modules/cypress-social-logins"',
			'"node_modules/@cypress/request"',
			'"node_modules/@testing-library/cypress"',
			'"node_modules/puppeteer"',
			'"node_modules/pg"',
			'"node_modules/pg-connection-string"',
			'"node_modules/sharp"',
		].join('\n')
		assert.deepEqual(verrouillesInterdits(ancien), [
			'cypress',
			'cypress-social-logins',
			'@cypress/request',
			'@testing-library/cypress',
			'puppeteer',
			'pg',
		])
	})

	test('sharp : 0.34.5 de main, et une copie imbriquée sous next', () => {
		assert.deepEqual(
			sharpsVulnerables({
				packages: { 'node_modules/sharp': { version: '0.34.5' } },
			}),
			['sharp 0.34.5 < 0.35.5']
		)
		assert.deepEqual(
			sharpsVulnerables({
				packages: {
					'node_modules/sharp': { version: '0.35.5' },
					'node_modules/next/node_modules/sharp': { version: '0.34.5' },
				},
			}),
			['sharp imbriqué : node_modules/next/node_modules/sharp']
		)
		assert.deepEqual(sharpsVulnerables({ packages: {} }), [
			'sharp absent du lock',
		])
		assert.ok(auMoins('0.36.0', '0.35.5') && auMoins('1.0.0', '0.35.5'))
		assert.ok(!auMoins('0.35.4', '0.35.5'))
	})

	test('workflow : variable CYPRESS_ et job commenté', () => {
		const ancien = lireWorkflow(
			'ancien.yml',
			'env:\n  CYPRESS_TEST_USER: x\njobs:\n#  SonarQube:\n#    needs: tests\n'
		)
		assert.equal(lignesCypressOuSonar([ancien]).length, 2)
	})

	test('package.json', () => {
		const ancien = JSON.stringify({
			scripts: { 'cypress:run': 'cypress run' },
			dependencies: {
				pg: '8.22.0',
				typescript: '5.9.3',
				'node-gyp': '^12.3.0',
			},
			devDependencies: { cypress: '^13.6.0' },
		})
		assert.deepEqual(paquetsInterdits(ancien), [
			'package.json mentionne cypress',
			'pg est encore installé',
			'typescript est dans dependencies',
			'node-gyp est dans dependencies',
		])
	})

	test('renovate.json : config:base, puis un groupe de patchs comme sur l’API', () => {
		const configBase = {
			extends: ['config:base'],
			automerge: false,
			packageRules: [
				{ matchPackageNames: ['tailwindcss'], allowedVersions: '<4' },
			],
		}
		assert.deepEqual(renovateHorsSecurite(configBase), [
			'vulnerabilityAlerts.enabled n’est pas true',
			'vulnerabilityAlerts.automerge n’est pas false',
			'osvVulnerabilityAlerts n’est pas true',
			'aucune règle ne coupe les mises à jour majeures, mineures et de patch',
			'next sans garde-fou <16',
		])
		const groupeDePatchs = {
			automerge: false,
			osvVulnerabilityAlerts: true,
			vulnerabilityAlerts: { enabled: true, automerge: false },
			packageRules: [
				{ matchUpdateTypes: ['major', 'minor'], enabled: false },
				{ matchUpdateTypes: ['patch'], groupName: 'patch updates' },
				{ matchPackageNames: ['next'], allowedVersions: '<16' },
				{ matchPackageNames: ['tailwindcss'], allowedVersions: '<4' },
			],
		}
		assert.deepEqual(renovateHorsSecurite(groupeDePatchs), [
			'aucune règle ne coupe les mises à jour majeures, mineures et de patch',
		])
		const seulementPourNext = {
			...groupeDePatchs,
			packageRules: [
				{
					matchPackageNames: ['next'],
					matchUpdateTypes: ['major', 'minor', 'patch'],
					enabled: false,
				},
				{ matchPackageNames: ['swiper'], enabled: true },
				...groupeDePatchs.packageRules.slice(2),
			],
		}
		assert.deepEqual(renovateHorsSecurite(seulementPourNext), [
			'aucune règle ne coupe les mises à jour majeures, mineures et de patch',
			'règle qui rallume des mises à jour : ?',
		])
		const config = JSON.parse(lireSiPresent('renovate.json'))
		assert.deepEqual(
			renovateHorsSecurite({
				...config,
				extends: [...config.extends, ':automergeMinor'],
			}),
			['preset qui fusionne seul : :automergeMinor']
		)
	})
})

// GitHub secrets the workflows may read (Settings › Secrets › Actions).
// GITHUB_TOKEN is the one GitHub gives every run. A new secret is added
// here on purpose, in the same pull request as the workflow that reads it.
const SECRETS_AUTORISES = [
	'NEXTAUTH_SECRET',
	'NEXTAUTH_URL',
	'GOOGLE_CLIENT_ID',
	'GOOGLE_CLIENT_SECRET',
	'MAILGUN_API_KEY',
	'MAILGUN_API_URL',
	'MAILGUN_PUBLIC_KEY',
	'MAILGUN_DOMAIN',
	'APP_IMAGE',
	'GITHUB_TOKEN',
]
// secrets of the removed Cypress job (its production test account) and
// SonarQube job (URG-11), to be deleted from GitHub (Settings › Secrets ›
// Actions): no workflow may read them again, before their deletion (the old
// values) or after it (empty values)
const SECRETS_SUPPRIMES = [
	'TEST_USER',
	'TEST_PW',
	'SONAR_TOKEN',
	'SONAR_HOST_URL',
]

// one secret by its name: `secrets.NAME` or `secrets['NAME']`
const SECRET_NOMME =
	/\bsecrets\s*(?:\.\s*([A-Za-z_][\w-]*)|\[\s*['"]([^'"]+)['"]\s*\])/gi

/**
 * The expressions of a line: each `${{ … }}`, and an `if:`, an expression
 * even without them.
 */
function expressions(ligne) {
	const dedans = [...ligne.matchAll(/\$\{\{([\s\S]*?)\}\}/g)].map(m => m[1])
	const si = /^\s*(?:-\s+)?if\s*:\s*(.*)$/.exec(ligne)
	if (si && !si[1].includes('${{')) dedans.push(si[1])
	return dedans.map(e => e.trim())
}

/**
 * Every secret a workflow reads, `secrets.NAME` or `secrets['NAME']`, the
 * name in capitals as GitHub matches it; `*` when it reads them all: any
 * other `secrets` in an expression (`toJSON(secrets)`, `secrets[matrix.x]`,
 * `secrets` alone) or `secrets: inherit` handed to a reusable workflow. A
 * `#` line is skipped only without `${{`: in a `run: |` block GitHub fills
 * the expression in before the shell reads the comment.
 */
function secretsLus({ fichier, texte }) {
	const lus = []
	texte.split('\n').forEach((ligne, i) => {
		const ou = `${fichier}:${i + 1}`
		if (ligne.trimStart().startsWith('#') && !ligne.includes('${{')) return
		for (const m of ligne.matchAll(SECRET_NOMME)) {
			const nom = (m[1] ?? m[2]).toUpperCase()
			lus.push({ nom, lu: `secrets.${nom}`, ou })
		}
		for (const expression of expressions(ligne))
			if (/\bsecrets\b/i.test(expression.replace(SECRET_NOMME, '')))
				lus.push({ nom: '*', lu: expression, ou })
		if (/^\s*secrets\s*:\s*inherit\b/.test(ligne))
			lus.push({ nom: '*', lu: 'secrets: inherit', ou })
	})
	return lus
}

/** The secrets read that are not in the allowlist. */
const secretsHorsListe = workflows =>
	workflows
		.flatMap(secretsLus)
		.filter(({ nom }) => !SECRETS_AUTORISES.includes(nom))
		.map(({ lu, ou }) => `${ou} : ${lu}`)

describe('secrets GitHub des workflows', () => {
	test('les workflows ne lisent que les secrets de la liste, aucun secret supprimé', () => {
		const workflows = workflowsDuDepot()
		assert.ok(workflows.flatMap(secretsLus).length > 0)
		assert.deepEqual(secretsHorsListe(workflows), [])
		for (const nom of SECRETS_SUPPRIMES)
			assert.ok(!SECRETS_AUTORISES.includes(nom), nom)
	})

	// the guard must see what it guards: the old workflow of the Cypress and
	// SonarQube jobs, in every spelling GitHub accepts
	test('un workflow qui lit TEST_USER, TEST_PW ou SONAR_* est refusé', () => {
		const ancien = lireWorkflow(
			'ancien.yml',
			[
				'env:',
				'  NEXTAUTH_SECRET: ${{secrets.NEXTAUTH_SECRET}}',
				'  CYPRESS_TEST_USER: ${{ secrets.TEST_USER }}',
				'  CYPRESS_TEST_PW: ${{secrets.TEST_PW}}',
				'jobs:',
				'  analyse:',
				'    env:',
				'      SONAR_TOKEN: ${{ secrets.sonar_token }}',
				"      SONAR_HOST_URL: ${{ secrets['SONAR_HOST_URL'] }}",
				'    # was: secrets.OLD_ONE',
				'    steps:',
				'      - name: vérifie les secrets',
				'        run: echo "${{ secrets.GITHUB_TOKEN }}" > /dev/null',
				'      - run: |',
				'          # login ${{ secrets.TEST_PW }}',
				"          echo '${{ toJSON(secrets) }}' > /dev/null",
				"      - if: secrets[matrix.nom] != ''",
				'        run: echo ok',
				'  appel:',
				'    uses: ./.github/workflows/reutilisable.yml',
				'    secrets: inherit',
			].join('\n')
		)
		assert.deepEqual(secretsHorsListe([ancien]), [
			'ancien.yml:3 : secrets.TEST_USER',
			'ancien.yml:4 : secrets.TEST_PW',
			'ancien.yml:8 : secrets.SONAR_TOKEN',
			'ancien.yml:9 : secrets.SONAR_HOST_URL',
			'ancien.yml:15 : secrets.TEST_PW',
			'ancien.yml:16 : toJSON(secrets)',
			"ancien.yml:17 : secrets[matrix.nom] != ''",
			'ancien.yml:21 : secrets: inherit',
		])
		assert.deepEqual(
			secretsLus(ancien).map(s => s.nom),
			[
				'NEXTAUTH_SECRET',
				'TEST_USER',
				'TEST_PW',
				'SONAR_TOKEN',
				'SONAR_HOST_URL',
				'GITHUB_TOKEN',
				'TEST_PW',
				'*',
				'*',
				'*',
			]
		)
	})
})
