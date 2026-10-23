import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Guards the two migration documents of docs/migration/:
// - CHANGEMENTS-VOULUS.md, the register of everything the v3 does differently from the
//   current site. At the rehearsal of the switch, only its lines are accepted differences,
//   so every line must keep a stable key, its source and the pages it touches.
// - JOURNAL.md, the dated facts of the migration.
// Neither may hold personal data: a profile or an account is named by its numeric id only.

const docs = path.resolve(import.meta.dir, '../../docs/migration')
const register = readFileSync(path.join(docs, 'CHANGEMENTS-VOULUS.md'), 'utf8')
const log = readFileSync(path.join(docs, 'JOURNAL.md'), 'utf8')
const schema = readFileSync(path.join(docs, 'SCHEMA.md'), 'utf8')

type RegisterLine = {
	/** The « Repère » cell as written, backticks included */
	key: string
	source: string
	pages: string
	cells: string[]
	/** Number of columns of the table the line belongs to */
	columns: number
}

const splitRow = (row: string) =>
	row
		.trim()
		.replace(/^\|/, '')
		.replace(/\|$/, '')
		.split('|')
		.map(cell => cell.trim())

const isSeparator = (row: string) => /^\|(\s*:?-+:?\s*\|)+$/.test(row.trim())

/**
 * Every row of every Markdown table of the register. A table without the « Repère »,
 * « Source » or « Pages touchées » column gives lines with these fields empty, which
 * `problems()` reports: the register holds no other kind of table.
 */
function readRegister(markdown: string): RegisterLine[] {
	const rows = markdown.split('\n')
	const lines: RegisterLine[] = []
	for (let i = 0; i < rows.length; i++) {
		const header = rows[i] ?? ''
		if (!header.startsWith('|') || !isSeparator(rows[i + 1] ?? '')) continue
		const names = splitRow(header)
		const cellOf = (cells: string[], name: string) => cells[names.indexOf(name)] ?? ''
		for (i += 2; (rows[i] ?? '').startsWith('|'); i++) {
			const cells = splitRow(rows[i] ?? '')
			lines.push({
				key: cellOf(cells, 'Repère'),
				source: cellOf(cells, 'Source'),
				pages: cellOf(cells, 'Pages touchées'),
				cells,
				columns: names.length,
			})
		}
	}
	return lines
}

const KEY = /^`[a-z0-9]+(?:-[a-z0-9]+)*`$/
// A section of a plan, a dated decision or a ticket
const SOURCE = /plan \d{2} §\d|\d{2}\/\d{2}\/\d{4}|ticket \d{3}/
// A family of addresses, in backticks: a path of the site, or an address on another host of the domain (`http`, `www`, `api`). The tools that compare the two sites read every one of
// them in a « Pages touchées » cell as a page where a difference is expected.
const ADDRESS = /`(?:\/|https?:\/\/)[^`]*`/
// « Aucune » said in full: the line touches no page
const NO_PAGE = /^Aucune\b/
// A remark about what does not change, which belongs in the cell before
const UNCHANGED = /\b(?:aucun|sans effet|sans changement|inchangé|gardé)/i

/** What is wrong with the lines of a register, one sentence per defect; empty when sound. */
function problems(lines: RegisterLine[]): string[] {
	const found: string[] = []
	const seen = new Set<string>()
	for (const line of lines) {
		const name = line.key || '(no key)'
		if (!KEY.test(line.key)) found.push(`${name}: the key is not a kebab-case word in backticks`)
		if (seen.has(line.key)) found.push(`${name}: the key is used twice`)
		seen.add(line.key)
		if (line.cells.length !== line.columns)
			found.push(`${name}: ${line.cells.length} cells for ${line.columns} columns`)
		if (line.cells.some(cell => cell === '')) found.push(`${name}: a cell is empty`)
		if (!SOURCE.test(line.source)) found.push(`${name}: the source names no plan section, dated decision or ticket`)
		if (NO_PAGE.test(line.pages)) {
			if (ADDRESS.test(line.pages)) found.push(`${name}: the pages say « Aucune » and still name an address`)
		} else if (!ADDRESS.test(line.pages))
			found.push(`${name}: the pages name no address family and do not say « Aucune »`)
		else if (UNCHANGED.test(line.pages)) found.push(`${name}: the pages hold a remark about what does not change`)
	}
	return found
}

const EMAIL = /[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/g
// The site's own domain and its subdomains: an address there (the sender of the site's emails)
// names no person. `not-my-makeup.fr` and `my-makeup.fr.exemple.test` are other domains.
const SITE_DOMAIN = /^(?:[\w-]+\.)*my-makeup\.fr$/i
const PHONE = /(?:\+33\s?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/
const PROFILE_PATH = /\/profil\/([^\s`,;:)]*)/g
// What stands for a profile in a family of addresses; nothing at all names no profile either
const PROFILE_PLACEHOLDERS = ['<slug>', '<username>', '']

