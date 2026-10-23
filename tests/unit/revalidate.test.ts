import { describe, expect, mock, test } from 'bun:test'
import { revalidateTag } from 'next/cache.js'
import type { PayloadRequest, RequestContext } from 'payload'
import { outsideNextRequest, refresh } from '../../src/collections/revalidate'
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
