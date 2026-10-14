import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { poserLesProfilsDeRecherche } from '../fixtures/profils-de-recherche'
import { creerContenu, rafraichirLesPagesDesProfils, supprimerContenu } from '../outils/pages-publiques'
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
	'accueil',
	'recherche',
	'adresse-inconnue',
	'historiques',
	'llms-txt',
	'article',
	'talent',
	'barre-finale',
	'double-barre',
	'toutes-les-news',
	'api-nextauth',
	'api-sendmail',
	'sante',
	'fichiers-publics',
	'verification-bing',
	'verification-indexnow',
	'profil',
	'profil-ancien-nom',
	'profil-non-repris',
])

test('I45 : les adresses gelées répondent comme la table, avec le même h1', async ({ request, baseURL }) => {
	test.setTimeout(300_000)
	const privee = listePrivee()
	const contenus: { collection: 'talents' | 'articles'; id: number }[] = []
	let cas: CasDeParite[]
	if (privee) cas = privee
	else {
		// The bench holds made-up pages for the families that depend on the data.
		const profils = await poserLesProfilsDeRecherche()
		const profil = (cle: string) => {
			const trouve = profils.get(cle)
			if (!trouve) throw new Error(`pas de profil d’essai « ${cle} »`)
			return trouve
		}
		await rafraichirLesPagesDesProfils(request, profil('reference'))
		const suffixe = Date.now().toString(36)
		const talent = `essai-parite-${suffixe}`
		const publie = `essai-parite-publie-${suffixe}`
		const brouillon = `essai-parite-brouillon-${suffixe}`
		contenus.push(
			{
				collection: 'talents',
				id: await creerContenu(request, 'talents', { title: `Essai ${talent}`, slug: talent, _status: 'published' }),
			},
			{
				collection: 'articles',
				id: await creerContenu(request, 'articles', { title: `Essai ${publie}`, slug: publie, _status: 'published' }),
			},
			{
				collection: 'articles',
				id: await creerContenu(request, 'articles', { title: `Essai ${brouillon}`, slug: brouillon, _status: 'draft' }),
			}
		)
		const jeu: DonneesDuJeu = {
			profilsVisibles: [...profils.entries()].filter(([cle]) => cle !== 'masquee').map(([, { slug }]) => slug),
			profilsMasques: [profil('masquee').slug],
			ancienNom: { ecrit: encodeURIComponent('Essai Zoé'), slug: profil('ancien-nom-accentue').slug },
			talents: [talent],
			articlesPublies: [publie],
			articlesBrouillons: [brouillon],
		}
		cas = casDuBanc(anciens, jeu)
	}
	expect(cas.length).toBeGreaterThan(30)

	try {
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
	} finally {
		for (const { collection, id } of contenus) await supprimerContenu(request, collection, id)
	}
})
