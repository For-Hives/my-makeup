/**
 * The tools of the parity of the addresses (ticket 072; plan 02 I45): how the h1 of a page is read,
 * the cases, the check and the report. Unit tests: no server (the run itself is
 * tests/e2e/parite-urls.spec.ts).
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
	bilan,
	type CasDeParite,
	casDeLaListePrivee,
	casDuBanc,
	ecrireLeBilan,
	empreinteDesTitres,
	lireLeCsv,
	type Reponse,
	type Resultat,
	sha256,
	type TitresDeLAncienSite,
	verifier,
} from '../outils/parite-urls'

const RACINE = join(import.meta.dir, '../..')
const anciens: TitresDeLAncienSite = JSON.parse(
	readFileSync(join(RACINE, 'tests/fixtures/parite-urls-h1.json'), 'utf8')
)
const inventaire = JSON.parse(readFileSync(join(RACINE, 'docs/migration/urls-inventaire.json'), 'utf8')) as {
	addresses: { address: string }[]
	complements: { address?: string }[]
}

/** The hash the old site's tool wrote for an address, which the fixture must hold. */
const hash = (adresse: string): string => {
	const sha = anciens[adresse]?.sha
	if (!sha) throw new Error(`pas d'empreinte pour ${adresse}`)
	return sha
}

const page = (corps: string, status = 200, location: string | null = null): Reponse => ({
	status,
	location,
	contentType: 'text/html; charset=utf-8',
	corps: async () => corps,
})

describe('la lecture du h1, comme l’outil de mesure', () => {
	// The three texts below are the public titles of the site; the hashes are those the tool wrote in 2026-10.
	test('le titre de l’accueil, de la page 404 et de la recherche donnent les empreintes de l’ancien site', () => {
		expect(sha256("Trouver la maquilleuse qui vous correspond n'a jamais été aussi simple")).toBe(hash('/'))
		expect(sha256('404 - Page non trouvée')).toBe(hash('/page-inexistante-audit-zz'))
		expect(sha256('Rechercher une maquilleuse')).toBe(hash('/search'))
	})

	test('les balises, les commentaires de React, les espaces et les entités sont lus comme l’outil les lit', () => {
		const html = `<html><head><script>var a = "<h1>x</h1>"</script></head><body>
			<h1 class="a">Trouver la maquilleuse <!-- --> qui vous correspond n&#x27;a jamais\n été aussi simple</h1></body></html>`
		expect(empreinteDesTitres(html)).toEqual({ n: 1, sha: hash('/') })
		expect(empreinteDesTitres('<p>sans titre</p>')).toEqual({ n: 0, sha: null })
		expect(empreinteDesTitres('<h1>Un</h1><h1>Deux</h1>').n).toBe(2)
	})
})

describe('la fixture des h1 de l’ancien site', () => {
	test('elle ne garde que des adresses que le dépôt écrit déjà en clair, jamais un chemin de profil', () => {
		const ecrites = new Set([
			...inventaire.addresses.map(({ address }) => address),
			...inventaire.complements.flatMap(({ address }) => (address ? [address] : [])),
		])
		for (const adresse of Object.keys(anciens)) expect(ecrites.has(adresse)).toBe(true)
		expect(Object.keys(anciens).filter(adresse => /^\/{1,2}profil\/(?!audit-inexistant-zz9$)/.test(adresse))).toEqual(
			[]
		)
	})

	test('chaque entrée dit un nombre de h1 et une empreinte de 64 caractères, ou aucune', () => {
		for (const [adresse, { n, sha }] of Object.entries(anciens)) {
			expect(Number.isInteger(n), adresse).toBe(true)
			if (n > 0) expect(sha, adresse).toMatch(/^[0-9a-f]{64}$/)
			else expect(sha, adresse).toBeNull()
		}
	})
})

