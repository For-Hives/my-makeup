import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { PROFILS_DU_JEU } from '../../src/jeu-fictif/profils'
import { poserLeJeuDuBanc } from '../fixtures/jeu-du-banc'
import {
	bilan,
	type CasDeParite,
	casDuBanc,
	type DonneesDuJeu,
	ecrireLeBilan,
	listePrivee,
	type TitresDeLAncienSite,
	verifier,
} from '../outils/parite-urls'

/**
 * I45 (ticket 072, plan 02 §7.3): every frozen address answers what the table promises, with the
 * same h1 as the old site. One run reports, by type of page, the addresses that are green and the
 * ones « à venir »; a type that is delivered fails the run on each address that is not green.
 *
 * - On the bench: the clear addresses of the inventory, the examples of the table, and the fictional
 *   set for the pages that depend on the data.
 * - On demand, on the imported copy: `PARITE_URLS_LISTE=<baseline csv of the measuring tool> bun run
 *   test:e2e tests/e2e/parite-urls.spec.ts`. Real profile addresses are requested and never written:
 *   they show as « profil #n ».
 *
 * A type is delivered once its ticket is done: it joins the list below in the same commit, and an
 * address of it that stops answering right then fails the run. A type that is not in the list but
 * answers right is counted green all the same.
 */
// Playwright runs under Node, which wants an attribute on a JSON import: the file is read.
const anciens: TitresDeLAncienSite = JSON.parse(
	readFileSync(new URL('../fixtures/parite-urls-h1.json', import.meta.url), 'utf8')
)

const LIVREES: ReadonlySet<string> = new Set([
	'adresse-inconnue',
	'historiques',
	'llms-txt',
	'barre-finale',
	'double-barre',
	'toutes-les-news',
	'api-nextauth',
	'api-sendmail',
	'sante',
	'fichiers-publics',
	'verification-bing',
	'verification-indexnow',
])

test('I45 : les adresses gelées répondent comme la table, avec le même h1', async ({ request, baseURL }) => {
	test.setTimeout(240_000)
	const privee = listePrivee()
	let cas: CasDeParite[]
	if (privee) cas = privee
	else {
		// The bench holds the fictional set: the pages that depend on the data are asked for it.
		await poserLeJeuDuBanc()
		const jeu: DonneesDuJeu = {
			profilsVisibles: PROFILS_DU_JEU.filter(({ attendu }) => attendu.statut !== 'masque').map(
				({ attendu }) => attendu.slug
			),
			profilsMasques: PROFILS_DU_JEU.filter(({ attendu }) => attendu.statut === 'masque').map(
				({ attendu }) => attendu.slug
			),
			ancienNom: { ecrit: encodeURIComponent('zoé lefèvre'), slug: 'zoe-lefevre' },
		}
		cas = casDuBanc(anciens, jeu)
	}
	expect(cas.length).toBeGreaterThan(30)

	const resultats = []
	for (const unCas of cas) {
		// `//x` is a path of the site: written after the origin, it is not read as a host.
		const resultat = await verifier(unCas, async adresse => {
			const reponse = await request.get(`${baseURL}${adresse}`, { maxRedirects: 0, failOnStatusCode: false })
			const entetes = reponse.headers()
			return {
				status: reponse.status(),
				location: entetes.location ?? null,
				contentType: entetes['content-type'] ?? null,
				corps: () => reponse.text(),
			}
		})
		resultats.push({ cas: unCas, resultat })
	}

	const lignes = bilan(resultats, LIVREES)
	console.log(`\n${ecrireLeBilan(lignes, LIVREES)}\n`)
	for (const { cas: unCas, resultat } of resultats)
		if (resultat.etat === 'ecart') console.log(`I45 écart connu ${unCas.etiquette} : ${resultat.raison}`)
	expect(lignes.flatMap(({ regressions }) => regressions)).toEqual([])
})
