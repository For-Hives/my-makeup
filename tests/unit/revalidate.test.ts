import { describe, expect, mock, test } from 'bun:test'
import { revalidateTag } from 'next/cache.js'
import type { PayloadRequest, RequestContext } from 'payload'
import { outsideNextRequest, refresh, refreshMedia } from '../../src/collections/revalidate'
import { IMPORT_CONTEXT } from '../../src/lib/import-context'
import { changeTargets, PUBLIC_PAGES, type PublicState, TAGS } from '../../src/lib/revalidate'
import { spyCache } from '../support/cache-spy'

/**
 * Ticket 047: which pages a save makes stale (src/lib/revalidate.ts), and the hooks that tell
 * Next (src/collections/revalidate.ts), without a database. The same, through Payload and the
 * REST API on the bench: tests/integration/revalidate.test.ts (I21).
 */

const published = (slug: string): PublicState => ({ slug, visible: true })
const cache = (slug: string): PublicState => ({ slug, visible: false })

const NOTHING = { chemins: [], etiquettes: [] }

describe('les pages qu’un enregistrement rend périmées', () => {
	test('un profil publié modifié : sa page, la recherche, le plan du site et le sitemap (I21)', () => {
		expect(changeTargets('profiles', published('zoe-lefevre'), published('zoe-lefevre'))).toEqual({
			chemins: ['/profil/zoe-lefevre', '/', '/search', '/site-map', '/sitemap.xml'],
			etiquettes: ['profil:zoe-lefevre', 'profils'],
		})
	})

	test('un brouillon qui reste brouillon, un profil masqué qui le reste : rien', () => {
		expect(changeTargets('profiles', cache('zoe-lefevre'), cache('zoe-lefevre'))).toEqual(NOTHING)
		expect(changeTargets('articles', cache('un-article'), cache('un-article'))).toEqual(NOTHING)
		expect(changeTargets('talents', null, cache('un-talent'))).toEqual(NOTHING)
		expect(changeTargets('talents', cache('un-talent'), null)).toEqual(NOTHING)
	})

	test('un document qui entre ou qui sort du public : sa page et les listes', () => {
		const expected = {
			chemins: ['/profil/zoe-lefevre', '/', '/search', '/site-map', '/sitemap.xml'],
			etiquettes: ['profil:zoe-lefevre', 'profils'],
		}
		// Published, created published, hidden, deleted.
		expect(changeTargets('profiles', cache('zoe-lefevre'), published('zoe-lefevre'))).toEqual(expected)
		expect(changeTargets('profiles', null, published('zoe-lefevre'))).toEqual(expected)
		expect(changeTargets('profiles', published('zoe-lefevre'), cache('zoe-lefevre'))).toEqual(expected)
		expect(changeTargets('profiles', published('zoe-lefevre'), null)).toEqual(expected)
	})

	test('un article : sa page, le blog, le plan du site et le sitemap ; un talent : sa page, l’accueil, les deux plans', () => {
		expect(changeTargets('articles', null, published('un-article'))).toEqual({
			chemins: ['/blog/un-article', '/blog', '/site-map', '/sitemap.xml'],
			etiquettes: ['article:un-article', 'articles'],
		})
		expect(changeTargets('talents', published('maquillage-mariee'), published('maquillage-mariee'))).toEqual({
			chemins: ['/talent/maquillage-mariee', '/', '/site-map', '/sitemap.xml'],
			etiquettes: ['talent:maquillage-mariee', 'talents'],
		})
	})

	test('une adresse changée sur un document publié : l’ancienne page et la nouvelle', () => {
		expect(changeTargets('articles', published('ancienne'), published('nouvelle'))).toEqual({
			chemins: ['/blog/ancienne', '/blog/nouvelle', '/blog', '/site-map', '/sitemap.xml'],
			etiquettes: ['article:ancienne', 'article:nouvelle', 'articles'],
		})
		// Changed while it was a draft: only the published address counts.
		expect(changeTargets('articles', cache('brouillon'), published('publiee')).chemins).toEqual([
			'/blog/publiee',
			'/blog',
			'/site-map',
			'/sitemap.xml',
		])
	})

	test('un slug qui n’en est pas un, comme le slug provisoire d’un profil en création, ne donne aucune page', () => {
		expect(changeTargets('profiles', null, published('_provisoire-1234'))).toEqual({
			chemins: ['/', '/search', '/site-map', '/sitemap.xml'],
			etiquettes: ['profils'],
		})
	})

	test('les étiquettes d’une lecture : celle de la liste, celle du document', () => {
		expect(TAGS.profil('zoe-lefevre')).toBe('profil:zoe-lefevre')
		expect([TAGS.profils, TAGS.articles, TAGS.talents]).toEqual(['profils', 'articles', 'talents'])
		for (const pages of Object.values(PUBLIC_PAGES)) expect(pages.listes).toContain('/sitemap.xml')
	})
})

