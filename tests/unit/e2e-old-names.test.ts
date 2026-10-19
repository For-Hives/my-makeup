import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'

/**
 * Tickets 250 and 251: the end-to-end files are not type-checked against the schema, so a name the
 * database lost would only fail in the CI. This guard reads them and refuses the old slugs and the
 * old enumeration values in the places that query the database.
 */

const OLD = [
	/collection: '(profils|demandes|auth-evenements|comptes-supprimes)'/,
	/\['demandes',/,
	/type: \{ equals: '(inscription|deconnexion|connexion)' \}/,
	/status\)\.toBe\('(publie|masque|brouillon)'\)/,
	/collection: 'pros', where: \{ nom:/,
]

describe('Les essais de bout en bout ne gardent aucun ancien nom de la base', () => {
	test('aucun ancien slug ni ancienne valeur dans tests/e2e', async () => {
		const found: string[] = []
		for await (const file of new Glob('tests/e2e/**/*.ts').scan('.')) {
			const text = await Bun.file(file).text()
			for (const pattern of OLD) if (pattern.test(text)) found.push(`${file}: ${pattern}`)
		}
		expect(found).toEqual([])
	})
})
