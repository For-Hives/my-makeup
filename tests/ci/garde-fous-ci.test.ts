import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
	buildContextProblems,
	imageProblems,
	misalignedVersions,
	type PackageVersions,
	publicVariablesProblems,
} from '../outils/garde-fous-ci'

/**
 * The guard rails of the CI (plans, C01 to C08) and of the Docker image.
 *
 * Every guard is run on the real files of the repository, where it finds nothing, and on a
 * faulty example made from those same files, where it must find the fault.
 */

const ROOT = path.resolve(import.meta.dir, '../..')
const read = (file: string): string => readFileSync(path.join(ROOT, file), 'utf8')

const dockerfile = read('Dockerfile')
const envExample = read('.env.exemple')
const packageJson = JSON.parse(read('package.json')) as PackageVersions
const versions = { nvmrc: read('.nvmrc'), packageJson, dockerfile }

/** The real text with one thing changed. Fails when the text to change is not there any more. */
function broken(text: string, from: string | RegExp, to: string): string {
	const changed = text.replace(from, to)
	if (changed === text) throw new Error(`faulty example out of date: nothing to replace for ${String(from)}`)
	return changed
}

describe('C04: .nvmrc, engines, packageManager and the Dockerfile name the same versions', () => {
	test('the repository is aligned', () => {
		expect(misalignedVersions(versions)).toEqual([])
	})

	test('the Dockerfile really starts from the Node of .nvmrc and the bun of packageManager', () => {
		const node = versions.nvmrc.trim()
		const bun = packageJson.packageManager?.replace('bun@', '')

		expect(dockerfile).toContain(`FROM oven/bun:${bun}@sha256:`)
		expect(dockerfile.match(new RegExp(`^FROM node:${node}-bookworm-slim@sha256:[0-9a-f]{64} AS`, 'gm'))).toHaveLength(
			2
		)
	})

	test.each([
		['a floating Node in .nvmrc', { ...versions, nvmrc: '24\n' }, '.nvmrc doit donner une version exacte'],
		[
			'another Node in .nvmrc than in the Dockerfile',
			{ ...versions, nvmrc: '24.20.0\n' },
			'attendu node:24.20.0-bookworm-slim',
		],
		[
			'another Node line in engines',
			{ ...versions, packageJson: { ...packageJson, engines: { node: '22.x' } } },
			'engines.node doit valoir « 24.x »',
		],
		[
			'another bun in packageManager than in the Dockerfile',
			{ ...versions, packageJson: { ...packageJson, packageManager: 'bun@1.3.13' } },
			'attendu oven/bun:1.3.13',
		],
		[
			'a bun given as a range',
			{ ...versions, packageJson: { ...packageJson, packageManager: 'bun@^1.3.14' } },
			'packageManager doit valoir « bun@ » suivi d’une version exacte',
		],
		[
			'a floating tag on a stage',
			{
				...versions,
				dockerfile: broken(
					dockerfile,
					/FROM node:[\d.]+-bookworm-slim(@\S+) AS run/,
					'FROM node:24-bookworm-slim$1 AS run'
				),
			},
			'FROM node:24-bookworm-slim : attendu node:',
		],
		[
			'an image without its digest',
			{ ...versions, dockerfile: broken(dockerfile, /(FROM oven\/bun:[\d.]+)@\S+/, '$1') },
			'l’image doit être figée par son digest',
		],
		[
			'another base image',
			{ ...versions, dockerfile: broken(dockerfile, /FROM node:\S+ AS run/, 'FROM alpine:3.22 AS run') },
			'seules les images oven/bun et node sont admises',
		],
		[
			'a file copied from an image that no stage pins',
			{
				...versions,
				dockerfile: broken(
					dockerfile,
					'COPY --from=deps /usr/local/bin/bun',
					'COPY --from=oven/bun:1.3.14 /usr/local/bin/bun'
				),
			},
			'COPY --from=oven/bun:1.3.14 : seule une étape précédente',
		],
		[
			'a last stage that is not Node',
			{ ...versions, dockerfile: dockerfile.slice(0, dockerfile.indexOf('# 2. Build')) },
			'La dernière étape du Dockerfile doit partir de l’image Node',
		],
	])('red on %s', (_fault, files, expected) => {
		expect(misalignedVersions(files).join('\n')).toContain(expected)
	})
})