describe('les cas du banc', () => {
	const cas = casDuBanc(anciens, {
		profilsVisibles: ['alice-test'],
		profilsMasques: ['masquee-test'],
		ancienNom: { ecrit: 'zo%C3%A9%20lef%C3%A8vre', slug: 'zoe-lefevre' },
		talents: ['maquillage-test'],
		articlesPublies: ['article-test'],
		articlesBrouillons: ['brouillon-test'],
	})
	const de = (adresse: string): CasDeParite => {
		const trouve = cas.find(c => c.adresse === adresse)
		if (!trouve) throw new Error(`pas de cas pour ${adresse}`)
		return trouve
	}

	test('une adresse redirigée est suivie jusqu’à sa destination, dont l’h1 est celui de l’ancien site', () => {
		expect(de('/blog/')).toMatchObject({ famille: 'barre-finale', statuts: [308], vers: '/blog', statutFinal: 200 })
		expect(de('/blog/').titre).toEqual({ mode: 'hash', sha: hash('/blog') })
		expect(de('/toutes-les-news')).toMatchObject({ statuts: [301], vers: '/blog', familleFinale: 'blog' })
		expect(de('/auth/profil')).toMatchObject({ famille: 'espace-prive', statuts: [307] })
	})

	test('la double barre accepte le 308 de Next, et reste un écart connu', () => {
		expect(de('//blog')).toMatchObject({ famille: 'double-barre', statuts: [301, 308] })
		expect(de('//blog').ecartConnu).toBeDefined()
	})

	test('une page inconnue doit avoir l’h1 de la 404 de l’ancien site, une recherche un seul h1', () => {
		expect(de('/page-inexistante-audit-zz').titre).toEqual({
			mode: 'hash',
			sha: hash('/page-inexistante-audit-zz'),
		})
		expect(de('/search?city=Annecy').titre).toEqual({ mode: 'un' })
		expect(de('/search').titre).toEqual({ mode: 'hash', sha: hash('/search') })
	})

	test('une page à deux h1 sur l’ancien site doit en avoir un seul', () => {
		expect(de('/a-propos').titre).toEqual({ mode: 'un' })
	})

	test('les profils, les talents et les articles viennent du jeu fictif, pas des vrais slugs de l’inventaire', () => {
		expect(de('/profil/alice-test')).toMatchObject({ famille: 'profil', statuts: [200] })
		expect(de('/profil/masquee-test')).toMatchObject({ famille: 'slug-inconnu', statuts: [404] })
		expect(de('/profil/zo%C3%A9%20lef%C3%A8vre')).toMatchObject({
			famille: 'profil-ancien-nom',
			vers: '/profil/zoe-lefevre',
		})
		expect(cas.some(c => c.adresse === '/blog/cout-maquilleuse-professionnelle-guide-tarifs')).toBe(false)
		expect(cas.some(c => c.adresse === '/talent/maquillage-fete')).toBe(false)
		expect(cas.some(c => c.adresse === '/talent/maquillage-mariee')).toBe(false)
		expect(de('/talent/maquillage-test')).toMatchObject({ famille: 'talent', statuts: [200] })
		expect(de('/blog/article-test')).toMatchObject({ famille: 'article', statuts: [200] })
		expect(de('/blog/brouillon-test')).toMatchObject({ famille: 'slug-inconnu', statuts: [404] })
	})

	test('les hôtes (http, www, ancienne API) ne sont pas des cas : l’hébergeur répond', () => {
		expect(cas.filter(c => ['http', 'www', 'ancienne-api'].includes(c.famille))).toEqual([])
	})
})

describe('la vérification d’un cas', () => {
	const cas: CasDeParite = {
		adresse: '/blog/',
		etiquette: '/blog/',
		famille: 'barre-finale',
		statuts: [308],
		vers: '/blog',
		statutFinal: 200,
		familleFinale: 'blog',
		titre: { mode: 'hash', sha: sha256('Le blog') },
	}
	const serveur =
		(table: Record<string, Reponse>) =>
		async (adresse: string): Promise<Reponse> =>
			table[adresse] ?? page('<h1>404 - Page non trouvée</h1>', 404)

	test('un saut juste, vers une page de même h1 et de même statut : vert', async () => {
		const resultat = await verifier(
			cas,
			serveur({ '/blog/': page('', 308, '/blog'), '/blog': page('<main><h1>Le blog</h1></main>') })
		)
		expect(resultat).toEqual({ etat: 'vert', destination: [] })
	})

	test('un mauvais statut ou une mauvaise destination : rouge, au nom de l’adresse', async () => {
		expect(await verifier(cas, serveur({ '/blog/': page('', 301, '/blog') }))).toMatchObject({ etat: 'rouge' })
		expect(await verifier(cas, serveur({ '/blog/': page('', 308, '/ailleurs') }))).toMatchObject({
			etat: 'rouge',
			defauts: ['destination /ailleurs au lieu de /blog'],
		})
	})

	test('une destination fautive est un défaut de la destination, pas de l’adresse', async () => {
		const resultat = await verifier(
			cas,
			serveur({ '/blog/': page('', 308, '/blog'), '/blog': page('<h1>Autre titre</h1>') })
		)
		expect(resultat).toEqual({ etat: 'vert', destination: ['h1 différent de celui de l’ancien site'] })
	})

	test('un h1 en double est un défaut, même avec le bon texte', async () => {
		const direct: CasDeParite = { ...cas, adresse: '/blog', vers: undefined, statuts: [200] }
		delete direct.vers
		const resultat = await verifier(direct, serveur({ '/blog': page('<h1>Le blog</h1><h1>Le blog</h1>') }))
		expect(resultat).toMatchObject({ etat: 'rouge', defauts: ["2 h1 au lieu d'un seul"] })
	})
})

