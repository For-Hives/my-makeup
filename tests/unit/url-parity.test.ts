/**
 * The tools of the parity of the addresses (ticket 072; plan 02 I45): how the h1 of a page is read,
 * the cases, the check and the report. Unit tests: no server (the run itself is
 * tests/e2e/parite-urls.spec.ts).
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
	benchCase,
	check,
	type OldSiteTitles,
	type ParityCase,
	privateListCase,
	type Reply,
	type Result,
	readCsv,
	sha256,
	summary,
	titleFingerprint,
	writeSummary,
} from '../support/url-parity'

const ROOT = join(import.meta.dir, '../..')
const old: OldSiteTitles = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/url-parity-h1.json'), 'utf8'))
const inventory = JSON.parse(readFileSync(join(ROOT, 'docs/migration/urls-inventaire.json'), 'utf8')) as {
	addresses: { address: string }[]
	complements: { address?: string }[]
}

/** The hash the old site's tool wrote for an address, which the fixture must hold. */
const hash = (adresse: string): string => {
	const sha = old[adresse]?.sha
	if (!sha) throw new Error(`pas d'empreinte pour ${adresse}`)
	return sha
}

const page = (corps: string, status = 200, location: string | null = null): Reply => ({
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
		expect(titleFingerprint(html)).toEqual({ n: 1, sha: hash('/') })
		expect(titleFingerprint('<p>sans titre</p>')).toEqual({ n: 0, sha: null })
		expect(titleFingerprint('<h1>Un</h1><h1>Deux</h1>').n).toBe(2)
	})
})

describe('la fixture des h1 de l’ancien site', () => {
	test('elle ne garde que des adresses que le dépôt écrit déjà en clair, jamais un chemin de profil', () => {
		const written = new Set([
			...inventory.addresses.map(({ address }) => address),
			...inventory.complements.flatMap(({ address }) => (address ? [address] : [])),
		])
		for (const url of Object.keys(old)) expect(written.has(url)).toBe(true)
		expect(Object.keys(old).filter(adresse => /^\/{1,2}profil\/(?!audit-inexistant-zz9$)/.test(adresse))).toEqual([])
	})

	test('chaque entrée dit un nombre de h1 et une empreinte de 64 caractères, ou aucune', () => {
		for (const [url, { n, sha }] of Object.entries(old)) {
			expect(Number.isInteger(n), url).toBe(true)
			if (n > 0) expect(sha, url).toMatch(/^[0-9a-f]{64}$/)
			else expect(sha, url).toBeNull()
		}
	})
})

describe('les cas du banc', () => {
	const testCaseAlt = benchCase(old, {
		profilsVisibles: ['alice-test'],
		profilsMasques: ['masquee-test'],
		ancienNom: { ecrit: 'zo%C3%A9%20lef%C3%A8vre', slug: 'zoe-lefevre' },
		talents: ['maquillage-test'],
		articlesPublies: ['article-test'],
		articlesBrouillons: ['brouillon-test'],
	})
	const from = (adresse: string): ParityCase => {
		const found = testCaseAlt.find(c => c.adresse === adresse)
		if (!found) throw new Error(`pas de cas pour ${adresse}`)
		return found
	}

	test('une adresse redirigée est suivie jusqu’à sa destination, dont l’h1 est celui de l’ancien site', () => {
		expect(from('/blog/')).toMatchObject({ famille: 'barre-finale', statuts: [308], vers: '/blog', statutFinal: 200 })
		expect(from('/blog/').titre).toEqual({ mode: 'hash', sha: hash('/blog') })
		expect(from('/toutes-les-news')).toMatchObject({ statuts: [301], vers: '/blog', familleFinale: 'blog' })
		expect(from('/auth/profil')).toMatchObject({ famille: 'espace-prive', statuts: [307] })
	})

	test('la double barre accepte le 308 de Next, et reste un écart connu', () => {
		expect(from('//blog')).toMatchObject({ famille: 'double-barre', statuts: [301, 308] })
		expect(from('//blog').ecartConnu).toBeDefined()
	})

	test('une page inconnue doit avoir l’h1 de la 404 de l’ancien site, une recherche un seul h1', () => {
		expect(from('/page-inexistante-audit-zz').titre).toEqual({
			mode: 'hash',
			sha: hash('/page-inexistante-audit-zz'),
		})
		expect(from('/search?city=Annecy').titre).toEqual({ mode: 'un' })
		expect(from('/search').titre).toEqual({ mode: 'hash', sha: hash('/search') })
	})

	test('une page à deux h1 sur l’ancien site doit en avoir un seul', () => {
		expect(from('/a-propos').titre).toEqual({ mode: 'un' })
	})

	test('les profils, les talents et les articles viennent du jeu fictif, pas des vrais slugs de l’inventaire', () => {
		expect(from('/profil/alice-test')).toMatchObject({ famille: 'profil', statuts: [200] })
		expect(from('/profil/masquee-test')).toMatchObject({ famille: 'slug-inconnu', statuts: [404] })
		expect(from('/profil/zo%C3%A9%20lef%C3%A8vre')).toMatchObject({
			famille: 'profil-ancien-nom',
			vers: '/profil/zoe-lefevre',
		})
		expect(testCaseAlt.some(c => c.adresse === '/blog/cout-maquilleuse-professionnelle-guide-tarifs')).toBe(false)
		expect(testCaseAlt.some(c => c.adresse === '/talent/maquillage-fete')).toBe(false)
		expect(testCaseAlt.some(c => c.adresse === '/talent/maquillage-mariee')).toBe(false)
		expect(from('/talent/maquillage-test')).toMatchObject({ famille: 'talent', statuts: [200] })
		expect(from('/blog/article-test')).toMatchObject({ famille: 'article', statuts: [200] })
		expect(from('/blog/brouillon-test')).toMatchObject({ famille: 'slug-inconnu', statuts: [404] })
	})

	test('les hôtes (http, www, ancienne API) ne sont pas des cas : l’hébergeur répond', () => {
		expect(testCaseAlt.filter(c => ['http', 'www', 'ancienne-api'].includes(c.famille))).toEqual([])
	})
})

