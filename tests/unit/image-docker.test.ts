import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
	CheckFailed,
	environmentNames,
	expectedPhotosOrigin,
	expectedVersion,
	imageConfigProblems,
	photosPolicyProblems,
} from '../../scripts/image/check'
import {
	citedVariables,
	declaredVariables,
	dockerignoreRules,
	PUBLIC_BUILD_VARIABLES,
	readDockerfile,
	runtimeVariables,
} from '../../scripts/image/rules'
import { MEDIA_ORIGIN_DEFAULT } from '../../src/lib/env'
import { contentSecurityPolicy } from '../../src/lib/security-headers'

const ROOT = path.resolve(import.meta.dir, '../..')
const read = (file: string): string => readFileSync(path.join(ROOT, file), 'utf8')

describe('the variables of the image are read from .env.exemple', () => {
	const envExample = read('.env.exemple')

	test('every variable of .env.exemple is either a public build variable or a runtime one', () => {
		const declared = declaredVariables(envExample)

		expect(declared).toContain('DATABASE_URI')
		expect(declared).toContain('PAYLOAD_SECRET')
		for (const name of PUBLIC_BUILD_VARIABLES) expect(declared).toContain(name)
		expect(runtimeVariables(envExample).sort()).toEqual(
			[...declared.filter(name => !PUBLIC_BUILD_VARIABLES.includes(name)), 'PAYLOAD_DROP_DATABASE'].sort()
		)
	})

	test('comments and indented lines are not variables', () => {
		expect(declaredVariables('# FAUX=1\n  AUSSI_FAUX=1\nVRAI=\nvrai_non_plus=1\nAUTRE_VRAI=valeur\n')).toEqual([
			'VRAI',
			'AUTRE_VRAI',
		])
	})

	test('a new secret in .env.exemple becomes a runtime variable, a public build variable never does', () => {
		expect(runtimeVariables('SMTP_PASSWORD=\nNEXT_PUBLIC_SITE_URL=\nSOURCE_COMMIT=\n')).toEqual([
			'SMTP_PASSWORD',
			'PAYLOAD_DROP_DATABASE',
		])
	})

	test('a name is found as a whole word only', () => {
		const names = ['DATABASE_URI', 'PAYLOAD_SECRET']

		expect(citedVariables('ARG DATABASE_URI', names)).toEqual(['DATABASE_URI'])
		expect(citedVariables('RUN echo "$PAYLOAD_SECRET" && echo "$DATABASE_URI"', names)).toEqual(names)
		expect(citedVariables('|1 PAYLOAD_SECRET=exemple /bin/sh -c true', names)).toEqual(['PAYLOAD_SECRET'])
		expect(citedVariables('ENV OLD_DATABASE_URI=1 PAYLOAD_SECRET_2=2 database_uri=3', names)).toEqual([])
	})
})