describe('le bilan par type', () => {
	const vert: Resultat = { etat: 'vert', destination: [] }
	const rouge: Resultat = { etat: 'rouge', defauts: ['statut 404 au lieu de 200'], destination: [] }
	const unCas = (famille: string, adresse: string): CasDeParite => ({
		adresse,
		etiquette: adresse,
		famille,
		statuts: [200],
		statutFinal: 200,
		titre: 'non-verifie',
	})

	test('un type livré dont une adresse échoue est une régression ; un type à venir est « à venir »', () => {
		const lignes = bilan(
			[
				{ cas: unCas('accueil', '/'), resultat: vert },
				{ cas: unCas('accueil', '/?a'), resultat: rouge },
				{ cas: unCas('talent', '/talent/a'), resultat: rouge },
				{ cas: unCas('talent', '/talent/b'), resultat: vert },
			],
			new Set(['accueil'])
		)
		expect(lignes).toEqual([
			{ famille: 'accueil', vertes: 1, aVenir: 0, ecarts: 0, regressions: ['/?a : statut 404 au lieu de 200'] },
			{ famille: 'talent', vertes: 1, aVenir: 1, ecarts: 0, regressions: [] },
		])
		expect(ecrireLeBilan(lignes, new Set(['accueil']))).toContain('talent')
		expect(ecrireLeBilan(lignes, new Set(['accueil']))).toMatch(/talent\s+1 verte, 1 à venir/)
	})

	test('la destination fautive d’une redirection pèse sur la famille de la destination, si elle est livrée', () => {
		const redirection: CasDeParite = { ...unCas('barre-finale', '/blog/'), vers: '/blog', familleFinale: 'blog' }
		const fautive: Resultat = { etat: 'vert', destination: ['la destination répond 404 au lieu de 200'] }
		const livree = bilan([{ cas: redirection, resultat: fautive }], new Set(['blog', 'barre-finale']))
		expect(livree.find(l => l.famille === 'blog')?.regressions).toEqual([
			'/blog/ → /blog : la destination répond 404 au lieu de 200',
		])
		expect(livree.find(l => l.famille === 'barre-finale')?.vertes).toBe(1)
		const attendue = bilan([{ cas: redirection, resultat: fautive }], new Set(['barre-finale']))
		expect(attendue.flatMap(l => l.regressions)).toEqual([])
	})
})

describe('la liste privée de la copie importée', () => {
	const blog = sha256('Le blog')
	const jeanne = sha256('Jeanne Imaginaire')
	const csv = [
		'url,chemin,statut_initial,statut_final,url_finale,type,h1_nb,h1_sha256',
		`https://my-makeup.fr/blog,/blog,200,200,https://my-makeup.fr/blog,html,1,${blog}`,
		`https://my-makeup.fr/profil/jeanne-imaginaire,/profil/jeanne-imaginaire,200,200,https://my-makeup.fr/profil/jeanne-imaginaire,html,1,${jeanne}`,
		`https://my-makeup.fr/profil/Jeanne Ancien,/profil/Jeanne Ancien,308,200,https://my-makeup.fr/profil/jeanne-imaginaire,html,1,${jeanne}`,
		`http://my-makeup.fr/,/,302,200,https://my-makeup.fr/,html,1,${sha256('x')}`,
	].join('\n')

	test('un champ entre guillemets, avec une virgule ou un saut de ligne, reste un seul champ', () => {
		expect(lireLeCsv('a,b\n"x, y","l1\nl2"\n')).toEqual([{ a: 'x, y', b: 'l1\nl2' }])
	})

	test('un profil réel est numéroté, jamais nommé, ni dans son étiquette ni dans les messages', async () => {
		const cas = casDeLaListePrivee(csv)
		expect(cas.map(c => c.etiquette)).toEqual(['/blog', 'profil #1', 'profil #2'])
		expect(cas.map(c => c.famille)).toEqual(['blog', 'profil', 'profil-ancien-nom'])
		const ancienNom = cas[2]
		if (!ancienNom) throw new Error('pas de cas')
		const resultat = await verifier(ancienNom, async () => page('', 404))
		expect(JSON.stringify(resultat)).not.toContain('jeanne')
		const faux = await verifier(ancienNom, async adresse =>
			adresse === ancienNom.adresse ? page('', 308, '/profil/autre-nom-imaginaire') : page('', 404)
		)
		expect(JSON.stringify(faux)).not.toContain('autre-nom-imaginaire')
		expect(JSON.stringify(faux)).toContain('/profil/…')
	})

	test('un profil dont l’adresse répond 200 ou 404 est juste : les 13 profils non repris ne se distinguent pas dans la liste', () => {
		const [, profil] = casDeLaListePrivee(csv)
		expect(profil?.statuts).toEqual([200, 404])
	})
})
