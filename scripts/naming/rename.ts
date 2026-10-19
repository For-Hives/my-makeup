/**
 * The rename tool of the English-names lots: moves files and folders and renames names through the
 * language service of TypeScript, so that every importer follows. No sed, no regular expression on
 * an identifier. It is removed by ticket 254, once the last lot is merged.
 *
 *   bun run names:rename <table.json> [--dry-run] [--no-git] [--project tsconfig.json]
 *
 * The table is a JSON file:
 *
 *   {
 *     "files": [{ "from": "src/lib/espace", "to": "src/lib/dashboard" },
 *               { "from": "src/lib/x/lire.ts", "to": "src/lib/x/read.ts" }],
 *     "names": [{ "file": "src/lib/x/read.ts", "from": "lireLeProfil", "to": "readProfile" }]
 *   }
 *
 * - `files` runs first, in order. A folder moves with what is inside it. The importers (and the moved
 *   files' own imports) are rewritten by `getEditsForFileRename`. Paths are relative to the root.
 * - `names` runs second, on the paths AFTER the moves. Each entry renames every declaration called
 *   `from` in that file, and its references in the whole project (importers, re-exports, shorthand
 *   properties). Strings and comments are not touched.
 *
 * Paths and names are checked before anything is written: a missing path, a target that exists, a
 * name that is not declared in the file or a `to` that is already declared there stops the run.
 * Without `--dry-run` the files are moved (by `git mv` when the root is a git checkout, unless
 * `--no-git`) and the changed texts written. It lists the files that still mention an old path in a
 * form the language service cannot follow (documents, JSON, workflows): those are for the lot to fix.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

export interface RenameTable {
	files?: { from: string; to: string }[]
	names?: { file: string; from: string; to: string }[]
}

export interface RenameOptions {
	root: string
	table: RenameTable
	/** Relative to `root`. */
	tsconfig?: string
	/** Compute and report, write nothing. */
	dryRun?: boolean
	/** Move with `git mv` when `root` holds a `.git`. Default true. */
	useGit?: boolean
}

export interface RenameResult {
	/** Paths relative to the root, after the moves. */
	changedFiles: string[]
	moved: { from: string; to: string }[]
	renamed: { file: string; from: string; to: string; references: number }[]
	/** Files that still mention an old path or name as text. */
	leftovers: { file: string; line: number; text: string }[]
}

const FORMAT: ts.FormatCodeSettings = { indentSize: 2, tabSize: 2, convertTabsToSpaces: false }
const PREFERENCES: ts.UserPreferences = {
	providePrefixAndSuffixTextForRename: true,
	allowRenameOfImportPath: false,
	importModuleSpecifierPreference: 'relative',
}

function normalize(file: string): string {
	return path.sep === '/' ? file : file.split(path.sep).join('/')
}

export class Project {
	/** Absolute path -> text of every TypeScript file of the project, as it is now. */
	private readonly texts = new Map<string, string>()
	private readonly versions = new Map<string, number>()
	private readonly removed = new Set<string>()
	readonly changed = new Set<string>()
	private readonly service: ts.LanguageService

	constructor(
		readonly root: string,
		tsconfig: string
	) {
		const configPath = path.join(root, tsconfig)
		const config = ts.getParsedCommandLineOfConfigFile(
			configPath,
			{ noEmit: true },
			{
				...ts.sys,
				onUnRecoverableConfigFileDiagnostic: diagnostic => {
					throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
				},
			}
		)
		if (!config) throw new Error(`Cannot read ${configPath}`)
		for (const file of config.fileNames) {
			if (file.includes('/node_modules/')) continue
			this.texts.set(normalize(file), readFileSync(file, 'utf8'))
		}
		const host: ts.LanguageServiceHost = {
			getCompilationSettings: () => config.options,
			getCurrentDirectory: () => root,
			getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
			getScriptFileNames: () => {
				this.fileNames ??= [...this.texts.keys()]
				return this.fileNames
			},
			getScriptVersion: file => String(this.versions.get(normalize(file)) ?? 0),
			getScriptSnapshot: file => {
				const text = this.read(normalize(file))
				return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
			},
			fileExists: file => this.fileExists(normalize(file)),
			readFile: file => this.read(normalize(file)),
			readDirectory: ts.sys.readDirectory,
			directoryExists: dir => this.directoryExists(normalize(dir)),
			getDirectories: ts.sys.getDirectories,
			realpath: ts.sys.realpath,
		}
		this.service = ts.createLanguageService(host, ts.createDocumentRegistry())
	}

