import { expect, test } from 'bun:test'
import { deployedVersion } from '../../src/lib/version'

const FULL_SHA = 'ABCDEF0123456789abcdef0123456789abcdef01'

test('NEXT_PUBLIC_APP_VERSION, then the short SOURCE_COMMIT, then package.json, then unknown', () => {
	expect(deployedVersion({ buildVersion: ' v1.4.0 ', commit: 'abcdef0123', packageVersion: '1.0.0' })).toBe('v1.4.0')
	expect(deployedVersion({ commit: 'ABCDEF0123', packageVersion: '1.0.0' })).toBe('abcdef0')
	expect(deployedVersion({ packageVersion: '1.0.0' })).toBe('1.0.0')
	expect(deployedVersion()).toBe('unknown')
})

test('an empty build variable gives way to the source commit, shortened to 7 characters', () => {
	expect(deployedVersion({ buildVersion: ' ', commit: FULL_SHA, packageVersion: '1.0.0' })).toBe('abcdef0')
})

test('a commit that is not a sha is ignored', () => {
	expect(deployedVersion({ commit: 'main', packageVersion: '1.0.0' })).toBe('1.0.0')
	expect(deployedVersion({ commit: 'HEAD', packageVersion: '1.0.0' })).toBe('1.0.0')
})

test('a full sha in the build variable reads like the same commit in SOURCE_COMMIT', () => {
	expect(deployedVersion({ buildVersion: FULL_SHA, packageVersion: '1.0.0' })).toBe('abcdef0')
	expect(deployedVersion({ buildVersion: FULL_SHA })).toBe(deployedVersion({ commit: FULL_SHA }))
})

test('a label in the build variable is never cut, even when it looks like a short sha', () => {
	expect(deployedVersion({ buildVersion: '20261014' })).toBe('20261014')
	expect(deployedVersion({ buildVersion: 'ABC1234' })).toBe('ABC1234')
})

test('next.config.ts gives the commit of the build to the bundles, as BUILD_SOURCE_COMMIT', async () => {
	// Only the presence of the key is checked: the module may already be loaded by another
	// test file, with the SOURCE_COMMIT of that moment.
	const { default: nextConfig } = await import('../../next.config')

	expect(typeof nextConfig.env?.BUILD_SOURCE_COMMIT).toBe('string')
})
