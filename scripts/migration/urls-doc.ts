/**
 * Writes the tables of docs/migration/URLS.md from the frozen table (src/lib/urls-gelees.ts)
 * and from the frozen inventory (docs/migration/urls-inventaire.json), so the document
 * cannot say anything else than what the tests read.
 *
 *   bun scripts/migration/urls-doc.ts           rewrites the generated blocks
 *   bun scripts/migration/urls-doc.ts --check   exit 1 when the document is out of date
 *
 * A block sits between `<!-- urls:<name>:debut -->` and `<!-- urls:<name>:fin -->`. The text
 * around the blocks is written by hand and never touched. Reads and writes that one file:
 * no network, no database.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import inventoryJson from '../../docs/migration/urls-inventaire.json'
import {
	anonymousStatus,
	FROZEN_URL_FAMILIES,
	type FrozenUrlFamily,
	familiesMeasured,
	UNWANTED_404_OF_2026_10_09,
	type UrlKind,
} from '../../src/lib/urls-gelees'

export const DOCUMENT_PATH = fileURLToPath(new URL('../../docs/migration/URLS.md', import.meta.url))

export interface InventoryAddress {
	address: string
	sources: string[]
	/** Status of the first answer. */
	first: number
	/** Status at the end of the redirects. */
	final: number
	hops: number
}

export interface InventoryProfileCase {
	family: string
	case: string
	count: number
	first: number
	final: number
}

export interface InventoryComplement {
	/** Left out for the IndexNow key file: its address is the key. */
	address?: string
	/** null when the table does not freeze the address. */
	family: string | null
	first: number
	sameBytesAsRepository?: boolean
}

export interface FrozenInventory {
	readAt: string
	previousReadAt: string
	previousTotal: number
	requests: number
	total: number
	complementsReadAt: string
	/** Every address read that names no real profile. */
	addresses: InventoryAddress[]
	/** The addresses made from a real profile, as numbers only. */
	profiles: InventoryProfileCase[]
	/** Technical addresses read by hand, outside the inventory tool. */
	complements: InventoryComplement[]
}

export const FROZEN_INVENTORY: FrozenInventory = inventoryJson

/** Sections of the document, in order, with the kinds of families each one lists. */
export const SECTIONS: ReadonlyArray<{ block: string; kinds: readonly UrlKind[] }> = [
	{ block: 'familles:pages', kinds: ['page', 'article', 'talent', 'profil', 'recherche', 'inconnue'] },
	{ block: 'familles:forme', kinds: ['normalisation'] },
	{ block: 'familles:hotes', kinds: ['hote'] },
	{ block: 'familles:espace', kinds: ['espace'] },
	{ block: 'familles:retirees', kinds: ['retiree'] },
	{ block: 'familles:techniques', kinds: ['technique'] },
	{ block: 'familles:verification', kinds: ['verification'] },
	{ block: 'familles:historiques', kinds: ['historique'] },
]

const code = (text: string): string => `\`${text}\``

function table(header: readonly string[], rows: ReadonlyArray<readonly string[]>): string {
	const line = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`
	return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n')
}

/** « 14/10/2026 à 00:07 UTC » from an ISO date of the inventory. */
export function frenchDate(iso: string): string {
	const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})Z$/.exec(iso)
	if (!parts) throw new Error(`Date illisible dans l'inventaire : ${iso}`)
	return `${parts[3]}/${parts[2]}/${parts[1]} à ${parts[4]} UTC`
}

const RULES: Readonly<Record<NonNullable<FrozenUrlFamily['rule']>, string>> = {
	'double-slash': 'Toute adresse avec `//`',
	'trailing-slash': 'Toute adresse terminée par `/`',
}

function addressesCell(family: FrozenUrlFamily): string {
	const patterns = family.rule
		? RULES[family.rule]
		: (family.origins ?? ['']).flatMap(origin => family.patterns.map(pattern => code(`${origin}${pattern}`))).join(', ')
	return family.when ? `${patterns} : ${family.when}` : patterns
}

