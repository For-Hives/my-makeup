/**
 * Reads, from source text and without running anything, the field names that the code hands to Payload
 * in a `select`, a `where`, a `sort` or a `populate` (ticket 300), with the collection each one is asked of.
 *
 * Payload accepts a key it does not know without any error: the result is only empty. That is how two
 * renamed fields (`prenom`, `nomArtiste`) went unseen through every test. This file reads the keys; the
 * test `tests/unit/query-keys.test.ts` checks them against the real configuration of the collections.
 *
 * What it reads: an object literal that has a `collection` property and, next to it, `select`, `where`,
 * `sort` or `populate`. A value may be written in place or named: a constant of the same file, or one
 * imported from another file of the scanned code (`select: CARD_FIELDS`, `where: LISTED_FILTER`,
 * `...PAGE_FIELDS`, `cond && { a: true }`, `cond ? A : B`). Names are looked up in the file first and
 * then through its imports, never in a table shared by all the files, so two files may give the same
 * name to two different things.
 *
 * What it cannot read (a collection passed as a parameter, a key computed from a variable, a filter
 * returned by a function) is returned as `unresolved`, with the reason, so that nothing is skipped
 * silently. A line can state that such a read is checked elsewhere: `// query-keys: ignore <reason>`,
 * on the line of the read or the line above it (docs/qualite.md, section 13).
 */
import { posix } from 'node:path'
import ts from 'typescript'

export type QueryKind = 'select' | 'where' | 'sort' | 'populate'

/** One field path (`pro.email`) asked of a collection, at a place of the code. */
export interface QueryKey {
	file: string
	line: number
	collection: string
	kind: QueryKind
	path: string
}

/** A key, or a collection, that could not be read from the text. */
export interface UnresolvedQuery {
	file: string
	line: number
	kind: QueryKind | 'collection'
	reason: string
}

export interface CollectedQueries {
	keys: QueryKey[]
	unresolved: UnresolvedQuery[]
}

const KINDS: readonly QueryKind[] = ['select', 'where', 'sort', 'populate']
const LOGICAL_OPERATORS = new Set(['and', 'or'])
const MAX_DEPTH = 8

/** An exception stated on the line of a read, or the line above it. It must give a reason. */
const IGNORE_MARK = /\/\/\s*query-keys:\s*ignore\s+\S/

/** An expression, with the file it is written in (a name is looked up from there). */
interface Located {
	node: ts.Expression
	file: string
}

interface ParsedFile {
	source: ts.SourceFile
	lines: string[]
	/** Every `const name = …` of the file, at any depth: a name declared twice is kept twice. */
	declarations: Map<string, ts.Expression[]>
	/** `import { exported as local } from 'module'`, by local name. */
	imports: Map<string, { module: string; exported: string }>
}

function scriptKind(path: string): ts.ScriptKind {
	return path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
}

function unwrap(node: ts.Expression): ts.Expression {
	let current = node
	while (
		ts.isAsExpression(current) ||
		ts.isParenthesizedExpression(current) ||
		ts.isSatisfiesExpression(current) ||
		ts.isNonNullExpression(current)
	)
		current = current.expression
	return current
}

function textOf(node: ts.Node): string | undefined {
	return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : undefined
}

function parse(file: string, text: string): ParsedFile {
	const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file))
	const declarations = new Map<string, ts.Expression[]>()
	const imports = new Map<string, { module: string; exported: string }>()
	const visit = (node: ts.Node): void => {
		if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
			const list = declarations.get(node.name.text) ?? []
			list.push(node.initializer)
			declarations.set(node.name.text, list)
		}
		if (
			ts.isImportDeclaration(node) &&
			ts.isStringLiteral(node.moduleSpecifier) &&
			node.importClause?.namedBindings &&
			ts.isNamedImports(node.importClause.namedBindings)
		)
			for (const element of node.importClause.namedBindings.elements)
				imports.set(element.name.text, {
					module: node.moduleSpecifier.text,
					exported: (element.propertyName ?? element.name).text,
				})
		ts.forEachChild(node, visit)
	}
	visit(source)
	return { source, lines: text.split('\n'), declarations, imports }
}

