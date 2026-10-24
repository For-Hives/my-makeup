import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

/**
 * What the browser downloads on the public pages (issue 1033). A client component pulls in everything it
 * imports, however far: a constant read from a file that also holds server code ships that server code to every
 * visitor. The profile page once shipped 360 KB of JavaScript instead of 190 KB because its view counter read a
 * path from `src/lib/views/profile-views.ts`, which imports `weekly-stats.ts` (zod, `node:crypto`, and so
 * crypto-browserify and buffer, and the lists of countries). Nothing in the HTML changed, only the weight.
 *
 * The test follows the value imports of every client component of the public pages, as far as they go, and
 * refuses what a visitor must not download: Node modules, zod, Payload, the statistics, the server rate limits,
 * the code of the owner's edition and of her dashboard.
 */

const SRC = join(import.meta.dir, '../../src')

/** The folders whose client components are loaded by a public page (profile, layout, analytics, forms of the page). */
const PUBLIC_CLIENT_FOLDERS = [
	'components/profile',
	'components/layout',
	'components/analytics',
	'components/quote',
	'components/contact',
]

/** What no public page may reach. A path fragment of a source file, or the start of a package name. */
const REFUSED: { what: string; test: (specifier: string, file: string) => boolean }[] = [
	{ what: 'a Node module', test: s => s.startsWith('node:') },
	{ what: 'zod', test: s => s === 'zod' || s.startsWith('zod/') },
	{ what: 'Payload', test: s => s === 'payload' || s.startsWith('payload/') || s.startsWith('@payloadcms/') },
	{ what: 'next/headers', test: s => s === 'next/headers' || s === 'next/server' },
	{ what: 'the statistics of the dashboard', test: (_s, f) => f.endsWith('lib/weekly-stats.ts') },
	{ what: 'a server rate limit', test: (_s, f) => /lib\/(auth|search)\/rate-limit\.ts$/.test(f) },
	{ what: 'the edition of the owner', test: (_s, f) => f.startsWith('components/direct-edit/') },
	{ what: 'the dashboard', test: (_s, f) => f.startsWith('components/dashboard/') },
]

function sources(folder: string): string[] {
	return readdirSync(folder).flatMap(name => {
		const path = join(folder, name)
		return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : []
	})
}

/** The modules a file loads at run time: `import x from`, `export … from`, `import('…')`. Type-only imports are erased. */
function valueImports(code: string): string[] {
	const found: string[] = []
	const statement = /(?:^|\n)\s*(import|export)\s+([^;]*?)\bfrom\s+['"]([^'"]+)['"]/g
	for (const [, , clause = '', specifier = ''] of code.matchAll(statement)) {
		const text = clause.trim()
		if (text.startsWith('type ')) continue
		const named = /^\{([^}]*)\}$/.exec(text)
		if (named && (named[1] ?? '').split(',').every(part => part.trim() === '' || part.trim().startsWith('type ')))
			continue
		found.push(specifier)
	}
	for (const [, specifier = ''] of code.matchAll(/(?:^|[^\w.])import\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push(specifier)
	for (const [, specifier = ''] of code.matchAll(/(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g)) found.push(specifier)
	return found
}

/** The source file a specifier of the repository leads to, or undefined for a package. */
function resolve(specifier: string, from: string): string | undefined {
	let base: string
	if (specifier.startsWith('@/')) base = join(SRC, specifier.slice(2))
	else if (specifier.startsWith('.')) base = join(dirname(from), specifier)
	else return undefined
	for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
		if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
	}
	return undefined
}

const USE_SERVER = /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*['"]use server['"]/

const own = (file: string) => relative(SRC, file)

/** Every refused thing a client file reaches, with the way there. */
function violations(root: string): string[] {
	const found: string[] = []
	const seen = new Set<string>([root])
	const queue: { file: string; path: string[] }[] = [{ file: root, path: [own(root)] }]
	while (queue.length > 0) {
		const { file, path } = queue.shift() as { file: string; path: string[] }
		// A Server Action file stays on the server: the client only gets a reference to it.
		if (path.length > 1 && USE_SERVER.test(readFileSync(file, 'utf8'))) continue
		for (const rule of REFUSED) {
			if (path.length > 1 && rule.test('', own(file))) found.push(`${rule.what}: ${path.join(' > ')}`)
		}
		for (const specifier of valueImports(readFileSync(file, 'utf8'))) {
			for (const rule of REFUSED) {
				if (rule.test(specifier, '')) found.push(`${rule.what} (${specifier}): ${[...path, specifier].join(' > ')}`)
			}
			const next = resolve(specifier, file)
			if (next && !seen.has(next)) {
				seen.add(next)
				queue.push({ file: next, path: [...path, own(next)] })
			}
		}
	}
	return found
}

describe('le JavaScript des pages publiques : aucun code du serveur, de l’édition ni du tableau de bord', () => {
	const roots = PUBLIC_CLIENT_FOLDERS.flatMap(folder => sources(join(SRC, folder))).filter(file =>
		/^\s*['"]use client['"]/.test(readFileSync(file, 'utf8'))
	)

	test('le test voit les composants clients des pages publiques', () => {
		expect(roots.length).toBeGreaterThan(10)
		expect(roots.map(own)).toContain('components/profile/ProfileViewCounter.tsx')
	})

	for (const root of roots) {
		test(`${own(root)} n’entraîne rien de cela`, () => {
			expect(violations(root)).toEqual([])
		})
	}
})