/** « 301 en un saut », « 301 ou 308 en un saut », « 200 ; sans session, 307 en un saut ». */
export function statusCell(family: FrozenUrlFamily): string {
	const statuses = [family.status, ...(family.alsoAccepted ?? [])].join(' ou ')
	const direct = family.redirect ? `${statuses} en un saut` : `${statuses}`
	return family.withoutSession ? `${direct} ; sans session, ${family.withoutSession.status} en un saut` : direct
}

/** The same, for a visitor without a session: « 307 en un saut », « 301 ou 308 en un saut », « 404 ». */
export function anonymousStatusCell(family: FrozenUrlFamily): string {
	return family.withoutSession ? `${family.withoutSession.status} en un saut` : statusCell(family)
}

function afterCell(family: FrozenUrlFamily): string {
	const after = family.redirect ? `${family.after} : ${family.redirect.to}` : family.after
	return family.withoutSession
		? `${after} ; sans session, redirection vers ${family.withoutSession.redirect.to}`
		: after
}

function familiesTable(kinds: readonly UrlKind[]): string {
	const rows = FROZEN_URL_FAMILIES.filter(family => kinds.includes(family.kind)).map(family => [
		code(family.id),
		addressesCell(family),
		family.today,
		afterCell(family),
		statusCell(family),
		family.planRow === undefined ? '—' : String(family.planRow),
	])
	return table(['Famille', 'Adresses', "Aujourd'hui", 'Après la bascule', 'Code attendu', 'Ligne de 01 §6.3'], rows)
}

function unwanted404Table(): string {
	const rows = UNWANTED_404_OF_2026_10_09.map((entry, index) => [
		String(index + 1),
		code(entry.path),
		entry.was,
		entry.successor ? code(entry.successor) : '—',
		'404 attendue',
		entry.reason,
	])
	return table(['N°', 'Adresse', "Ce que c'était", 'Page qui a pris la suite', 'Après la bascule', 'Pourquoi'], rows)
}

/** What changes for an anonymous visitor: families whose status is not the one measured today. */
function changesTable(): string {
	const rows = FROZEN_URL_FAMILIES.filter(
		family => family.statusToday.length !== 1 || family.statusToday[0] !== anonymousStatus(family)
	).map(family => [code(family.id), addressesCell(family), family.statusToday.join(', '), anonymousStatusCell(family)])
	return table(['Famille', 'Adresses', "Code aujourd'hui", 'Code après la bascule'], rows)
}

/** The one family of an inventory address: the candidate measured with its first status. */
export function inventoryFamily(entry: { address: string; first: number }): FrozenUrlFamily {
	const found = familiesMeasured(entry.address, entry.first)
	const [family] = found
	if (family === undefined || found.length !== 1)
		throw new Error(`${entry.address} (${entry.first}) : ${found.length} familles au lieu d'une`)
	return family
}

const familyById = (id: string): FrozenUrlFamily => {
	const family = FROZEN_URL_FAMILIES.find(candidate => candidate.id === id)
	if (!family) throw new Error(`Famille inconnue dans l'inventaire : ${id}`)
	return family
}

const todayCell = (first: number, final: number, hops: number): string =>
	hops === 0 ? String(first) : `${first}, puis ${final} en ${hops} ${hops === 1 ? 'saut' : 'sauts'}`

function inventorySummary(inventory: FrozenInventory): string {
	const counts = new Map<string, number>()
	const add = (id: string, count: number): void => {
		counts.set(id, (counts.get(id) ?? 0) + count)
	}
	for (const entry of inventory.addresses) add(inventoryFamily(entry).id, 1)
	for (const profile of inventory.profiles) add(profile.family, profile.count)
	const rows = FROZEN_URL_FAMILIES.filter(family => counts.has(family.id)).map(family => [
		code(family.id),
		String(counts.get(family.id)),
		family.statusToday.join(', '),
		anonymousStatusCell(family),
	])
	const total = [...counts.values()].reduce((sum, count) => sum + count, 0)
	if (total !== inventory.total) throw new Error(`Inventaire : ${total} adresses classées sur ${inventory.total}`)
	const real = inventory.profiles.reduce((sum, profile) => sum + profile.count, 0)
	return [
		`Relevé du ${frenchDate(inventory.readAt)} : **${inventory.total} adresses**, ${inventory.requests} requêtes GET. ` +
			`${inventory.addresses.length} sont écrites en clair plus bas ; les ${real} autres portent le nom d'un profil et ne sont que comptées.`,
		'',
		table(
			['Famille', 'Adresses relevées', "Code aujourd'hui", 'Code après la bascule'],
			[...rows, ['**Total**', `**${total}**`, '', '']]
		),
	].join('\n')
}