describe('the Dockerfile is read instruction by instruction', () => {
	test('the Dockerfile of the repository: three stages, public arguments, an unprivileged user, a health check', () => {
		const { globalArgs, stages, unknown } = readDockerfile(read('Dockerfile'))

		expect(unknown).toEqual([])
		expect(globalArgs).toEqual([])
		expect(stages.map(stage => [stage.image, stage.name])).toEqual([
			['oven/bun', 'deps'],
			['node', 'build'],
			['node', 'run'],
		])
		expect(stages.map(stage => stage.digest?.length)).toEqual([71, 71, 71])
		expect(stages[1]?.args).toEqual([...PUBLIC_BUILD_VARIABLES])
		expect(stages[1]?.copiesFrom).toEqual(['deps', 'deps'])
		expect(stages[2]?.env).toEqual(['NODE_ENV', 'NEXT_TELEMETRY_DISABLED', 'PORT', 'HOSTNAME'])
		expect(stages[2]?.copiesFrom).toEqual(['build', 'build', 'build'])
		expect(stages[2]?.user).toBe('node')
		expect(stages[2]?.healthcheck?.slice(0, 2)).toEqual(['node', '-e'])
		expect(stages[2]?.command).toEqual(['node', 'server.js'])
	})

	test('continued lines, comments, defaults and the old ENV form', () => {
		const { globalArgs, stages, unknown } = readDockerfile(
			[
				'# syntax=docker/dockerfile:1',
				'ARG VERSION=1',
				'FROM --platform=linux/amd64 exemple/image:1.2.3 AS base',
				'ARG A B=2',
				'ENV C=3 \\',
				'    D=4',
				'ENV E valeur',
				'RUN echo \\',
				'  # a comment inside a command',
				'  bonjour',
				'FROM base',
				'COPY --chown=1:1 --from=base /a /b',
				'MAINTAINER quelqu’un',
			].join('\n')
		)

		expect(globalArgs).toEqual(['VERSION'])
		expect(stages[0]).toMatchObject({ image: 'exemple/image', tag: '1.2.3', name: 'base', args: ['A', 'B'] })
		expect(stages[0]?.env).toEqual(['C', 'D', 'E'])
		expect(stages[0]?.digest).toBeUndefined()
		expect(stages[1]).toMatchObject({ image: 'base', copiesFrom: ['base'], user: undefined, healthcheck: undefined })
		expect(unknown).toEqual(['MAINTAINER quelqu’un'])
	})

	test('no declared name is dropped, whatever its case: the rules decide, not the reader', () => {
		const { globalArgs, stages } = readDockerfile(
			['ARG registre', 'FROM exemple/image:1', 'ARG npm_token Payload_Secret=x', 'ENV app_env=prod Autre=1'].join('\n')
		)

		expect(globalArgs).toEqual(['registre'])
		expect(stages[0]?.args).toEqual(['npm_token', 'Payload_Secret'])
		expect(stages[0]?.env).toEqual(['app_env', 'Autre'])
	})

	test('.dockerignore: comments and blank lines do not count', () => {
		expect(dockerignoreRules('# tout\n*\n\n!src\n  !public  \n')).toEqual(['*', '!src', '!public'])
	})
})

describe('the production build is served two ways', () => {
	test('the image runs the standalone server; `bun run start` keeps `next start`, and the README says its warning is expected', () => {
		const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts
		const readme = read('README.md')
		const row = readme.split('\n').find(line => line.startsWith('| `bun run start` |')) ?? ''

		expect(read('next.config.ts')).toContain("output: 'standalone'")
		expect(readDockerfile(read('Dockerfile')).stages.at(-1)?.command).toEqual(['node', 'server.js'])
		// Next warns that `next start` « does not work » with a standalone build, and serves it all the same.
		// Whoever changes this script changes the two sentences of the README with it.
		expect(scripts.start).toBe('next start')
		expect(row).toContain('`output: standalone` est attendu')
		expect(readme.includes('"next start" does not work with "output: standalone" configuration')).toBe(true)
	})
})

