/**
 * Writes tests/fixtures/parite-urls-h1.json: the h1 of the old site for the clear addresses of the
 * frozen inventory, as the measuring tool counted them (ticket 072; plan 02 I45).
 *
 *   bun --no-env-file scripts/migration/parite-urls-h1.ts <baseline-2026-10.csv>
 *
 * Reads the private baseline of the measuring tool, which holds real profile addresses, and keeps
 * only the addresses the repository already writes in clear (docs/migration/urls-inventaire.json):
 * for each, the number of h1 and the SHA-256 of their text. The h1 text itself is never written. A
 * profile address is never a key, so nothing real reaches the file.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SITE_ORIGIN } from '../../src/lib/frozen-urls'
import { lireLeCsv } from '../../tests/outils/parite-urls'
import { FROZEN_INVENTORY } from './urls-doc'

const SORTIE = fileURLToPath(new URL('../../tests/fixtures/parite-urls-h1.json', import.meta.url))

const [source] = process.argv.slice(2)
if (!source) {
	console.error('Usage : bun --no-env-file scripts/migration/parite-urls-h1.ts <baseline-2026-10.csv>')
	process.exit(1)
}

const lignes = lireLeCsv(readFileSync(source, 'utf8'))
const parUrl = new Map(lignes.map(ligne => [ligne.url ?? '', ligne]))
const adresses = [
	...FROZEN_INVENTORY.addresses.map(({ address }) => address),
	...FROZEN_INVENTORY.complements.flatMap(({ address }) => (address ? [address] : [])),
]

const resultat: Record<string, { n: number; sha: string | null }> = {}
for (const adresse of adresses) {
	if (!adresse.startsWith('/')) continue
	const ligne = parUrl.get(`${SITE_ORIGIN}${adresse}`)
	if (!ligne || ligne.type !== 'html') continue
	resultat[adresse] = { n: Number(ligne.h1_nb), sha: ligne.h1_sha256 || null }
}
writeFileSync(SORTIE, `${JSON.stringify(resultat, null, '\t')}\n`)
console.log(`${Object.keys(resultat).length} adresses écrites dans tests/fixtures/parite-urls-h1.json`)
