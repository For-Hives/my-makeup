import { describe, expect, mock, test } from 'bun:test'
import { revalidateTag } from 'next/cache.js'
import type { PayloadRequest, RequestContext } from 'payload'
import { horsDUneRequeteDeNext, rafraichissement } from '../../src/collections/revalidation'
import { CONTEXTE_IMPORT } from '../../src/lib/contexte-import'
import { ciblesDuChangement, ETIQUETTES, type EtatPublic, PAGES_PUBLIQUES } from '../../src/lib/revalidation'
import { espionnerLeCache } from '../outils/espion-cache'

/**
 * Ticket 047: which pages a save makes stale (src/lib/revalidation.ts), and the hooks that tell
 * Next (src/collections/revalidation.ts), without a database. The same, through Payload and the
 * REST API on the bench: tests/integration/revalidation.test.ts (I21).
 */

const publie = (slug: string): EtatPublic => ({ slug, visible: true })
const cache = (slug: string): EtatPublic => ({ slug, visible: false })

const RIEN = { chemins: [], etiquettes: [] }

describe('les pages qu’un enregistrement rend périmées', () => {
	test('un profil publié modifié : sa page, la recherche, le plan du site et le sitemap (I21)', () => {
		expect(ciblesDuChangement('profils', publie('zoe-lefevre'), publie('zoe-lefevre'))).toEqual({
			chemins: ['/profil/zoe-lefevre', '/search', '/site-map', '/sitemap.xml'],
			etiquettes: ['profil:zoe-lefevre', 'profils'],
		})
	})

	test('un brouillon qui reste brouillon, un profil masqué qui le reste : rien', () => {
		expect(ciblesDuChangement('profils', cache('zoe-lefevre'), cache('zoe-lefevre'))).toEqual(RIEN)
		expect(ciblesDuChangement('articles', cache('un-article'), cache('un-article'))).toEqual(RIEN)
		expect(ciblesDuChangement('talents', null, cache('un-talent'))).toEqual(RIEN)
		expect(ciblesDuChangement('talents', cache('un-talent'), null)).toEqual(RIEN)
	})

	test('un document qui entre ou qui sort du public : sa page et les listes', () => {
		const attendu = {
			chemins: ['/profil/zoe-lefevre', '/search', '/site-map', '/sitemap.xml'],
			etiquettes: ['profil:zoe-lefevre', 'profils'],
		}
		// Published, created published, hidden, deleted.
		expect(ciblesDuChangement('profils', cache('zoe-lefevre'), publie('zoe-lefevre'))).toEqual(attendu)
		expect(ciblesDuChangement('profils', null, publie('zoe-lefevre'))).toEqual(attendu)
		expect(ciblesDuChangement('profils', publie('zoe-lefevre'), cache('zoe-lefevre'))).toEqual(attendu)
		expect(ciblesDuChangement('profils', publie('zoe-lefevre'), null)).toEqual(attendu)
	})

	test('un article : sa page, le blog, le plan du site et le sitemap ; un talent : sa page, l’accueil, les deux plans', () => {
		expect(ciblesDuChangement('articles', null, publie('un-article'))).toEqual({
			chemins: ['/blog/un-article', '/blog', '/site-map', '/sitemap.xml'],
			etiquettes: ['article:un-article', 'articles'],
		})
		expect(ciblesDuChangement('talents', publie('maquillage-mariee'), publie('maquillage-mariee'))).toEqual({
			chemins: ['/talent/maquillage-mariee', '/', '/site-map', '/sitemap.xml'],
			etiquettes: ['talent:maquillage-mariee', 'talents'],
		})
	})

	test('une adresse changée sur un document publié : l’ancienne page et la nouvelle', () => {
		expect(ciblesDuChangement('articles', publie('ancienne'), publie('nouvelle'))).toEqual({
			chemins: ['/blog/ancienne', '/blog/nouvelle', '/blog', '/site-map', '/sitemap.xml'],
			etiquettes: ['article:ancienne', 'article:nouvelle', 'articles'],
		})
		// Changed while it was a draft: only the published address counts.
		expect(ciblesDuChangement('articles', cache('brouillon'), publie('publiee')).chemins).toEqual([
			'/blog/publiee',
			'/blog',
			'/site-map',
			'/sitemap.xml',
		])
	})

	test('un slug qui n’en est pas un, comme le slug provisoire d’un profil en création, ne donne aucune page', () => {
		expect(ciblesDuChangement('profils', null, publie('_provisoire-1234'))).toEqual({
			chemins: ['/search', '/site-map', '/sitemap.xml'],
			etiquettes: ['profils'],
		})
	})

	test('les étiquettes d’une lecture : celle de la liste, celle du document', () => {
		expect(ETIQUETTES.profil('zoe-lefevre')).toBe('profil:zoe-lefevre')
		expect([ETIQUETTES.profils, ETIQUETTES.articles, ETIQUETTES.talents]).toEqual(['profils', 'articles', 'talents'])
		for (const pages of Object.values(PAGES_PUBLIQUES)) expect(pages.listes).toContain('/sitemap.xml')
	})
})

/** The part of a request the hooks read: the database adapter and the logger. */
function requete(lignes: Record<string, unknown>[] = []) {
	const findOne = mock(async () => lignes.shift() ?? null)
	const journal = { debug: mock(() => {}), error: mock(() => {}) }
	const req = { payload: { db: { findOne }, logger: journal } } as unknown as PayloadRequest
	return { req, findOne, journal }
}

const HOOKS = rafraichissement('profils')

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
			{ id: 7, slug: 'zoe-lefevre', statut: 'publie' },
			{ id: 7, slug: 'zoe-lefevre', statut: 'publie' },
		])

		const { appels, chemins, etiquettes } = await espionnerLeCache(() => mettreAJour(req, {}))

		expect(findOne).toHaveBeenCalledTimes(2)
		expect(chemins).toEqual(['/profil/zoe-lefevre', '/search', '/site-map', '/sitemap.xml'])
		expect(etiquettes).toEqual(['profil:zoe-lefevre', 'profils'])
		for (const appel of appels.filter(({ fonction }) => fonction === 'revalidateTag'))
			expect(appel.option).toEqual({ expire: 0 })
	})

	test('le contexte d’import : rien n’est lu, rien n’est rafraîchi, l’écriture passe telle quelle', async () => {
		const { req, findOne } = requete([{ id: 7, slug: 'zoe-lefevre', statut: 'publie' }])
		const context: RequestContext = { ...CONTEXTE_IMPORT }

		const { appels } = await espionnerLeCache(async () => {
			const { avant, apres, data } = await mettreAJour(req, context)
			expect(avant).toBe(data)
			expect(apres).toEqual({ id: 7 })
			await HOOKS.avantSuppression({ context, id: 7, req } as never)
			await HOOKS.apresSuppression({ context, doc: { id: 7 }, id: 7, req } as never)
		})

		expect(findOne).not.toHaveBeenCalled()
		expect(appels).toEqual([])
		expect(context).toEqual({ ...CONTEXTE_IMPORT })
	})

	test('hors d’une requête de Next, l’enregistrement passe : rien n’est rafraîchi, rien n’est levé', async () => {
		const { req, journal } = requete([
			{ id: 7, slug: 'zoe-lefevre', statut: 'publie' },
			{ id: 7, slug: 'zoe-lefevre', statut: 'publie' },
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
		expect(horsDUneRequeteDeNext(refus)).toBe(true)
		expect(horsDUneRequeteDeNext(new Error('Invariant: static generation store missing'))).toBe(false)
		expect(horsDUneRequeteDeNext('E263')).toBe(false)
	})
})