/** The part of a request the hooks read: the database adapter and the logger. */
function request(lignes: Record<string, unknown>[] = []) {
	const findOne = mock(async () => lignes.shift() ?? null)
	const log = { debug: mock(() => {}), error: mock(() => {}) }
	const req = { payload: { db: { findOne }, logger: log } } as unknown as PayloadRequest
	return { req, findOne, journal: log }
}

const HOOKS = refresh('profiles')

/** An update of a profile through the hooks, as Payload runs them: before the write, then after. */
async function update(req: PayloadRequest, context: RequestContext, id = 7) {
	const data = { description: 'Une description' }
	const before = await HOOKS.avantEcriture({ context, data, operation: 'update', originalDoc: { id }, req } as never)
	const after = await HOOKS.apresEcriture({
		context,
		doc: { id },
		operation: 'update',
		previousDoc: { id },
		req,
	} as never)
	return { avant: before, apres: after, data }
}

describe('les crochets de Payload', () => {
	test('un profil publié modifié : Next reçoit sa page et les listes, les étiquettes expirées tout de suite', async () => {
		const { req, findOne } = request([
			{ id: 7, slug: 'zoe-lefevre', status: 'published' },
			{ id: 7, slug: 'zoe-lefevre', status: 'published' },
		])

		const { appels: calls, chemins: paths, etiquettes: labels } = await spyCache(() => update(req, {}))

		expect(findOne).toHaveBeenCalledTimes(2)
		expect(paths).toEqual(['/', '/profil/zoe-lefevre', '/search', '/site-map', '/sitemap.xml'])
		expect(labels).toEqual(['profil:zoe-lefevre', 'profils'])
		for (const call of calls.filter(({ fonction }) => fonction === 'revalidateTag'))
			expect(call.option).toEqual({ expire: 0 })
	})

	test('le contexte d’import : rien n’est lu, rien n’est rafraîchi, l’écriture passe telle quelle', async () => {
		const { req, findOne } = request([{ id: 7, slug: 'zoe-lefevre', status: 'published' }])
		const context: RequestContext = { ...IMPORT_CONTEXT }

		const { appels: calls } = await spyCache(async () => {
			const { avant: before, apres: after, data } = await update(req, context)
			expect(before).toBe(data)
			expect(after).toEqual({ id: 7 })
			await HOOKS.avantSuppression({ context, id: 7, req } as never)
			await HOOKS.apresSuppression({ context, doc: { id: 7 }, id: 7, req } as never)
		})

		expect(findOne).not.toHaveBeenCalled()
		expect(calls).toEqual([])
		expect(context).toEqual({ ...IMPORT_CONTEXT })
	})

	test('hors d’une requête de Next, l’enregistrement passe : rien n’est rafraîchi, rien n’est levé', async () => {
		const { req, journal: log } = request([
			{ id: 7, slug: 'zoe-lefevre', status: 'published' },
			{ id: 7, slug: 'zoe-lefevre', status: 'published' },
		])

		// No spy: Next's own revalidateTag, outside of one of its requests.
		const { apres: after } = await update(req, {})

		expect(after).toEqual({ id: 7 })
		expect(log.debug).toHaveBeenCalledTimes(1)
		expect(log.error).not.toHaveBeenCalled()
	})

	test('le refus de Next hors de ses requêtes est reconnu à son message, et seulement lui', () => {
		let refusal: unknown
		try {
			revalidateTag('profils', { expire: 0 })
		} catch (error) {
			refusal = error
		}
		expect(outsideNextRequest(refusal)).toBe(true)
		expect(outsideNextRequest(new Error('Invariant: static generation store missing'))).toBe(false)
		expect(outsideNextRequest(new Error('static generation store missing in revalidateTag("x")'))).toBe(false)
		expect(outsideNextRequest('Invariant: static generation store missing in revalidateTag("x")')).toBe(false)
	})
})

