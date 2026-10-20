/**
 * The release notes of the site (ticket 036): what a visitor or a makeup artist can notice,
 * one French sentence per change, kept in src/content/changelog.json.
 *
 * A note waits in `pending` from the commit that brings the change (`bun run notes:ajouter`).
 * The publication of a version (scripts/release/publication.ts, run by
 * .github/workflows/release.yml once ci-ok is green on main) moves every pending note under
 * the number it reserves. The « Nouveautés » page of the makeup artists will read `releases`.
 *
 * This module is pure: no file, no network. The scripts read and write the file through it,
 * and the unit tests check the file of the repository with it, so a faulty note fails the CI
 * of its own pull request, not the publication.
 */

import { slugify } from './slug'

/** Where the notes live, from the root of the repository. */
export const CHANGELOG_FILE = 'src/content/changelog.json'

/** The three kinds of note, with the word a page shows in front of each one. */
export const NOTE_TYPES = { ajout: 'Nouveau', amelioration: 'Amélioré', correction: 'Corrigé' } as const
export type NoteType = keyof typeof NOTE_TYPES

export interface Note {
	/** Stable, unique in the whole file: a page keys its list with it. */
	id: string
	type: NoteType
	/** One French sentence, for the person who reads it: no file name, no jargon. */
	text: string
}

export interface Release {
	/** `major.minor.patch`, reserved by the publication. */
	version: string
	/** The day of the publication, in Paris: `YYYY-MM-DD`. */
	date: string
	/** The commit of main that was published, in full. */
	commit: string
	notes: Note[]
}

export interface Changelog {
	description?: string
	/** Notes written since the last publication, in the order they were added. */
	pending: Note[]
	/** Published versions, newest first. Only versions that carried notes are listed. */
	releases: Release[]
}