	/** Text of the files outside the project (libraries, types), read once. */
	private readonly outside = new Map<string, string | null>()

	private read(file: string): string | undefined {
		const known = this.texts.get(file)
		if (known !== undefined) return known
		if (this.removed.has(file)) return undefined
		let cached = this.outside.get(file)
		if (cached === undefined) {
			cached = ts.sys.fileExists(file) ? (ts.sys.readFile(file) ?? null) : null
			this.outside.set(file, cached)
		}
		return cached ?? undefined
	}

	private fileExists(file: string): boolean {
		if (this.texts.has(file)) return true
		if (this.removed.has(file)) return false
		return ts.sys.fileExists(file)
	}

	/** The folders and file list of the project, rebuilt only when a file is added or removed. */
	private folders: Set<string> | null = null
	private fileNames: string[] | null = null

	private directoryExists(dir: string): boolean {
		if (!this.folders) {
			this.folders = new Set()
			for (const file of this.texts.keys()) {
				for (let at = file.lastIndexOf('/'); at > 0; at = file.lastIndexOf('/', at - 1)) {
					const folder = file.slice(0, at)
					if (this.folders.has(folder)) break
					this.folders.add(folder)
				}
			}
		}
		return this.folders.has(dir) || ts.sys.directoryExists(dir)
	}

	abs(relative: string): string {
		return normalize(path.join(this.root, relative))
	}

	rel(absolute: string): string {
		return normalize(path.relative(this.root, absolute))
	}

	has(absolute: string): boolean {
		return this.texts.has(absolute)
	}

	filesUnder(absolute: string): string[] {
		return [...this.texts.keys()].filter(file => file === absolute || file.startsWith(`${absolute}/`))
	}

	text(absolute: string): string {
		const text = this.texts.get(absolute)
		if (text === undefined) throw new Error(`${this.rel(absolute)} is not a file of the project`)
		return text
	}

	private set(absolute: string, text: string): void {
		if (!this.texts.has(absolute)) {
			this.folders = null
			this.fileNames = null
		}
		this.texts.set(absolute, text)
		this.versions.set(absolute, (this.versions.get(absolute) ?? 0) + 1)
		this.changed.add(absolute)
	}

	private applyEdits(file: string, edits: readonly ts.TextChange[]): void {
		const text = this.text(file)
		const sorted = [...edits].sort((a, b) => b.span.start - a.span.start)
		let next = text
		for (const edit of sorted) {
			next = next.slice(0, edit.span.start) + edit.newText + next.slice(edit.span.start + edit.span.length)
		}
		this.set(file, next)
	}

	/** Moves one file or folder inside the project and rewrites what imports it (and what it imports). */
	move(from: string, to: string): void {
		const members = this.filesUnder(from)
		const isFile = this.texts.has(from)
		const changes = this.service.getEditsForFileRename(from, to, FORMAT, PREFERENCES)
		const moves = new Map<string, string>()
		for (const member of members) moves.set(member, isFile ? to : to + member.slice(from.length))
		for (const change of changes) {
			const file = normalize(change.fileName)
			if (this.texts.has(file)) this.applyEdits(file, change.textChanges)
		}
		for (const [oldFile, newFile] of moves) {
			const text = this.text(oldFile)
			this.texts.delete(oldFile)
			this.folders = null
			this.fileNames = null
			this.removed.add(oldFile)
			this.removed.delete(newFile)
			this.set(newFile, text)
			this.changed.delete(oldFile)
		}
	}