describe('la vérification d’un cas', () => {
	const testCaseAlt: ParityCase = {
		adresse: '/blog/',
		etiquette: '/blog/',
		famille: 'barre-finale',
		statuts: [308],
		vers: '/blog',
		statutFinal: 200,
		familleFinale: 'blog',
		titre: { mode: 'hash', sha: sha256('Le blog') },
	}
	const server =
		(table: Record<string, Reply>) =>
		async (adresse: string): Promise<Reply> =>
			table[adresse] ?? page('<h1>404 - Page non trouvée</h1>', 404)

	test('un saut juste, vers une page de même h1 et de même statut : vert', async () => {
		const result = await check(
			testCaseAlt,
			server({ '/blog/': page('', 308, '/blog'), '/blog': page('<main><h1>Le blog</h1></main>') })
		)
		expect(result).toEqual({ etat: 'vert', destination: [] })
	})

	test('un mauvais statut ou une mauvaise destination : rouge, au nom de l’adresse', async () => {
		expect(await check(testCaseAlt, server({ '/blog/': page('', 301, '/blog') }))).toMatchObject({ etat: 'rouge' })
		expect(await check(testCaseAlt, server({ '/blog/': page('', 308, '/ailleurs') }))).toMatchObject({
			etat: 'rouge',
			defauts: ['destination /ailleurs au lieu de /blog'],
		})
	})

	test('une destination fautive est un défaut de la destination, pas de l’adresse', async () => {
		const result = await check(
			testCaseAlt,
			server({ '/blog/': page('', 308, '/blog'), '/blog': page('<h1>Autre titre</h1>') })
		)
		expect(result).toEqual({ etat: 'vert', destination: ['h1 différent de celui de l’ancien site'] })
	})

	test('un h1 en double est un défaut, même avec le bon texte', async () => {
		const direct: ParityCase = { ...testCaseAlt, adresse: '/blog', vers: undefined, statuts: [200] }
		delete direct.vers
		const result = await check(direct, server({ '/blog': page('<h1>Le blog</h1><h1>Le blog</h1>') }))
		expect(result).toMatchObject({ etat: 'rouge', defauts: ["2 h1 au lieu d'un seul"] })
	})
})

