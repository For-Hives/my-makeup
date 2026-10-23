import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Guard of docs/migration/BASCULE.md, the step-by-step of the cutover day (ticket 184).
 *
 * The document promises that every step has an actor, a gesture, a numbered check, a duration and
 * a stop rule; that the day fits in the hour before the domains are swapped; that the old front
 * follows its legacy branch before the merge; that the green-light list comes first; that the
 * rollback fits on one page; and that no secret or value is written in it. This test keeps those
 * promises true.
 */

const ROOT = path.resolve(import.meta.dir, '../..')
const DOC_PATH = path.join(ROOT, 'docs/migration/BASCULE.md')
const doc = readFileSync(DOC_PATH, 'utf8')
const lines = doc.split('\n')

type StepRow = {
	number: number
	who: string
	gesture: string
	check: string
	duration: string
	stop: string
}

function headingIndex(title: string): number {
	const index = lines.findIndex(line => line.startsWith('## ') && line.includes(title))
	if (index === -1) throw new Error(`Heading not found: ${title}`)
	return index
}

/** The step rows (first cell is a number) found between two lines. */
function stepRows(from: number, to: number): StepRow[] {
	const rows: StepRow[] = []
	for (const line of lines.slice(from, to)) {
		if (!line.startsWith('|')) continue
		const cells = line
			.split('|')
			.slice(1, -1)
			.map(cell => cell.trim())
		if (!/^\d+$/.test(cells[0] ?? '')) continue
		expect(cells).toHaveLength(6)
		const [number, who, gesture, check, duration, stop] = cells as [string, string, string, string, string, string]
		rows.push({ number: Number(number), who, gesture, check, duration, stop })
	}
	return rows
}

const greenLightAt = headingIndex('La liste de feu vert')
const dayAt = headingIndex('Le jour J')
const rollbackAt = headingIndex('Le retour arrière, sur une page')
const afterAt = headingIndex('Après le jour J')
const notDoneAt = headingIndex('Ce que ce document ne fait pas')

const dayRows = stepRows(dayAt, rollbackAt)
const afterRows = stepRows(afterAt, notDoneAt)
const allRows = [...dayRows, ...afterRows]

function minutes(row: StepRow): number {
	const match = /^(\d+) min/.exec(row.duration)
	if (!match) throw new Error(`Step ${row.number}: duration is not « N min »: ${row.duration}`)
	return Number(match[1])
}