	/** Every declaration identifier called `name` in the file, in order. */
	declarationPositions(file: string, name: string): number[] {
		const source = ts.createSourceFile(file, this.text(file), ts.ScriptTarget.ES2022, true)
		const positions: number[] = []
		const visit = (node: ts.Node): void => {
			if (
				(ts.isVariableDeclaration(node) ||
					ts.isFunctionDeclaration(node) ||
					ts.isClassDeclaration(node) ||
					ts.isInterfaceDeclaration(node) ||
					ts.isTypeAliasDeclaration(node) ||
					ts.isEnumDeclaration(node) ||
					ts.isBindingElement(node)) &&
				node.name &&
				ts.isIdentifier(node.name) &&
				node.name.text === name
			) {
				positions.push(node.name.getStart(source))
			}
			ts.forEachChild(node, visit)
		}
		visit(source)
		return positions
	}

	/**
	 * The edits that rename the declaration at `position` and every reference, as spans of the text
	 * the project has now. Nothing is applied: `applyBatch` applies the edits of many renames at once,
	 * so that the language service computes all of them on the same state of the project.
	 */
	renameEdits(file: string, position: number, to: string): Map<string, ts.TextChange[]> {
		const locations = this.service.findRenameLocations(file, position, false, false, PREFERENCES)
		if (!locations || locations.length === 0) throw new Error(`Nothing to rename at ${this.rel(file)}:${position}`)
		const byFile = new Map<string, ts.TextChange[]>()
		for (const location of locations) {
			const target = normalize(location.fileName)
			if (!this.texts.has(target)) continue
			const edits = byFile.get(target) ?? []
			edits.push({
				span: location.textSpan,
				newText: `${location.prefixText ?? ''}${to}${location.suffixText ?? ''}`,
			})
			byFile.set(target, edits)
		}
		return byFile
	}

	/** Applies edits of several renames together; the same span asked twice is applied once. */
	applyBatch(batch: readonly Map<string, ts.TextChange[]>[]): void {
		const merged = new Map<string, Map<string, ts.TextChange>>()
		for (const edits of batch) {
			for (const [file, list] of edits) {
				const spans = merged.get(file) ?? new Map<string, ts.TextChange>()
				for (const edit of list) spans.set(`${edit.span.start}:${edit.span.length}:${edit.newText}`, edit)
				merged.set(file, spans)
			}
		}
		for (const [file, spans] of merged) {
			const sorted = [...spans.values()].sort((x, y) => x.span.start - y.span.start)
			for (let i = 1; i < sorted.length; i++) {
				const previous = sorted[i - 1]
				const current = sorted[i]
				if (previous && current && previous.span.start + previous.span.length > current.span.start) {
					throw new Error(`Two renames touch the same place in ${this.rel(file)}`)
				}
			}
			this.applyEdits(file, sorted)
		}
	}
}

function git(root: string, args: string[]): { ok: boolean; stdout: string } {
	const run = Bun.spawnSync(['git', ...args], { cwd: root })
	return { ok: run.exitCode === 0, stdout: new TextDecoder().decode(run.stdout) }
}

function validate(project: Project, table: RenameTable): void {
	const problems: string[] = []
	const seenTargets = new Set<string>()
	for (const move of table.files ?? []) {
		const from = project.abs(move.from)
		const to = project.abs(move.to)
		if (project.filesUnder(from).length === 0)
			problems.push(`files: ${move.from} is not a file or folder of the project`)
		if (project.filesUnder(to).length > 0 || existsSync(to)) problems.push(`files: ${move.to} already exists`)
		if (seenTargets.has(to)) problems.push(`files: ${move.to} is the target of two moves`)
		seenTargets.add(to)
	}
	for (const entry of table.names ?? []) {
		if (!/^[A-Za-z_$][\w$]*$/.test(entry.to)) problems.push(`names: ${entry.to} is not an identifier`)
		if (entry.from === entry.to) problems.push(`names: ${entry.from} is renamed to itself`)
	}
	if (problems.length > 0) throw new Error(problems.join('\n'))
}

function findLeftovers(root: string, needles: readonly string[]): RenameResult['leftovers'] {
	if (needles.length === 0 || !existsSync(path.join(root, '.git'))) return []
	const result: RenameResult['leftovers'] = []
	for (const needle of needles) {
		const run = git(root, ['grep', '-nIF', '--no-color', '-e', needle])
		for (const line of run.stdout.split('\n')) {
			const match = /^([^:]+):(\d+):(.*)$/.exec(line)
			if (match?.[1] && match[2]) result.push({ file: match[1], line: Number(match[2]), text: (match[3] ?? '').trim() })
		}
	}
	return result
}