/** The kinds of personal data found in a text; empty when there is none. */
function personalData(text: string): string[] {
	const found: string[] = []
	for (const [, domain = ''] of text.matchAll(EMAIL))
		if (!SITE_DOMAIN.test(domain)) found.push('an email address outside the site’s own domain')
	if (PHONE.test(text)) found.push('a phone number')
	// A family of addresses that ends a sentence: its punctuation is not part of the slug
	for (const [, slug = ''] of text.matchAll(PROFILE_PATH))
		if (!PROFILE_PLACEHOLDERS.includes(slug.replace(/[.!?…]+$/, ''))) found.push('the address of a real profile')
	return found
}

const lines = readRegister(register)
const lineOf = (key: string) => lines.find(line => line.key === `\`${key}\``)

describe('the checks themselves', () => {
	test('a line without a source, without pages, with a reused key or an empty cell is reported', () => {
		const broken = [
			'| Repère | Avant | Dans la v3 | Source | Pages touchées |',
			'|---|---|---|---|---|',
			'| `sans-source` | a | b | on verra | `/search` |',
			'| `sans-page` | a | b | plan 01 §6.2 | partout |',
			'| `sans-page` | a |  | ticket 017 | Aucune. |',
			'| Pas Un Repère | a | b | décision du 13/10/2026 | `/cgu` | en trop |',
			'| `aucune-et-une-page` | a | b | ticket 017 | Aucune. `/cgu` le dit déjà. |',
			'| `page-qui-ne-change-pas` | a | b | ticket 017 | `/auth/profil` : nouveau. Sans effet sur `/search`. |',
			'| `affichage-garde` | a | b | ticket 017 | `/profil/<slug>` : affichage gardé. |',
			'| `pages-qui-changent` | a | b | ticket 017 | `/profil/<slug>` de ces profils : 404 attendue. |',
			'',
			'| Titre | Autre |',
			'|---|---|',
			'| un tableau | qui n’est pas du registre |',
		].join('\n')

		expect(problems(readRegister(broken))).toEqual([
			'`sans-source`: the source names no plan section, dated decision or ticket',
			'`sans-page`: the pages name no address family and do not say « Aucune »',
			'`sans-page`: the key is used twice',
			'`sans-page`: a cell is empty',
			'Pas Un Repère: the key is not a kebab-case word in backticks',
			'Pas Un Repère: 6 cells for 5 columns',
			'`aucune-et-une-page`: the pages say « Aucune » and still name an address',
			'`page-qui-ne-change-pas`: the pages hold a remark about what does not change',
			'`affichage-garde`: the pages hold a remark about what does not change',
			'(no key): the key is not a kebab-case word in backticks',
			'(no key): the source names no plan section, dated decision or ticket',
			'(no key): the pages name no address family and do not say « Aucune »',
		])
	})

	test('an email address, a phone number and the address of a real profile are personal data', () => {
		// Fictitious values: a reserved test domain and a number of the range kept for fiction
		expect(personalData('écrire à prenom@example.test')).toEqual(['an email address outside the site’s own domain'])
		expect(personalData('appeler le 06 39 98 00 00')).toEqual(['a phone number'])
		expect(personalData('voir `/profil/un-vrai-slug`')).toEqual(['the address of a real profile'])
		expect(personalData('`/profil/<slug>`, `/profil/<username>`, ids 67 et 104, le 13/10/2026')).toEqual([])
	})

	test('a family of addresses that ends a sentence is not the address of a real profile', () => {
		expect(personalData('Les 13 profils répondent 404 sur /profil/<slug>.')).toEqual([])
		expect(personalData('Qui redirige depuis /profil/<username> ? Et depuis /profil/<slug>…')).toEqual([])
		expect(personalData('Toutes les adresses sous /profil/ sont comparées.')).toEqual([])
		// The punctuation is dropped, the slug is still read
		expect(personalData('La page /profil/un-vrai-slug.')).toEqual(['the address of a real profile'])
	})

	test('an address of the site itself is not personal data, an address that looks like one is', () => {
		expect(personalData('Les emails partent de ne-pas-repondre@send.my-makeup.fr.')).toEqual([])
		expect(personalData('Expéditeur : contact@my-makeup.fr, relu le 14/10/2026')).toEqual([])
		for (const address of ['prenom@not-my-makeup.fr', 'prenom@my-makeup.fr.exemple.test', 'prenom@exemple.test'])
			expect(personalData(`écrire à ${address}`), address).toEqual(['an email address outside the site’s own domain'])
		// Every address is read, not only the first one
		expect(personalData('de contact@my-makeup.fr à prenom@exemple.test')).toEqual([
			'an email address outside the site’s own domain',
		])
	})
})

