/**
 * The publication of a version (ticket 036, docs/publication.md).
 *
 *   bun run release:publier --a-blanc   shows what the next publication would do, writes nothing
 *   bun run release:publier --pousser   publishes: only in .github/workflows/release.yml
 *
 * A publication reserves the next number, moves the pending release notes under it, writes
 * .release/version.json and pushes, in one atomic push, the commit that holds both files and the
 * tag of the number. Coolify watches .release/version.json on main and deploys the production
 * when it changes: nothing else deploys it.
 *
 * Two publications never reserve the same number:
 * - the number follows every number already taken, read on the remote: the `vX.Y.Z` tags and
 *   the version file;
 * - the push is atomic and never forced: the branch only moves forward from the commit the
 *   publication started from, and a tag that already exists is never replaced. When another
 *   publication got there first, both refs are refused, nothing is taken, and this one says
 *   it was overtaken.
 *
 * This file and what it imports only use the runtime of bun: the publication job runs no
 * `bun install`, so no code of a dependency ever runs next to the token that pushes on main.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
	CHANGELOG_FILE,
	type Changelog,
	compareVersions,
	isVersion,
	type Note,
	parseChangelog,
	parseVersion,
	promotePending,
	serializeChangelog,
} from '../../src/lib/notes-de-version'

/** The file Coolify watches (Watch Paths) to deploy the production. */
export const RELEASE_FILE = '.release/version.json'
/** The only branch a version is published from. */
export const RELEASE_BRANCH = 'main'
/** The checks the protection of the branch requires, the ones the publication waits for. */
export const REQUIRED_CHECKS_FILE = 'ci/checks-requis.json'
/** Who signs the publication commit: the bot of GitHub Actions. */
const BOT = { name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' }

const COMMIT = /^[0-9a-f]{40}$/
const TAG = /^[0-9a-f]{40}\trefs\/tags\/v(\d+\.\d+\.\d+)$/

/** What .release/version.json holds. */
export interface VersionFile {
	version: string
	/** The commit of main that is published: the one whose CI was green. */
	commit: string
	/** When the number was reserved, in UTC. */
	publishedAt: string
}

/** The publication, as computed: what would be written. */
export interface Plan {
	version: string
	versionFile: VersionFile
	changelog: Changelog
	/** The notes that move under the new number, in their order. */
	notes: Note[]
}

export type Result =
	| { status: 'publiee'; version: string; releaseCommit: string; notes: number }
	| { status: 'deja-publiee'; version: string; releaseCommit: string }
	| { status: 'depassee'; tip: string }

/**
 * The next number: the version of package.json when no taken number reaches it, else the
 * correction after the highest taken number. Raising package.json (3.1.0) starts a new line.
 */
export function nextVersion(base: string, taken: readonly string[]): string {
	if (!isVersion(base))
		throw new Error(`package.json : « version » doit valoir majeur.mineur.correctif, pas « ${base} ».`)
	const highest = taken.filter(isVersion).sort(compareVersions).at(-1)
	if (highest === undefined || compareVersions(base, highest) > 0) return base
	const [major, minor, patch] = parseVersion(highest) ?? [0, 0, 0]
	return `${major}.${minor}.${patch + 1}`
}

/** The numbers the tags of `git ls-remote --tags` (or `git show-ref --tags`) have taken. */
export function takenByTags(listing: string): string[] {
	return listing
		.split('\n')
		.map(line => TAG.exec(line.trim().replace(' ', '\t'))?.[1])
		.filter((version): version is string => version !== undefined)
}

/** Reads a version file. Throws, in French, when it is not one. */
export function parseVersionFile(text: string): VersionFile {
	let data: unknown
	try {
		data = JSON.parse(text)
	} catch {
		throw new Error(`${RELEASE_FILE} n’est pas du JSON lisible.`)
	}
	const file = data as Partial<VersionFile> | null
	if (
		typeof file !== 'object' ||
		file === null ||
		!isVersion(file.version) ||
		typeof file.commit !== 'string' ||
		!COMMIT.test(file.commit) ||
		typeof file.publishedAt !== 'string' ||
		Number.isNaN(Date.parse(file.publishedAt))
	)
		throw new Error(`${RELEASE_FILE} doit porter { version, commit, publishedAt }.`)
	return { version: file.version, commit: file.commit, publishedAt: file.publishedAt }
}

const serializeVersionFile = (file: VersionFile): string => `${JSON.stringify(file, null, '\t')}\n`

/** The day of `now` in Paris, `YYYY-MM-DD`: the date a makeup artist reads under a version. */
const parisDay = (now: Date): string => now.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })

/** What the repository holds at its root: the base version, the changelog, the last version file. */
function readState(root: string): { base: string; changelog: Changelog; versionFile?: VersionFile } {
	const file = (name: string) => path.join(root, name)
	if (!existsSync(file('package.json')) || !existsSync(file(CHANGELOG_FILE)))
		throw new Error(`package.json ou ${CHANGELOG_FILE} manque ici : lance la commande depuis la racine du dépôt.`)
	const { version } = JSON.parse(readFileSync(file('package.json'), 'utf8')) as { version?: unknown }
	return {
		base: String(version),
		changelog: parseChangelog(readFileSync(file(CHANGELOG_FILE), 'utf8')),
		...(existsSync(file(RELEASE_FILE))
			? { versionFile: parseVersionFile(readFileSync(file(RELEASE_FILE), 'utf8')) }
			: {}),
	}
}

/** The publication of `commit` from the state of `root`, given the numbers already taken elsewhere. */
export function plan(root: string, commit: string, takenElsewhere: readonly string[], now: Date): Plan {
	if (!COMMIT.test(commit)) throw new Error(`Commit à publier illisible : « ${commit} ».`)
	const { base, changelog, versionFile } = readState(root)
	const taken = [...takenElsewhere, ...changelog.releases.map(release => release.version)]
	if (versionFile) taken.push(versionFile.version)
	const version = nextVersion(base, taken)
	return {
		version,
		versionFile: { version, commit, publishedAt: now.toISOString() },
		changelog: promotePending(changelog, { version, date: parisDay(now), commit }),
		notes: changelog.pending,
	}
}

/* ------------------------------------------------------------------------------------------
 * git
 * ---------------------------------------------------------------------------------------- */

type GitRun = { code: number; out: string; err: string }
type Git = (args: string[], options?: { remote?: boolean; env?: Record<string, string> }) => GitRun

/**
 * Runs git in `cwd`. A command that talks to the remote receives the token in an HTTP header
 * scoped to github.com, through the environment: never on the command line, never in
 * .git/config, and git never asks for a password.
 */
function gitIn(cwd: string, env: Record<string, string | undefined>, token?: string): Git {
	const header = token ? `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}` : undefined
	return (args, { remote = false, env: extra = {} } = {}) => {
		const ran = Bun.spawnSync(['git', ...args], {
			cwd,
			env: {
				...env,
				...extra,
				GIT_TERMINAL_PROMPT: '0',
				...(remote && header
					? {
							GIT_CONFIG_COUNT: '1',
							GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
							GIT_CONFIG_VALUE_0: header,
						}
					: {}),
			},
		})
		return { code: ran.exitCode, out: ran.stdout.toString().trim(), err: ran.stderr.toString().trim() }
	}
}

function must(run: GitRun, what: string): string {
	if (run.code !== 0) throw new Error(`git n’a pas pu ${what} :\n${run.err || run.out}`)
	return run.out
}

/** The commit the remote branch points to now. */
const remoteTip = (git: Git, remote: string, branch: string): string =>
	must(
		git(['ls-remote', '--exit-code', remote, `refs/heads/${branch}`], { remote: true }),
		`lire la tête de ${branch}`
	).split('\t')[0] ?? ''

/** The numbers the tags of the remote have taken. */
const remoteTags = (git: Git, remote: string): string[] =>
	takenByTags(must(git(['ls-remote', '--tags', remote], { remote: true }), 'lire les étiquettes du dépôt'))

