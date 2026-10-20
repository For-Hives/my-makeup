import { describe, expect, test } from 'bun:test'
import {
	evaluate,
	formatFindings,
	isWaiting,
	loadConfig,
	loadWords,
	type NamingConfig,
	namesOfPaths,
} from '../../../scripts/naming/check'
import { collectFromPackageScripts, collectFromSource } from '../../../scripts/naming/collect'
import { frenchWordsOf, splitName } from '../../../scripts/naming/split-words'

const words = loadWords()

function config(overrides: Partial<NamingConfig> = {}): NamingConfig {
	return { waiting: [], exceptions: { paths: [], words: [] }, ...overrides }
}

function run(files: Record<string, string>, cfg: NamingConfig, useWaiting = true) {
	const names = namesOfPaths(Object.keys(files), file => files[file] ?? '', ['src', 'scripts', 'tests'])
	return evaluate(names, cfg, words, { useWaiting })
}

describe('naming check: splitting', () => {
	test('splits camelCase, PascalCase, dashes, underscores, digits and acronyms', () => {
		expect(splitName('lireLeProfilPublic')).toEqual(['lire', 'le', 'profil', 'public'])
		expect(splitName('ActionDInscription')).toEqual(['action', 'd', 'inscription'])
		expect(splitName('HTTPServer2xx')).toEqual(['http', 'server', 'xx'])
		expect(splitName('mot-de-passe_oublie')).toEqual(['mot', 'de', 'passe', 'oublie'])
		expect(splitName('CODES_D_ERREUR')).toEqual(['codes', 'd', 'erreur'])
		expect(splitName('éléphant')).toEqual(['elephant'])
	})

	test('the word list is the starting list of the plan and is read as a set', () => {
		expect(words.size).toBeGreaterThan(1500)
		expect(frenchWordsOf('lireLeProfilPublic', words)).toEqual(['lire', 'le', 'profil'])
	})
})

describe('naming check: what is read', () => {
	test('a French declared name is found, an English homograph is not', () => {
		const report = run(
			{
				'src/lib/french.ts':
					'export function lireLeProfil() {}\nconst table = 1\nfunction message() {}\ntype Image = {}',
				'src/lib/english.ts':
					'export const table = 1\nexport function message() {}\nexport type Page = {}\nconst section = 2',
			},
			config()
		)
		expect(report.failures.map(f => f.name)).toEqual(['lireLeProfil'])
		expect(report.failures[0]?.words).toEqual(['lire', 'le', 'profil'])
		expect(report.failures[0]?.exported).toBe(true)
	})

	test('file and folder names are read, extensions and digits are not', () => {
		const report = run(
			{
				'src/lib/maquilleuse/photo.ts': 'export const photo = 1',
				'src/lib/page.test.tsx': 'export const page = 1',
				'src/migrations/20261016_044617_comptes_supprimes.ts': 'export const up = 1',
			},
			config()
		)
		const found = report.failures.map(f => `${f.kind}:${f.file}`).sort()
		expect(found).toEqual(['directory:src/lib/maquilleuse', 'file:src/migrations/20261016_044617_comptes_supprimes.ts'])
	})

	test('strings and comments are not read', () => {
		const source = [
			'// lire le profil de la maquilleuse',
			'/** Le profil. */',
			"export const label = 'lire le profil'",
			'export const text = `bonjour ` + label',
			'export const element = <p>le profil</p>',
		].join('\n')
		const names = collectFromSource('src/x.tsx', source)
		expect(names.map(n => n.name)).toEqual(['label', 'text', 'element'])
		expect(run({ 'src/x.tsx': source }, config()).failures).toEqual([])
	})

	test('declarations: kinds, destructuring, export flag', () => {
		const source = [
			'const { alpha, beta: gamma } = {} as never',
			'let [first] = [1]',
			'export class Widget {}',
			'interface Shape {}',
			'export type { Shape }',
			'enum Color {}',
			'function local() {}',
			'export default local',
		].join('\n')
		const flags = Object.fromEntries(collectFromSource('src/x.ts', source).map(n => [n.name, n.exported]))
		expect(flags).toEqual({
			alpha: false,
			gamma: false,
			first: false,
			Widget: true,
			Shape: true,
			Color: false,
			local: false,
		})
	})

	test('environment variables and script options are read, with their shapes only', () => {
		const source = [
			'const jeton = process.env.IMPORT_JETON',
			"const other = Bun.env['PROBES_TARGET']",
			'const { BASCULE_LE } = process.env',
			"type Raw = Partial<Record<'APP_ENV' | 'IMPORT_COMMUNES', string>>",
			"const a = args.includes('--a-blanc')",
			"const b = args.find((x) => x.startsWith('--cible='))",
			"const c = 'not --an-option'",
			'const e = Math.PI + Number.MAX_SAFE_INTEGER',
		].join('\n')
		const names = collectFromSource('scripts/x.ts', source)
		expect(
			names
				.filter(n => n.kind === 'env')
				.map(n => n.name)
				.sort()
		).toEqual(['APP_ENV', 'BASCULE_LE', 'IMPORT_COMMUNES', 'IMPORT_JETON', 'PROBES_TARGET'])
		expect(names.filter(n => n.kind === 'option').map(n => n.name)).toEqual(['a-blanc', 'cible'])
	})

	test('options are read in scripts and test tools only; package.json scripts are read', () => {
		const report = run(
			{
				'scripts/tool.ts': "export const flag = '--a-blanc'",
				'src/page.ts': "export const flag = '--a-blanc'",
			},
			config()
		)
		expect(report.failures.filter(f => f.kind === 'option').map(f => f.file)).toEqual(['scripts/tool.ts'])
		const scripts = collectFromPackageScripts('package.json', '{"scripts":{"notes:ajouter":"x","build":"y"}}')
		expect(scripts.map(n => n.name)).toEqual(['notes:ajouter', 'build'])
		const names = evaluate(scripts, config(), words).failures
		expect(names.map(f => f.name)).toEqual(['notes:ajouter'])
	})
})

