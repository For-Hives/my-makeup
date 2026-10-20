/**
 * The naming check: lists the names of the code that are still French (CLAUDE.md, « Conventions »).
 *
 *   bun run names:check                       the whole repository, minus the waiting list
 *   bun run names:check src/lib/auth          one or more folders or files
 *   bun run names:check --no-waiting          ignore the waiting list: the real size of the work
 *   bun run names:check --summary             counts by kind, to compare with PLAN-ANGLAIS.md §2
 *   bun run names:check --json                the findings as JSON
 *
 * It reads declarations, file and folder names, the scripts of package.json, the environment
 * variables the code reads and the options of our scripts (scripts/naming/collect.ts). It reads
 * neither strings nor comments.
 *
 * The exit code is 1 when a French name is found outside the waiting list and the named exceptions
 * (scripts/naming/config.json). The waiting list holds the folders no lot has renamed yet: each lot
 * removes its folders from it. The words come from scripts/naming/french-words.txt.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
	type CollectedName,
	collectFromPackageScripts,
	collectFromSource,
	directoriesOf,
	fileStem,
	isSourceFile,
	type NameKind,
} from './collect'
import { frenchWordsOf, parseWordList } from './split-words'

const ROOT = path.resolve(import.meta.dir, '../..')
const NAMING_DIR = import.meta.dir

/** The folders and files scanned. */
export const SCANNED_ROOTS = ['src', 'scripts', 'tests'] as const

export interface NamingConfig {
	/**
	 * Paths (a file or a folder, and what is inside) that no lot has handled yet. An entry that starts
	 * with `!` takes a path back out of the list; the last matching entry wins. An entry that starts
	 * with `=` covers that exact path only, not what is inside (a folder whose own name is French).
	 */
	waiting: string[]
	exceptions: {
		/** A file or folder whose own name stays: a frozen address, a workflow file. Not what is inside. */
		paths: { path: string; reason: string }[]
		/** A word that stays wherever it is found, or only under the paths listed in `in`. */
		words: { word: string; reason: string; in?: string[] }[]
	}
}

export interface Finding extends CollectedName {
	/** The French words of the name that are not excused by an exception. */
	words: string[]
}

export interface Report {
	/** Outside the waiting list and the exceptions: these fail the check. */
	failures: Finding[]
	/** French names inside the waiting list. */
	waiting: Finding[]
	/** French names an exception excuses completely. */
	excused: Finding[]
	/** Waiting-list entries that match no path any more. */
	staleWaiting: string[]
	/** Exceptions that match nothing any more (a file was moved or deleted): to remove or update. */
	staleExceptions: string[]
	totals: Record<string, { all: number; french: number }>
}

export function loadWords(file = path.join(NAMING_DIR, 'french-words.txt')): Set<string> {
	return parseWordList(readFileSync(file, 'utf8'))
}

export function loadConfig(file = path.join(NAMING_DIR, 'config.json')): NamingConfig {
	return JSON.parse(readFileSync(file, 'utf8')) as NamingConfig
}

export function isUnder(candidate: string, entry: string): boolean {
	return candidate === entry || candidate.startsWith(`${entry}/`)
}

export function isWaiting(candidate: string, waiting: readonly string[]): boolean {
	let covered = false
	for (const entry of waiting) {
		if (entry.startsWith('=')) {
			if (candidate === entry.slice(1)) covered = true
		} else if (entry.startsWith('!')) {
			if (isUnder(candidate, entry.slice(1))) covered = false
		} else if (isUnder(candidate, entry)) covered = true
	}
	return covered
}

/** The names of one file as `file`, `directory` entries and the names read from its text. */
export function namesOfPaths(
	paths: readonly string[],
	read: (file: string) => string,
	scannedRoots: readonly string[] = SCANNED_ROOTS
): CollectedName[] {
	const names: CollectedName[] = []
	const directories = new Set<string>()
	for (const file of paths) {
		if (!scannedRoots.some(root => isUnder(file, root))) continue
		for (const dir of directoriesOf(file)) {
			if (directories.has(dir)) continue
			directories.add(dir)
			names.push({ kind: 'directory', name: dir.slice(dir.lastIndexOf('/') + 1), file: dir })
		}
		names.push({ kind: 'file', name: fileStem(file), file })
		const isOption = isUnder(file, 'scripts') || isUnder(file, 'tests/support')
		if (isSourceFile(file)) {
			for (const entry of collectFromSource(file, read(file))) {
				if (entry.kind === 'option' && !isOption) continue
				names.push(entry)
			}
		}
	}
	return names
}

function listedFiles(): string[] {
	const run = Bun.spawnSync(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: ROOT })
	return new TextDecoder()
		.decode(run.stdout)
		.split('\0')
		.filter(file => file && existsSync(path.join(ROOT, file)))
}

/** Every name of the repository, French or not. */
export function collectRepository(): CollectedName[] {
	const files = listedFiles()
	const names = namesOfPaths(files, file => readFileSync(path.join(ROOT, file), 'utf8'))
	if (files.includes('package.json')) {
		names.push(...collectFromPackageScripts('package.json', readFileSync(path.join(ROOT, 'package.json'), 'utf8')))
	}
	return names
}

function wordIsExcused(word: string, file: string, config: NamingConfig): boolean {
	return config.exceptions.words.some(
		rule => rule.word === word && (!rule.in || rule.in.some(scope => isUnder(file, scope)))
	)
}

function totalsKey(entry: CollectedName): string {
	if (entry.kind !== 'declaration') return entry.kind
	return entry.exported ? 'declaration-exported' : 'declaration'
}

