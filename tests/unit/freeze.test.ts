/** The freeze of the old site (ticket 172): which commits are allowed once it has started. */

import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	commitCategory,
	type OldSiteCommit,
	readGitLog,
	verifyHistory,
	verifyReferences,
} from '../../scripts/migration/freeze-rules'

const START = '2026-12-01T09:00:00Z'
const commit = (subject: string, date: string, extra: Partial<OldSiteCommit> = {}): OldSiteCommit => ({
	body: '',
	date,
	parents: 1,
	sha: subject.replace(/\W/gu, '').padEnd(40, '0').slice(0, 40),
	subject,
	...extra,
})

describe('categorieDuCommit', () => {
	test('security, banner, read-only and contents are allowed, by scope or by type', () => {
		expect(commitCategory(commit('fix(security): close the redirect', START))).toBe('securite')
		expect(commitCategory(commit('feat(bandeau): announce the switch', START))).toBe('bandeau')
		expect(commitCategory(commit('feat(lecture-seule): close the writes', START))).toBe('lecture-seule')
		expect(commitCategory(commit('content: new article', START))).toBe('contenus')
	})
	test('a Gel trailer puts a commit in a category', () => {
		expect(commitCategory(commit('chore(deps): bump x', START, { body: 'CVE\n\nGel: security\n' }))).toBe('securite')
		expect(commitCategory(commit('chore(deps): bump x', START, { body: 'Gel: anything\n' }))).toBeNull()
	})
	test('features and fixes of the product are not allowed', () => {
		expect(commitCategory(commit('feat(search): new filter', START))).toBeNull()
		expect(commitCategory(commit('fix(profil): focus', START))).toBeNull()
		expect(commitCategory(commit('whatever', START))).toBeNull()
	})
})

describe('verifierLHistorique', () => {
	const commits = [
		commit('feat(search): before the freeze', '2026-11-30T10:00:00Z'),
		commit('fix(security): after', '2026-12-02T10:00:00Z'),
		commit('feat(search): after, forbidden', '2026-12-03T10:00:00Z'),
		commit('Merge pull request #1', '2026-12-04T10:00:00Z', { parents: 2 }),
	]
	test('only the commits at or after the start count, merges left out', () => {
		const report = verifyHistory(commits, START)
		expect(report.afterFreeze.map(v => v.subject)).toEqual(['fix(security): after', 'feat(search): after, forbidden'])
		expect(report.forbidden.map(v => v.subject)).toEqual(['feat(search): after, forbidden'])
	})
	test('a commit exactly at the start is inside the freeze', () => {
		expect(verifyHistory([commit('feat(x): at start', START)], START).forbidden).toHaveLength(1)
	})
	test('an unreadable start is refused', () => {
		expect(() => verifyHistory([], 'demain')).toThrow()
	})
})

describe('verifierLesReferences', () => {
	test('a capture or an inventory taken before the freeze, or undated, is reported', () => {
		const errors = verifyReferences(START, [
			{ name: 'capture', takenAt: '2026-11-30T10:00:00Z' },
			{ name: 'inventaire', takenAt: undefined },
			{ name: 'bonne', takenAt: '2026-12-01T10:00:00Z' },
		])
		expect(errors).toHaveLength(2)
		expect(errors[0]).toContain('à refaire')
	})
})

describe('lireLeJournalGit', () => {
	test('reads the format of the command', () => {
		const output =
			'a1\x1f2026-12-02T10:00:00+01:00\x1fp1\x1ffix(security): x\x1fGel: security\n\x1e\nb2\x1f2026-12-03T10:00:00+01:00\x1fp1 p2\x1fMerge\x1f\x1e'
		const read = readGitLog(output)
		expect(read.map(c => [c.sha, c.parents])).toEqual([
			['a1', 1],
			['b2', 2],
		])
		expect(read[0]?.body).toContain('Gel: security')
	})
})

describe('the command on a real throwaway repository', () => {
	test('exit 1 on a forbidden commit after the start, 0 once it is the only allowed kind', () => {
		const dir = mkdtempSync(join(tmpdir(), 'gel-'))
		try {
			const git = (...args: string[]) =>
				spawnSync('git', ['-C', dir, '-c', 'user.name=T', '-c', 'user.email=t@example.test', ...args], {
					encoding: 'utf8',
					env: { ...process.env, GIT_COMMITTER_DATE: '2026-12-02T10:00:00Z', GIT_AUTHOR_DATE: '2026-12-02T10:00:00Z' },
				})
			git('init', '-q', '-b', 'main')
			writeFileSync(join(dir, 'a'), '1')
			git('add', '.')
			git('commit', '-q', '-m', 'fix(security): ok')
			const launch = () =>
				spawnSync(
					'bun',
					[
						'--no-env-file',
						join(import.meta.dir, '../../scripts/migration/freeze.ts'),
						'--start',
						START,
						'--repository',
						dir,
						'--ref',
						'main',
						'--capture',
						'2026-12-05T00:00:00Z',
						'--inventory',
						'2026-12-05T00:00:00Z',
					],
					{ encoding: 'utf8' }
				)
			expect(launch().status).toBe(0)
			writeFileSync(join(dir, 'a'), '2')
			git('commit', '-q', '-am', 'feat(search): forbidden')
			const refusal = launch()
			expect(refusal.status).toBe(1)
			expect(refusal.stdout).toContain('INTERDIT')
		} finally {
			rmSync(dir, { force: true, recursive: true })
		}
	})
})