describe('the register of intended changes', () => {
	test('every line has a unique key, a source and the pages it touches', () => {
		expect(lines.length).toBeGreaterThan(0)
		expect(problems(lines)).toEqual([])
	})

	test('the eight transformations of plan 01 §6.2 each have their line', () => {
		const transformations = [
			'ville-en-commune',
			'prix-numerique',
			'disponibilite-par-defaut',
			'slug-stocke',
			'coordonnees-consentement',
			'profils-vides-brouillon',
			'comptes-sans-profil',
			'comptes-inactifs-24-mois',
		]
		for (const key of transformations) expect(lineOf(key)?.source, key).toContain('plan 01 §6.2')
	})

	test('the visible decisions of 13/10/2026 each have their line', () => {
		const decisions = ['recherche-sans-profils-vides', 'profils-spam-non-repris', 'confirmation-email']
		for (const key of decisions) expect(lineOf(key)?.source, key).toContain('13/10/2026')
	})

	test('the deviations from the technical plan say they touch no page', () => {
		const deviations = ['emails-resend', 'groupe-front']
		for (const key of deviations) expect(lineOf(key)?.pages, key).toStartWith('Aucune')
	})

	test('a line that says « Aucune » names no address, and the other lines only name pages that change', () => {
		const withoutPage = lines.filter(line => line.pages.startsWith('Aucune')).map(line => line.key)

		// The three lines whose pages answer as today, the bin and the names of the photos, which only the storage
		// sees, and the two deviations from the technical plan
		expect(withoutPage).toEqual([
			'`slug-stocke`',
			'`comptes-email-partage`',
			'`recherche-sans-profils-vides`',
			'`photos-corbeille`',
			'`photos-noms-imprevisibles`',
			'`emails-resend`',
			'`groupe-front`',
		])
		expect(register).toContain('La case « Pages touchées » ne nomme que les familles où un écart est attendu')
	})

	test('the consent source is written as in the frozen schema and in the ticket that imports it', () => {
		const source = /source (« publié par [^»]+ »)/.exec(schema)?.[1]

		expect(source).toBe('« publié par la maquilleuse »')
		expect(lineOf('coordonnees-consentement')?.cells.join(' ')).toContain(`source ${source}`)
		expect(register).not.toContain('publié par la pro')
	})

	test('the 13 profiles left by the spam are listed by their numeric id', () => {
		const text = lineOf('profils-spam-non-repris')?.cells.join(' ') ?? ''
		const list = /Identifiants[^:]*:\s*([\d, ]+)/.exec(text)?.[1] ?? ''
		const ids = list.split(',').map(id => Number(id.trim()))

		expect(ids).toEqual([67, 74, 76, 77, 78, 79, 87, 88, 94, 95, 96, 104, 108])
	})

	test('it holds no personal data', () => {
		expect(personalData(register)).toEqual([])
	})
})

const urls = readFileSync(path.join(docs, 'URLS.md'), 'utf8')

