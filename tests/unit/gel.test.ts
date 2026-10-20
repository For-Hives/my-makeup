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

const DEBUT = '2026-12-01T09:00:00Z'
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
		expect(commitCategory(commit('fix(security): close the redirect', DEBUT))).toBe('securite')
		expect(commitCategory(commit('feat(bandeau): announce the switch', DEBUT))).toBe('bandeau')
		expect(commitCategory(commit('feat(lecture-seule): close the writes', DEBUT))).toBe('lecture-seule')
		expect(commitCategory(commit('content: new article', DEBUT))).toBe('contenus')
	})
	test('a Gel trailer puts a commit in a category', () => {
		expect(commitCategory(commit('chore(deps): bump x', DEBUT, { body: 'CVE\n\nGel: security\n' }))).toBe('securite')
		expect(commitCategory(commit('chore(deps): bump x', DEBUT, { body: 'Gel: anything\n' }))).toBeNull()
	})
	test('features and fixes of the product are not allowed', () => {
		expect(commitCategory(commit('feat(search): new filter', DEBUT))).toBeNull()
		expect(commitCategory(commit('fix(profil): focus', DEBUT))).toBeNull()
		expect(commitCategory(commit('whatever', DEBUT))).toBeNull()
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
		const rapport = verifyHistory(commits, DEBUT)
		expect(rapport.afterFreeze.map(v => v.subject)).toEqual(['fix(security): after', 'feat(search): after, forbidden'])
		expect(rapport.forbidden.map(v => v.subject)).toEqual(['feat(search): after, forbidden'])
	})
	test('a commit exactly at the start is inside the freeze', () => {
		expect(verifyHistory([commit('feat(x): at start', DEBUT)], DEBUT).forbidden).toHaveLength(1)
	})
	test('an unreadable start is refused', () => {
		expect(() => verifyHistory([], 'demain')).toThrow()
	})
})

describe('verifierLesReferences', () => {
	test('a capture or an inventory taken before the freeze, or undated, is reported', () => {
		const erreurs = verifyReferences(DEBUT, [
			{ name: 'capture', takenAt: '2026-11-30T10:00:00Z' },
			{ name: 'inventaire', takenAt: undefined },
			{ name: 'bonne', takenAt: '2026-12-01T10:00:00Z' },
		])
		expect(erreurs).toHaveLength(2)
		expect(erreurs[0]).toContain('à refaire')
	})
})

describe('lireLeJournalGit', () => {
	test('reads the format of the command', () => {
		const sortie =
			'a1\x1f2026-12-02T10:00:00+01:00\x1fp1\x1ffix(security): x\x1fGel: security\n\x1e\nb2\x1f2026-12-03T10:00:00+01:00\x1fp1 p2\x1fMerge\x1f\x1e'
		const lus = readGitLog(sortie)
		expect(lus.map(c => [c.sha, c.parents])).toEqual([
			['a1', 1],
			['b2', 2],
		])
		expect(lus[0]?.body).toContain('Gel: security')
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
			const lancer = () =>
				spawnSync(
					'bun',
					[
						'--no-env-file',
						join(import.meta.dir, '../../scripts/migration/freeze.ts'),
						'--start',
						DEBUT,
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
			expect(lancer().status).toBe(0)
			writeFileSync(join(dir, 'a'), '2')
			git('commit', '-q', '-am', 'feat(search): forbidden')
			const refus = lancer()
			expect(refus.status).toBe(1)
			expect(refus.stdout).toContain('INTERDIT')
		} finally {
			rmSync(dir, { force: true, recursive: true })
		}
	})
})