/** Sorts the names into failures, waiting names and excused names, and counts them. */
export function evaluate(
	names: readonly CollectedName[],
	config: NamingConfig,
	words: ReadonlySet<string>,
	options: { useWaiting?: boolean; scope?: readonly string[] } = {}
): Report {
	const useWaiting = options.useWaiting ?? true
	const scope = options.scope ?? []
	const report: Report = { failures: [], waiting: [], excused: [], staleWaiting: [], staleExceptions: [], totals: {} }
	const distinct = new Set<string>()
	const reported = new Set<string>()
	const bump = (key: string, french: boolean) => {
		const total = report.totals[key] ?? { all: 0, french: 0 }
		total.all++
		if (french) total.french++
		report.totals[key] = total
	}
	for (const entry of names) {
		if (scope.length > 0 && !scope.some(s => isUnder(entry.file, s))) continue
		const found = frenchWordsOf(entry.name, words)
		const isNameKind = entry.kind === 'file' || entry.kind === 'directory'
		// Distinct counts, like the plan: a name declared twice, or an option used twice, counts once.
		const identity = isNameKind ? `${entry.kind}:${entry.file}` : `${totalsKey(entry)}:${entry.name}`
		const first = !distinct.has(identity)
		distinct.add(identity)
		if (first) bump(totalsKey(entry), found.length > 0)
		if (entry.kind === 'declaration' && entry.exported && first) {
			const plain = `declaration:${entry.name}`
			if (!distinct.has(plain)) {
				distinct.add(plain)
				bump('declaration', found.length > 0)
			}
		}
		if (found.length === 0) continue
		const reportKey = `${entry.file}|${entry.kind}|${entry.name}`
		if (reported.has(reportKey)) continue
		reported.add(reportKey)
		const pathExcused = isNameKind && config.exceptions.paths.some(rule => rule.path === entry.file)
		const remaining = pathExcused ? [] : found.filter(word => !wordIsExcused(word, entry.file, config))
		const finding: Finding = { ...entry, words: remaining.length > 0 ? remaining : found }
		if (remaining.length === 0) report.excused.push(finding)
		else if (useWaiting && isWaiting(entry.file, config.waiting)) report.waiting.push(finding)
		else report.failures.push(finding)
	}
	const paths = new Set(names.map(entry => entry.file))
	report.staleWaiting = config.waiting
		.filter(entry => !entry.startsWith('!'))
		.map(entry => (entry.startsWith('=') ? entry.slice(1) : entry))
		.filter(entry => ![...paths].some(p => isUnder(p, entry)))
	report.staleExceptions = [
		...config.exceptions.paths.map(rule => rule.path).filter(rulePath => !paths.has(rulePath)),
		...config.exceptions.words.flatMap(rule =>
			(rule.in ?? []).filter(scope => ![...paths].some(p => isUnder(p, scope))).map(scope => `${rule.word} in ${scope}`)
		),
	]
	return report
}

const KIND_LABEL: Record<string, string> = {
	file: 'files',
	directory: 'folders',
	declaration: 'declared names (distinct)',
	'declaration-exported': 'exported names (distinct)',
	env: 'environment variables',
	option: 'script options',
	script: 'package.json scripts',
}

export function formatFindings(findings: readonly Finding[]): string {
	const byFile = new Map<string, Finding[]>()
	for (const finding of findings) byFile.set(finding.file, [...(byFile.get(finding.file) ?? []), finding])
	const lines: string[] = []
	for (const file of [...byFile.keys()].sort()) {
		lines.push(file)
		for (const finding of byFile.get(file) ?? []) {
			const kind: NameKind | string = finding.exported ? `${finding.kind} (exported)` : finding.kind
			lines.push(`  ${kind}: ${finding.name}  [${finding.words.join(', ')}]`)
		}
	}
	return lines.join('\n')
}

export function formatSummary(report: Report): string {
	const lines = ['kind                         french / all']
	for (const key of Object.keys(KIND_LABEL)) {
		const total = report.totals[key]
		if (!total) continue
		const percent = total.all > 0 ? Math.round((100 * total.french) / total.all) : 0
		lines.push(`${(KIND_LABEL[key] ?? key).padEnd(28)} ${total.french} / ${total.all} (${percent} %)`)
	}
	lines.push(`failures ${report.failures.length}, waiting ${report.waiting.length}, excused ${report.excused.length}`)
	return lines.join('\n')
}

export function main(args: readonly string[]): number {
	const flags = args.filter(arg => arg.startsWith('--'))
	const scope = args.filter(arg => !arg.startsWith('--')).map(arg => arg.replace(/^\.\//, '').replace(/\/$/, ''))
	const unknown = flags.filter(flag => !['--no-waiting', '--summary', '--json'].includes(flag))
	if (unknown.length > 0) {
		console.error(`Unknown option: ${unknown.join(', ')}`)
		return 2
	}
	const useWaiting = !flags.includes('--no-waiting')
	const report = evaluate(collectRepository(), loadConfig(), loadWords(), { useWaiting, scope })
	if (flags.includes('--json')) console.log(JSON.stringify(report, null, 2))
	else {
		if (report.failures.length > 0) console.log(formatFindings(report.failures))
		if (flags.includes('--summary')) console.log(`\n${formatSummary(report)}`)
		if (report.staleWaiting.length > 0 && scope.length === 0) {
			console.log(`\nWaiting-list entries that match nothing any more (remove them): ${report.staleWaiting.join(', ')}`)
		}
		if (report.staleExceptions.length > 0 && scope.length === 0) {
			console.log(
				`\nExceptions that match nothing any more (update or remove them): ${report.staleExceptions.join(', ')}`
			)
		}
	}
	if (report.failures.length > 0) {
		console.error(`\n${report.failures.length} French name(s) outside the waiting list and the exceptions.`)
		return 1
	}
	return 0
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
