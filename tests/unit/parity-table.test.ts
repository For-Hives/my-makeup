import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Ticket 176 (plan 02 §10.1 point 1 and §7): the table of docs/tests/suite-parite.md gives a state to every named
 * test of the plan, and says where it is proved. This test keeps the table honest:
 *
 * - every identifier of the plan is in it once, and no other;
 * - a state is one of three: `vert`, `hors bascule` (with the ticket that takes it up), `remplacé` (by what);
 * - a `vert` row names test files that exist and that carry the identifier (alone, or in a range such as « E19-E29 »);
 * - the counts at the top of the document are the counts of the rows.
 *
 * The guard is proved red below: a table with a missing identifier, a wrong state and a file that does not exist
 * is refused for each of the three faults.
 */

const ROOT = path.resolve(import.meta.dir, '../..')
const TABLE_FILE = 'docs/tests/suite-parite.md'

const range = (prefix: string, from: number, to: number) =>
	Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${String(from + i).padStart(2, '0')}`)

/** The 255 named tests of plan 02 §7: 224 of the new site, 31 of the existing one. */
export const PLAN_IDS: readonly string[] = [
	...range('U', 1, 87),
	...range('I', 1, 45),
	...range('E', 1, 74),
	...range('P', 1, 4),
	...range('R', 1, 6),
	...range('C', 1, 8),
	...range('S', 1, 13).map(id => id),
	...range('AF-', 1, 10),
	...range('RG-', 1, 8),
]

const STATES = ['vert', 'hors bascule', 'remplacé'] as const
type State = (typeof STATES)[number]

export interface Row {
	id: string
	state: string
	where: string
	note: string
}

/** The rows of the table between the two marks of the document. */
export function readRows(markdown: string): Row[] {
	const start = markdown.indexOf('<!-- table:start -->')
	const end = markdown.indexOf('<!-- table:end -->')
	if (start < 0 || end < start) throw new Error('Les repères <!-- table:start --> et <!-- table:end --> manquent.')
	return markdown
		.slice(start, end)
		.split('\n')
		.filter(line => line.startsWith('| ') && !line.startsWith('| Id ') && !line.startsWith('|---'))
		.map(line => {
			const cells = line
				.slice(1, -1)
				.split(' | ')
				.map(cell => cell.trim().replace(/^\|\s*|\s*\|$/g, ''))
			const [id = '', state = '', where = '', note = ''] = cells
			return { id, state, where, note }
		})
}

/** Every identifier a text carries, a range such as « E19-E29 » or « U14 à U23 » giving all of its identifiers. */
export function idsIn(text: string): Set<string> {
	const found = new Set<string>()
	const pattern =
		/(?<![A-Za-z0-9])([UIEPRCS])(\d\d)(?![0-9])(?:\s*(?:-|–|à|to)\s*\1?(\d\d)(?![0-9]))?|(?<![A-Za-z0-9])(AF|RG)-(\d\d)(?![0-9])/g
	for (const match of text.matchAll(pattern)) {
		if (match[4]) {
			found.add(`${match[4]}-${match[5]}`)
			continue
		}
		const letter = match[1] as string
		const from = Number(match[2])
		const to = match[3] ? Number(match[3]) : from
		for (let n = from; n <= Math.max(from, to) && n - from < 30; n++)
			found.add(`${letter}${String(n).padStart(2, '0')}`)
	}
	return found
}

/** What is wrong with a table, in words; empty when it is right. */
export function problemsOf(markdown: string, root = ROOT): string[] {
	const problems: string[] = []
	const rows = readRows(markdown)
	const seen = new Map<string, number>()
	for (const { id } of rows) seen.set(id, (seen.get(id) ?? 0) + 1)
	for (const id of PLAN_IDS) if (!seen.has(id)) problems.push(`${id} : absent du tableau`)
	for (const [id, count] of seen) {
		if (!PLAN_IDS.includes(id)) problems.push(`${id} : n’est pas un identifiant du plan`)
		if (count > 1) problems.push(`${id} : ${count} lignes`)
	}
	for (const { id, state, where, note } of rows) {
		if (!STATES.includes(state as State)) {
			problems.push(`${id} : état « ${state} » inconnu`)
			continue
		}
		if (state === 'hors bascule' && !/^ticket \d{3}$/.test(where)) problems.push(`${id} : hors bascule sans ticket`)
		if (state === 'hors bascule' && note === '') problems.push(`${id} : hors bascule sans raison`)
		if (state === 'remplacé' && where === '') problems.push(`${id} : remplacé sans ce qui le remplace`)
		if (state === 'vert') {
			const files = [...where.matchAll(/`([^`]+)`/g)].map(match => match[1] as string)
			if (files.length === 0) problems.push(`${id} : vert sans fichier de test`)
			const carries = files.some(file => {
				const full = path.join(root, file)
				return existsSync(full) && idsIn(readFileSync(full, 'utf8')).has(id)
			})
			for (const file of files) if (!existsSync(path.join(root, file))) problems.push(`${id} : ${file} n’existe pas`)
			if (files.length > 0 && !carries) problems.push(`${id} : aucun fichier cité ne porte l’identifiant`)
		}
	}
	const counted = Object.fromEntries(STATES.map(state => [state, rows.filter(row => row.state === state).length]))
	const announced = /<!-- counts: vert (\d+), hors bascule (\d+), remplacé (\d+) -->/.exec(markdown)
	if (!announced) problems.push('Les décomptes <!-- counts: … --> manquent.')
	else if (
		Number(announced[1]) !== counted.vert ||
		Number(announced[2]) !== counted['hors bascule'] ||
		Number(announced[3]) !== counted.remplacé
	)
		problems.push(`Les décomptes annoncés ne sont pas ceux des lignes : ${JSON.stringify(counted)}`)
	return problems
}