/**
 * The audit table of docs/seo/cache-des-pages.md, one row per change an admin or a makeup artist makes: the
 * stored row before and after the write goes through the hooks, and Next receives the pages and tags the table
 * promises. The pages that read the directory (zones, search, home, blocks of profiles) are refreshed by the tag
 * `profils`: the same tag is carried by every cached read of the directory (src/services/public/cached.ts).
 */
describe('le tableau d’audit : un changement, les pages rafraîchies', () => {
	const PROFILE_PAGES = (slug: string) => ({
		chemins: ['/', `/profil/${slug}`, '/search', '/site-map', '/sitemap.xml'],
		etiquettes: [`profil:${slug}`, 'profils'],
	})

	/** A write of a profile (or of another collection) seen by the hooks: its stored row before, then after. */
	async function write(
		collection: 'profiles' | 'articles' | 'talents',
		before: Record<string, unknown> | null,
		after: Record<string, unknown> | null
	) {
		const hooks = refresh(collection)
		const { req } = request([...(before ? [before] : []), ...(after ? [after] : [])])
		const context: RequestContext = {}
		return spyCache(async () => {
			if (before && after) {
				await hooks.avantEcriture({ context, data: {}, operation: 'update', originalDoc: { id: 7 }, req } as never)
				await hooks.apresEcriture({
					context,
					doc: { id: 7 },
					operation: 'update',
					previousDoc: { id: 7 },
					req,
				} as never)
			} else if (before) {
				await hooks.avantSuppression({ context, id: 7, req } as never)
				await hooks.apresSuppression({ context, doc: { id: 7 }, id: 7, req } as never)
			} else {
				await hooks.apresEcriture({ context, doc: { id: 7 }, operation: 'create', req } as never)
			}
		})
	}

	const profile = (status: string, slug = 'zoe-lefevre') => ({ id: 7, slug, status, indexable: true })

	// A published profile whose box, city, speciality, photo, description or prices change stays `published`: the
	// stored row only differs by fields the hook does not read, and the page and the lists are refreshed all the same.
	test.each([
		['« Vérifiée » cochée ou décochée'],
		['« Super maquilleuse » cochée ou décochée'],
		['la ville'],
		['la spécialité'],
		['la photo principale ou la galerie'],
		['la description'],
		['les prix'],
	])('un profil publié, %s : sa page, la recherche, l’accueil, les plans, l’étiquette de la liste', async () => {
		const refreshed = await write('profiles', profile('published'), profile('published'))
		expect(refreshed.chemins.sort()).toEqual(PROFILE_PAGES('zoe-lefevre').chemins)
		expect(refreshed.etiquettes.sort()).toEqual(PROFILE_PAGES('zoe-lefevre').etiquettes)
	})

	test.each([
		['brouillon → publié', 'draft', 'published'],
		['publié → masqué', 'published', 'hidden'],
		['publié → brouillon (profil vidé)', 'published', 'draft'],
		['masqué → publié', 'hidden', 'published'],
	])('le statut d’un profil, %s', async (_nom, from, to) => {
		const refreshed = await write('profiles', profile(from), profile(to))
		expect(refreshed.chemins.sort()).toEqual(PROFILE_PAGES('zoe-lefevre').chemins)
		expect(refreshed.etiquettes.sort()).toEqual(PROFILE_PAGES('zoe-lefevre').etiquettes)
	})

	test('un profil qui reste masqué ou brouillon : rien', async () => {
		expect(targetsOf(await write('profiles', profile('hidden'), profile('hidden')))).toEqual(NOTHING)
		expect(targetsOf(await write('profiles', profile('draft'), profile('draft')))).toEqual(NOTHING)
	})

	test('l’adresse d’un profil publié change : l’ancienne page et la nouvelle', async () => {
		const refreshed = await write('profiles', profile('published', 'ancien-nom'), profile('published', 'nouveau-nom'))
		expect(refreshed.etiquettes.sort()).toEqual(['profil:ancien-nom', 'profil:nouveau-nom', 'profils'])
		expect(refreshed.chemins).toContain('/profil/ancien-nom')
		expect(refreshed.chemins).toContain('/profil/nouveau-nom')
	})

	test('un profil publié supprimé : sa page et les listes', async () => {
		const refreshed = await write('profiles', profile('published'), null)
		expect(refreshed.etiquettes.sort()).toEqual(PROFILE_PAGES('zoe-lefevre').etiquettes)
	})

	test.each([
		['articles', 'un-article', '/blog/un-article', 'article:un-article', 'articles', '/blog'],
		['talents', 'un-talent', '/talent/un-talent', 'talent:un-talent', 'talents', '/'],
	] as const)('un %s : publication, dépublication, changement d’adresse', async (collection, slug, page, tag, list, listPage) => {
		const row = (status: string, slug_: string = slug) => ({ id: 7, slug: slug_, _status: status })
		for (const [from, to] of [
			[null, row('published')],
			[row('draft'), row('published')],
			[row('published'), row('draft')],
			[row('published'), row('published')],
		] as const) {
			const refreshed = await write(collection, from, to)
			expect(refreshed.etiquettes.sort()).toEqual([tag, list].sort())
			expect(refreshed.chemins).toEqual(expect.arrayContaining([page, listPage, '/sitemap.xml', '/site-map']))
		}
		const renamed = await write(collection, row('published'), row('published', `${slug}-2`))
		expect(renamed.etiquettes.sort()).toEqual([tag, `${tag}-2`, list].sort())
		expect(targetsOf(await write(collection, row('draft'), row('draft')))).toEqual(NOTHING)
	})
})