describe('what the image check reads in a built image', () => {
	const image = {
		user: 'node',
		env: ['PATH=/usr/local/bin', 'NODE_VERSION=24.21.0', 'NODE_ENV=production', 'PORT=3000', 'HOSTNAME=0.0.0.0'],
		history: 'CMD ["node" "server.js"]\nUSER node\nENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0',
		labels: 'null',
		runtimeNames: ['DATABASE_URI', 'PAYLOAD_SECRET'],
	}

	test('an image built from the Dockerfile has nothing wrong', () => {
		expect(imageConfigProblems(image)).toEqual([])
		expect(environmentNames(image.env)).toEqual(['PATH', 'NODE_VERSION', 'NODE_ENV', 'PORT', 'HOSTNAME'])
	})

	test.each(['', 'root', '0', '0:0', 'root:root'])('red on an image that runs as root: user « %s »', user => {
		expect(imageConfigProblems({ ...image, user })).toEqual(['l’image tourne en root : il lui faut une ligne USER.'])
	})

	test('red on a runtime variable set in the image', () => {
		const problems = imageConfigProblems({ ...image, env: [...image.env, 'DATABASE_URI=postgres://exemple'] })

		expect(problems).toEqual([
			'l’image fixe des variables qui ne sont pas dans la liste admise : DATABASE_URI.',
			'l’image nomme des variables d’exécution : DATABASE_URI.',
		])
	})

	test('red on a runtime variable named in the history, as a build argument leaves it', () => {
		const history = `${image.history}\nRUN |1 PAYLOAD_SECRET=exemple /bin/sh -c node server.js # buildkit\nARG PAYLOAD_SECRET`

		expect(imageConfigProblems({ ...image, history })).toEqual([
			'l’image nomme des variables d’exécution : PAYLOAD_SECRET.',
		])
	})

	test('red on a runtime variable named in a label', () => {
		expect(imageConfigProblems({ ...image, labels: '{"build":"DATABASE_URI"}' })).toEqual([
			'l’image nomme des variables d’exécution : DATABASE_URI.',
		])
	})

	test('the version expected from /api/health is the short form of the commit given to the build', () => {
		expect(expectedVersion('ABCDEF0123456789abcdef0123456789abcdef01')).toBe('abcdef0')
		expect(expectedVersion(' abcdef0 ')).toBe('abcdef0')
		expect(expectedVersion(undefined)).toBeUndefined()
		expect(expectedVersion('')).toBeUndefined()
		expect(() => expectedVersion('main')).toThrow(CheckFailed)
	})
})

describe('the photos of the environment are given to the build of the image', () => {
	const AUTRE_PHOTOS = 'https://exemple-photos.example.test'

	test('R2_PUBLIC_URL is a public build argument, dropped from the build when empty', () => {
		const dockerfile = read('Dockerfile')

		expect(PUBLIC_BUILD_VARIABLES).toContain('R2_PUBLIC_URL')
		expect(readDockerfile(dockerfile).stages[1]?.args).toContain('R2_PUBLIC_URL')
		expect(dockerfile).toContain('if [ -z "${R2_PUBLIC_URL:-}" ]; then unset R2_PUBLIC_URL; fi')
		// It is no secret: the guard of the Dockerfile and the check of the image let its name through.
		expect(runtimeVariables(read('.env.exemple'))).not.toContain('R2_PUBLIC_URL')
	})

	test('the expected origin is the one of the build, else the one of the live site', () => {
		expect(expectedPhotosOrigin(AUTRE_PHOTOS)).toBe(AUTRE_PHOTOS)
		expect(expectedPhotosOrigin(undefined)).toBe(MEDIA_ORIGIN_DEFAULT)
		expect(expectedPhotosOrigin('')).toBe(MEDIA_ORIGIN_DEFAULT)
		expect(() => expectedPhotosOrigin('https://*.example.test')).toThrow(CheckFailed)
	})

	test('an image built for another photo host serves its own host, and only it', () => {
		const sent = contentSecurityPolicy({ development: false, mediaOrigin: AUTRE_PHOTOS })

		expect(photosPolicyProblems(sent, AUTRE_PHOTOS)).toEqual([])
		expect(photosPolicyProblems(sent, MEDIA_ORIGIN_DEFAULT)).toHaveLength(1)
	})

	test('an image built without the argument serves the photos of the live site', () => {
		const sent = contentSecurityPolicy({ development: false, mediaOrigin: MEDIA_ORIGIN_DEFAULT })

		expect(photosPolicyProblems(sent, expectedPhotosOrigin(undefined))).toEqual([])
		expect(photosPolicyProblems(sent, AUTRE_PHOTOS)).toHaveLength(1)
	})

	test('a policy that names both hosts, or none, or no policy at all, is refused', () => {
		expect(photosPolicyProblems(`img-src 'self' ${AUTRE_PHOTOS} ${MEDIA_ORIGIN_DEFAULT}`, AUTRE_PHOTOS)).toHaveLength(1)
		expect(photosPolicyProblems("img-src 'self' data:", AUTRE_PHOTOS)).toHaveLength(1)
		expect(photosPolicyProblems(null, AUTRE_PHOTOS)).toHaveLength(1)
	})
})