/** Reads the keys that every file of `files` (path to text) hands to Payload. */
export function collectQueries(files: ReadonlyMap<string, string>): CollectedQueries {
	const parsed = new Map<string, ParsedFile>()
	for (const [file, text] of files) parsed.set(file, parse(file, text))

	/** The file an import points to: `@/x` is `src/x`, `./x` is beside the importing file. */
	function moduleFile(from: string, module: string): string | undefined {
		let base: string
		if (module.startsWith('@/')) base = `src/${module.slice(2)}`
		else if (module.startsWith('.')) base = posix.join(posix.dirname(from), module)
		else return undefined
		return [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(candidate => parsed.has(candidate))
	}

	/**
	 * What an expression stands for, once the names are followed: the expressions it may be (a conditional has
	 * two). `undefined` when a name is ambiguous or not found, or the expression is a call.
	 */
	function resolve(located: Located, depth = 0): Located[] | undefined {
		if (depth > MAX_DEPTH) return undefined
		const node = unwrap(located.node)
		const here = { file: located.file }
		if (ts.isConditionalExpression(node)) {
			const branches = [node.whenTrue, node.whenFalse].map(branch => resolve({ node: branch, ...here }, depth + 1))
			return branches.every(branch => branch !== undefined) ? branches.flat().filter(Boolean) : undefined
		}
		if (ts.isBinaryExpression(node)) {
			const operator = node.operatorToken.kind
			if (operator === ts.SyntaxKind.AmpersandAmpersandToken) return resolve({ node: node.right, ...here }, depth + 1)
			if (operator === ts.SyntaxKind.BarBarToken || operator === ts.SyntaxKind.QuestionQuestionToken) {
				const sides = [node.left, node.right].map(side => resolve({ node: side, ...here }, depth + 1))
				return sides.every(side => side !== undefined) ? sides.flat().filter(Boolean) : undefined
			}
			return undefined
		}
		if (ts.isIdentifier(node)) return resolveName(located.file, node.text, depth)
		if (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node) || textOf(node) !== undefined)
			return [{ node, ...here }]
		return undefined
	}

	function resolveName(file: string, name: string, depth: number): Located[] | undefined {
		const entry = parsed.get(file)
		if (!entry) return undefined
		const own = entry.declarations.get(name)
		if (own) return own.length === 1 && own[0] ? resolve({ node: own[0], file }, depth + 1) : undefined
		const imported = entry.imports.get(name)
		const target = imported ? moduleFile(file, imported.module) : undefined
		return imported && target ? resolveName(target, imported.exported, depth + 1) : undefined
	}

	const keys: QueryKey[] = []
	const unresolved: UnresolvedQuery[] = []

	for (const [file, entry] of parsed) {
		const { source, lines } = entry
		const lineOf = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
		const ignored = (node: ts.Node) => {
			const line = lineOf(node)
			return IGNORE_MARK.test(lines[line - 1] ?? '') || IGNORE_MARK.test(lines[line - 2] ?? '')
		}
		const skip = (node: ts.Node, kind: QueryKind | 'collection', reason: string, owner?: ts.Node) => {
			if (!ignored(node) && !(owner && ignored(owner))) unresolved.push({ file, line: lineOf(node), kind, reason })
		}
		const add = (node: ts.Node, collection: string, kind: QueryKind, path: string) =>
			keys.push({ file, line: lineOf(node), collection, kind, path })

		/** The name of a property: written, or computed from a constant. */
		function keyName(name: ts.PropertyName): string | undefined {
			if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name))
				return name.text
			if (ts.isComputedPropertyName(name)) {
				const found = resolve({ node: name.expression, file })
				const only = found?.length === 1 ? found[0] : undefined
				return only ? textOf(only.node) : undefined
			}
			return undefined
		}

		/** The properties of an object literal as (name, value), spreads of named or conditional objects followed. */
		function properties(
			object: Located,
			fail: (node: ts.Node, reason: string) => void,
			depth = 0
		): { name: string; value: Located; at: ts.Node }[] {
			const found: { name: string; value: Located; at: ts.Node }[] = []
			if (!ts.isObjectLiteralExpression(object.node) || depth > MAX_DEPTH) return found
			for (const property of object.node.properties) {
				if (ts.isSpreadAssignment(property)) {
					const targets = resolve({ node: property.expression, file: object.file })
					if (!targets) fail(property, 'spread that cannot be followed')
					else
						for (const target of targets)
							found.push(...properties(target, fail, depth + 1).map(item => ({ ...item, at: property })))
				} else if (ts.isPropertyAssignment(property)) {
					const name = keyName(property.name)
					if (name === undefined) fail(property, 'computed key that is not a constant')
					else found.push({ name, value: { node: property.initializer, file: object.file }, at: property })
				} else if (ts.isShorthandPropertyAssignment(property))
					found.push({ name: property.name.text, value: { node: property.name, file: object.file }, at: property })
				else fail(property, 'property that cannot be read')
			}
			return found
		}

		/** `select: { a: true, group: { b: true } }` -> `a`, `group.b`. */
		function readSelect(value: Located, collection: string, kind: QueryKind, prefix: string, owner: ts.Node): void {
			const fail = (node: ts.Node, reason: string) => skip(node, kind, reason, owner)
			const targets = resolve(value)
			if (!targets) {
				fail(value.node, 'value that cannot be followed to an object')
				return
			}
			for (const target of targets) {
				if (!ts.isObjectLiteralExpression(target.node)) {
					fail(value.node, 'not an object')
					continue
				}
				for (const { name, value: child, at } of properties(target, fail)) {
					const path = prefix ? `${prefix}.${name}` : name
					const inner = unwrap(child.node)
					const nested = ts.isObjectLiteralExpression(inner)
						? [child]
						: ts.isIdentifier(inner)
							? resolve(child)
							: undefined
					if (nested?.every(item => ts.isObjectLiteralExpression(unwrap(item.node)))) {
						for (const item of nested) readSelect(item, collection, kind, path, owner)
					} else add(at, collection, kind, path)
				}
			}
		}

		/** `where: { a: {…}, and: [{ b: {…} }] }` -> `a`, `b`. */
		function readWhere(value: Located, collection: string, owner: ts.Node): void {
			const fail = (node: ts.Node, reason: string) => skip(node, 'where', reason, owner)
			const targets = resolve(value)
			if (!targets) {
				fail(value.node, 'filter that cannot be followed to an object')
				return
			}
			for (const target of targets) {
				if (!ts.isObjectLiteralExpression(target.node)) {
					fail(value.node, 'not an object')
					continue
				}
				for (const { name, value: child, at } of properties(target, fail)) {
					if (!LOGICAL_OPERATORS.has(name)) {
						add(at, collection, 'where', name)
						continue
					}
					const lists = resolve(child)
					if (!lists) {
						fail(child.node, `\`${name}\` that cannot be followed to a list`)
						continue
					}
					for (const list of lists) {
						if (!ts.isArrayLiteralExpression(list.node)) {
							fail(child.node, `\`${name}\` is not a list written out`)
							continue
						}
						for (const element of list.node.elements) {
							if (ts.isSpreadElement(element)) fail(element, 'spread in a list of conditions')
							else readWhere({ node: element, file: list.file }, collection, owner)
						}
					}
				}
			}
		}

		function readSort(value: Located, collection: string, owner: ts.Node): void {
			const targets = resolve(value)
			if (!targets) {
				skip(value.node, 'sort', 'value that cannot be followed to a text', owner)
				return
			}
			for (const target of targets) {
				if (ts.isArrayLiteralExpression(target.node)) {
					for (const element of target.node.elements) readSort({ node: element, file: target.file }, collection, owner)
					continue
				}
				const text = textOf(target.node)
				if (text === undefined) skip(value.node, 'sort', 'not a text', owner)
				else add(value.node, collection, 'sort', text.replace(/^-/, ''))
			}
		}

		const visit = (node: ts.Node): void => {
			if (ts.isObjectLiteralExpression(node)) {
				const self = { node: node as ts.Expression, file }
				const items = properties(self, () => undefined)
				const collectionItem = items.find(item => item.name === 'collection')
				const reading = items.filter(item => (KINDS as readonly string[]).includes(item.name))
				if (collectionItem && reading.length > 0 && !ignored(node)) {
					const named = resolve(collectionItem.value)
					const slug = named?.length === 1 && named[0] ? textOf(named[0].node) : undefined
					if (slug === undefined) skip(collectionItem.at, 'collection', collectionItem.value.node.getText(source), node)
					else
						for (const item of reading) {
							const kind = item.name as QueryKind
							if (ignored(item.at)) continue
							if (kind === 'select' || kind === 'populate') readSelect(item.value, slug, kind, '', item.at)
							else if (kind === 'where') readWhere(item.value, slug, item.at)
							else readSort(item.value, slug, item.at)
						}
				}
			}
			ts.forEachChild(node, visit)
		}
		visit(source)
	}
	return { keys, unresolved }
}
