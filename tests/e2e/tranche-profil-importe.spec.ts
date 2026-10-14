import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { RACINE } from '../outils/banc'
import { ECRANS } from '../outils/e2e'

/**
 * Ticket 026, the first slice, end to end: the fake Strapi source of the bench, the import as a
 * person runs it, then the public page of the fictional profile 21 in the application built for
 * production. One test, on the large screen only: the import writes into the bench, and two
 * screen sizes would run it twice at once. The 390 px look is taken inside the same test.
 *
 * The source and the import are commands of bun, started from here with the environment of the
 * bench that `bun run test:e2e` gives Playwright.
 */

const DECISIONS_DU_BANC = 'tests/fixtures/import/decisions-du-banc.json'

/** The kept answers of the referential of the communes for the fake source: the import asks nothing online. */
const REFERENTIEL_DU_BANC = 'tests/fixtures/import/referentiel-du-banc.json'

/** The keys a reading of a profile must never put into a page: what is private or reserved. */
const CLES_PRIVEES =
	/"(?:pro|strapiId|legacyUsername|statut|motif|verifie|verifieLe|siret|noteInterne|score|superMaquilleuse|coordonnees|telephone|contactPublic|consentiLe|sourceConsentement)"\s*:/

/**
 * Runs a command of bun in the repository, under the environment of the bench and the production
 * mode of the application it serves, and gives its exit code and output.
 */
function bun(...ligne: string[]): Promise<{ code: number | null; sortie: string }> {
	return new Promise((resoudre, rejeter) => {
		const enfant = spawn('bun', ['--no-env-file', ...ligne], {
			cwd: RACINE,
			env: { ...process.env, NODE_ENV: 'production' },
		})
		let sortie = ''
		enfant.stdout.on('data', morceau => {
			sortie += String(morceau)
		})
		enfant.stderr.on('data', morceau => {
			sortie += String(morceau)
		})
		enfant.on('error', rejeter)
		enfant.on('close', code => resoudre({ code, sortie }))
	})
}

/** A real run of the import, with the table of decisions of the bench, and its report. */
async function importer(rapport: string) {
	const { code, sortie } = await bun(
		'scripts/migration/import.ts',
		'--reel',
		'--decisions',
		DECISIONS_DU_BANC,
		'--communes',
		REFERENTIEL_DU_BANC,
		'--hors-ligne',
		// Profile 21 of the fake source shows contact details: the import needs the date of the switch.
		'--consentement-le',
		'2026-11-02T08:00:00Z',
		'--rapport',
		rapport
	)
	expect(code, sortie).toBe(0)
	return JSON.parse(readFileSync(rapport, 'utf8')) as {
		collections: Record<string, { crees: number; modifies: number }>
	}
}

test.afterAll(async () => {
	await bun('scripts/source-strapi.ts', '--effacer')
})

test('un profil repris de la fausse base Strapi s’affiche sur sa page publique, nom en h1, rien de privé', async ({
	page,
	request,
}, testInfo) => {
	test.setTimeout(180_000)
	const source = await bun('scripts/source-strapi.ts')
	expect(source.code, source.sortie).toBe(0)

	const premier = await importer(testInfo.outputPath('rapport-1.json'))
	expect(premier.collections.profils).toMatchObject({ crees: 13, modifies: 0 })

	// The HTML of the server, as a search engine reads it: 200, the name in the only h1.
	const reponse = await request.get('/profil/zoe-lefevre')
	expect(reponse.status()).toBe(200)
	const html = await reponse.text()
	expect(html).toMatch(/<h1[^>]*>Zoé Lefèvre<\/h1>/)
	expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
	expect(html).toContain('Mariage')
	// Profile 21 shows a phone and an email on the old site, and the import carries that consent
	// over (ticket 064): the page of ticket 102 shows exactly those two, and the email of her
	// account, which she never published, nowhere. Nothing private goes into the page as data.
	expect(html).toContain('06 39 98 12 34')
	expect(html).toContain('contact.zoe@example.test')
	expect(html).toContain('Français')
	expect(html).not.toContain('zoe.lefevre@example.test')
	expect(html).not.toMatch(CLES_PRIVEES)

	// In a browser, at both widths.
	await page.goto('/profil/zoe-lefevre')
	const titre = page.getByRole('heading', { level: 1, name: 'Zoé Lefèvre' })
	await expect(titre).toBeVisible()
	await page.setViewportSize(ECRANS.mobile)
	await expect(titre).toBeVisible()
	await testInfo.attach('profil-390px', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })

	// An unknown slug: 404. What a draft answers is ticket 104's (200 in noindex, as today).
	expect((await request.get('/profil/audit-inexistant-zz9')).status()).toBe(404)

	// A second run of the import writes nothing.
	const second = await importer(testInfo.outputPath('rapport-2.json'))
	for (const collection of ['pros', 'profils', 'talents'])
		expect(second.collections[collection], collection).toMatchObject({ crees: 0, modifies: 0 })
})