type ChangedFamily = { id: string; addresses: string[] }

/** The families of the table between the `urls:ecarts` marks of URLS.md: what the addresses of the old site stop answering. */
function readChangedFamilies(markdown: string): ChangedFamily[] {
	const block = /<!-- urls:ecarts:debut -->\n([\s\S]*?)\n<!-- urls:ecarts:fin -->/.exec(markdown)?.[1] ?? ''
	return block
		.split('\n')
		.filter(row => row.startsWith('|') && !isSeparator(row))
		.slice(1)
		.map(row => {
			const [family = '', addresses = ''] = splitRow(row)
			return { id: family.replaceAll('`', ''), addresses: [...addresses.matchAll(/`([^`]+)`/g)].map(m => m[1] ?? '') }
		})
}

/**
 * The families of the table that no line of the register names: neither by the key of a line, nor by one of
 * its addresses in the « Pages touchées » cell of a line.
 */
function familiesWithoutLine(changed: ChangedFamily[], registerLines: RegisterLine[]): string[] {
	const pages = new Set(registerLines.flatMap(line => [...line.pages.matchAll(/`([^`]+)`/g)].map(m => m[1] ?? '')))
	const keys = new Set(registerLines.map(line => line.key))
	return changed
		.filter(({ id, addresses }) => !keys.has(`\`${id}\``) && !addresses.some(address => pages.has(address)))
		.map(({ id }) => id)
}

describe('the families of addresses that change, in URLS.md', () => {
	const changed = readChangedFamilies(urls)

	test('the table of URLS.md is read, with its twelve families', () => {
		expect(changed.map(({ id }) => id)).toEqual([
			'profil-non-repris',
			'toutes-les-news',
			'double-barre',
			'http',
			'www',
			'ancienne-api',
			'espace-racine',
			'espace-erreur',
			'espace-google',
			'api-nextauth',
			'api-sendmail',
			'llms-txt',
		])
		for (const { id, addresses } of changed) expect(addresses.length, id).toBeGreaterThan(0)
	})

	test('every one of them is named by a line of the register', () => {
		expect(familiesWithoutLine(changed, lines)).toEqual([])
	})

	test('a family that no line names is reported, by its key or by its addresses', () => {
		const some = [
			'| Repère | Avant | Dans la v3 | Source | Pages touchées |',
			'|---|---|---|---|---|',
			'| `par-ses-adresses` | a | b | ticket 033 | `/auth`, `/ailleurs` |',
			'| `ancienne-api` | a | b | ticket 033 | `/autre` |',
		].join('\n')
		const families = [
			{ id: 'espace-racine', addresses: ['/auth'] },
			{ id: 'ancienne-api', addresses: ['https://api.my-makeup.fr/*'] },
			{ id: 'espace-erreur', addresses: ['/auth/error'] },
			{ id: 'sans-adresse', addresses: [] },
		]
		expect(familiesWithoutLine(families, readRegister(some))).toEqual(['espace-erreur', 'sans-adresse'])
	})

	test('an address is compared whole: « /auth/error/autre » does not name « /auth/error »', () => {
		const only = readRegister(
			[
				'| Repère | Avant | Dans la v3 | Source | Pages touchées |',
				'|---|---|---|---|---|',
				'| `x` | a | b | ticket 033 | `/auth/error/autre` |',
			].join('\n')
		)
		expect(familiesWithoutLine([{ id: 'espace-erreur', addresses: ['/auth/error'] }], only)).toEqual(['espace-erreur'])
	})
})

describe('the journal of the migration', () => {
	test('it has one heading per day, the oldest first', () => {
		const days = [...log.matchAll(/^## (\d{2})\/(\d{2})\/(\d{4})$/gm)].map(
			([, day, month, year]) => `${year}-${month}-${day}`
		)

		expect(days.length).toBeGreaterThan(0)
		expect(days).toEqual([...new Set(days)].sort())
	})

	test('it starts with tickets 001 and 002, done', () => {
		expect(log).toContain('Ticket 001 fait')
		expect(log).toContain('Ticket 002 fait')
	})

	test('it holds no personal data', () => {
		expect(personalData(log)).toEqual([])
	})
})