const targetsOf = ({ chemins, etiquettes }: { chemins: string[]; etiquettes: string[] }) => ({ chemins, etiquettes })

describe('les photos : remplacer, renommer ou supprimer une image rafraîchit les pages qui la montrent', () => {
	/** The rows `db.find` gives for the profiles, then for the articles that hold the photo. */
	function mediaRequest(profils: Record<string, unknown>[], articles: Record<string, unknown>[]) {
		const answers = [{ docs: profils }, { docs: articles }]
		const find = mock(async () => answers.shift() ?? { docs: [] })
		const log = { debug: mock(() => {}), error: mock(() => {}) }
		return { find, log, req: { payload: { db: { find }, logger: log } } as unknown as PayloadRequest }
	}
	const HOOKS_MEDIA = refreshMedia()

	test('un fichier remplacé : la page du profil qui la porte, l’accueil, la recherche, le blog si un article la porte', async () => {
		const { req, find } = mediaRequest(
			[{ id: 1, slug: 'zoe-lefevre', status: 'published' }],
			[{ id: 2, slug: 'un-article', _status: 'published' }]
		)
		const refreshed = await spyCache(async () => {
			await HOOKS_MEDIA.apresEcriture({ context: {}, doc: { id: 9 }, operation: 'update', req } as never)
		})
		expect(find).toHaveBeenCalledTimes(2)
		expect(refreshed.etiquettes.sort()).toEqual(['article:un-article', 'articles', 'profil:zoe-lefevre', 'profils'])
		expect(refreshed.chemins).toEqual(
			expect.arrayContaining(['/profil/zoe-lefevre', '/blog/un-article', '/blog', '/search', '/'])
		)
	})

	test('la photo d’un profil masqué ou d’un brouillon : rien', async () => {
		const { req } = mediaRequest(
			[{ id: 1, slug: 'zoe-lefevre', status: 'hidden' }],
			[{ id: 2, slug: 'un-brouillon', _status: 'draft' }]
		)
		const refreshed = await spyCache(async () => {
			await HOOKS_MEDIA.apresEcriture({ context: {}, doc: { id: 9 }, operation: 'update', req } as never)
		})
		expect(targetsOf(refreshed)).toEqual(NOTHING)
	})

	test('une création, l’écriture interne du stockage et l’import : rien n’est lu, rien n’est rafraîchi', async () => {
		const { req, find } = mediaRequest([{ id: 1, slug: 'zoe-lefevre', status: 'published' }], [])
		const refreshed = await spyCache(async () => {
			await HOOKS_MEDIA.apresEcriture({ context: {}, doc: { id: 9 }, operation: 'create', req } as never)
			await HOOKS_MEDIA.apresEcriture({
				context: { skipCloudStorage: true },
				doc: { id: 9 },
				operation: 'update',
				req,
			} as never)
			await HOOKS_MEDIA.apresEcriture({
				context: { ...IMPORT_CONTEXT },
				doc: { id: 9 },
				operation: 'update',
				req,
			} as never)
		})
		expect(find).not.toHaveBeenCalled()
		expect(refreshed.appels).toEqual([])
	})

	test('une suppression : les pages sont lues avant (la base oublie le lien), rafraîchies après', async () => {
		const { req } = mediaRequest([{ id: 1, slug: 'zoe-lefevre', status: 'published' }], [])
		const context: RequestContext = {}
		const refreshed = await spyCache(async () => {
			await HOOKS_MEDIA.avantSuppression({ context, id: 9, req } as never)
			await HOOKS_MEDIA.apresSuppression({ context, doc: { id: 9 }, id: 9, req } as never)
		})
		expect(refreshed.etiquettes.sort()).toEqual(['profil:zoe-lefevre', 'profils'])
		expect(context).toEqual({})
	})
})

