import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { Articles } from '@/collections/Articles'
import { Talents } from '@/collections/Talents'
import { JeuFictifRefuse } from '@/jeu-fictif/garde'
import { poserLaRedactionDuJeu, poserLeJeu } from '@/jeu-fictif/jeu'
import { ARTICLES_DU_JEU, TALENTS_DU_JEU } from '@/jeu-fictif/redaction'
import { estUnSlug } from '@/lib/slug'
import { definitionDeLaSource } from '../outils/source-strapi/donnees'

/**
 * The editorial part of the fictional set (ticket 052), without the bench: three talents, three
 * articles one of which is a draft, fixed slugs that do not meet those of the fake Strapi source,
 * texts that say they are made up, and the guard that keeps the load off the site. The same set
 * loaded on the bench: tests/integration/banc-jeu-complet.test.ts.
 */

const maxLength = (collection: typeof Articles, nom: string): number | undefined => {
	const champ = collection.fields.find(f => 'name' in f && f.name === nom)
	return champ && 'maxLength' in champ ? champ.maxLength : undefined
}

describe('Les talents et les articles du jeu', () => {
	test('trois talents et trois articles, dont un seul brouillon', () => {
		expect(TALENTS_DU_JEU).toHaveLength(3)
		expect(ARTICLES_DU_JEU).toHaveLength(3)
		expect(ARTICLES_DU_JEU.filter(({ statut }) => statut === 'draft')).toHaveLength(1)
		expect(ARTICLES_DU_JEU.filter(({ statut }) => statut === 'published')).toHaveLength(2)
	})

	test('chaque adresse est une adresse que le serveur accepte telle quelle, et aucune n’est partagée', () => {
		for (const liste of [TALENTS_DU_JEU, ARTICLES_DU_JEU]) {
			const slugs = liste.map(({ slug }) => slug)
			for (const slug of slugs) expect(estUnSlug(slug), slug).toBe(true)
			expect(new Set(slugs).size).toBe(slugs.length)
		}
	})

	test('aucune adresse ne rencontre celles de la fausse source Strapi : les deux jeux se chargent côte à côte', () => {
		const { lignes } = definitionDeLaSource('https://medias.source-fictive.example.test')
		const prises = new Set([...(lignes.talents ?? []), ...(lignes.articles ?? [])].map(ligne => String(ligne.slug)))

		expect(prises.size).toBeGreaterThan(0)
		for (const { slug } of [...TALENTS_DU_JEU, ...ARTICLES_DU_JEU]) expect(prises.has(slug), slug).toBe(false)
	})

	test('les textes pour les moteurs de recherche tiennent dans les bornes du serveur', () => {
		const titre = maxLength(Articles, 'seo_title')
		const description = maxLength(Articles, 'seo_description')
		expect(titre).toBe(70)
		expect(description).toBe(155)
		for (const { seo_title, seo_description } of ARTICLES_DU_JEU) {
			expect(seo_title?.length ?? 0).toBeLessThanOrEqual(titre ?? 0)
			expect(seo_description?.length ?? 0).toBeLessThanOrEqual(description ?? 0)
		}
		expect(Talents.fields.some(f => 'name' in f && f.name === 'seo_title')).toBe(true)
	})

	test('tout dit qu’il est fictif : signature, textes ; aucune adresse de messagerie, aucun lien', () => {
		for (const article of ARTICLES_DU_JEU) {
			expect(article.author).toContain('fictive')
			expect(article.content).toMatch(/fictif/)
		}
		for (const talent of TALENTS_DU_JEU) expect(talent.content).toMatch(/fictif/)
		const tout = JSON.stringify([TALENTS_DU_JEU, ARTICLES_DU_JEU])
		expect(tout).not.toMatch(/@|https?:\/\//)
	})
})

describe('Le chargement de la rédaction du jeu refuse hors du banc', () => {
	/** A Payload that remembers every call and fails it: nothing may be read or written. */
	function payloadMuet() {
		const appels: string[] = []
		const noter = (operation: string) => () => {
			appels.push(operation)
			return Promise.reject(new Error(`${operation} ne devait pas être appelé`))
		}
		const payload = {
			create: noter('create'),
			db: { poolOptions: { connectionString: 'postgres://u:p@h:5432/mymakeup' } },
			find: noter('find'),
		} as unknown as Payload
		return { appels, payload }
	}

	test.each([
		['la prod déclarée', { APP_ENV: 'prod', NEXT_PUBLIC_SITE_URL: 'https://my-makeup.fr' }],
		['un environnement sans APP_ENV', { NEXT_PUBLIC_SITE_URL: 'https://v3.my-makeup.fr' }],
	])('%s : ni lecture ni écriture, ni pour la rédaction ni pour le jeu entier', async (_cas, variables) => {
		const { appels, payload } = payloadMuet()
		const environnement = {
			...variables,
			DATABASE_URI: 'postgres://u:p@h:5432/mymakeup',
			S3_ENDPOINT: 'https://compte-factice.r2.cloudflarestorage.com',
		}

		await expect(poserLaRedactionDuJeu(payload, { variables: environnement })).rejects.toBeInstanceOf(JeuFictifRefuse)
		await expect(poserLeJeu(payload, { variables: environnement })).rejects.toBeInstanceOf(JeuFictifRefuse)
		expect(appels).toEqual([])
	})
})