describe('BASCULE.md: the shape of the document', () => {
	test('the green-light list comes before the first step and every line is a checkbox', () => {
		expect(greenLightAt).toBeLessThan(dayAt)
		const boxes = lines.slice(greenLightAt, dayAt).filter(line => line.startsWith('- ['))
		expect(boxes.length).toBeGreaterThanOrEqual(12)
		for (const box of boxes) expect(box.startsWith('- [ ] ')).toBe(true)
	})

	test('the sections come in the promised order', () => {
		expect(greenLightAt).toBeLessThan(dayAt)
		expect(dayAt).toBeLessThan(rollbackAt)
		expect(rollbackAt).toBeLessThan(afterAt)
		expect(afterAt).toBeLessThan(notDoneAt)
	})

	test('steps are numbered 1 to 12 on the day and 13 to 17 after it, without a gap', () => {
		expect(dayRows.map(row => row.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
		expect(afterRows.map(row => row.number)).toEqual([13, 14, 15, 16, 17])
	})
})

describe('BASCULE.md: every step is complete', () => {
	test('each step has an actor, a gesture, a check, a duration and a stop rule', () => {
		for (const row of allRows) {
			for (const [name, value] of Object.entries(row)) {
				expect(String(value).length, `step ${row.number}, ${name}`).toBeGreaterThan(0)
			}
			expect(row.who, `step ${row.number}`).toMatch(/Andy|Claude/)
			minutes(row)
		}
	})

	test('each check is numbered', () => {
		for (const row of allRows) {
			expect(row.check, `step ${row.number}`).toMatch(/\d/)
		}
	})

	test('each stop rule of the day names a rollback or says it is fixed forward', () => {
		for (const row of dayRows) {
			expect(row.stop, `step ${row.number}`).toMatch(/[Rr]etour arrière|corrige|recommence|reste|corriger/)
		}
	})

	test('an actor who is Andy only says what to do in Coolify or on the site, never a command with a value', () => {
		for (const row of allRows) {
			expect(row.gesture, `step ${row.number}`).not.toMatch(/=\S*[0-9a-f]{16,}/)
		}
	})
})

describe('BASCULE.md: the hour', () => {
	test('the steps up to the swap of the domains add up to 58 minutes, under the hour', () => {
		const swapDone = dayRows.find(row => row.number === 8)
		expect(swapDone).toBeDefined()
		const total = dayRows.filter(row => row.number <= 8).reduce((sum, row) => sum + minutes(row), 0)
		expect(total).toBe(58)
		expect(total).toBeLessThanOrEqual(60)
		expect(doc).toContain('58 minutes')
	})

	test('the total of the day written in the document is the sum of the table', () => {
		const total = dayRows.reduce((sum, row) => sum + minutes(row), 0)
		expect(total).toBe(100)
		expect(doc).toContain('Le total du jour : 100 minutes')
	})
})

describe('BASCULE.md: the order that protects the data', () => {
	const byNumber = (n: number): StepRow => {
		const row = allRows.find(candidate => candidate.number === n)
		if (!row) throw new Error(`Step ${n} not found`)
		return row
	}

	test('the old API is frozen before anything is imported, and the final snapshot is taken after the freeze', () => {
		expect(byNumber(1).gesture).toContain('LEGACY_READ_ONLY=true')
		expect(byNumber(2).gesture).toContain('Backup now')
		expect(byNumber(2).check).toContain("après l'étape 1")
		expect(byNumber(3).gesture).toContain('IMPORT_MODE=real')
	})

	test('the real import is followed by a second pass with zero change, then a check', () => {
		expect(byNumber(4).check).toContain('0 création, 0 mise à jour')
		expect(byNumber(5).gesture).toContain('IMPORT_MODE=check')
		expect(byNumber(3).check).toContain('13 profils de spam')
	})

	test('the host is checked before the swap, with the protected access', () => {
		expect(byNumber(6).gesture).toContain('cutover:check')
		expect(byNumber(6).gesture).toContain('v3.my-makeup.fr')
		expect(byNumber(6).check).toContain('100 %')
	})

	test('the session tests come after the swap, not before', () => {
		expect(byNumber(10).number).toBeGreaterThan(byNumber(8).number)
		expect(byNumber(10).gesture).toContain('inscription')
		expect(byNumber(10).check).toContain('email')
		expect(byNumber(10).check).toContain('E73')
	})

	test('the measure is read through the site and the series break is annotated', () => {
		expect(byNumber(11).check).toContain('Umami')
		expect(byNumber(11).check).toContain('annotation')
	})

	test('the import variables leave with the swap and the cutover date is set there', () => {
		expect(byNumber(7).gesture).toContain('CUTOVER_DATE')
		expect(byNumber(7).gesture).toContain('IMPORT_')
	})

	test('the old front follows its legacy branch with automatic deployment off, before the merge', () => {
		const branch = byNumber(14)
		const merge = byNumber(16)
		expect(branch.number).toBeLessThan(merge.number)
		expect(branch.gesture).toContain('legacy-v1')
		expect(branch.gesture).toContain('déploiement automatique coupé')
		expect(byNumber(15).number).toBeLessThan(merge.number)
		expect(byNumber(15).gesture).toContain('ci-ok')
		expect(byNumber(15).gesture).toContain('CodeQL')
		expect(merge.check).toContain("0 déploiement de l'ancien front")
	})

	test('the steps after the day start after the end of the rollback window', () => {
		const section = lines.slice(afterAt, notDoneAt).join('\n')
		expect(section).toContain('J+1 18:00')
		expect(section).toContain('après cette heure')
		expect(byNumber(17).check).toContain('renovate:validate')
	})
})

describe('BASCULE.md: the rollback fits on one page', () => {
	const section = lines.slice(rollbackAt, afterAt)

	test('it is at most 40 lines long', () => {
		expect(section.length).toBeLessThanOrEqual(40)
	})

	test('it covers the case before the swap and the case after it, and the deadline', () => {
		const text = section.join('\n')
		expect(text).toContain("**A. Avant l'échange")
		expect(text).toContain("**B. Après l'échange")
		expect(text).toContain('J+1 18:00')
	})

	test('it says to export before anything is stopped', () => {
		const text = section.join('\n')
		expect(text).toContain("Exporter d'abord")
		expect(text).toContain('/api/cutover/delta')
	})
})

describe('BASCULE.md: no secret and no value', () => {
	test('no long hexadecimal string, hash, connection string with a password or email address', () => {
		expect(doc).not.toMatch(/[0-9a-f]{32,}/)
		expect(doc).not.toMatch(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{20,}/)
		expect(doc).not.toMatch(/postgres(ql)?:\/\/[^\s<>`]+:[^\s<>`@]+@/)
		expect(doc).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
		expect(doc).not.toMatch(/Bearer\s+\S+/)
	})

	test('a variable is only ever named, or set to a word, a date placeholder or a boolean', () => {
		const assignments = doc.match(/`[A-Z][A-Z0-9_]+=[^`]*`/g) ?? []
		expect(assignments.length).toBeGreaterThan(0)
		const allowed = /^`[A-Z][A-Z0-9_]+=(true|off|real|check|dry-run|prod|AAAA-MM-JJ|…)`$/
		for (const assignment of assignments) {
			expect(assignment, assignment).toMatch(allowed)
		}
	})
})

describe('BASCULE.md: what it points to exists', () => {
	test('every relative link resolves', () => {
		const links = [...doc.matchAll(/\]\((?!https?:|#)([^)#\s]+)(?:#[^)]*)?\)/g)].map(match => match[1] as string)
		expect(links.length).toBeGreaterThan(5)
		for (const link of links) {
			const target = path.resolve(path.dirname(DOC_PATH), link)
			expect(existsSync(target), link).toBe(true)
		}
	})

	test('every `bun run` command exists in package.json', () => {
		const packageJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
			scripts: Record<string, string>
		}
		const commands = [...doc.matchAll(/`bun run ([a-z][a-z:-]*)/g)].map(match => match[1] as string)
		expect(commands.length).toBeGreaterThan(3)
		for (const command of commands) {
			expect(packageJson.scripts[command], command).toBeDefined()
		}
	})

	test('every variable of the site it names is known to the application', () => {
		const known = readFileSync(path.join(ROOT, 'src/lib/env.ts'), 'utf8')
		// Names that belong to the old API or to Coolify, not to this application.
		const elsewhere = new Set(['LEGACY_READ_ONLY', 'MEDIA_SWEEP', 'STRAPI_SOURCE_URI'])
		const names = new Set(
			[...doc.matchAll(/`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)(?:=[^`]*)?`/g)].map(match => match[1] as string)
		)
		expect(names.has('IMPORT_TOKEN')).toBe(true)
		for (const name of names) {
			// WATCH_* are settings of the GitHub repository (sonde-continue.yml), not of the application.
			if (elsewhere.has(name) || name.startsWith('HOST_CHECK_') || name.startsWith('WATCH_')) continue
			expect(known, name).toContain(name)
		}
	})

	test('the host-check variables it names are the ones the command reads', () => {
		const reader = readFileSync(path.join(ROOT, 'docs/tests/controle-hote.md'), 'utf8')
		for (const name of ['HOST_CHECK_TARGET', 'HOST_CHECK_ACCESS_USER', 'HOST_CHECK_ACCESS_PASSWORD']) {
			expect(doc).toContain(name)
			expect(reader).toContain(name)
		}
	})

	test('the rollback documents it links to are the ones of the other tickets', () => {
		for (const file of ['RETOUR-ARRIERE.md', 'LECTURE-SEULE.md', 'IMPORT.md', 'GEL.md']) {
			expect(doc).toContain(file)
		}
	})
})
