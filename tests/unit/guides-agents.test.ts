import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Guard of the three documents an agent works from (ticket 030):
 * - CLAUDE.md: the commands, the architecture, what is forbidden, the traps;
 * - AGENTS.md: the method (targeted tests while working, whole suites once at the end) and
 *   what « fini » means;
 * - docs/qualite.md: the rules of the tests, the seven rules of the lists edited in place,
 *   the look at a screen at 390 px.
 *
 * A guide that cites a command that does not exist, or links to a file that is gone, sends
 * every agent the wrong way. So a command written in a guide is a promise this test checks:
 * the script is in package.json, the file is on disk, the binary comes from a dependency.
 * A link is the same promise for a file. A path in backticks without a link is not checked:
 * the architecture section names folders that arrive with their first file.
 *
 * The permanent rules the ticket asks for are pinned too, by their wording: rewording one
 * means updating this test, in the same change.
 */

const ROOT = path.resolve(import.meta.dir, '../..')
const GUIDES = ['CLAUDE.md', 'AGENTS.md', 'docs/qualite.md'] as const

const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8')
const guides = Object.fromEntries(GUIDES.map(file => [file, read(file)])) as Record<(typeof GUIDES)[number], string>

type PackageJson = {
	bin?: string | Record<string, string>
	dependencies?: Record<string, string>
	devDependencies?: Record<string, string>
	scripts?: Record<string, string>
}
const packageJson = JSON.parse(read('package.json')) as PackageJson
const SCRIPTS = new Set(Object.keys(packageJson.scripts ?? {}))
const PACKAGES = new Set([
	...Object.keys(packageJson.dependencies ?? {}),
	...Object.keys(packageJson.devDependencies ?? {}),
])

/** The binaries the direct dependencies install, by name: `playwright` comes from `@playwright/test`. */
const BINARIES = new Set(
	[...PACKAGES].flatMap(name => {
		const manifest = path.join(ROOT, 'node_modules', name, 'package.json')
		if (!existsSync(manifest)) return []
		const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as PackageJson
		if (typeof bin === 'string') return [name.split('/').pop() ?? name]
		return Object.keys(bin ?? {})
	})
)

/**
 * Tools of the machine: those the README asks for (« Démarrer en local »), and the GitHub CLI, with
 * which docs/qualite.md reads the CI and plays the canary. The guard does not look into their arguments.
 */
const MACHINE_TOOLS = new Set(['git', 'gh', 'curl', 'openssl'])
/** A first word that makes a span of inline code a command, even when the guides may not run it. */
const COMMAND_WORDS = new Set([
	'bun',
	'bunx',
	'docker',
	...MACHINE_TOOLS,
	'biome',
	'make',
	'next',
	'node',
	'npm',
	'npx',
	'payload',
	'playwright',
	'pnpm',
	'podman',
	'tsc',
	'yarn',
])
/** The only built-in bun commands a guide gives. Another one is added here on purpose, not in passing. */
const BUN_BUILT_INS = new Set(['install'])
const SHELL_FENCES = new Set(['sh', 'bash', 'shell', 'console'])
const SOURCE_FILE = /\.(?:ts|tsx|mts|js|mjs)$/

const isDirectory = (file: string) => existsSync(file) && statSync(file).isDirectory()

/**
 * Why a path given to a command is wrong, or nothing. `tests/unit/<fichier>` stands for any file of
 * the folder: the part before the placeholder must be a folder that exists.
 */