/**
 * When the tip of the branch is the publication of `source` (its only parent, and a version file
 * that names it), the version it published; nothing otherwise.
 */
function publishedBy(git: Git, remote: string, branch: string, tip: string, source: string): string | undefined {
	must(git(['fetch', '--no-tags', '--quiet', remote, `refs/heads/${branch}`], { remote: true }), `récupérer ${branch}`)
	const parents = must(git(['cat-file', '-p', tip]), 'lire la tête')
		.split('\n')
		.filter(line => line.startsWith('parent '))
	if (parents.length !== 1 || parents[0] !== `parent ${source}`) return undefined
	const shown = git(['show', `${tip}:${RELEASE_FILE}`])
	if (shown.code !== 0) return undefined
	try {
		const file = parseVersionFile(shown.out)
		return file.commit === source ? file.version : undefined
	} catch {
		return undefined
	}
}

export interface PublishOptions {
	/** The checkout of the source commit (detached), whose remote receives the publication. */
	cwd: string
	/** The commit whose CI was green: the publication starts from it, and only from it. */
	source: string
	remote?: string
	branch?: string
	now?: Date
	/** The token of the run, given to git for the remote only. */
	token?: string
	/** The environment of git. */
	env?: Record<string, string | undefined>
}

/** A publication ready to push: its commit and its tag exist in the checkout, not on the remote yet. */
export interface Prepared {
	status: 'prete'
	version: string
	releaseCommit: string
	notes: number
	/** The tip of the branch the publication starts from: the push moves it forward from there only. */
	tip: string
	push: () => Result
}

/**
 * Prepares the publication of `source`: reads what the remote has taken, writes the two files,
 * commits them and tags the commit, in the checkout only. Says instead when it was already done
 * (a retry of the same run), or when the branch has moved on (a newer commit owns the next
 * publication): then nothing is written and no number is taken.
 */
export function prepare(options: PublishOptions): Prepared | Result {
	const { cwd, source, remote = 'origin', branch = RELEASE_BRANCH, now = new Date() } = options
	const git = gitIn(cwd, options.env ?? process.env, options.token)

	const head = must(git(['rev-parse', 'HEAD']), 'lire le commit extrait')
	if (head !== source)
		throw new Error(`Le commit extrait (${head.slice(0, 7)}) n’est pas celui à publier (${source.slice(0, 7)}).`)

	const tip = remoteTip(git, remote, branch)
	if (tip !== source) {
		const version = publishedBy(git, remote, branch, tip, source)
		return version === undefined ? { status: 'depassee', tip } : { status: 'deja-publiee', version, releaseCommit: tip }
	}

	const next = plan(cwd, source, remoteTags(git, remote), now)
	const tag = `v${next.version}`
	writeFiles(cwd, next)
	must(git(['add', '--', RELEASE_FILE, CHANGELOG_FILE]), 'préparer le commit de publication')
	const message = `chore(release): ${tag}\n\nPublication of ${source}, ${next.notes.length} release note(s).`
	const signedByTheBot = {
		GIT_AUTHOR_NAME: BOT.name,
		GIT_AUTHOR_EMAIL: BOT.email,
		GIT_COMMITTER_NAME: BOT.name,
		GIT_COMMITTER_EMAIL: BOT.email,
	}
	must(
		git(['-c', 'commit.gpgsign=false', 'commit', '--quiet', '--no-verify', '-m', message], { env: signedByTheBot }),
		'écrire le commit de publication'
	)
	const releaseCommit = must(git(['rev-parse', 'HEAD']), 'lire le commit de publication')
	must(git(['-c', 'tag.gpgsign=false', 'tag', tag, releaseCommit]), `poser l’étiquette ${tag}`)

	return {
		status: 'prete',
		version: next.version,
		releaseCommit,
		notes: next.notes.length,
		tip,
		push: () => {
			// Both refs or neither, never forced: the branch moves forward from `tip` only, a tag is never replaced.
			const pushed = git(['push', '--atomic', '--porcelain', remote, `HEAD:refs/heads/${branch}`, `refs/tags/${tag}`], {
				remote: true,
			})
			if (pushed.code === 0)
				return { status: 'publiee', version: next.version, releaseCommit, notes: next.notes.length }
			// Refused: if a newer commit or another publication got there first, this one is overtaken.
			const current = remoteTip(git, remote, branch)
			if (current !== tip || remoteTags(git, remote).includes(next.version)) return { status: 'depassee', tip: current }
			throw new Error(
				`La poussée de ${tag} sur ${branch} est refusée, sans qu’une autre publication l’explique (protection de la branche ?) :\n${pushed.err || pushed.out}`
			)
		},
	}
}

