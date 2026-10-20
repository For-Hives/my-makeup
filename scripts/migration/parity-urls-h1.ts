/**
 * Writes tests/fixtures/parite-urls-h1.json: the h1 of the old site for the clear addresses of the
 * frozen inventory, as the measuring tool counted them (ticket 072; plan 02 I45).
 *
 *   bun --no-env-file scripts/migration/parity-urls-h1.ts <baseline-2026-10.csv>
 *
 * Reads the private baseline of the measuring tool, which holds real profile addresses, and keeps
 * only the addresses the repository already writes in clear (docs/migration/urls-inventaire.json):
 * for each, the number of h1 and the SHA-256 of their text. The h1 text itself is never written. A
 * profile address is never a key, so nothing real reaches the file.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SITE_ORIGIN } from '../../src/lib/frozen-urls'
import { lireLeCsv } from '../../tests/support/url-parity'
import { FROZEN_INVENTORY } from './urls-doc'

const OUTPUT = fileURLToPath(new URL('../../tests/fixtures/parite-urls-h1.json', import.meta.url))

const [source] = process.argv.slice(2)
if (!source) {
	console.error('Usage : bun --no-env-file scripts/migration/parity-urls-h1.ts <baseline-2026-10.csv>')
	process.exit(1)
}

const rows = lireLeCsv(readFileSync(source, 'utf8'))
const byUrl = new Map(rows.map(ligne => [ligne.url ?? '', ligne]))
const addresses = [
	...FROZEN_INVENTORY.addresses.map(({ address }) => address),
	...FROZEN_INVENTORY.complements.flatMap(({ address }) => (address ? [address] : [])),
]

const result: Record<string, { n: number; sha: string | null }> = {}
for (const pageUrl of addresses) {
	if (!pageUrl.startsWith('/')) continue
	const row = byUrl.get(`${SITE_ORIGIN}${pageUrl}`)
	if (!row || row.type !== 'html') continue
	result[pageUrl] = { n: Number(row.h1_nb), sha: row.h1_sha256 || null }
}
writeFileSync(OUTPUT, `${JSON.stringify(result, null, '\t')}\n`)
console.log(`${Object.keys(result).length} adresses écrites dans tests/fixtures/parite-urls-h1.json`)
