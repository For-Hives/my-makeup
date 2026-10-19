import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { applyRenameTable } from '../../../scripts/naming/rename'

let root: string

function write(file: string, text: string): void {
	const target = path.join(root, file)
	mkdirSync(path.dirname(target), { recursive: true })
	writeFileSync(target, text)
}

function read(file: string): string {
	return readFileSync(path.join(root, file), 'utf8')
}

beforeEach(() => {
	root = mkdtempSync(path.join(tmpdir(), 'rename-'))
	write(
		'tsconfig.json',
		JSON.stringify({
			compilerOptions: {
				strict: true,
				module: 'esnext',
				moduleResolution: 'bundler',
				target: 'ES2022',
				noEmit: true,
				skipLibCheck: true,
				types: [],
				paths: { '@/*': ['./src/*'] },
			},
			include: ['src/**/*.ts'],
		})
	)
	write(
		'src/lib/espace/profil.ts',
		"import { helper } from './outils'\n// lireLeProfil stays in this comment\nexport const lireLeProfil = () => helper('lireLeProfil')\nexport const autre = 1\n"
	)
	write('src/lib/espace/outils.ts', 'export const helper = (text: string) => text\n')
	write(
		'src/app/page.ts',
		"import { lireLeProfil } from '@/lib/espace/profil'\nimport { autre } from '../lib/espace/profil'\nexport const page = { lireLeProfil, autre }\nexport const text = 'lireLeProfil'\n"
	)
	write('src/app/reexport.ts', "export { lireLeProfil as other } from '../lib/espace/profil'\n")
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

describe('rename tool', () => {
	test('moves a file and rewrites its importers, relative and aliased', () => {
		const result = applyRenameTable({
			root,
			table: { files: [{ from: 'src/lib/espace/profil.ts', to: 'src/lib/espace/profile.ts' }] },
			useGit: false,
		})
		expect(existsSync(path.join(root, 'src/lib/espace/profil.ts'))).toBe(false)
		expect(read('src/lib/espace/profile.ts')).toContain("from './outils'")
		expect(read('src/app/page.ts')).toContain("from '@/lib/espace/profile'")
		expect(read('src/app/page.ts')).toContain("from '../lib/espace/profile'")
		expect(read('src/app/reexport.ts')).toContain("'../lib/espace/profile'")
		expect(result.moved).toEqual([{ from: 'src/lib/espace/profil.ts', to: 'src/lib/espace/profile.ts' }])
	})

	test('moves a folder: importers follow, and so do the imports between the moved files', () => {
		applyRenameTable({
			root,
			table: { files: [{ from: 'src/lib/espace', to: 'src/lib/dashboard/main' }] },
			useGit: false,
		})
		expect(existsSync(path.join(root, 'src/lib/espace'))).toBe(false)
		expect(read('src/lib/dashboard/main/profil.ts')).toContain("from './outils'")
		expect(read('src/app/page.ts')).toContain("from '@/lib/dashboard/main/profil'")
		expect(read('src/app/page.ts')).toContain("from '../lib/dashboard/main/profil'")
	})

	test('moves a folder whose files import something outside it', () => {
		write('src/lib/shared.ts', 'export const shared = 1\n')
		write('src/lib/espace/uses.ts', "import { shared } from '../shared'\nexport const used = shared\n")
		applyRenameTable({
			root,
			table: { files: [{ from: 'src/lib/espace', to: 'src/lib/deep/dashboard' }] },
			useGit: false,
		})
		expect(read('src/lib/deep/dashboard/uses.ts')).toContain("from '../../shared'")
	})

	test('renames a name everywhere it is used, not in strings or comments', () => {
		const result = applyRenameTable({
			root,
			table: { names: [{ file: 'src/lib/espace/profil.ts', from: 'lireLeProfil', to: 'readProfile' }] },
			useGit: false,
		})
		expect(read('src/lib/espace/profil.ts')).toContain("export const readProfile = () => helper('lireLeProfil')")
		expect(read('src/lib/espace/profil.ts')).toContain('// lireLeProfil stays in this comment')
		expect(read('src/app/page.ts')).toContain("import { readProfile } from '@/lib/espace/profil'")
		expect(read('src/app/page.ts')).toContain('{ lireLeProfil: readProfile, autre }')
		expect(read('src/app/page.ts')).toContain("'lireLeProfil'")
		expect(read('src/app/reexport.ts')).toContain('export { readProfile as other }')
		expect(result.renamed[0]?.references).toBe(4)
	})

	test('a name entry uses the paths after the moves, and both kinds run in one table', () => {
		applyRenameTable({
			root,
			table: {
				files: [{ from: 'src/lib/espace', to: 'src/lib/dashboard' }],
				names: [{ file: 'src/lib/dashboard/profil.ts', from: 'autre', to: 'other' }],
			},
			useGit: false,
		})
		expect(read('src/app/page.ts')).toContain("import { other } from '../lib/dashboard/profil'")
		expect(read('src/lib/dashboard/profil.ts')).toContain('export const other = 1')
	})

	test('a dry run writes nothing', () => {
		const before = read('src/app/page.ts')
		const result = applyRenameTable({
			root,
			table: { files: [{ from: 'src/lib/espace', to: 'src/lib/dashboard' }], names: [] },
			dryRun: true,
			useGit: false,
		})
		expect(result.changedFiles.length).toBeGreaterThan(0)
		expect(existsSync(path.join(root, 'src/lib/espace/profil.ts'))).toBe(true)
		expect(read('src/app/page.ts')).toBe(before)
	})

	test('refuses before writing: missing source, existing target, undeclared or taken name', () => {
		const before = read('src/app/page.ts')
		expect(() =>
			applyRenameTable({ root, table: { files: [{ from: 'src/nope.ts', to: 'src/x.ts' }] }, useGit: false })
		).toThrow('not a file or folder')
		expect(() =>
			applyRenameTable({
				root,
				table: { files: [{ from: 'src/lib/espace/profil.ts', to: 'src/lib/espace/outils.ts' }] },
				useGit: false,
			})
		).toThrow('already exists')
		expect(() =>
			applyRenameTable({
				root,
				table: { names: [{ file: 'src/lib/espace/profil.ts', from: 'absent', to: 'x' }] },
				useGit: false,
			})
		).toThrow('is not declared')
		expect(() =>
			applyRenameTable({
				root,
				table: { names: [{ file: 'src/lib/espace/profil.ts', from: 'autre', to: 'lireLeProfil' }] },
				useGit: false,
			})
		).toThrow('already declared')
		expect(read('src/app/page.ts')).toBe(before)
	})
})
