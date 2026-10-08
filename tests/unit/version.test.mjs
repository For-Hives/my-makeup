import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deployedVersion } from '../../src/lib/version.js'
import { healthPayload } from '../../src/lib/health.js'

test('NEXT_PUBLIC_APP_VERSION, then the short SOURCE_COMMIT, then package.json', () => {
	assert.equal(
		deployedVersion({
			buildVersion: ' v1.4.0 ',
			commit: 'abcdef0123',
			packageVersion: '1.0.0',
		}),
		'v1.4.0'
	)
	assert.equal(
		deployedVersion({ commit: 'ABCDEF0123', packageVersion: '1.0.0' }),
		'abcdef0'
	)
	assert.equal(
		deployedVersion({ commit: 'HEAD', packageVersion: '1.0.0' }),
		'1.0.0'
	)
	assert.equal(deployedVersion(), 'unknown')
})

test('/api/health shows the same version as the Umami tag', () => {
	const versions = { commit: 'f'.repeat(40), packageVersion: '1.0.0' }
	assert.equal(healthPayload(versions).version, deployedVersion(versions))
})