/** A note is read in one breath: past this length it is no longer a sentence. */
export const NOTE_MAX_LENGTH = 280

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ID_MAX_LENGTH = 60
const VERSION = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/
const COMMIT = /^[0-9a-f]{40}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** What gives away a file or some code in a sentence: a backtick, a folder of the repository, an extension. */
const FILE_OR_CODE: readonly RegExp[] = [
	/`/,
	/(?:^|[\s(«"'’])(?:src|tests|scripts|docs|public|\.github)\//,
	/\.(?:tsx?|jsx?|mjs|cjs|json|md|ya?ml|css|sql|env)\b/,
]

/**
 * Words of the trade that a makeup artist does not have to know. Written in lower case, they
 * are found whatever the case; the acronyms only in capitals (« pr » is not « PR »).
 */
const JARGON = ['commit', 'merge', 'refactor', 'refactoring', 'endpoint', 'webhook', 'backend', 'frontend']
const JARGON_NAMES = ['Payload', 'Next.js', 'TypeScript', 'React', 'Biome', 'Docker', 'Coolify', 'PostgreSQL']
const JARGON_ACRONYMS = ['API', 'CI', 'PR', 'SQL', 'JSON', 'HTTP', 'URL']

const escapeRegExp = (word: string): string => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const asWord = (word: string, flags: string): RegExp =>
	new RegExp(String.raw`(?<![\p{L}\d])${escapeRegExp(word)}(?![\p{L}\d])`, `u${flags}`)
const JARGON_PATTERNS: readonly (readonly [string, RegExp])[] = [
	...[...JARGON, ...JARGON_NAMES].map(word => [word, asWord(word, 'i')] as const),
	...JARGON_ACRONYMS.map(word => [word, asWord(word, '')] as const),
]

/** Personal data never goes into a note: an email address, a phone number. */
const EMAIL = /@/
const PHONE = /(?:\d[\s.-]?){9,}/

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

/** The three numbers of a version, or nothing when it is not `major.minor.patch`. */
export function parseVersion(version: unknown): [number, number, number] | undefined {
	if (typeof version !== 'string') return undefined
	const found = VERSION.exec(version)
	return found ? [Number(found[1]), Number(found[2]), Number(found[3])] : undefined
}

export const isVersion = (version: unknown): version is string => parseVersion(version) !== undefined

/** Negative when `a` comes before `b`, zero when they are the same version. Both must be valid. */
export function compareVersions(a: string, b: string): number {
	const [x, y] = [parseVersion(a), parseVersion(b)]
	if (!x || !y) throw new Error(`Numéro de version illisible : « ${x ? b : a} ».`)
	return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
}

/** A real day of the calendar, written `YYYY-MM-DD`. */
const isDay = (value: unknown): value is string =>
	typeof value === 'string' && DAY.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)

/** Why a sentence cannot be a release note, in French, one reason per line; empty when it can. */
export function noteTextProblems(text: unknown): string[] {
	if (typeof text !== 'string' || text.trim() === '') return ['la note est vide : écris une phrase.']
	const problems: string[] = []
	if (text !== text.trim()) problems.push('la phrase commence ou finit par un espace.')
	if (text.length > NOTE_MAX_LENGTH)
		problems.push(`la phrase fait ${text.length} caractères : ${NOTE_MAX_LENGTH} au plus, une seule idée.`)
	if (!/^\p{Lu}/u.test(text.trim())) problems.push('la phrase commence par une majuscule.')
	if (!/[.!?…]$/.test(text.trim())) problems.push('la phrase finit par un point.')
	if (FILE_OR_CODE.some(pattern => pattern.test(text)))
		problems.push('pas de nom de fichier ni de code : dis ce que la personne peut faire.')
	for (const [word, pattern] of JARGON_PATTERNS)
		if (pattern.test(text)) problems.push(`« ${word} » est un mot de technicien : dis-le avec les mots de la personne.`)
	if (EMAIL.test(text) || PHONE.test(text))
		problems.push('aucune donnée personnelle : ni adresse email, ni numéro de téléphone.')
	return problems
}

function noteProblems(note: unknown, where: string, ids: Set<string>): string[] {
	if (!isRecord(note)) return [`${where} : une note est un objet { id, type, text }.`]
	const problems: string[] = []
	const extra = Object.keys(note).filter(key => !['id', 'type', 'text'].includes(key))
	if (extra.length > 0) problems.push(`${where} : champ inconnu (${extra.join(', ')}).`)
	if (typeof note.id !== 'string' || !ID.test(note.id) || note.id.length > ID_MAX_LENGTH)
		problems.push(`${where} : l’identifiant s’écrit en minuscules et tirets, ${ID_MAX_LENGTH} caractères au plus.`)
	else if (ids.has(note.id)) problems.push(`${where} : l’identifiant « ${note.id} » existe déjà.`)
	else ids.add(note.id)
	if (typeof note.type !== 'string' || !(note.type in NOTE_TYPES))
		problems.push(`${where} : le type est ${Object.keys(NOTE_TYPES).join(', ')}.`)
	for (const problem of noteTextProblems(note.text)) problems.push(`${where} : ${problem}`)
	return problems
}

/**
 * What is wrong with the content of the changelog, in French, one problem per line; empty when
 * it is sound. Every note is checked, published ones too, and every identifier is unique.
 */
export function changelogProblems(data: unknown): string[] {
	if (!isRecord(data)) return ['Le journal est un objet { pending, releases }.']
	const problems: string[] = []
	const extra = Object.keys(data).filter(key => !['description', 'pending', 'releases'].includes(key))
	if (extra.length > 0) problems.push(`Champ inconnu à la racine du journal (${extra.join(', ')}).`)
	if (data.description !== undefined && typeof data.description !== 'string')
		problems.push('« description » est un texte.')

	const ids = new Set<string>()
	if (!Array.isArray(data.pending)) problems.push('« pending » est la liste des notes en attente, même vide.')
	else
		for (const [index, note] of data.pending.entries()) problems.push(...noteProblems(note, `pending[${index}]`, ids))

	if (!Array.isArray(data.releases)) problems.push('« releases » est la liste des versions publiées, même vide.')
	else {
		let newer: string | undefined
		for (const [index, release] of data.releases.entries()) {
			const where = `releases[${index}]`
			if (!isRecord(release)) {
				problems.push(`${where} : une version est un objet { version, date, commit, notes }.`)
				continue
			}
			const extraKeys = Object.keys(release).filter(key => !['version', 'date', 'commit', 'notes'].includes(key))
			if (extraKeys.length > 0) problems.push(`${where} : champ inconnu (${extraKeys.join(', ')}).`)
			if (!isVersion(release.version)) problems.push(`${where} : le numéro s’écrit majeur.mineur.correctif.`)
			else {
				if (newer !== undefined && compareVersions(release.version, newer) >= 0)
					problems.push(`${where} : les versions vont de la plus récente à la plus ancienne, sans doublon.`)
				newer = release.version
			}
			if (!isDay(release.date)) problems.push(`${where} : la date s’écrit AAAA-MM-JJ.`)
			if (typeof release.commit !== 'string' || !COMMIT.test(release.commit))
				problems.push(`${where} : le commit publié s’écrit en entier, 40 caractères hexadécimaux.`)
			if (!Array.isArray(release.notes) || release.notes.length === 0)
				problems.push(`${where} : une version listée porte au moins une note.`)
			else
				for (const [position, note] of release.notes.entries())
					problems.push(...noteProblems(note, `${where}.notes[${position}]`, ids))
		}
	}
	return problems
}

/** Reads the text of the file. Throws, with every problem, when it is not a sound changelog. */
export function parseChangelog(text: string): Changelog {
	let data: unknown
	try {
		data = JSON.parse(text)
	} catch {
		throw new Error(`${CHANGELOG_FILE} n’est pas du JSON lisible.`)
	}
	const problems = changelogProblems(data)
	if (problems.length > 0) throw new Error(`${CHANGELOG_FILE} :\n${problems.map(line => `- ${line}`).join('\n')}`)
	return data as Changelog
}

/** The text of the file: tabs and a final line break, as Biome would write it (Biome leaves this file alone). */
export function serializeChangelog(changelog: Changelog): string {
	const { description, pending, releases } = changelog
	return `${JSON.stringify({ ...(description === undefined ? {} : { description }), pending, releases }, null, '\t')}\n`
}

const allIds = (changelog: Changelog): Set<string> =>
	new Set([...changelog.pending, ...changelog.releases.flatMap(release => release.notes)].map(note => note.id))

/** An identifier made from the sentence, unique in the file: « …-2 », « …-3 » when it is taken. */
function newId(text: string, taken: Set<string>): string {
	const base =
		slugify(text)
			.slice(0, ID_MAX_LENGTH - 3)
			.replace(/-+$/, '') || 'note'
	if (!taken.has(base)) return base
	let n = 2
	while (taken.has(`${base}-${n}`)) n += 1
	return `${base}-${n}`
}

/** The changelog with one more pending note. Throws, in French, when the type or the sentence is refused. */
export function addNote(changelog: Changelog, type: string, text: string): Changelog {
	const problems = noteTextProblems(text)
	if (!(type in NOTE_TYPES))
		problems.unshift(`le type « ${type} » n’existe pas : ${Object.keys(NOTE_TYPES).join(', ')}.`)
	if (problems.length > 0) throw new Error(`Note refusée :\n${problems.map(line => `- ${line}`).join('\n')}`)
	const note: Note = { id: newId(text, allIds(changelog)), type: type as NoteType, text }
	return { ...changelog, pending: [...changelog.pending, note] }
}

/**
 * The changelog once a version is published: every pending note moves, in its order, under the
 * new number. A version without notes leaves the changelog as it is: a technical publication
 * does not invent news.
 */
export function promotePending(changelog: Changelog, release: Omit<Release, 'notes'>): Changelog {
	const problems = changelogProblems(changelog)
	if (!isVersion(release.version)) problems.push(`Numéro à publier illisible : « ${release.version} ».`)
	if (!isDay(release.date)) problems.push(`Date de publication illisible : « ${release.date} ».`)
	if (!COMMIT.test(release.commit)) problems.push(`Commit publié illisible : « ${release.commit} ».`)
	const latest = changelog.releases[0]?.version
	if (latest !== undefined && isVersion(release.version) && compareVersions(release.version, latest) <= 0)
		problems.push(`La version ${release.version} n’est pas plus récente que la dernière publiée (${latest}).`)
	if (problems.length > 0) throw new Error(problems.join('\n'))
	if (changelog.pending.length === 0) return changelog
	return { ...changelog, pending: [], releases: [{ ...release, notes: changelog.pending }, ...changelog.releases] }
}