describe('naming check: waiting list and exceptions', () => {
	const files = {
		'src/lib/maquilleuse/photo.ts': 'export const lireLaPhoto = 1',
		'src/lib/auth/x.ts': 'export const connecter = 1',
	}

	test('a folder of the waiting list does not fail, the others do', () => {
		const report = run(files, config({ waiting: ['src/lib/maquilleuse'] }))
		expect(report.failures.map(f => f.file)).toEqual(['src/lib/auth/x.ts'])
		expect(report.waiting.length).toBe(2)
	})

	test('without the waiting list everything fails', () => {
		const report = run(files, config({ waiting: ['src/lib'] }), false)
		expect(report.waiting).toEqual([])
		expect(report.failures.length).toBe(3)
	})

	test('waiting-list entries: prefixes follow folder boundaries, ! takes a path out, = is exact', () => {
		expect(isWaiting('src/lib/maquilleuse/a.ts', ['src/lib/maquilleuse'])).toBe(true)
		expect(isWaiting('src/lib/maquilleuse-bis/a.ts', ['src/lib/maquilleuse'])).toBe(false)
		expect(isWaiting('tests/unit/naming/a.ts', ['tests', '!tests/unit/naming'])).toBe(false)
		expect(isWaiting('tests/unit/other.ts', ['tests', '!tests/unit/naming'])).toBe(true)
		expect(isWaiting('src/app/(espace)', ['=src/app/(espace)'])).toBe(true)
		expect(isWaiting('src/app/(espace)/auth', ['=src/app/(espace)'])).toBe(false)
	})

	test('a stale waiting entry is reported', () => {
		expect(run(files, config({ waiting: ['src/lib/gone'] })).staleWaiting).toEqual(['src/lib/gone'])
	})

	test('a named exception is not reported: a frozen folder, a scoped word', () => {
		const report = run(
			{
				'src/app/(site)/a-propos/page.tsx': 'export default function Page() {}',
				'src/lib/search.ts': 'export const specialite = 1',
				'src/lib/other.ts': 'export const specialite = 1',
			},
			config({
				exceptions: {
					paths: [{ path: 'src/app/(site)/a-propos', reason: 'frozen address' }],
					words: [{ word: 'specialite', in: ['src/lib/search.ts'], reason: 'the ?specialite= parameter' }],
				},
			})
		)
		expect(report.failures.map(f => f.file)).toEqual(['src/lib/other.ts'])
		expect(report.excused.map(f => f.file).sort()).toEqual(['src/app/(site)/a-propos', 'src/lib/search.ts'])
	})

	test('a path exception covers the name of the folder, not what is inside it', () => {
		const report = run(
			{ 'src/app/a-propos/lireLeProfil.ts': 'export const x = 1' },
			config({ exceptions: { paths: [{ path: 'src/app/a-propos', reason: 'frozen' }], words: [] } })
		)
		expect(report.failures.map(f => f.file)).toEqual(['src/app/a-propos/lireLeProfil.ts'])
	})

	test('an exception that matches nothing any more is reported', () => {
		const report = run(
			{ 'src/a.ts': 'export const x = 1' },
			config({
				exceptions: {
					paths: [{ path: 'src/gone', reason: 'was a frozen address' }],
					words: [{ word: 'specialite', in: ['src/moved.ts'], reason: 'the parameter' }],
				},
			})
		)
		expect(report.staleExceptions).toEqual(['src/gone', 'specialite in src/moved.ts'])
	})

	test('the report groups by file, and the totals count distinct names', () => {
		const report = run({ 'src/a.ts': 'const profil = 1\nconst profil2 = 2\nexport const table = 3' }, config())
		expect(formatFindings(report.failures)).toContain('src/a.ts')
		expect(report.totals.declaration).toEqual({ all: 3, french: 2 })
	})

	test('the committed configuration is well formed and its exceptions carry a reason', () => {
		const committed = loadConfig()
		expect(committed.waiting.length).toBeGreaterThan(0)
		for (const rule of [...committed.exceptions.paths, ...committed.exceptions.words]) {
			expect(rule.reason.length).toBeGreaterThan(10)
		}
	})
})