export function applyRenameTable(options: RenameOptions): RenameResult {
	const root = path.resolve(options.root)
	const table = options.table
	const project = new Project(normalize(root), options.tsconfig ?? 'tsconfig.json')
	validate(project, table)

	const moved: RenameResult['moved'] = []
	for (const move of table.files ?? []) {
		project.move(project.abs(move.from), project.abs(move.to))
		moved.push({ from: move.from, to: move.to })
	}

	// All the renames are computed on the same state of the project, then applied together: the
	// language service does not rebuild its program between two names.
	const renamed: RenameResult['renamed'] = []
	const problems: string[] = []
	const batch: Map<string, ts.TextChange[]>[] = []
	const leaving = new Map<string, Set<string>>()
	for (const entry of table.names ?? []) {
		const file = project.abs(entry.file)
		leaving.set(file, (leaving.get(file) ?? new Set<string>()).add(entry.from))
	}
	for (const entry of table.names ?? []) {
		const file = project.abs(entry.file)
		if (!project.has(file)) {
			problems.push(`names: ${entry.file} is not a file of the project (paths are those after the moves)`)
			continue
		}
		if (project.declarationPositions(file, entry.to).length > 0 && !leaving.get(file)?.has(entry.to)) {
			problems.push(`names: ${entry.to} is already declared in ${entry.file}`)
			continue
		}
		const positions = project.declarationPositions(file, entry.from)
		if (positions.length === 0) {
			problems.push(`names: ${entry.from} is not declared in ${entry.file}`)
			continue
		}
		let references = 0
		for (const position of positions) {
			const edits = project.renameEdits(file, position, entry.to)
			for (const list of edits.values()) references += list.length
			batch.push(edits)
		}
		renamed.push({ file: entry.file, from: entry.from, to: entry.to, references })
	}
	if (problems.length > 0) throw new Error(problems.join('\n'))
	project.applyBatch(batch)

	if (!options.dryRun) {
		const useGit = (options.useGit ?? true) && existsSync(path.join(root, '.git'))
		for (const move of moved) {
			const from = path.join(root, move.from)
			const to = path.join(root, move.to)
			mkdirSync(path.dirname(to), { recursive: true })
			if (!(useGit && git(root, ['mv', move.from, move.to]).ok)) renameSync(from, to)
		}
		for (const file of project.changed) {
			if (existsSync(path.dirname(file))) writeFileSync(file, project.text(file))
		}
	}
	const leftovers = options.dryRun
		? []
		: findLeftovers(root, [...moved.map(move => move.from), ...renamed.map(entry => entry.from)])
	return {
		changedFiles: [...project.changed].map(file => project.rel(file)).sort(),
		moved,
		renamed,
		leftovers,
	}
}

export function main(args: readonly string[]): number {
	const flag = (name: string) => args.includes(name)
	const projectIndex = args.indexOf('--project')
	const tsconfig = projectIndex >= 0 ? args[projectIndex + 1] : undefined
	const tablePath = args.find((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--project')
	if (!tablePath) {
		console.error('Usage: bun run names:rename <table.json> [--dry-run] [--no-git] [--project tsconfig.json]')
		return 2
	}
	const table = JSON.parse(readFileSync(tablePath, 'utf8')) as RenameTable
	const root = process.cwd()
	try {
		const result = applyRenameTable({
			root,
			table,
			dryRun: flag('--dry-run'),
			useGit: !flag('--no-git'),
			...(tsconfig ? { tsconfig } : {}),
		})
		for (const move of result.moved) console.log(`moved   ${move.from} -> ${move.to}`)
		for (const entry of result.renamed) {
			console.log(`renamed ${entry.from} -> ${entry.to} (${entry.references} places) in ${entry.file}`)
		}
		console.log(`${result.changedFiles.length} file(s) ${flag('--dry-run') ? 'would change' : 'changed'}.`)
		if (result.leftovers.length > 0) {
			console.log('\nStill mentioned as text, outside the language service (fix by hand):')
			for (const left of result.leftovers) console.log(`  ${left.file}:${left.line}  ${left.text.slice(0, 100)}`)
		}
		return 0
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error))
		return 1
	}
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
