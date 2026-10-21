import { type APIRequestContext, expect, test } from '@playwright/test'
import { placeProfile, readDemoPhoto } from '../../src/demo-data/loading'
import { DEMO_PROFILES, type DemoProfile } from '../../src/demo-data/profiles'
import { createAccount } from '../support/account-factory'
import { testPayload } from '../support/payload-test'
import { createContent, deleteContent } from '../support/public-pages'

/**
 * The HTML of the public pages is kept in the cache of Next (ticket 269; audit m17): the second visit of the home
 * page, of a profile, of a talent and of an article does not render the page again, and a save through the
 * application renders it again at the next visit. The pages that depend on a session never enter that cache.
 *
 * `x-nextjs-cache: HIT` is the header `next start` puts on a page it serves from its cache; `STALE` and `MISS` are
 * the other two values. The tests run against the production build (tests/support/e2e.ts).
 */

test.describe.configure({ mode: 'serial' })

const ONE_MINUTE = 60_000

const datasetType = (cle: string): DemoProfile => {
	const type = DEMO_PROFILES.find(autre => autre.cle === cle)
	if (!type) throw new Error(`Le profil type « ${cle} » du jeu fictif manque.`)
	return type
}

const TEMPLATE = datasetType('actif-non-publiable')
const REFERENCE = datasetType('reference')

/** The cache state and the cache header of a page, and its HTML. */
async function visit(request: APIRequestContext, path: string) {
	const response = await request.get(path, { maxRedirects: 0 })
	const headers = response.headers()
	return {
		statut: response.status(),
		html: await response.text(),
		cacheDeNext: headers['x-nextjs-cache'] ?? null,
		cacheControl: headers['cache-control'] ?? '',
	}
}

/** A second visit that is served from the cache: the poll absorbs the render that a first visit may still be doing. */
async function expectCached(request: APIRequestContext, path: string) {
	await visit(request, path)
	const second = await visit(request, path)
	expect(second.statut, path).toBe(200)
	expect(second.cacheDeNext, path).toBe('HIT')
	expect(second.cacheControl, path).not.toMatch(/no-store/)
	return second
}

