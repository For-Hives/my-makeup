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
 * REST API on the bench: tests/integration/revalidation.test.ts (I21).
 */

const publie = (slug: string): PublicState => ({ slug, visible: true })
const cache = (slug: string): PublicState => ({ slug, visible: false })

const RIEN = { chemins: [], etiquettes: [] }

describe('les pages qu’un enregistrement rend périmées', () => {
	test('un profil publié modifié : sa page, la recherche, le plan du site et le sitemap (I21)', () => {
		expect(changeTargets('profiles', publie('zoe-lefevre'), publie('zoe-lefevre'))).toEqual({
			chemins: ['/profil/zoe-lefevre', '/search', '/site-map', '/sitemap.xml'],
			etiquettes: ['profil:zoe-lefevre', 'profils'],
		})
	})

	test('un brouillon qui reste brouillon, un profil masqué qui le reste : rien', () => {
		expect(changeTargets('profiles', cache('zoe-lefevre'), cache('zoe-lefevre'))).toEqual(RIEN)
		expect(changeTargets('articles', cache('un-article'), cache('un-article'))).toEqual(RIEN)
		expect(changeTargets('talents', null, cache('un-talent'))).toEqual(RIEN)
		expect(changeTargets('talents', cache('un-talent'), null)).toEqual(RIEN)
	})

	test('un document qui entre ou qui sort du public : sa page et les listes', () => {
		const attendu = {
			chemins: ['/profil/zoe-lefevre', '/search', '/site-map', '/sitemap.xml'],
			etiquettes: ['profil:zoe-lefevre', 'profils'],
		}
		// Published, created published, hidden, deleted.
		expect(changeTargets('profiles', cache('zoe-lefevre'), publie('zoe-lefevre'))).toEqual(attendu)
		expect(changeTargets('profiles', null, publie('zoe-lefevre'))).toEqual(attendu)
		expect(changeTargets('profiles', publie('zoe-lefevre'), cache('zoe-lefevre'))).toEqual(attendu)
		expect(changeTargets('profiles', publie('zoe-lefevre'), null)).toEqual(attendu)
	})

	test('un article : sa page, le blog, le plan du site et le sitemap ; un talent : sa page, l’accueil, les deux plans', () => {
		expect(changeTargets('articles', null, publie('un-article'))).toEqual({
			chemins: ['/blog/un-article', '/blog', '/site-map', '/sitemap.xml'],
			etiquettes: ['article:un-article', 'articles'],
		})
		expect(changeTargets('talents', publie('maquillage-mariee'), publie('maquillage-mariee'))).toEqual({
			chemins: ['/talent/maquillage-mariee', '/', '/site-map', '/sitemap.xml'],
			etiquettes: ['talent:maquillage-mariee', 'talents'],
		})
	})

	test('une adresse changée sur un document publié : l’ancienne page et la nouvelle', () => {
		expect(changeTargets('articles', publie('ancienne'), publie('nouvelle'))).toEqual({
			chemins: ['/blog/ancienne', '/blog/nouvelle', '/blog', '/site-map', '/sitemap.xml'],
			etiquettes: ['article:ancienne', 'article:nouvelle', 'articles'],
		})
		// Changed while it was a draft: only the published address counts.
		expect(changeTargets('articles', cache('brouillon'), publie('publiee')).chemins).toEqual([
			'/blog/publiee',
			'/blog',
			'/site-map',
			'/sitemap.xml',
		])
	})

	test('un slug qui n’en est pas un, comme le slug provisoire d’un profil en création, ne donne aucune page', () => {
		expect(changeTargets('profiles', null, publie('_provisoire-1234'))).toEqual({
			chemins: ['/search', '/site-map', '/sitemap.xml'],
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
function requete(lignes: Record<string, unknown>[] = []) {
	const findOne = mock(async () => lignes.shift() ?? null)
	const journal = { debug: mock(() => {}), error: mock(() => {}) }
	const req = { payload: { db: { findOne }, logger: journal } } as unknown as PayloadRequest
	return { req, findOne, journal }
}

const HOOKS = refresh('profiles')

/** An update of a profile through the hooks, as Payload runs them: before the write, then after. */
async function mettreAJour(req: PayloadRequest, context: RequestContext, id = 7) {
	const data = { description: 'Une description' }
	const avant = await HOOKS.avantEcriture({ context, data, operation: 'update', originalDoc: { id }, req } as never)
	const apres = await HOOKS.apresEcriture({
		context,
		doc: { id },
		operation: 'update',
		previousDoc: { id },
		req,
	} as never)
	return { avant, apres, data }
}

describe('les crochets de Payload', () => {
	test('un profil publié modifié : Next reçoit sa page et les listes, les étiquettes expirées tout de suite', async () => {
		const { req, findOne } = requete([
			{ id: 7, slug: 'zoe-lefevre', status: 'published' },
			{ id: 7, slug: 'zoe-lefevre', status: 'published' },
		])

		const { appels, chemins, etiquettes } = await spyCache(() => mettreAJour(req, {}))

		expect(findOne).toHaveBeenCalledTimes(2)
		expect(chemins).toEqual(['/profil/zoe-lefevre', '/search', '/site-map', '/sitemap.xml'])
		expect(etiquettes).toEqual(['profil:zoe-lefevre', 'profils'])
		for (const appel of appels.filter(({ fonction }) => fonction === 'revalidateTag'))
			expect(appel.option).toEqual({ expire: 0 })
	})

	test('le contexte d’import : rien n’est lu, rien n’est rafraîchi, l’écriture passe telle quelle', async () => {
		const { req, findOne } = requete([{ id: 7, slug: 'zoe-lefevre', status: 'published' }])
		const context: RequestContext = { ...IMPORT_CONTEXT }

		const { appels } = await spyCache(async () => {
			const { avant, apres, data } = await mettreAJour(req, context)
			expect(avant).toBe(data)
			expect(apres).toEqual({ id: 7 })
			await HOOKS.avantSuppression({ context, id: 7, req } as never)
			await HOOKS.apresSuppression({ context, doc: { id: 7 }, id: 7, req } as never)
		})

		expect(findOne).not.toHaveBeenCalled()
		expect(appels).toEqual([])
		expect(context).toEqual({ ...IMPORT_CONTEXT })
	})

	test('hors d’une requête de Next, l’enregistrement passe : rien n’est rafraîchi, rien n’est levé', async () => {
		const { req, journal } = requete([
			{ id: 7, slug: 'zoe-lefevre', status: 'published' },
			{ id: 7, slug: 'zoe-lefevre', status: 'published' },
		])

		// No spy: Next's own revalidateTag, outside of one of its requests.
		const { apres } = await mettreAJour(req, {})

		expect(apres).toEqual({ id: 7 })
		expect(journal.debug).toHaveBeenCalledTimes(1)
		expect(journal.error).not.toHaveBeenCalled()
	})

	test('le refus de Next hors de ses requêtes est reconnu à son code, et seulement lui', () => {
		let refus: unknown
		try {
			revalidateTag('profils', { expire: 0 })
		} catch (erreur) {
			refus = erreur
		}
		expect(outsideNextRequest(refus)).toBe(true)
		expect(outsideNextRequest(new Error('Invariant: static generation store missing'))).toBe(false)
		expect(outsideNextRequest('E263')).toBe(false)
	})
})
