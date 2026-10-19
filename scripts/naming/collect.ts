/**
 * Reads the names of the code that the naming rule covers (CLAUDE.md, « Conventions ») from source
 * text, without running anything:
 *
 * - `file` and `directory`: every path segment under the scanned roots;
 * - `declaration`: `const`, `let`, `var`, `function`, `class`, `interface`, `type` and `enum` names
 *   (destructured names included), with the `exported` flag;
 * - `env`: the environment variables the code reads (`process.env.NAME`, `env.NAME`, a destructuring
 *   of them, the keys of a `Record<'NAME', …>`);
 * - `option`: the command-line options of our scripts (a string that is exactly `--some-option`);
 * - `script`: the scripts of package.json.
 *
 * It does not read strings (apart from the two exact shapes above), comments or JSX text.
 */
import ts from 'typescript'

export type NameKind = 'file' | 'directory' | 'declaration' | 'env' | 'option' | 'script'

export interface CollectedName {
	kind: NameKind
	name: string
	/** Repository path of the file, of the directory, or of package.json. */
	file: string
	/** Declarations only. */
	exported?: boolean
}

const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/
const ENV_BASES = /(?:^|\.)(?:env|environment)$/i
const UPPER_SNAKE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$|^[A-Z]{4,}$/
const OPTION_SHAPE = /^--([a-z][a-z0-9]*(?:-[a-z0-9]+)*)=?$/

export function isSourceFile(path: string): boolean {
	return SOURCE_EXTENSION.test(path) && !path.endsWith('.d.ts')
}

/** The name of a file without its extensions: `a-b.test.tsx` -> `a-b.test`, split later on `.`. */
export function fileStem(path: string): string {
	const base = path.slice(path.lastIndexOf('/') + 1)
	const dot = base.lastIndexOf('.')
	return dot > 0 ? base.slice(0, dot) : base
}

/** Every directory above a file, from the root, as paths: `a/b/c.ts` -> `a`, `a/b`. */
export function directoriesOf(path: string): string[] {
	const parts = path.split('/')
	const result: string[] = []
	for (let i = 1; i < parts.length; i++) result.push(parts.slice(0, i).join('/'))
	return result
}

function scriptKindOf(path: string): ts.ScriptKind {
	if (path.endsWith('x')) return path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.JSX
	return path.endsWith('.js') || path.endsWith('.mjs') || path.endsWith('.cjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS
}

function bindingNames(name: ts.BindingName, out: string[]): void {
	if (ts.isIdentifier(name)) {
		out.push(name.text)
		return
	}
	for (const element of name.elements) {
		if (ts.isBindingElement(element)) bindingNames(element.name, out)
	}
}

function isExportedStatement(node: ts.Node): boolean {
	return (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0
}

function textOfExpression(node: ts.Expression): string {
	if (ts.isIdentifier(node)) return node.text
	if (ts.isPropertyAccessExpression(node)) return `${textOfExpression(node.expression)}.${node.name.text}`
	if (node.kind === ts.SyntaxKind.MetaProperty) return 'import.meta'
	return ''
}

/** The names read from the source of one file. `path` is the repository path, for the result only. */
export function collectFromSource(path: string, text: string): CollectedName[] {
	const source = ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true, scriptKindOf(path))
	const found: CollectedName[] = []
	const exportedLater = new Set<string>()
	const declared: CollectedName[] = []

	const add = (kind: NameKind, name: string, exported?: boolean) => {
		const entry: CollectedName = { kind, name, file: path }
		if (exported !== undefined) entry.exported = exported
		;(kind === 'declaration' ? declared : found).push(entry)
	}

	const visit = (node: ts.Node): void => {
		if (ts.isVariableDeclaration(node)) {
			const names: string[] = []
			bindingNames(node.name, names)
			const statement = node.parent.parent
			const exported = ts.isVariableStatement(statement) && isExportedStatement(statement)
			for (const name of names) add('declaration', name, exported)
			const init = node.initializer
			if (ts.isObjectBindingPattern(node.name) && init && ENV_BASES.test(textOfExpression(init))) {
				for (const element of node.name.elements) {
					const key = element.propertyName ?? element.name
					if (ts.isIdentifier(key)) add('env', key.text)
				}
			}
		} else if (
			(ts.isFunctionDeclaration(node) ||
				ts.isClassDeclaration(node) ||
				ts.isInterfaceDeclaration(node) ||
				ts.isTypeAliasDeclaration(node) ||
				ts.isEnumDeclaration(node)) &&
			node.name
		) {
			add('declaration', node.name.text, isExportedStatement(node))
		} else if (ts.isExportDeclaration(node) && !node.moduleSpecifier && node.exportClause) {
			if (ts.isNamedExports(node.exportClause)) {
				for (const specifier of node.exportClause.elements) {
					exportedLater.add((specifier.propertyName ?? specifier.name).text)
				}
			}
		} else if (ts.isPropertyAccessExpression(node)) {
			const base = textOfExpression(node.expression)
			if (ENV_BASES.test(base) && UPPER_SNAKE.test(node.name.text)) add('env', node.name.text)
		} else if (ts.isElementAccessExpression(node)) {
			const base = textOfExpression(node.expression)
			const arg = node.argumentExpression
			if (ENV_BASES.test(base) && ts.isStringLiteralLike(arg) && UPPER_SNAKE.test(arg.text)) add('env', arg.text)
		} else if (ts.isTypeReferenceNode(node) && /^(?:Record|Partial|Pick|Omit)$/.test(node.typeName.getText(source))) {
			const first = node.typeArguments?.[0]
			if (first) {
				ts.forEachChild(first, function literals(child) {
					if (
						ts.isLiteralTypeNode(child) &&
						ts.isStringLiteral(child.literal) &&
						UPPER_SNAKE.test(child.literal.text)
					) {
						add('env', child.literal.text)
					}
					ts.forEachChild(child, literals)
				})
				if (ts.isLiteralTypeNode(first) && ts.isStringLiteral(first.literal) && UPPER_SNAKE.test(first.literal.text)) {
					add('env', first.literal.text)
				}
			}
		} else if (ts.isStringLiteralLike(node)) {
			const match = OPTION_SHAPE.exec(node.text)
			if (match?.[1]) add('option', match[1])
		}
		ts.forEachChild(node, visit)
	}
	visit(source)

	for (const entry of declared) {
		if (!entry.exported && exportedLater.has(entry.name)) entry.exported = true
	}
	const unique = new Map<string, CollectedName>()
	for (const entry of [...declared, ...found]) unique.set(`${entry.kind}|${entry.name}|${entry.exported}`, entry)
	return [...unique.values()]
}

/** The scripts of a package.json text, as names. */
export function collectFromPackageScripts(path: string, text: string): CollectedName[] {
	const parsed = JSON.parse(text) as { scripts?: Record<string, string> }
	return Object.keys(parsed.scripts ?? {}).map(name => ({ kind: 'script' as const, name, file: path }))
}