async function newProfile(withOffers: boolean) {
	const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`
	const word = `Cache${suffix}`
	const type: DemoProfile = {
		...TEMPLATE,
		cle: `essai-cache-${suffix}`,
		compte: { email: `essai-cache-${suffix}@example.test`, nom: `Essai ${word}` },
		profil: {
			...TEMPLATE.profil,
			firstName: 'Essai',
			lastName: word,
			artistName: `Essai ${word} Maquillage`,
			...(withOffers && { serviceOffers: REFERENCE.profil.serviceOffers }),
		},
		photos: { principale: TEMPLATE.photos.principale, galerie: [] },
	}
	const placed = await placeProfile(await testPayload(), type, readDemoPhoto, false)
	const admin = await createAccount('admin')
	return { id: placed.profil, pro: placed.compte, slug: placed.slug, mot: word, entetes: admin.session.enTetes }
}

async function removeProfile(request: APIRequestContext, profile: Awaited<ReturnType<typeof newProfile>>) {
	await request.delete(`/api/profiles/${profile.id}`, { headers: profile.entetes })
	await request.delete(`/api/pros/${profile.pro}`, { headers: profile.entetes })
	const payload = await testPayload()
	await payload.delete({ collection: 'media', where: { owner: { equals: profile.pro } } }).catch(() => undefined)
}

test.describe('Pages publiques en cache (269)', () => {
	test('la seconde visite d’un profil publiable est servie du cache, et un enregistrement la rend à jour', async ({
		request,
	}) => {
		test.setTimeout(180_000)
		const profile = await newProfile(true)
		try {
			const page = await expectCached(request, `/profil/${profile.slug}`)
			expect(page.html).toContain('Maquilleuse à Annecy, je compose chaque maquillage')

			const response = await request.patch(`/api/profiles/${profile.id}`, {
				headers: profile.entetes,
				data: { description: `Description changée pour l’essai de cache ${profile.mot}, assez longue pour être lue.` },
			})
			expect(response.ok()).toBe(true)
			await expect
				.poll(
					async () =>
						(await visit(request, `/profil/${profile.slug}`)).html.includes(`l’essai de cache ${profile.mot}`),
					{
						timeout: ONE_MINUTE,
					}
				)
				.toBe(true)
			// Rendered again once, then kept again.
			await expectCached(request, `/profil/${profile.slug}`)
		} finally {
			await removeProfile(request, profile)
		}
	})

	test('un profil non publiable garde son noindex dans la page en cache, une adresse inconnue répond 404', async ({
		request,
	}) => {
		test.setTimeout(180_000)
		const profile = await newProfile(false)
		try {
			const first = await visit(request, `/profil/${profile.slug}`)
			const second = await visit(request, `/profil/${profile.slug}`)
			for (const page of [first, second]) {
				expect(page.statut).toBe(200)
				expect(page.html).toMatch(/<meta name="robots" content="[^"]*noindex/i)
				expect(page.html).not.toMatch(/<link rel="canonical"/)
			}
			for (const unknown of [
				`/profil/inconnu-${profile.mot.toLowerCase()}`,
				'/talent/inconnu-269',
				'/blog/inconnu-269',
			]) {
				for (let read = 0; read < 2; read += 1) expect((await visit(request, unknown)).statut, unknown).toBe(404)
			}
			// The internal address of the home page is no page of the site.
			const internal = await visit(request, '/home-cached/principal')
			expect(internal.statut).toBe(404)
		} finally {
			await removeProfile(request, profile)
		}
	})

	test('l’accueil, un talent et un article sont servis du cache, et une modification publiée les rafraîchit', async ({
		request,
	}) => {
		test.setTimeout(180_000)
		const suffix = Date.now().toString(36)
		const talent = `essai-cache-talent-${suffix}`
		const article = `essai-cache-article-${suffix}`
		const talentTitle = `Essai talent cache ${suffix}`
		const idTalent = await createContent(request, 'talents', {
			title: talentTitle,
			slug: talent,
			description: 'Présentation de départ.',
			_status: 'published',
		})
		const idArticle = await createContent(request, 'articles', {
			title: `Essai ${article}`,
			slug: article,
			excerpt: 'Extrait de départ.',
			_status: 'published',
		})
		try {
			const headers = (await createAccount('admin')).session.enTetes
			const home = await expectCached(request, '/')
			expect(home.html).toContain(talentTitle)
			expect((await expectCached(request, `/talent/${talent}`)).html).toContain('Présentation de départ.')
			expect((await expectCached(request, `/blog/${article}`)).html).toContain('Extrait de départ.')

			for (const [collection, id, data] of [
				['talents', idTalent, { title: `${talentTitle} modifié`, description: 'Présentation changée.' }],
				['articles', idArticle, { excerpt: 'Extrait changé.' }],
			] as const) {
				const response = await request.patch(`/api/${collection}/${id}`, { headers, data })
				expect(response.ok(), collection).toBe(true)
			}
			await expect
				.poll(async () => (await visit(request, '/')).html.includes(`${talentTitle} modifié`), { timeout: ONE_MINUTE })
				.toBe(true)
			await expect
				.poll(async () => (await visit(request, `/talent/${talent}`)).html.includes('Présentation changée.'), {
					timeout: ONE_MINUTE,
				})
				.toBe(true)
			await expect
				.poll(async () => (await visit(request, `/blog/${article}`)).html.includes('Extrait changé.'), {
					timeout: ONE_MINUTE,
				})
				.toBe(true)
			await expectCached(request, '/')
			await expectCached(request, `/talent/${talent}`)
			await expectCached(request, `/blog/${article}`)
		} finally {
			await deleteContent(request, 'talents', idTalent)
			await deleteContent(request, 'articles', idArticle)
		}
	})

	test('les pages de la session ne sont jamais dans un cache partagé', async ({ request }) => {
		for (const path of ['/auth', '/auth/signin', '/auth/signup', '/auth/profil', '/auth/apercu-profil']) {
			const page = await visit(request, path)
			expect(page.cacheControl, path).toContain('private')
			expect(page.cacheControl, path).toContain('no-store')
			expect(page.cacheDeNext, path).not.toBe('HIT')
		}
	})
})
