// URG-12 (plans/01, plans/02 §7.7 C01, C02, C04): guards on the CI itself.
// The audit found a CI that let broken builds through (`continue-on-error`,
// the build skipped when the cache existed): this test reads every workflow
// and fails as soon as one of these patterns comes back, or when the Node
// versions of the CI, the Docker image, .nvmrc and engines drift apart.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
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