describe('un rafraîchissement qui échoue ne fait jamais échouer l’enregistrement', () => {
	test('Next refuse une étiquette : l’enregistrement passe, l’erreur est journalisée, les autres pages sont tentées', async () => {
		const { req, journal: log } = request([
			{ id: 7, slug: 'zoe-lefevre', status: 'published' },
			{ id: 7, slug: 'zoe-lefevre', status: 'published' },
		])
		const refreshed = await spyCache(
			async () => {
				const { apres: after } = await update(req, {})
				expect(after).toEqual({ id: 7 })
			},
			{ failWith: new Error('cache indisponible') }
		)

		expect(log.error).toHaveBeenCalled()
		// Every tag and every path was attempted: the first refusal stops nothing.
		expect(refreshed.appels.length).toBe(2 + 5)
	})

	test('la lecture de l’état échoue, avant ou après l’écriture : l’enregistrement passe', async () => {
		const findOne = mock(async () => {
			throw new Error('base indisponible')
		})
		const log = { debug: mock(() => {}), error: mock(() => {}) }
		const req = { payload: { db: { findOne }, logger: log } } as unknown as PayloadRequest

		const { avant: before, apres: after } = await update(req, {})
		const hooks = refresh('profiles')
		await hooks.avantSuppression({ context: {}, id: 7, req } as never)
		const doc = await hooks.apresSuppression({ context: {}, doc: { id: 7 }, id: 7, req } as never)

		expect(before).toEqual({ description: 'Une description' })
		expect(after).toEqual({ id: 7 })
		expect(doc).toEqual({ id: 7 })
		expect(log.error).toHaveBeenCalled()
	})

	test('un échec de la file de IndexNow ou de Next sur un média : l’enregistrement passe', async () => {
		const find = mock(async () => {
			throw new Error('base indisponible')
		})
		const log = { debug: mock(() => {}), error: mock(() => {}) }
		const req = { payload: { db: { find }, logger: log } } as unknown as PayloadRequest
		const doc = await refreshMedia().apresEcriture({ context: {}, doc: { id: 9 }, operation: 'update', req } as never)
		expect(doc).toEqual({ id: 9 })
		expect(log.error).toHaveBeenCalled()
	})
})