function inventoryAddressesTable(inventory: FrozenInventory): string {
	const rows = inventory.addresses.map(entry => {
		const family = inventoryFamily(entry)
		return [
			code(entry.address),
			todayCell(entry.first, entry.final, entry.hops),
			anonymousStatusCell(family),
			code(family.id),
		]
	})
	return table(['Adresse', "Aujourd'hui", 'Après la bascule', 'Famille'], rows)
}

function inventoryProfilesTable(inventory: FrozenInventory): string {
	const rows = inventory.profiles.map(profile => {
		const family = familyById(profile.family)
		const hops = profile.first === profile.final ? 0 : 1
		return [
			profile.case,
			String(profile.count),
			todayCell(profile.first, profile.final, hops),
			anonymousStatusCell(family),
			code(family.id),
		]
	})
	return table(['Cas', 'Adresses', "Aujourd'hui", 'Après la bascule', 'Famille'], rows)
}

function complementsTable(inventory: FrozenInventory): string {
	const rows = inventory.complements.map(entry => {
		const family = entry.family === null ? null : familyById(entry.family)
		return [
			entry.address ? code(entry.address) : 'Fichier de clé IndexNow (`/<clé>.txt`)',
			entry.sameBytesAsRepository ? `${entry.first}, mêmes octets que le fichier de \`public/\`` : String(entry.first),
			family ? anonymousStatusCell(family) : 'Hors gel',
			family ? code(family.id) : '—',
		]
	})
	return table(['Adresse', "Aujourd'hui", 'Après la bascule', 'Famille'], rows)
}

/** Every generated block of the document, by name. */
export function renderBlocks(inventory: FrozenInventory = FROZEN_INVENTORY): Record<string, string> {
	return {
		...Object.fromEntries(SECTIONS.map(section => [section.block, familiesTable(section.kinds)])),
		'classement-404': unwanted404Table(),
		ecarts: changesTable(),
		'inventaire:familles': inventorySummary(inventory),
		'inventaire:adresses': inventoryAddressesTable(inventory),
		'inventaire:profils': inventoryProfilesTable(inventory),
		'inventaire:complements': complementsTable(inventory),
	}
}

const startMark = (name: string): string => `<!-- urls:${name}:debut -->`
const endMark = (name: string): string => `<!-- urls:${name}:fin -->`

/** The document with every block replaced. Throws when a block has no place in it. */
export function applyBlocks(document: string, blocks: Readonly<Record<string, string>>): string {
	let result = document
	for (const [name, content] of Object.entries(blocks)) {
		const start = result.indexOf(startMark(name))
		const end = result.indexOf(endMark(name))
		if (start === -1 || end === -1 || end < start)
			throw new Error(`Bloc « ${name} » introuvable dans docs/migration/URLS.md`)
		result = `${result.slice(0, start + startMark(name).length)}\n${content}\n${result.slice(end)}`
	}
	return result
}

/** Names of the blocks marked in a document, in order. */
export function blocksOf(document: string): string[] {
	return [...document.matchAll(/<!-- urls:([a-z0-9:-]+):debut -->/g)].map(match => match[1] ?? '')
}

function main(argv: readonly string[]): number {
	const current = readFileSync(DOCUMENT_PATH, 'utf8')
	const wanted = applyBlocks(current, renderBlocks())
	if (argv.includes('--check')) {
		if (wanted === current) return 0
		console.error('docs/migration/URLS.md ne dit plus la même chose que la table : bun scripts/migration/urls-doc.ts')
		return 1
	}
	if (wanted !== current) writeFileSync(DOCUMENT_PATH, wanted)
	console.log(
		wanted === current ? 'docs/migration/URLS.md : déjà à jour' : 'docs/migration/URLS.md : tableaux réécrits'
	)
	return 0
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
