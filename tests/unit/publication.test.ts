import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
	dryRun,
	nextVersion,
	type Prepared,
	parseVersionFile,
	prepare,
	publish,
	RELEASE_FILE,
	type Result,
	requiredChecksRefusal,
	requiredWorkflowChecks,
	takenByTags,
} from '../../scripts/release/publication'
import { CHANGELOG_FILE, type Changelog, parseChangelog } from '../../src/lib/notes-de-version'
import { HttpResponse, http, simuler } from '../outils/http-sortant'

/**
 * The publication of a version (ticket 036). The git parts run for real, on repositories made
 * in a temporary folder: a bare repository plays GitHub, clones play the runs of the workflow.
 * Nothing leaves this machine.
 */

const ROOT = path.resolve(import.meta.dir, '../..')
const ADD_NOTE = path.join(ROOT, 'scripts/release/ajouter-note.ts')
const PUBLICATION = path.join(ROOT, 'scripts/release/publication.ts')
const NOW = new Date('2026-10-14T21:30:00Z')
const NOTE = 'Tu peux ajouter une vidéo à ta galerie.'

let folder = ''
let counter = 0

/** git without the settings of this machine: no global identity, no signing, no hooks of the user. */
const ENV = (): Record<string, string> => ({
	PATH: process.env.PATH ?? '',
	HOME: folder,
	GIT_CONFIG_NOSYSTEM: '1',
	GIT_CONFIG_GLOBAL: path.join(folder, 'gitconfig'),
	GIT_AUTHOR_NAME: 'Autrice Fictive',
	GIT_AUTHOR_EMAIL: 'autrice@example.test',
	GIT_COMMITTER_NAME: 'Autrice Fictive',
	GIT_COMMITTER_EMAIL: 'autrice@example.test',
})