describe('le tableau de la suite complète (ticket 176)', () => {
	const markdown = readFileSync(path.join(ROOT, TABLE_FILE), 'utf8')

	test('chaque test nommé du plan a un état, une preuve ou une raison, et les décomptes sont justes', () => {
		expect(problemsOf(markdown)).toEqual([])
	})

	test('255 tests nommés : 224 de la v3 et 31 de l’existant', () => {
		expect(PLAN_IDS).toHaveLength(255)
		expect(new Set(PLAN_IDS).size).toBe(255)
	})

	test('chaque test que le ticket 176 nomme est vert', () => {
		const rows = new Map(readRows(markdown).map(row => [row.id, row]))
		for (const id of [
			'I45',
			'U61',
			'U62',
			'U63',
			'U64',
			'E31',
			'E73',
			'E18',
			'C01',
			'C02',
			'C03',
			'C04',
			'C05',
			'C06',
			'C07',
			'C08',
		])
			expect(rows.get(id)?.state, id).toBe('vert')
	})
})

describe('la garde voit les fautes d’un tableau fautif', () => {
	const good = (extra = '') =>
		`<!-- counts: vert 1, hors bascule 0, remplacé 0 -->\n<!-- table:start -->\n| Id | État | Où | Note |\n|---|---|---|---|\n| U01 | vert | \`tests/unit/completeness.test.ts\` | |\n${extra}<!-- table:end -->`

	test('un identifiant du plan qui manque est dit', () => {
		expect(problemsOf(good())).toContain('U02 : absent du tableau')
	})

	test('un état inconnu, un identifiant en double et un identifiant étranger sont dits', () => {
		const problems = problemsOf(good('| U01 | fait | `x` | |\n| Z99 | vert | `x` | |\n'))
		expect(problems).toContain('U01 : 2 lignes')
		expect(problems).toContain('U01 : état « fait » inconnu')
		expect(problems).toContain('Z99 : n’est pas un identifiant du plan')
	})

	test('un vert sans fichier, avec un fichier absent ou qui ne porte pas l’identifiant est dit', () => {
		const table = (where: string) =>
			`<!-- counts: vert 1, hors bascule 0, remplacé 0 -->\n<!-- table:start -->\n| U01 | vert | ${where} | |\n<!-- table:end -->`
		expect(problemsOf(table('rien'))).toContain('U01 : vert sans fichier de test')
		expect(problemsOf(table('`tests/unit/absent.test.ts`'))).toContain('U01 : tests/unit/absent.test.ts n’existe pas')
		expect(problemsOf(table('`tests/unit/slugs.test.ts`'))).toContain('U01 : aucun fichier cité ne porte l’identifiant')
	})

	test('un hors bascule sans ticket ni raison, un remplacé sans remplaçant, des décomptes faux sont dits', () => {
		const table = `<!-- counts: vert 5, hors bascule 0, remplacé 0 -->\n<!-- table:start -->\n| U21 | hors bascule | bientôt | |\n| S10 | remplacé | | |\n<!-- table:end -->`
		const problems = problemsOf(table)
		expect(problems).toContain('U21 : hors bascule sans ticket')
		expect(problems).toContain('U21 : hors bascule sans raison')
		expect(problems).toContain('S10 : remplacé sans ce qui le remplace')
		expect(problems.some(problem => problem.startsWith('Les décomptes annoncés'))).toBe(true)
	})

	test('une plage « E19-E29 » porte tous ses identifiants', () => {
		const ids = idsIn('plan 02 E19-E29 et U14 à U16, AF-03, RG-07')
		expect([...ids].sort()).toEqual([...range('E', 19, 29), 'U14', 'U15', 'U16', 'AF-03', 'RG-07'].sort())
	})
})