function pathDefect(given: string): string | undefined {
	const relative = given.replace(/^\.\//, '')
	const placeholder = relative.indexOf('<')
	if (placeholder === -1) return existsSync(path.join(ROOT, relative)) ? undefined : `« ${given} » does not exist`
	const folder = relative.slice(0, placeholder)
	return folder.endsWith('/') && isDirectory(path.join(ROOT, folder)) ? undefined : `« ${folder} » is not a folder`
}

function bunDefect(args: string[]): string | undefined {
	// bun's own options come before the command: --no-env-file, --env-file=.env.test
	const [command, ...rest] = args.slice(args.findIndex(word => !word.startsWith('-')))
	if (command === undefined || args.every(word => word.startsWith('-'))) return 'bun is given no command'
	if (command === 'run') {
		const script = rest[0] ?? ''
		return SCRIPTS.has(script) ? undefined : `package.json has no script « ${script} »`
	}
	if (command === 'test')
		return rest
			.filter(word => !word.startsWith('-'))
			.map(pathDefect)
			.find(defect => defect !== undefined)
	if (SOURCE_FILE.test(command)) return pathDefect(command)
	return BUN_BUILT_INS.has(command) ? undefined : `« bun ${command} » is not a command the guides give`
}

function bunxDefect(args: string[]): string | undefined {
	const name = args[0] ?? ''
	return PACKAGES.has(name) || BINARIES.has(name) ? undefined : `no dependency of package.json gives « ${name} »`
}

function dockerDefect(args: string[]): string | undefined {
	if (args[0] !== 'compose') return 'docker is only used through « docker compose »'
	const flag = args.indexOf('-f')
	const file = flag === -1 ? 'docker-compose.yml' : (args[flag + 1] ?? '')
	return existsSync(path.join(ROOT, file)) ? undefined : `the compose file « ${file} » does not exist`
}

/** Why a command cannot be run as written in this repository, or nothing when it can. */
function commandDefect(command: string): string | undefined {
	const words = command.trim().split(/\s+/)
	// PORT=3100 bun run dev
	while (/^[A-Z_][A-Z0-9_]*=/.test(words[0] ?? '')) words.shift()
	const [tool = '', ...args] = words
	if (tool === 'bun') return bunDefect(args)
	if (tool === 'bunx') return bunxDefect(args)
	if (tool === 'docker') return dockerDefect(args)
	if (MACHINE_TOOLS.has(tool)) return undefined
	return `« ${tool} » is not run directly: cite a script of package.json`
}

type Cited = { command: string; line: number }

/**
 * The commands a document cites: every command of a shell block, and every span of inline code
 * that starts with a command word and goes on. A tool named alone (`curl`, `bun`) is a
 * mention, not a command. Other fenced blocks are code samples: they are not read.
 * In a shell block, a line that ends with a backslash goes on with the next one: the lines
 * make one command, cited at its first line.
 */
function citedCommands(markdown: string): Cited[] {
	const cited: Cited[] = []
	let fence: string | undefined
	let unfinished: Cited | undefined
	markdown.split('\n').forEach((text, index) => {
		const line = index + 1
		const opening = /^\s*```(\w*)/.exec(text)
		if (opening) {
			fence = fence === undefined ? (opening[1] ?? '') : undefined
			unfinished = undefined
			return
		}
		if (fence !== undefined) {
			if (!SHELL_FENCES.has(fence)) return
			const written = text.trim()
			const part = written.replace(/\s*\\$/, '')
			const goesOn = written.endsWith('\\')
			if (unfinished) {
				unfinished.command = `${unfinished.command} ${part}`.trim()
				if (!goesOn) unfinished = undefined
				return
			}
			if (written === '' || written.startsWith('#')) return
			const command = { command: part, line }
			cited.push(command)
			if (goesOn) unfinished = command
			return
		}
		for (const [, span = ''] of text.matchAll(/`([^`]+)`/g)) {
			const words = span.trim().split(/\s+/)
			while (/^[A-Z_][A-Z0-9_]*=/.test(words[0] ?? '')) words.shift()
			if (words.length > 1 && COMMAND_WORDS.has(words[0] ?? '')) cited.push({ command: span.trim(), line })
		}
	})
	return cited
}

/** The local files a document points to: Markdown links, and the lines Claude Code imports (`@AGENTS.md`). */
function citedFiles(markdown: string): string[] {
	const links = [...markdown.matchAll(/\]\(([^)\s]+)\)/g)].map(([, target = '']) => target)
	const imports = [...markdown.matchAll(/^@(\S+)$/gm)].map(([, target = '']) => target)
	return [...links, ...imports]
		.filter(target => !/^(?:[a-z]+:|#)/i.test(target))
		.map(target => target.replace(/#.*$/, ''))
}

/** What is wrong with a guide, one sentence per defect; empty when every command and every link holds. */
function problems(file: string, markdown: string): string[] {
	const commands = citedCommands(markdown).flatMap(({ command, line }) => {
		const defect = commandDefect(command)
		return defect ? [`${file}:${line}: \`${command}\`: ${defect}`] : []
	})
	const folder = path.dirname(path.join(ROOT, file))
	const files = citedFiles(markdown)
		.filter(target => !existsSync(path.resolve(folder, target)))
		.map(target => `${file}: the link to « ${target} » leads nowhere`)
	return [...commands, ...files]
}

/** The text of a `## ` section, from its heading to the next one; empty when the document has no such section. */
function section(markdown: string, heading: RegExp): string {
	const parts = markdown.split(/^(?=## )/m).filter(part => part.startsWith('## '))
	return parts.find(part => heading.test(part.split('\n', 1)[0] ?? '')) ?? ''
}

/** The items of the numbered lists of a text: number, bold lead, and the whole item with its sub-lines. */
function numberedItems(text: string): Array<{ number: number; lead: string; body: string }> {
	return text
		.split(/^(?=\d+\. )/m)
		.map(body => ({ body, found: /^(\d+)\. \*\*(.+?)\*\*/.exec(body) }))
		.flatMap(({ body, found }) => (found ? [{ number: Number(found[1]), lead: found[2] ?? '', body }] : []))
}

/** The names of the expected rules a text does not hold. */
const missing = (text: string, expected: ReadonlyArray<readonly [name: string, wording: RegExp]>) =>
	expected.filter(([, wording]) => !wording.test(text)).map(([name]) => name)

/** What « fini » includes, whatever else the section says (the fourth criterion of ticket 030). */
const DONE = [
	['targeted tests green', /tests ciblés[^|\n]*verts/i],
	['a look at a screenshot at 390 px', /capture à 390 px[^|\n]*regardée/i],
	['a release note', /note de version/i],
	['a line in the register of intended changes', /ligne au registre[^\n]*CHANGEMENTS-VOULUS\.md/i],
	['a test in the access matrix', /test dans la matrice d['’]accès/i],
] as const

/** The three things the ticket wants written as forbidden. */
const FORBIDDEN = [
	['no production database', /base de prod/i],
	['no schema push outside this machine', /poussée de schéma hors de ce poste/i],
	['no personal data in the tests', /donnée personnelle dans les tests/i],
] as const

/** The seven rules of the lists edited in place, lessons of October 2026, in their order. */
const LIST_RULES = [
	['L1', /identifiant par ligne/i],
	['L2', /frappe garde le focus/i],
	['L3', /ligne en cours de modification/i],
	['L4', /après un retrait, le focus reste dans le panneau/i],
	['L5', /chaque retrait est annoncé/i],
	['L6', /doublon est refusé/i],
	['L7', /entrée maintenue n['’]agit qu['’]une fois/i],
] as const

describe('the checks themselves', () => {
	test('a command that exists passes, with an environment variable, a placeholder or a binary of a dependency', () => {
		const sound = [
			'bun install --frozen-lockfile',
			'PORT=3100 bun run dev',
			'bun --no-env-file test tests/unit/guides-agents.test.ts',
			'bun --no-env-file test tests/unit/<fichier>',
			'bun scripts/migration/urls-doc.ts --check',
			'bunx @biomejs/biome check .',
			'bunx playwright screenshot --viewport-size=390,844 http://127.0.0.1:3000/ /tmp/capture.png',
			'docker compose up -d --wait',
			'git status -sb',
		]

		expect(sound.map(commandDefect)).toEqual(sound.map(() => undefined))
	})

	test('a script, a file, a folder, a binary or a compose file that does not exist is reported', () => {
		expect(commandDefect('bun run nexiste-pas')).toBe('package.json has no script « nexiste-pas »')
		expect(commandDefect('bun run')).toBe('package.json has no script «  »')
		expect(commandDefect('bun --no-env-file test tests/unit/absent.test.ts')).toBe(
			'« tests/unit/absent.test.ts » does not exist'
		)
		expect(commandDefect('bun --no-env-file test tests/absent/<fichier>')).toBe('« tests/absent/ » is not a folder')
		expect(commandDefect('bun scripts/absent.ts')).toBe('« scripts/absent.ts » does not exist')
		expect(commandDefect('bun --no-env-file')).toBe('bun is given no command')
		expect(commandDefect('bun add left-pad')).toBe('« bun add » is not a command the guides give')
		expect(commandDefect('bunx paquet-inconnu')).toBe('no dependency of package.json gives « paquet-inconnu »')
		expect(commandDefect('docker compose -f compose.absent.yml up')).toBe(
			'the compose file « compose.absent.yml » does not exist'
		)
		expect(commandDefect('docker run postgres')).toBe('docker is only used through « docker compose »')
	})

	test('a tool run without a script of package.json is reported', () => {
		for (const command of ['npx biome check', 'tsc --noEmit', 'next dev', 'playwright test', 'make test'])
			expect(commandDefect(command), command).toContain('is not run directly')
	})

	test('commands are read in shell blocks and in inline code, and a tool named alone is not one', () => {
		const document = [
			'Lance `bun run dev`, puis `PORT=3100 bun run start`. Il faut `curl` et `bun`.',
			'Le fichier `src/lib/env.ts` et le script `test:unit` ne sont pas des commandes.',
			'```sh',
			'# a comment',
			'make test',
			'```',
			'```ts',
			'npx("this is code, not a command")',
			'```',
			'Jamais `npx biome`.',
		].join('\n')

		expect(citedCommands(document)).toEqual([
			{ command: 'bun run dev', line: 1 },
			{ command: 'PORT=3100 bun run start', line: 1 },
			{ command: 'make test', line: 5 },
			{ command: 'npx biome', line: 10 },
		])
	})

	test('a command of a shell block that goes on after a backslash is one command, and a tool of the machine passes', () => {
		const document = [
			'```sh',
			'gh run list --branch v3 \\',
			'  --json databaseId \\',
			"  --jq '.[0]'",
			'# a comment that ends with a backslash \\',
			'make test \\',
			'  --watch',
			'```',
			'Puis `gh run view NUMERO`.',
		].join('\n')

		expect(citedCommands(document)).toEqual([
			{ command: "gh run list --branch v3 --json databaseId --jq '.[0]'", line: 2 },
			{ command: 'make test --watch', line: 6 },
			{ command: 'gh run view NUMERO', line: 9 },
		])
		expect(citedCommands(document).map(({ command }) => commandDefect(command))).toEqual([
			undefined,
			'« make » is not run directly: cite a script of package.json',
			undefined,
		])
	})

	test('a guide with a missing script and a dead link is reported, line by line', () => {
		const broken = [
			'Lance `bun run tout-casser`.',
			'Voir [le guide](docs/absent.md), [le site](https://my-makeup.fr), [plus bas](#ici) et [le README](README.md#tests).',
			'',
			'@ABSENT.md',
		].join('\n')

		expect(problems('GUIDE.md', broken)).toEqual([
			'GUIDE.md:1: `bun run tout-casser`: package.json has no script « tout-casser »',
			'GUIDE.md: the link to « docs/absent.md » leads nowhere',
			'GUIDE.md: the link to « ABSENT.md » leads nowhere',
		])
	})

	test('a link is resolved from the folder of its document', () => {
		expect(problems('docs/qualite.md', '[le guide](../AGENTS.md) et [les composants](tests/composants.md)')).toEqual([])
		expect(problems('docs/qualite.md', '[le guide](AGENTS.md)')).toEqual([
			'docs/qualite.md: the link to « AGENTS.md » leads nowhere',
		])
	})

	test('a rule that left its section is reported by name', () => {
		const done = [
			'# Guide',
			'',
			'## « Fini »',
			'',
			'- [ ] **Les tests ciblés du changement sont verts.**',
			'- Une **note de version**.',
			'',
			'## Autre section',
			'',
			'Une **capture à 390 px** est prise et regardée, et un test dans la matrice d’accès.',
		].join('\n')

		expect(missing(section(done, /« Fini »/), DONE)).toEqual([
			'a look at a screenshot at 390 px',
			'a line in the register of intended changes',
			'a test in the access matrix',
		])
		expect(section(done, /Interdits/)).toBe('')
	})

	test('the items of a numbered list are read with their sub-lines', () => {
		const list = ['1. **L1. Une règle.** Sa phrase.', '   - Test : un essai.', '2. **L2. Une autre.**', 'Fin.'].join(
			'\n'
		)

		expect(numberedItems(list).map(({ number, lead }) => [number, lead])).toEqual([
			[1, 'L1. Une règle.'],
			[2, 'L2. Une autre.'],
		])
		expect(numberedItems(list)[0]?.body).toContain('Test : un essai.')
	})
})

describe('every command and every link of the guides', () => {
	for (const file of GUIDES)
		test(`${file} cites only commands that exist and files that are there`, () => {
			expect(problems(file, guides[file])).toEqual([])
		})

	test('the guides do cite commands: the check is not empty', () => {
		const cited = GUIDES.flatMap(file => citedCommands(guides[file]).map(({ command }) => command))

		expect(cited.length).toBeGreaterThan(15)
		expect(cited).toContain(
			'bunx playwright screenshot --viewport-size=390,844 --full-page http://127.0.0.1:3000/ /tmp/capture-390.png'
		)
	})

	test('every script of the final pass is cited, and is in package.json', () => {
		const method = section(guides['AGENTS.md'], /Méthode/)
		const finalPass = ['bun run check', 'bun run typecheck', 'bun run test', 'bun run build']
		const cited = citedCommands(method).map(({ command }) => command)

		expect(cited.filter(command => finalPass.includes(command))).toEqual(finalPass)
		for (const command of finalPass) expect(commandDefect(command), command).toBeUndefined()
	})
})

describe('CLAUDE.md', () => {
	const guide = guides['CLAUDE.md']

	test('it writes what is forbidden: production database, schema push outside this machine, personal data in the tests', () => {
		const leads = numberedItems(section(guide, /^## Interdits/))
			.map(({ lead }) => lead)
			.join('\n')

		expect(missing(leads, FORBIDDEN)).toEqual([])
	})

	test('it has its sections: commands, architecture, what is forbidden, schema, URL, traps', () => {
		const headings = [...guide.matchAll(/^## (.+)$/gm)].map(([, heading]) => heading)

		for (const heading of ['Commandes', 'Architecture', 'Interdits', 'Schéma', 'URL', 'Pièges'])
			expect(headings, heading).toContain(heading)
	})

	test('every access rule adds its lines to the access matrix, which exists (ticket 018)', () => {
		const architecture = section(guide, /^## Architecture/)

		expect(architecture).toMatch(/toute règle d['’]accès ajoute ses lignes à la matrice d['’]accès/i)
		expect(architecture).toContain('`tests/integration/payload-acces.test.ts`')
		expect(guides['AGENTS.md']).toMatch(
			/toute règle d['’]accès ajoute ses lignes à `tests\/integration\/payload-acces\.test\.ts`/i
		)
		expect(existsSync(path.join(ROOT, 'tests/integration/payload-acces.test.ts'))).toBe(true)
		expect(existsSync(path.join(ROOT, 'src/lib/access.ts'))).toBe(true)
	})

	test('it loads AGENTS.md and points to the documents an agent needs', () => {
		const files = citedFiles(guide)

		for (const file of [
			'AGENTS.md',
			'README.md',
			'docs/qualite.md',
			'docs/tests/composants.md',
			'docs/migration/SCHEMA.md',
			'docs/migration/URLS.md',
			'docs/migration/CHANGEMENTS-VOULUS.md',
			'docs/migration/JOURNAL.md',
		])
			expect(files, file).toContain(file)
		expect(guide).toMatch(/^@AGENTS\.md$/m)
	})
})

describe('AGENTS.md', () => {
	const guide = guides['AGENTS.md']

	test('the method: the touched test file while working, the whole suites once at the end, then the CI', () => {
		const method = section(guide, /Méthode/)
		const steps = numberedItems(method).map(({ lead }) => lead)

		expect(steps[0]).toMatch(/pendant le travail, lance seulement le fichier de tests que tu touches/i)
		expect(steps[2]).toMatch(/à la fin, lance le passage complet une seule fois/i)
		expect(steps[3]).toMatch(/la seconde passe complète est celle de la CI/i)
		expect(method).toContain('`bun --no-env-file test tests/unit/<fichier>`')
	})

	test('« fini » includes targeted tests, the 390 px screenshot, the release note, the register line, the access matrix', () => {
		expect(missing(section(guide, /« Fini »/), DONE)).toEqual([])
	})

	test('« fini » sends lists edited in place to the seven rules of the quality document', () => {
		expect(section(guide, /« Fini »/)).toMatch(/liste éditée en place[^\n]*L1 à L7[^\n]*docs\/qualite\.md/i)
	})
})

describe('docs/qualite.md', () => {
	const rules = numberedItems(section(guides['docs/qualite.md'], /Listes éditées en place/))

	test('the seven rules of the lists edited in place are there, numbered L1 to L7, in order', () => {
		expect(rules.map(({ number }) => number)).toEqual([1, 2, 3, 4, 5, 6, 7])
		expect(rules.map(({ lead }) => lead.slice(0, 2))).toEqual(LIST_RULES.map(([label]) => label))
		for (const [index, [label, wording]] of LIST_RULES.entries()) expect(rules[index]?.lead, label).toMatch(wording)
	})

	test('each of the seven rules says how it is tested and the defect it comes from', () => {
		for (const { lead, body } of rules) {
			expect(body, lead).toMatch(/^ {3}- Test : \S/m)
			expect(body, lead).toMatch(/^ {3}- Origine : .*\/10\/2026.* PR #\d{3}/m)
		}
	})

	test('they are written as permanent criteria, replayed by every ticket that touches a list', () => {
		const text = guides['docs/qualite.md']

		expect(text).toMatch(/critères permanents/)
		expect(section(text, /Listes éditées en place/)).toMatch(/les rejoue toutes, avec un test par règle/)
	})
})

describe('the README', () => {
	test('it sends an agent to the two guides and to the quality document', () => {
		const files = citedFiles(read('README.md'))

		for (const file of GUIDES) expect(files, file).toContain(file)
	})

	test('it points to the frozen schema and the frozen URLs, next to the register and the journal', () => {
		const files = citedFiles(read('README.md'))

		for (const file of ['docs/migration/SCHEMA.md', 'docs/migration/URLS.md']) expect(files, file).toContain(file)
	})
})