describe('the image is built with public variables only, runs without root and says if it is healthy', () => {
	test('the Dockerfile of the repository respects every rule', () => {
		expect(imageProblems(dockerfile, envExample)).toEqual([])
		expect(publicVariablesProblems()).toEqual([])
	})

	test('the variables the application needs to run are known as runtime variables', () => {
		// The two secrets of today. The list follows .env.exemple: this test only proves it is read.
		const faulty = `${dockerfile}\nARG DATABASE_URI\nARG PAYLOAD_SECRET\n`

		expect(imageProblems(faulty, envExample).join('\n')).toContain('DATABASE_URI est une variable d’exécution')
		expect(imageProblems(faulty, envExample).join('\n')).toContain('PAYLOAD_SECRET est une variable d’exécution')
	})

	test.each([
		[
			'a secret as a build argument',
			`${dockerfile}\nARG PAYLOAD_SECRET\n`,
			'ARG PAYLOAD_SECRET : seules les variables publiques',
		],
		[
			'a secret written in the image',
			broken(dockerfile, 'ENV NODE_ENV=production', 'ENV DATABASE_URI=postgres://exemple NODE_ENV=production'),
			'DATABASE_URI est une variable d’exécution',
		],
		[
			'a secret used in a command',
			broken(dockerfile, '&& bun run build', '&& PAYLOAD_SECRET=exemple bun run build'),
			'PAYLOAD_SECRET est une variable d’exécution',
		],
		[
			'a variable of a later ticket that .env.exemple would list',
			`${dockerfile}\nARG SMTP_PASSWORD\n`,
			'ARG SMTP_PASSWORD : seules les variables publiques',
		],
		[
			'a public variable nobody added to the list',
			`${dockerfile}\nARG NEXT_PUBLIC_AUTRE\n`,
			'ARG NEXT_PUBLIC_AUTRE : seules les variables publiques',
		],
		[
			'a setting of the running image outside the list',
			broken(dockerfile, 'ENV NODE_ENV=production', 'ENV APP_ENV=prod NODE_ENV=production'),
			'ENV APP_ENV dans la dernière étape',
		],
		['no USER line', broken(dockerfile, /^USER node$/m, ''), 'utilisateur sans droits'],
		['root as the user', broken(dockerfile, /^USER node$/m, 'USER root'), 'utilisateur sans droits'],
		['uid 0 as the user', broken(dockerfile, /^USER node$/m, 'USER 0:0'), 'utilisateur sans droits'],
		['no health check', dockerfile.slice(0, dockerfile.indexOf('HEALTHCHECK')), 'doit porter un HEALTHCHECK'],
		['a health check on another path', broken(dockerfile, "'/api/health'", "'/'"), 'doit porter un HEALTHCHECK'],
		[
			'a health check the guard cannot read',
			broken(dockerfile, /CMD \["node", "-e", .*\]$/m, 'CMD curl -f http://127.0.0.1:3000/api/health'),
			'doit porter un HEALTHCHECK',
		],
		[
			'an instruction the guard does not read',
			`${dockerfile}\nONBUILD RUN true\n`,
			'ne sait pas lire : « ONBUILD RUN true »',
		],
	])('red on %s', (_fault, faulty, expected) => {
		expect(imageProblems(faulty, envExample).join('\n')).toContain(expected)
	})

	test('a runtime variable is recognised from .env.exemple alone, whatever the Dockerfile says', () => {
		const withMail = `${envExample}\nSMTP_PASSWORD=\n`

		expect(imageProblems(`${dockerfile}\nRUN echo "$SMTP_PASSWORD"\n`, envExample)).toEqual([])
		expect(imageProblems(`${dockerfile}\nRUN echo "$SMTP_PASSWORD"\n`, withMail).join('\n')).toContain(
			'SMTP_PASSWORD est une variable d’exécution'
		)
	})

	test('red on a build variable whose name does not say it is public', () => {
		expect(publicVariablesProblems(['NEXT_PUBLIC_SITE_URL', 'S3_BUCKET'])).toEqual([
			'S3_BUCKET n’a pas un nom de variable publique : elle n’a pas sa place dans le build.',
		])
	})
})

describe('.dockerignore refuses everything but what the build needs', () => {
	/** Frozen here: a path is let into the build context by changing this list too. */
	const ALLOWED = [
		'package.json',
		'bun.lock',
		'next.config.ts',
		'tsconfig.json',
		'postcss.config.json',
		'src',
		'public',
	]
	const dockerignore = read('.dockerignore')

	test('the file of the repository lets through exactly the frozen list', () => {
		expect(buildContextProblems(dockerignore, ALLOWED)).toEqual([])
	})

	test.each([
		[
			'a file that no longer refuses everything first',
			broken(dockerignore, /^\*$/m, 'node_modules'),
			'doit commencer par « * »',
		],
		['a local .env let through', `${dockerignore}!.env\n`, 'laisse passer « .env »'],
		['the working files of the migration let through', `${dockerignore}!.migration\n`, 'laisse passer « .migration »'],
		['a source folder that is no longer sent', broken(dockerignore, '!src\n', ''), 'ne laisse plus passer « src »'],
		['a line that excludes after everything was excluded', `${dockerignore}tests/\n`, '« tests/ » ne sert à rien'],
	])('red on %s', (_fault, faulty, expected) => {
		expect(buildContextProblems(faulty, ALLOWED).join('\n')).toContain(expected)
	})
})
