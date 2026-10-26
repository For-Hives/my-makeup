import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'

/**
 * The pages of the search keep the directory in the cache of Next. The « Essai » profiles are loaded with the
 * Payload of the test process, which does not refresh that cache: a spec that loads them and then reads the
 * search must have the application refresh it (`refreshProfilePages`), or it reads the directory an earlier
 * spec of the run cached before the profiles existed ("Aucun résultat pour Quasarium"), depending on which
 * specs share the shard.
 */
describe('Les essais qui lisent la recherche font rafraîchir son cache', () => {
	test('tout fichier qui charge les profils de recherche appelle refreshProfilePages', async () => {
		const missing: string[] = []
		for await (const file of new Glob('tests/e2e/**/*.ts').scan('.')) {
			const text = await Bun.file(file).text()
			if (text.includes('setSearchProfiles(') && !text.includes('refreshProfilePages(')) missing.push(file)
		}
		expect(missing).toEqual([])
	})

	test('tout fichier qui charge les profils de page et ouvre la recherche appelle refreshProfilePages', async () => {
		// The « Page … » profiles are loaded by the test process too: a search opened after an earlier spec filled the
		// directory cache reads « Aucun résultat pour Page » and `a.card-hover` never shows (e2e 3/5, 25/10/2026).
		const missing: string[] = []
		for await (const file of new Glob('tests/e2e/**/*.ts').scan('.')) {
			const text = await Bun.file(file).text()
			if (
				text.includes('setPageProfiles(') &&
				text.includes('/search?search=Page') &&
				!text.includes('refreshProfilePages(')
			)
				missing.push(file)
		}
		expect(missing).toEqual([])
	})

	test('refreshProfilePages rafraîchit pour chaque profil nouveau, pas une seule fois par processus', async () => {
		const text = await Bun.file('tests/support/public-pages.ts').text()
		expect(text).not.toMatch(/let refreshed = false/)
	})
})
