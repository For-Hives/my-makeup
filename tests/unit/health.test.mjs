import { test } from 'node:test'
import assert from 'node:assert/strict'
import { healthPayload } from '../../src/lib/health.js'

test('the build variable wins', () => {
	assert.deepEqual(
		healthPayload({ buildVersion: 'abc1234', commit: 'f'.repeat(40), packageVersion: '1.0.0' }),
		{ ok: true, version: 'abc1234' }
	)
})

test('then the source commit, shortened', () => {
	assert.deepEqual(
		healthPayload({ buildVersion: ' ', commit: 'ABCDEF0123456789abcdef0123456789abcdef01', packageVersion: '1.0.0' }),
		{ ok: true, version: 'abcdef0' }
	)
})

test('a commit that is not a sha is ignored', () => {
	assert.deepEqual(healthPayload({ commit: 'main', packageVersion: '1.0.0' }), {
		ok: true,
		version: '1.0.0',
	})
})

test('then package.json, then unknown', () => {
	assert.deepEqual(healthPayload({ packageVersion: '1.0.0' }), { ok: true, version: '1.0.0' })
	assert.deepEqual(healthPayload(), { ok: true, version: 'unknown' })
})