/**
 * Publishes `source`: prepares, then pushes the commit and the tag at once. Throws on anything
 * that is neither a publication, a retry nor a newer commit: a refused push that no other
 * publication explains, a broken changelog, a git that fails.
 */
export function publish(options: PublishOptions): Result {
	const prepared = prepare(options)
	return prepared.status === 'prete' ? prepared.push() : prepared
}

function writeFiles(cwd: string, next: Plan): void {
	mkdirSync(path.join(cwd, path.dirname(RELEASE_FILE)), { recursive: true })
	writeFileSync(path.join(cwd, RELEASE_FILE), serializeVersionFile(next.versionFile))
	writeFileSync(path.join(cwd, CHANGELOG_FILE), serializeChangelog(next.changelog))
}

/** The dry run: the publication of the checked-out commit, from the tags this clone knows. Writes nothing. */
export function dryRun(root: string, now = new Date()): Plan {
	const git = gitIn(root, process.env)
	const head = git(['rev-parse', 'HEAD'])
	const commit = head.code === 0 && COMMIT.test(head.out) ? head.out : '0'.repeat(40)
	const tags = git(['show-ref', '--tags'])
	return plan(root, commit, tags.code === 0 ? takenByTags(tags.out) : [], now)
}

/* ------------------------------------------------------------------------------------------
 * ci-ok
 * ---------------------------------------------------------------------------------------- */

/** The checks of ci/checks-requis.json that a workflow of this repository gives: ci-ok today. */
export function requiredWorkflowChecks(root: string): string[] {
	const { checks } = JSON.parse(readFileSync(path.join(root, REQUIRED_CHECKS_FILE), 'utf8')) as {
		checks: { nom: string; source: string }[]
	}
	const names = checks.filter(check => check.source === 'workflow').map(check => check.nom)
	if (names.length === 0) throw new Error(`${REQUIRED_CHECKS_FILE} ne nomme aucun check de workflow : rien à attendre.`)
	return names
}

interface CheckRuns {
	check_runs?: { name?: string; status?: string; conclusion?: string | null; app?: { slug?: string } }[]
}

/**
 * Why `commit` may not be published, or nothing: each required check, as GitHub Actions ran it
 * last on that commit, must have succeeded. The workflow already starts only after a green CI;
 * this reads the check itself, by the name the protection of the branch requires.
 */
export async function requiredChecksRefusal(options: {
	repository: string
	commit: string
	token: string
	checks: readonly string[]
}): Promise<string | undefined> {
	const { repository, commit, token, checks } = options
	for (const check of checks) {
		const url = `https://api.github.com/repos/${repository}/commits/${commit}/check-runs?check_name=${encodeURIComponent(check)}&filter=latest`
		let response: Response
		try {
			response = await fetch(url, {
				redirect: 'error',
				signal: AbortSignal.timeout(15_000),
				headers: {
					Accept: 'application/vnd.github+json',
					Authorization: `Bearer ${token}`,
					'X-GitHub-Api-Version': '2022-11-28',
				},
			})
		} catch {
			return `GitHub ne répond pas : impossible de lire le check « ${check} ». Rien n’est publié.`
		}
		if (!response.ok)
			return `GitHub refuse la lecture du check « ${check} » (réponse ${response.status}). Rien n’est publié.`
		const { check_runs: runs = [] } = (await response.json()) as CheckRuns
		const ours = runs.filter(run => run.name === check && run.app?.slug === 'github-actions')
		if (!ours.some(run => run.status === 'completed' && run.conclusion === 'success'))
			return `Le check « ${check} » du commit ${commit.slice(0, 7)} n’a pas réussi (${ours.map(run => run.conclusion ?? run.status).join(', ') || 'absent'}). Rien n’est publié.`
	}
	return undefined
}