function git(cwd: string, ...args: string[]): string {
	const ran = Bun.spawnSync(['git', ...args], { cwd, env: ENV() })
	if (ran.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${ran.stderr.toString()}`)
	return ran.stdout.toString().trim()
}

/** Runs a script of the repository with bun, in `cwd`, as `bun run` would. */
function script(cwd: string, file: string, args: string[], env: Record<string, string> = {}) {
	const ran = Bun.spawnSync([process.execPath, '--no-env-file', file, ...args], { cwd, env: { ...ENV(), ...env } })
	return { code: ran.exitCode, out: ran.stdout.toString(), err: ran.stderr.toString() }
}

const changelogOf = (pending: string[] = []): Changelog => ({
	pending: pending.map((text, index) => ({ id: `note-${index + 1}`, type: 'ajout', text })),
	releases: [],
})

/** A fresh folder with a working copy holding package.json and the changelog, committed. */
function workingCopy(changelog: Changelog = changelogOf()): string {
	counter += 1
	const work = path.join(folder, `travail-${counter}`)
	mkdirSync(path.join(work, 'src/content'), { recursive: true })
	writeFileSync(path.join(work, 'package.json'), `${JSON.stringify({ name: 'essai', version: '3.0.0' }, null, '\t')}\n`)
	writeFileSync(path.join(work, CHANGELOG_FILE), `${JSON.stringify(changelog, null, '\t')}\n`)
	git(work, 'init', '--quiet', '--initial-branch=main')
	git(work, 'add', '.')
	git(work, 'commit', '--quiet', '-m', 'premier commit')
	return work
}

/** A bare repository that plays GitHub, with one commit on main; and that commit. */
function remoteWith(changelog: Changelog): { remote: string; source: string; seed: string } {
	const seed = workingCopy(changelog)
	const remote = path.join(folder, `distant-${counter}.git`)
	git(folder, 'init', '--quiet', '--bare', '--initial-branch=main', remote)
	git(seed, 'remote', 'add', 'origin', remote)
	git(seed, 'push', '--quiet', 'origin', 'main')
	return { remote, source: git(seed, 'rev-parse', 'HEAD'), seed }
}

/** A run of the workflow: a clone of the remote, the commit whose CI is green checked out. */
function run(remote: string, source: string): string {
	counter += 1
	const clone = path.join(folder, `passage-${counter}`)
	git(folder, 'clone', '--quiet', remote, clone)
	git(clone, 'checkout', '--quiet', '--detach', source)
	return clone
}

const publishFrom = (clone: string, source: string, now = NOW): Result =>
	publish({ cwd: clone, source, now, env: ENV() })
const prepareFrom = (clone: string, source: string, now = NOW): Prepared | Result =>
	prepare({ cwd: clone, source, now, env: ENV() })

/** What the remote holds on main: its tip, the version file and the changelog there. */
function onRemote(remote: string) {
	const tip = git(remote, 'rev-parse', 'refs/heads/main')
	return {
		tip,
		versionFile: parseVersionFile(git(remote, 'show', `${tip}:${RELEASE_FILE}`)),
		changelog: parseChangelog(`${git(remote, 'show', `${tip}:${CHANGELOG_FILE}`)}\n`),
		tags: git(remote, 'tag', '--list').split('\n').filter(Boolean),
	}
}

beforeAll(() => {
	folder = mkdtempSync(path.join(os.tmpdir(), 'publication-'))
	writeFileSync(path.join(folder, 'gitconfig'), '')
})

afterAll(() => {
	rmSync(folder, { recursive: true, force: true })
})

describe('the next number', () => {
	test.each([
		['nothing taken yet: the version of package.json', '3.0.0', [], '3.0.0'],
		['the old site’s tags are all below it', '3.0.0', ['0.4.3', '1.0.6'], '3.0.0'],
		['after the highest taken number', '3.0.0', ['3.0.0', '3.0.4', '3.0.2'], '3.0.5'],
		['package.json raised to a new line', '3.1.0', ['3.0.7'], '3.1.0'],
		['package.json raised, and that line already started', '3.1.0', ['3.0.7', '3.1.0'], '3.1.1'],
		['a taken number of a later line wins', '3.0.0', ['4.0.0'], '4.0.1'],
		['what is not a version is ignored', '3.0.0', ['v3.0.9', 'latest', '3.0'], '3.0.0'],
	])('%s', (_case, base, taken, expected) => {
		expect(nextVersion(base, taken)).toBe(expected)
	})

	test('it is always above every taken number', () => {
		const taken: string[] = []
		for (let step = 0; step < 50; step += 1) {
			const next = nextVersion('3.0.0', taken)
			expect(taken).not.toContain(next)
			taken.push(next)
		}
		expect(new Set(taken).size).toBe(50)
	})

	test('package.json must give a readable version', () => {
		expect(() => nextVersion('3.0', [])).toThrow('« version » doit valoir majeur.mineur.correctif')
	})

	test('the tags are read as git lists them, remote or local, annotated or not', () => {
		const listing = [
			`${'1'.repeat(40)}\trefs/tags/v1.0.6`,
			`${'2'.repeat(40)}\trefs/tags/v3.0.0`,
			`${'3'.repeat(40)}\trefs/tags/v3.0.0^{}`,
			`${'4'.repeat(40)} refs/tags/v3.0.1`,
			`${'5'.repeat(40)}\trefs/tags/v1-legacy-final`,
			`${'6'.repeat(40)}\trefs/heads/v3.0.9`,
		].join('\n')

		expect(takenByTags(listing)).toEqual(['1.0.6', '3.0.0', '3.0.1'])
	})
})

describe('add a note, then publish à blanc: the note goes under the new number', () => {
	test('with the two commands, as a person runs them', () => {
		const work = workingCopy()
		const before = readFileSync(path.join(work, CHANGELOG_FILE), 'utf8')

		const added = script(work, ADD_NOTE, ['ajout', NOTE])
		expect(added.err).toBe('')
		expect(added.out).toContain('Note en attente ajoutée (tu-peux-ajouter-une-video-a-ta-galerie)')
		const withNote = readFileSync(path.join(work, CHANGELOG_FILE), 'utf8')
		expect(withNote).not.toBe(before)
		expect(parseChangelog(withNote).pending.map(note => note.text)).toEqual([NOTE])

		const dry = script(work, PUBLICATION, ['--a-blanc'])
		expect(dry.err).toBe('')
		expect(dry.code).toBe(0)
		expect(dry.out).toContain('la prochaine version serait la 3.0.0. Rien n’est écrit.')
		expect(dry.out).toContain(`Les notes en attente passeraient sous la 3.0.0 :\n  - [ajout] ${NOTE}`)
		expect(dry.out).toContain('"version": "3.0.0"')

		// À blanc: nothing written, the note still waits.
		expect(readFileSync(path.join(work, CHANGELOG_FILE), 'utf8')).toBe(withNote)
		expect(existsSync(path.join(work, RELEASE_FILE))).toBe(false)
		expect(git(work, 'status', '--porcelain')).toBe(`M ${CHANGELOG_FILE}`)
	})

	test('the plan of the dry run: the note under the number, nothing left pending', () => {
		const work = workingCopy(changelogOf([NOTE]))
		const head = git(work, 'rev-parse', 'HEAD')

		const planned = dryRun(work, NOW)

		expect(planned.version).toBe('3.0.0')
		expect(planned.changelog.pending).toEqual([])
		expect(planned.changelog.releases).toEqual([
			{ version: '3.0.0', date: '2026-10-14', commit: head, notes: [{ id: 'note-1', type: 'ajout', text: NOTE }] },
		])
		expect(planned.versionFile).toEqual({ version: '3.0.0', commit: head, publishedAt: '2026-10-14T21:30:00.000Z' })
	})

	test('the date under a version is the day in Paris, not in UTC', () => {
		const work = workingCopy(changelogOf([NOTE]))

		// 22:30 UTC on the 14th is already 00:30 on the 15th in Paris.
		expect(dryRun(work, new Date('2026-10-14T22:30:00Z')).changelog.releases[0]?.date).toBe('2026-10-15')
	})

	test('outside the root of the repository, it says where to run it', () => {
		expect(() => dryRun(folder, NOW)).toThrow('lance la commande depuis la racine du dépôt')
	})

	test('the dry run counts the tags this clone knows', () => {
		const work = workingCopy(changelogOf([NOTE]))
		git(work, 'tag', 'v3.0.3')

		expect(dryRun(work, NOW).version).toBe('3.0.4')
	})

	test('a refused note is not written, and says why', () => {
		const work = workingCopy()
		const before = readFileSync(path.join(work, CHANGELOG_FILE), 'utf8')

		const added = script(work, ADD_NOTE, ['ajout', 'ajout du composant Galerie.tsx'])

		expect(added.code).toBe(1)
		expect(added.err).toContain('la phrase commence par une majuscule')
		expect(added.err).toContain('pas de nom de fichier ni de code')
		expect(readFileSync(path.join(work, CHANGELOG_FILE), 'utf8')).toBe(before)
	})

	test('without a type or a sentence, the command says how to use it', () => {
		const added = script(workingCopy(), ADD_NOTE, ['ajout'])

		expect(added.code).toBe(1)
		expect(added.err).toContain('Usage : bun run notes:ajouter <type> "<une phrase>"')
		expect(added.err).toContain('ajout (Nouveau), amelioration (Amélioré), correction (Corrigé)')
	})

	test('the publication command wants a mode, and only publishes from its workflow', () => {
		const work = workingCopy()

		expect(script(work, PUBLICATION, []).err).toContain('bun run release:publier --a-blanc')
		const outside = script(work, PUBLICATION, ['--pousser'])
		expect(outside.code).toBe(1)
		expect(outside.err).toContain('« --pousser » ne tourne que dans le workflow de publication')
		expect(existsSync(path.join(work, RELEASE_FILE))).toBe(false)
	})
})

describe('a publication', () => {
	test('writes the version file, moves the notes, tags the number, on main', () => {
		const { remote, source } = remoteWith(changelogOf([NOTE]))

		const result = publishFrom(run(remote, source), source)

		expect(result).toMatchObject({ status: 'publiee', version: '3.0.0', notes: 1 })
		const after = onRemote(remote)
		expect(after.versionFile).toEqual({ version: '3.0.0', commit: source, publishedAt: '2026-10-14T21:30:00.000Z' })
		expect(after.changelog.pending).toEqual([])
		expect(after.changelog.releases.map(release => [release.version, release.commit, release.notes.length])).toEqual([
			['3.0.0', source, 1],
		])
		expect(after.tags).toEqual(['v3.0.0'])
		expect(git(remote, 'rev-parse', 'v3.0.0')).toBe(after.tip)
		// One commit on top of the source, which touches the two files and nothing else.
		expect(git(remote, 'rev-parse', `${after.tip}^`)).toBe(source)
		expect(git(remote, 'diff', '--name-only', source, after.tip).split('\n')).toEqual([RELEASE_FILE, CHANGELOG_FILE])
		expect(git(remote, 'log', '-1', '--format=%an %s', after.tip)).toBe('github-actions[bot] chore(release): v3.0.0')
	})

	test('without a pending note, it still takes a number and deploys, and the changelog stays as it is', () => {
		const { remote, source } = remoteWith(changelogOf())

		expect(publishFrom(run(remote, source), source)).toMatchObject({ status: 'publiee', version: '3.0.0', notes: 0 })
		expect(onRemote(remote).changelog).toEqual(changelogOf())
		expect(git(remote, 'diff', '--name-only', source, 'main')).toBe(RELEASE_FILE)
	})

	test('refuses to publish another commit than the one checked out', () => {
		const { remote, source } = remoteWith(changelogOf())

		expect(() => publishFrom(run(remote, source), 'f'.repeat(40))).toThrow('n’est pas celui à publier')
	})
})

describe('two publications never take the same number', () => {
	test('one after the other: 3.0.0, then 3.0.1, each note under its own number', () => {
		const { remote, source, seed } = remoteWith(changelogOf([NOTE]))
		expect(publishFrom(run(remote, source), source)).toMatchObject({ status: 'publiee', version: '3.0.0' })

		// The next change lands on main with its own note.
		git(seed, 'pull', '--quiet', '--ff-only', 'origin', 'main')
		expect(script(seed, ADD_NOTE, ['correction', 'La galerie se ferme au clavier.']).code).toBe(0)
		git(seed, 'commit', '--quiet', '-am', 'second changement')
		git(seed, 'push', '--quiet', 'origin', 'main')
		const second = git(seed, 'rev-parse', 'HEAD')

		expect(publishFrom(run(remote, second), second)).toMatchObject({ status: 'publiee', version: '3.0.1', notes: 1 })
		const after = onRemote(remote)
		expect(after.tags).toEqual(['v3.0.0', 'v3.0.1'])
		expect(after.changelog.releases.map(release => [release.version, release.notes.map(note => note.text)])).toEqual([
			['3.0.1', ['La galerie se ferme au clavier.']],
			['3.0.0', [NOTE]],
		])
	})

	test('at the same time, from the same state: one lands, the other takes nothing', () => {
		const { remote, source } = remoteWith(changelogOf([NOTE]))
		// Two runs, a second apart: two different publications of the same state.
		const first = prepareFrom(run(remote, source), source)
		const second = prepareFrom(run(remote, source), source, new Date(NOW.getTime() + 1000))
		if (first.status !== 'prete' || second.status !== 'prete') throw new Error('both runs should be ready to push')
		// Both read the same remote: both mean to take 3.0.0.
		expect([first.version, second.version]).toEqual(['3.0.0', '3.0.0'])

		expect(first.push()).toMatchObject({ status: 'publiee', version: '3.0.0' })
		expect(second.push()).toEqual({ status: 'depassee', tip: first.releaseCommit })

		const after = onRemote(remote)
		expect(after.tip).toBe(first.releaseCommit)
		expect(after.tags).toEqual(['v3.0.0'])
		expect(git(remote, 'rev-parse', 'v3.0.0')).toBe(first.releaseCommit)
	})

	test('a number taken by a tag alone is not taken twice: the push is all or nothing', () => {
		const { remote, source, seed } = remoteWith(changelogOf([NOTE]))
		const prepared = prepareFrom(run(remote, source), source)
		if (prepared.status !== 'prete') throw new Error('the run should be ready to push')
		// Meanwhile the number is taken on the remote by a tag, while main does not move.
		git(seed, 'tag', 'v3.0.0')
		git(seed, 'push', '--quiet', 'origin', 'v3.0.0')

		expect(prepared.push()).toEqual({ status: 'depassee', tip: source })
		// Atomic: the branch did not move either, and the tag is the one that was there.
		expect(git(remote, 'rev-parse', 'refs/heads/main')).toBe(source)
		expect(git(remote, 'rev-parse', 'v3.0.0')).toBe(source)

		// The next run sees the tag and takes the number after it.
		expect(publishFrom(run(remote, source), source)).toMatchObject({ status: 'publiee', version: '3.0.1' })
	})

	test('a taken tag counts even when the files say otherwise', () => {
		const { remote, source, seed } = remoteWith(changelogOf([NOTE]))
		git(seed, 'tag', 'v3.0.4')
		git(seed, 'push', '--quiet', 'origin', 'v3.0.4')

		expect(publishFrom(run(remote, source), source)).toMatchObject({ status: 'publiee', version: '3.0.5' })
	})

	test('the same run started again finds its publication, and takes no second number', () => {
		const { remote, source } = remoteWith(changelogOf([NOTE]))
		const published = publishFrom(run(remote, source), source)
		if (published.status !== 'publiee') throw new Error('the first run should publish')

		expect(publishFrom(run(remote, source), source)).toEqual({
			status: 'deja-publiee',
			version: '3.0.0',
			releaseCommit: published.releaseCommit,
		})
		expect(onRemote(remote).tags).toEqual(['v3.0.0'])
	})

	test('an older commit, once main has moved on, takes nothing: the newer one owns the next number', () => {
		const { remote, source, seed } = remoteWith(changelogOf([NOTE]))
		writeFileSync(path.join(seed, 'autre.txt'), 'un autre changement\n')
		git(seed, 'add', 'autre.txt')
		git(seed, 'commit', '--quiet', '-m', 'changement plus récent')
		git(seed, 'push', '--quiet', 'origin', 'main')
		const newer = git(seed, 'rev-parse', 'HEAD')

		expect(publishFrom(run(remote, source), source)).toEqual({ status: 'depassee', tip: newer })
		expect(git(remote, 'tag', '--list')).toBe('')
		expect(git(remote, 'rev-parse', 'refs/heads/main')).toBe(newer)
	})

	test('a push refused for another reason fails loudly, and takes nothing', () => {
		const { remote, source } = remoteWith(changelogOf([NOTE]))
		// What a protected branch does to a push it does not accept.
		const hook = path.join(remote, 'hooks/pre-receive')
		writeFileSync(hook, '#!/bin/sh\necho "branche protégée" >&2\nexit 1\n')
		chmodSync(hook, 0o755)

		expect(() => publishFrom(run(remote, source), source)).toThrow('sans qu’une autre publication l’explique')
		expect(git(remote, 'tag', '--list')).toBe('')
		expect(git(remote, 'rev-parse', 'refs/heads/main')).toBe(source)
	})
})

describe('the publication reads ci-ok on the commit before publishing', () => {
	const REPOSITORY = 'exemple/depot'
	const COMMIT = 'c'.repeat(40)
	const CHECK_RUNS = `https://api.github.com/repos/${REPOSITORY}/commits/${COMMIT}/check-runs`
	const ask = () =>
		requiredChecksRefusal({ repository: REPOSITORY, commit: COMMIT, token: 'jeton-fictif', checks: ['ci-ok'] })
	const answer = (runs: object[]) => simuler(http.get(CHECK_RUNS, () => HttpResponse.json({ check_runs: runs })))
	const ciOk = { name: 'ci-ok', status: 'completed', conclusion: 'success', app: { slug: 'github-actions' } }

	test('the check it waits for is the one the protection of the branch requires', () => {
		expect(requiredWorkflowChecks(ROOT)).toEqual(['ci-ok'])
	})

	test('green ci-ok: it may publish, and it asked for that check on that commit, with the token', async () => {
		let asked: Request | undefined
		simuler(
			http.get(CHECK_RUNS, ({ request }) => {
				asked = request
				return HttpResponse.json({ check_runs: [ciOk] })
			})
		)

		expect(await ask()).toBeUndefined()
		expect(new URL(asked?.url ?? '').searchParams.get('check_name')).toBe('ci-ok')
		expect(new URL(asked?.url ?? '').searchParams.get('filter')).toBe('latest')
		expect(asked?.headers.get('authorization')).toBe('Bearer jeton-fictif')
	})

	test.each([
		['a red ci-ok', [{ ...ciOk, conclusion: 'failure' }], 'n’a pas réussi (failure)'],
		['a ci-ok still running', [{ ...ciOk, status: 'in_progress', conclusion: null }], 'n’a pas réussi (in_progress)'],
		['no ci-ok at all', [], 'n’a pas réussi (absent)'],
		['a ci-ok given by another app', [{ ...ciOk, app: { slug: 'autre-app' } }], 'n’a pas réussi (absent)'],
	])('refused on %s', async (_case, runs, expected) => {
		answer(runs)

		expect(await ask()).toContain(expected)
	})

	test('refused when GitHub refuses or does not answer', async () => {
		simuler(http.get(CHECK_RUNS, () => new HttpResponse(null, { status: 403 })))
		expect(await ask()).toContain('GitHub refuse la lecture du check « ci-ok » (réponse 403)')

		simuler(http.get(CHECK_RUNS, () => HttpResponse.error()))
		expect(await ask()).toContain('GitHub ne répond pas')
	})
})
