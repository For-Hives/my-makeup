import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { Articles } from '../../src/collections/Articles'
import { Profiles } from '../../src/collections/Profiles'
import { Talents } from '../../src/collections/Talents'
import { SiteMapBody } from '../../src/components/site-map/SiteMapBody'
import { NEUTRAL_NAME } from '../../src/lib/profile/display-name'
import { profileMetadata, profileStructuredData } from '../../src/lib/seo/profile'
import { sitemapEntries, sitemapXml } from '../../src/lib/seo/sitemap'
import { readIndexablePages, readIndexableProfiles } from '../../src/services/public/indexable-pages'
import { publicProfileOf } from '../../src/services/public/profiles'

/**
 * The plan of the site names every profile by her real name (ticket 299). The reading selected `prenom`,
 * `nom` and `nomArtiste`, names that no longer exist: Payload gave back no name and every link of the plan
 * read « Maquilleuse professionnelle ». The Payload double below applies `select` like the real one: a field
 * that is not selected is not given back, and a field that does not exist is never there.
 */

/** Fictional documents, under the names of the collection. */
const DOCUMENTS = [
	{ slug: 'ines-morel', firstName: 'Inès', lastName: 'Morel', artistName: 'Studio Inès' },
	{ slug: 'studio-lumiere', firstName: null, lastName: null, artistName: 'Studio Lumière' },
	{ slug: 'zoe-lefevre', firstName: 'Zoé', lastName: null, artistName: null },
	{ slug: 'prenom-vide', firstName: '  ', lastName: 'null', artistName: 'Atelier Vide' },
].map(document => ({ ...document, updatedAt: '2026-05-06T07:08:09.000Z', hiddenField: 'ne doit pas sortir' }))

const NAMES = ['Inès Morel', 'Studio Lumière', 'Zoé', 'Atelier Vide']

/** A Payload whose `find` gives back the documents projected by `select`, as the real one does. */
function projectingPayload(): Payload {
	return {
		find: async (options: { collection: string; select?: Record<string, true> }) => {
			const select = options.select ?? {}
			const docs =
				options.collection === 'profiles'
					? DOCUMENTS.map(document =>
							Object.fromEntries(Object.entries(document).filter(([key]) => select[key] === true))
						)
					: []
			return { docs, hasNextPage: false }
		},
	} as unknown as Payload
}

describe('299 : le plan du site nomme chaque profil par son vrai nom', () => {
	test('la lecture des profils publiables donne le prénom et le nom, sinon le nom d’artiste', async () => {
		const profiles = await readIndexableProfiles(projectingPayload())
		expect(profiles.map(({ nom: name }) => name)).toEqual(NAMES)
		expect(profiles.map(({ nom: name }) => name)).not.toContain(NEUTRAL_NAME)
	})

	test('la page rendue sans JavaScript porte le vrai nom de chaque profil, jamais le nom neutre', async () => {
		const pages = await readIndexablePages(projectingPayload())
		const html = renderToStaticMarkup(SiteMapBody(pages))
		for (const name of NAMES) expect(html, name).toContain(`>${name}</a>`)
		expect(html).not.toContain(NEUTRAL_NAME)
	})
})

describe('299 : un nom réel dans le titre, le JSON-LD et le sitemap, et des champs qui existent', () => {
	const profile = publicProfileOf(
		{
			slug: 'ines-morel',
			firstName: 'Inès',
			lastName: 'Morel',
			artistName: 'Studio Inès',
			specialty: 'Mariée',
		} as never,
		{ photo: null, galerie: [], coordonnees: null }
	)

	test('le titre de la page d’un profil et son JSON-LD portent son nom, pas le nom neutre', () => {
		expect(JSON.stringify(profileMetadata(profile).title)).toContain('Inès Morel')
		const structured = JSON.stringify(profileStructuredData(profile))
		expect(structured).toContain('"name":"Inès Morel"')
		expect(structured).not.toContain(NEUTRAL_NAME)
	})

	test('le sitemap liste l’adresse du profil lu', async () => {
		const profiles = await readIndexableProfiles(projectingPayload())
		const xml = sitemapXml(sitemapEntries({ profils: profiles, talents: [], articles: [] }))
		expect(xml).toContain('<loc>https://my-makeup.fr/profil/ines-morel</loc>')
	})

	test('chaque champ que les lectures du plan et du sitemap sélectionnent existe dans sa collection', async () => {
		const reads: { collection: string; select: Record<string, true> }[] = []
		const spy = {
			find: async (options: { collection: string; select: Record<string, true> }) => {
				reads.push(options)
				return { docs: [], hasNextPage: false }
			},
		} as unknown as Payload
		await readIndexablePages(spy)
		const collections = { profiles: Profiles, talents: Talents, articles: Articles } as Record<
			string,
			{ fields: { name?: string }[] }
		>
		expect(reads.map(({ collection }) => collection).sort()).toEqual(['articles', 'profiles', 'talents'])
		for (const { collection, select } of reads) {
			const fields = (collections[collection]?.fields ?? []).map(({ name }) => name)
			for (const key of Object.keys(select))
				expect(['id', 'createdAt', 'updatedAt', ...fields], `${collection}.${key}`).toContain(key)
		}
	})
})

describe('299 : les états vide et erreur du plan du site', () => {
	test('sans profil, sans talent ni article : les pages fixes restent, aucune section vide', () => {
		const html = renderToStaticMarkup(SiteMapBody({ profils: [], zones: [], talents: [], articles: [] }))
		expect(html).toContain('<h3>')
		expect(html).not.toContain('plan-des-profils')
		expect(html).not.toContain('<h3>Maquilleuses</h3>')
		expect(html).not.toContain('<h3>Talents</h3>')
		expect(html).not.toContain('<h3>Blog</h3>')
		expect(html).not.toContain('<ul></ul>')
	})

	test('si la base échoue, la lecture lève : le plan ne montre jamais une liste coupée', async () => {
		const failing = {
			find: async () => {
				throw new Error('base indisponible')
			},
		} as unknown as Payload
		await expect(readIndexablePages(failing)).rejects.toThrow('base indisponible')
	})
})