/* ------------------------------------------------------------------------------------------
 * The command
 * ---------------------------------------------------------------------------------------- */

const USAGE = [
	'Usage :',
	'  bun run release:publier --a-blanc   montre la prochaine publication, sans rien écrire',
	'  bun run release:publier --pousser   publie (le workflow release.yml seulement)',
].join('\n')

function describeDryRun(next: Plan): string {
	const lines = [`Publication à blanc : la prochaine version serait la ${next.version}. Rien n’est écrit.`]
	if (next.notes.length === 0) lines.push('Aucune note en attente : la version déploierait sans nouveauté à annoncer.')
	else {
		lines.push(`Les notes en attente passeraient sous la ${next.version} :`)
		for (const note of next.notes) lines.push(`  - [${note.type}] ${note.text}`)
	}
	lines.push(`${RELEASE_FILE} vaudrait :`, serializeVersionFile(next.versionFile).trimEnd())
	lines.push('Le numéro réel se décide à la publication, d’après les étiquettes du dépôt GitHub.')
	return lines.join('\n')
}

function describe(result: Result, source: string): string {
	switch (result.status) {
		case 'publiee':
			return `Version ${result.version} publiée depuis ${source.slice(0, 7)} : ${result.notes} note(s) rangée(s) sous ce numéro, ${RELEASE_FILE} écrit (commit ${result.releaseCommit.slice(0, 7)}, étiquette v${result.version}). Coolify déploie la prod depuis ce fichier.`
		case 'deja-publiee':
			return `Le commit ${source.slice(0, 7)} est déjà publié en version ${result.version} (commit ${result.releaseCommit.slice(0, 7)}) : rien à refaire.`
		case 'depassee':
			return `${RELEASE_BRANCH} a avancé (tête ${result.tip.slice(0, 7)}) : la publication revient au passage de la CI du commit le plus récent. Aucun numéro n’est pris.`
	}
}

async function push(): Promise<void> {
	const { GITHUB_ACTIONS, GITHUB_REPOSITORY, GITHUB_TOKEN, SOURCE_COMMIT, GITHUB_STEP_SUMMARY } = process.env
	if (GITHUB_ACTIONS !== 'true' || !GITHUB_REPOSITORY || !GITHUB_TOKEN || !SOURCE_COMMIT || !COMMIT.test(SOURCE_COMMIT))
		throw new Error(
			'« --pousser » ne tourne que dans le workflow de publication (GITHUB_ACTIONS, GITHUB_REPOSITORY, GITHUB_TOKEN, SOURCE_COMMIT). En local : « --a-blanc ».'
		)
	// The header git receives is the token in base64: GitHub masks the token, not this form of it.
	console.log(`::add-mask::${Buffer.from(`x-access-token:${GITHUB_TOKEN}`).toString('base64')}`)

	const root = process.cwd()
	const refused = await requiredChecksRefusal({
		repository: GITHUB_REPOSITORY,
		commit: SOURCE_COMMIT,
		token: GITHUB_TOKEN,
		checks: requiredWorkflowChecks(root),
	})
	if (refused !== undefined) throw new Error(refused)

	const result = publish({ cwd: root, source: SOURCE_COMMIT, token: GITHUB_TOKEN })
	const said = describe(result, SOURCE_COMMIT)
	console.log(said)
	if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, `${said}\n`)
}

async function main(): Promise<void> {
	const mode = process.argv.slice(2)
	try {
		if (mode.length === 1 && mode[0] === '--a-blanc') console.log(describeDryRun(dryRun(process.cwd())))
		else if (mode.length === 1 && mode[0] === '--pousser') await push()
		else {
			console.error(USAGE)
			process.exitCode = 1
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error))
		process.exitCode = 1
	}
}

if (import.meta.main) await main()
