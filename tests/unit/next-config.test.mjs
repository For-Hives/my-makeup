import { afterEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const nextConfig = require('../../next.config.js')
const initial = process.env.UMAMI_ORIGIN

afterEach(() => {
	if (initial === undefined) delete process.env.UMAMI_ORIGIN
	else process.env.UMAMI_ORIGIN = initial
})

const destinations = async () =>
	Object.fromEntries(
		(await nextConfig.rewrites()).map(r => [r.source, r.destination])
	)

describe('Umami behind /u (MES-10)', () => {
	test('only the script and the send endpoint are proxied', async () => {
		delete process.env.UMAMI_ORIGIN
		assert.deepEqual(Object.keys(await destinations()), [
			'/u/script.js',
			'/u/api/send',
		])
	})

	test('empty UMAMI_ORIGIN: the current instance', async () => {
		for (const value of [undefined, '', '  ']) {
			if (value === undefined) delete process.env.UMAMI_ORIGIN
			else process.env.UMAMI_ORIGIN = value
			assert.deepEqual(await destinations(), {
				'/u/script.js': 'https://umami.wadefade.fr/script.js',
				'/u/api/send': 'https://umami.wadefade.fr/api/send',
			})
		}
	})

	test('moving the instance only changes UMAMI_ORIGIN', async () => {
		process.env.UMAMI_ORIGIN = 'https://u.my-makeup.fr/'
		assert.deepEqual(await destinations(), {
			'/u/script.js': 'https://u.my-makeup.fr/script.js',
			'/u/api/send': 'https://u.my-makeup.fr/api/send',
		})
		process.env.UMAMI_ORIGIN = 'http://umami:3000/stats'
		assert.equal(
			(await destinations())['/u/api/send'],
			'http://umami:3000/stats/api/send'
		)
	})

	test('a request still carrying a cookie or credentials is never relayed', async () => {
		delete process.env.UMAMI_ORIGIN
		for (const rewrite of await nextConfig.rewrites())
			assert.deepEqual(
				rewrite.missing,
				[
					{ type: 'header', key: 'cookie' },
					{ type: 'header', key: 'authorization' },
				],
				rewrite.source
			)
	})

	test('/U/script.js or /u/API/send are not relayed: the case of the path counts', () => {
		// the middleware matcher, which cleans the headers, is case-sensitive
		assert.equal(nextConfig.experimental.caseSensitiveRoutes, true)
	})

	test('an invalid UMAMI_ORIGIN stops the build', async () => {
		for (const value of [
			'umami.wadefade.fr',
			'ftp://umami.example.org',
			'https://umami.example.org/?x=1',
			'https://user:pass@umami.example.org',
		]) {
			process.env.UMAMI_ORIGIN = value
			await assert.rejects(nextConfig.rewrites(), /UMAMI_ORIGIN/, value)
		}
	})

	test('SOURCE_COMMIT is frozen into the build for the data-tag', () => {
		assert.equal(typeof nextConfig.env.BUILD_SOURCE_COMMIT, 'string')
	})
})