describe('le bilan par type', () => {
	const green: Result = { etat: 'vert', destination: [] }
	const red: Result = { etat: 'rouge', defauts: ['statut 404 au lieu de 200'], destination: [] }
	const testCase = (famille: string, adresse: string): ParityCase => ({
		adresse,
		etiquette: adresse,
		famille,
		statuts: [200],
		statutFinal: 200,
		titre: 'non-verifie',
	})

	test('un type livré dont une adresse échoue est une régression ; un type à venir est « à venir »', () => {
		const lines = summary(
			[
				{ cas: testCase('accueil', '/'), resultat: green },
				{ cas: testCase('accueil', '/?a'), resultat: red },
				{ cas: testCase('talent', '/talent/a'), resultat: red },
				{ cas: testCase('talent', '/talent/b'), resultat: green },
			],
			new Set(['accueil'])
		)
		expect(lines).toEqual([
			{ famille: 'accueil', vertes: 1, aVenir: 0, ecarts: 0, regressions: ['/?a : statut 404 au lieu de 200'] },
			{ famille: 'talent', vertes: 1, aVenir: 1, ecarts: 0, regressions: [] },
		])
		expect(writeSummary(lines, new Set(['accueil']))).toContain('talent')
		expect(writeSummary(lines, new Set(['accueil']))).toMatch(/talent\s+1 verte, 1 à venir/)
	})

	test('la destination fautive d’une redirection pèse sur la famille de la destination, si elle est livrée', () => {
		const redirection: ParityCase = { ...testCase('barre-finale', '/blog/'), vers: '/blog', familleFinale: 'blog' }
		const faulty: Result = { etat: 'vert', destination: ['la destination répond 404 au lieu de 200'] }
		const delivered = summary([{ cas: redirection, resultat: faulty }], new Set(['blog', 'barre-finale']))
		expect(delivered.find(l => l.famille === 'blog')?.regressions).toEqual([
			'/blog/ → /blog : la destination répond 404 au lieu de 200',
		])
		expect(delivered.find(l => l.famille === 'barre-finale')?.vertes).toBe(1)
		const expected = summary([{ cas: redirection, resultat: faulty }], new Set(['barre-finale']))
		expect(expected.flatMap(l => l.regressions)).toEqual([])
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
		expect(readCsv('a,b\n"x, y","l1\nl2"\n')).toEqual([{ a: 'x, y', b: 'l1\nl2' }])
	})

	test('un profil réel est numéroté, jamais nommé, ni dans son étiquette ni dans les messages', async () => {
		const testCaseAlt = privateListCase(csv)
		expect(testCaseAlt.map(c => c.etiquette)).toEqual(['/blog', 'profil #1', 'profil #2'])
		expect(testCaseAlt.map(c => c.famille)).toEqual(['blog', 'profil', 'profil-ancien-nom'])
		const oldName = testCaseAlt[2]
		if (!oldName) throw new Error('pas de cas')
		const result = await check(oldName, async () => page('', 404))
		expect(JSON.stringify(result)).not.toContain('jeanne')
		const fake = await check(oldName, async adresse =>
			adresse === oldName.adresse ? page('', 308, '/profil/autre-nom-imaginaire') : page('', 404)
		)
		expect(JSON.stringify(fake)).not.toContain('autre-nom-imaginaire')
		expect(JSON.stringify(fake)).toContain('/profil/…')
	})

	test('un profil dont l’adresse répond 200 ou 404 est juste : les 13 profils non repris ne se distinguent pas dans la liste', () => {
		const [, profile] = privateListCase(csv)
		expect(profile?.statuts).toEqual([200, 404])
	})
})

describe('le titre de l’onglet des talents importés (ticket 108)', () => {
	const csv = [
		'url,chemin,statut_initial,statut_final,url_finale,type,h1_nb,h1_sha256',
		`https://my-makeup.fr/talent/mariage,/talent/mariage,200,200,https://my-makeup.fr/talent/mariage,html,1,${sha256('Mariage')}`,
		`https://my-makeup.fr/blog,/blog,200,200,https://my-makeup.fr/blog,html,1,${sha256('Le blog')}`,
	].join('\n')
	const html = (titre: string, h1 = 'Mariage') =>
		`<html><head><title>${titre}</title></head><body><h1>${h1}</h1></body></html>`
	const GOOD = 'Maquilleuse mariage : trouver la bonne pro près de chez vous' // 59 characters

	test('seul un talent de la copie importée exige le titre écrit par la rédaction', () => {
		const [talent, blog] = privateListCase(csv)
		expect(talent?.titreDeLOngletRequis).toBe(true)
		expect(blog?.titreDeLOngletRequis).toBeUndefined()
	})

	test('un titre de 50 à 60 caractères, distinct du h1, est vert', async () => {
		expect(GOOD.length).toBeGreaterThanOrEqual(50)
		const [talent] = privateListCase(csv)
		if (!talent) throw new Error('pas de cas')
		expect((await check(talent, async () => page(html(GOOD)))).etat).toBe('vert')
	})

	test('le titre court de l’ancien site (« titre | My-Makeup »), trop court, échoue', async () => {
		const [talent] = privateListCase(csv)
		if (!talent) throw new Error('pas de cas')
		const result = await check(talent, async () => page(html('Mariage | My-Makeup')))
		expect(result.etat).toBe('rouge')
		expect(JSON.stringify(result)).toContain('au lieu de 50 à 60')
	})

	test('un titre trop long, ou le h1 lui-même, échoue', async () => {
		const [talent] = privateListCase(csv)
		if (!talent) throw new Error('pas de cas')
		expect((await check(talent, async () => page(html(`${GOOD} et plus encore`)))).etat).toBe('rouge')
		const long = 'Mariage'.padEnd(55, 'x')
		const [same] = privateListCase(csv.replace(sha256('Mariage'), sha256(long)))
		if (!same) throw new Error('pas de cas')
		const sameText = await check(same, async () => page(html(long, long)))
		expect(JSON.stringify(sameText)).toContain('identique au h1')
	})
})
