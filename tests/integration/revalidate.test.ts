import { afterAll, afterEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import type { CollectionSlug } from 'payload'
import { IMPORT_CONTEXT } from '@/lib/import-context'
import type { Profile } from '@/payload-types'
import { createAccount } from '../support/account-factory'
import { type Refreshed, spyCache } from '../support/cache-spy'
import { importOnBench } from '../support/import'
import { countMails, emptySink } from '../support/mailpit'
import { emptyBase, testPayload } from '../support/payload-test'
import { fileForForm } from '../support/photos'
import { callRest, formWithFile } from '../support/rest'
import { createSourceStrapi, eraseSourceStrapi } from '../support/source-strapi'

// The bench is shared by every checkout of the machine, and a suite under load runs several times slower than alone:
// the default 5 s is passed by the heaviest tests of this file (ticket 225). The delay bounds a call that hangs, it
// is not a duration the test promises. A test that times out leaves its queries running into the next file.
setDefaultTimeout(30_000)

/**
 * Ticket 047, plan 02 I21: a publication or a change refreshes the public pages that show the
 * document (its page, the search or the blog or the home page, the plan of the site, the
 * sitemap), and the import refreshes nothing. Each write goes through Payload as the site makes
 * it, mostly by REST, inside the spy of Next's cache (tests/support/cache-spy.ts). The rule
 * itself is tested in tests/unit/revalidate.test.ts.
 */

afterEach(async () => {
	await Promise.all([emptyBase(), emptySink()])
})

/** What a write asks Next to refresh when it refreshes nothing. */
const NOTHING = { chemins: [], etiquettes: [] }

/** The paths and tags of a spy, without the list of the calls. */
const targets = ({ chemins, etiquettes }: Refreshed) => ({ chemins, etiquettes })

/** What a change of a public profile refreshes: its page, the search, the plan of the site, the sitemap. */
const profilePages = (slug: string) => ({
	chemins: [`/profil/${slug}`, '/', '/search', '/site-map', '/sitemap.xml'].sort(),
	etiquettes: [`profil:${slug}`, 'profils'],
})

/** The profile of a makeup artist, read without access control. */
async function profileOf(compte: number | string): Promise<Profile> {
	const payload = await testPayload()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte } } })
	const profile = docs[0]
	if (!profile) throw new Error('La fabrique n’a pas créé le profil de la maquilleuse.')
	return profile
}

/** A makeup artist with her session, and her profile, empty: a draft. */
async function artist() {
	const account = await createAccount('maquilleuse')
	return { compte: account, profil: await profileOf(account.id) }
}

/** A makeup artist whose profile is published: a speciality is enough. Written outside of a request of Next. */
async function publishedArtist() {
	const { compte: account, profil: profile } = await artist()
	const payload = await testPayload()
	const published = await payload.update({
		collection: 'profiles',
		id: profile.id,
		data: { specialty: 'Maquillage mariée' },
		depth: 0,
	})
	expect(published.status).toBe('published')
	return { compte: account, profil: published }
}

/** A REST write that must succeed. */
async function write(...[methode, chemin, options]: Parameters<typeof callRest>) {
	const response = await callRest(methode, chemin, options)
	if (response.statut >= 300) throw new Error(`Écriture refusée : ${response.statut} ${response.texte}`)
	return response.corps as { doc: { id: number; slug: string; _status?: string } }
}

describe('Un profil publié modifié rafraîchit sa page, la recherche et le sitemap (I21)', () => {
	test('la maquilleuse change sa description : sa page, la recherche, le plan du site et le sitemap, expirés tout de suite', async () => {
		const { compte: account, profil: profile } = await publishedArtist()

		const refreshed = await spyCache(() =>
			write('PATCH', `/api/profiles/${profile.id}`, {
				enTetes: account.session.enTetes,
				corps: { description: 'Une description fictive, changée par la maquilleuse.' },
			})
		)

		expect(targets(refreshed)).toEqual(profilePages(profile.slug))
		for (const { fonction: fn, option } of refreshed.appels)
			expect(option).toEqual(fn === 'revalidateTag' ? { expire: 0 } : undefined)
	})

	test('la réponse ne choisit qu’un champ : les pages sont rafraîchies quand même', async () => {
		const { compte: account, profil: profile } = await publishedArtist()

		const refreshed = await spyCache(() =>
			write('PATCH', `/api/profiles/${profile.id}?select[description]=true`, {
				enTetes: account.session.enTetes,
				corps: { description: 'Une autre description fictive.' },
			})
		)

		expect(targets(refreshed)).toEqual(profilePages(profile.slug))
	})

	test('un brouillon qui devient publié, à son premier champ rempli : ses pages', async () => {
		const { compte: account, profil: profile } = await artist()
		expect(profile.status).toBe('draft')

		const refreshed = await spyCache(() =>
			write('PATCH', `/api/profiles/${profile.id}`, {
				enTetes: account.session.enTetes,
				corps: { specialty: 'Maquillage artistique' },
			})
		)

		expect(targets(refreshed)).toEqual(profilePages(profile.slug))
	})

	test('l’admin masque un profil publié, puis le supprime : ses pages, à chaque fois', async () => {
		const [admin, { profil: profile }] = await Promise.all([createAccount('admin'), publishedArtist()])
		const headers = admin.session.enTetes

		const hidden = await spyCache(() =>
			write('PATCH', `/api/profiles/${profile.id}`, {
				enTetes: headers,
				corps: { chosenStatus: 'hidden', reason: 'Masqué pour le test' },
			})
		)
		expect(targets(hidden)).toEqual(profilePages(profile.slug))

		// Shown again, then deleted while published.
		await write('PATCH', `/api/profiles/${profile.id}`, {
			enTetes: headers,
			corps: { chosenStatus: 'automatic', reason: 'Rétabli après le test' },
		})
		const deleted = await spyCache(() => write('DELETE', `/api/profiles/${profile.id}`, { enTetes: headers }))
		expect(targets(deleted)).toEqual(profilePages(profile.slug))
	})

	test('hors d’une requête de Next (un script, l’API locale), l’enregistrement passe sans rafraîchir', async () => {
		const { profil: profile } = await publishedArtist()
		const payload = await testPayload()

		const after = await payload.update({
			collection: 'profiles',
			id: profile.id,
			data: { description: 'Écrite par un script.' },
			depth: 0,
		})

		expect(after).toMatchObject({ status: 'published', description: 'Écrite par un script.' })
	})
})

describe('Les cases de l’admin, les photos et les actions en masse (audit du 28/10/2026)', () => {
	test('l’admin coche puis décoche « Vérifiée » et « Super maquilleuse » : les pages du profil, la recherche et l’accueil, à chaque fois', async () => {
		const [admin, { profil: profile }] = await Promise.all([createAccount('admin'), publishedArtist()])
		const headers = admin.session.enTetes

		for (const corps of [{ verified: true }, { verified: false }, { superArtist: true }, { superArtist: false }]) {
			const refreshed = await spyCache(() => write('PATCH', `/api/profiles/${profile.id}`, { enTetes: headers, corps }))
			expect(targets(refreshed)).toEqual(profilePages(profile.slug))
		}
	})

	test('une photo du profil renommée puis supprimée par l’admin : la page du profil et les listes, à chaque fois', async () => {
		const [admin, { compte: account, profil: profile }] = await Promise.all([createAccount('admin'), publishedArtist()])
		const sent = await callRest('POST', '/api/media?depth=0', {
			enTetes: account.session.enTetes,
			formulaire: formWithFile(fileForForm()),
		})
		const photo = (sent.corps as { doc: { id: number } }).doc
		await write('PATCH', `/api/profiles/${profile.id}`, {
			enTetes: account.session.enTetes,
			corps: { mainPicture: photo.id },
		})

		const renamed = await spyCache(() =>
			write('PATCH', `/api/media/${photo.id}`, {
				enTetes: admin.session.enTetes,
				corps: { alt: 'Un texte alternatif fictif' },
			})
		)
		expect(targets(renamed)).toEqual(profilePages(profile.slug))

		// A photo that nothing holds refreshes nothing.
		const free = (
			(
				await callRest('POST', '/api/media?depth=0', {
					enTetes: account.session.enTetes,
					formulaire: formWithFile(fileForForm()),
				})
			).corps as { doc: { id: number } }
		).doc
		const unused = await spyCache(() =>
			write('PATCH', `/api/media/${free.id}`, { enTetes: admin.session.enTetes, corps: { alt: 'Aucune page' } })
		)
		expect(targets(unused)).toEqual(NOTHING)

		// Deleted while the profile still holds it as her main photo: the pages that showed it are refreshed.
		const deleted = await spyCache(() => write('DELETE', `/api/media/${photo.id}`, { enTetes: admin.session.enTetes }))
		expect(targets(deleted)).toEqual(profilePages(profile.slug))
	})

	test('les actions en masse sur les profils et les médias sont refusées avant toute écriture : rien à rafraîchir', async () => {
		const [admin, { profil: profile }] = await Promise.all([createAccount('admin'), publishedArtist()])

		const refreshed = await spyCache(async () => {
			for (const [method, path] of [
				['PATCH', '/api/profiles?where[slug][exists]=true'],
				['DELETE', '/api/profiles?where[slug][exists]=true'],
				['PATCH', '/api/media?where[id][exists]=true'],
				['DELETE', '/api/media?where[id][exists]=true'],
			] as const) {
				const response = await callRest(method, path, {
					enTetes: admin.session.enTetes,
					corps: { description: 'Masse' },
				})
				expect(response.statut).toBeGreaterThanOrEqual(400)
			}
		})

		expect(targets(refreshed)).toEqual(NOTHING)
		expect((await profileOf(profile.pro as number)).status).toBe('published')
	})

	test('une suppression en masse d’articles par l’admin : la page et les listes de chacun', async () => {
		const editor = await createAccount('redaction')
		const headers = editor.session.enTetes
		for (const slug of ['premier-article-fictif', 'second-article-fictif'])
			await write('POST', '/api/articles', { enTetes: headers, corps: { title: slug, slug, _status: 'published' } })

		const refreshed = await spyCache(() =>
			write('DELETE', '/api/articles?where[slug][exists]=true', { enTetes: headers })
		)

		expect(refreshed.etiquettes).toEqual(
			expect.arrayContaining(['article:premier-article-fictif', 'article:second-article-fictif', 'articles'])
		)
		expect(refreshed.chemins).toEqual(
			expect.arrayContaining(['/blog/premier-article-fictif', '/blog/second-article-fictif', '/blog'])
		)
	})

	test('Next refuse le rafraîchissement : l’enregistrement passe quand même, et la donnée est écrite', async () => {
		const [admin, { profil: profile }] = await Promise.all([createAccount('admin'), publishedArtist()])

		await spyCache(
			() =>
				write('PATCH', `/api/profiles/${profile.id}`, { enTetes: admin.session.enTetes, corps: { verified: true } }),
			{ failWith: new Error('cache indisponible') }
		)

		expect((await profileOf(profile.pro as number)).verified).toBe(true)
	})
})

describe('Un brouillon qui reste brouillon ne rafraîchit rien', () => {
	test('un profil entièrement vide qui reçoit un prénom reste un brouillon : rien', async () => {
		const { compte: account, profil: profile } = await artist()

		const refreshed = await spyCache(() =>
			write('PATCH', `/api/profiles/${profile.id}`, { enTetes: account.session.enTetes, corps: { firstName: 'Zoé' } })
		)

		expect((await profileOf(account.id)).status).toBe('draft')
		expect(targets(refreshed)).toEqual(NOTHING)
	})

	test('un profil masqué que la maquilleuse modifie reste masqué : rien', async () => {
		const [admin, { compte: account, profil: profile }] = await Promise.all([createAccount('admin'), publishedArtist()])
		await write('PATCH', `/api/profiles/${profile.id}`, {
			enTetes: admin.session.enTetes,
			corps: { chosenStatus: 'hidden', reason: 'Masqué pour le test' },
		})

		const refreshed = await spyCache(() =>
			write('PATCH', `/api/profiles/${profile.id}`, {
				enTetes: account.session.enTetes,
				corps: { description: 'Changée pendant le masquage.' },
			})
		)

		expect((await profileOf(account.id)).status).toBe('hidden')
		expect(targets(refreshed)).toEqual(NOTHING)
	})

	test('un article et un talent créés en brouillon, enregistrés en brouillon, avec ou sans ?draft=true : rien', async () => {
		const editor = await createAccount('redaction')
		const headers = editor.session.enTetes

		const refreshed = await spyCache(async () => {
			for (const [collection, slug] of [
				['articles', 'un-brouillon-fictif'],
				['talents', 'un-talent-en-brouillon'],
			] as const) {
				const { doc } = await write('POST', `/api/${collection}?draft=true`, {
					enTetes: headers,
					corps: { title: 'Un brouillon fictif', slug, _status: 'draft' },
				})
				await write('PATCH', `/api/${collection}/${doc.id}?draft=true`, {
					enTetes: headers,
					corps: { title: 'Encore' },
				})
				await write('PATCH', `/api/${collection}/${doc.id}`, {
					enTetes: headers,
					corps: { title: 'Toujours', _status: 'draft' },
				})
			}
		})

		expect(targets(refreshed)).toEqual(NOTHING)
	})
})

describe('Un article ou un talent publié, modifié, retiré : ses pages', () => {
	const articlePages = (...slugs: string[]) => ({
		chemins: [...slugs.map(slug => `/blog/${slug}`), '/blog', '/site-map', '/sitemap.xml'].sort(),
		etiquettes: [...slugs.map(slug => `article:${slug}`), 'articles'].sort(),
	})

	test('publié, puis son adresse changée : sa page, puis l’ancienne et la nouvelle, le blog et les plans', async () => {
		const editor = await createAccount('redaction')
		const headers = editor.session.enTetes

		let id = 0
		const publication = await spyCache(async () => {
			const { doc } = await write('POST', '/api/articles', {
				enTetes: headers,
				corps: { title: 'Un article fictif', slug: 'un-article-fictif', _status: 'published' },
			})
			id = doc.id
		})
		expect(targets(publication)).toEqual(articlePages('un-article-fictif'))

		const url = await spyCache(() =>
			write('PATCH', `/api/articles/${id}`, { enTetes: headers, corps: { slug: 'un-article-renomme' } })
		)
		expect(targets(url)).toEqual(articlePages('un-article-fictif', 'un-article-renomme'))
	})

	test('retiré alors qu’un brouillon plus récent l’attend : sa page quand même', async () => {
		const editor = await createAccount('redaction')
		const headers = editor.session.enTetes
		const { doc } = await write('POST', '/api/articles', {
			enTetes: headers,
			corps: { title: 'Un article fictif', slug: 'un-article-fictif', _status: 'published' },
		})
		// A draft version saved over the published article: the latest version is now a draft.
		await write('PATCH', `/api/articles/${doc.id}?draft=true`, {
			enTetes: headers,
			corps: { title: 'Un titre en cours' },
		})

		const removal = await spyCache(() =>
			write('PATCH', `/api/articles/${doc.id}`, { enTetes: headers, corps: { _status: 'draft' } })
		)

		expect((await callRest('GET', `/api/articles/${doc.id}`)).statut).toBe(404)
		expect(targets(removal)).toEqual(articlePages('un-article-fictif'))
	})

	test('un talent publié, modifié, puis supprimé : sa page, l’accueil et les plans, à chaque fois', async () => {
		const editor = await createAccount('redaction')
		const headers = editor.session.enTetes
		const expected = {
			chemins: ['/', '/site-map', '/sitemap.xml', '/talent/maquillage-fictif'].sort(),
			etiquettes: ['talent:maquillage-fictif', 'talents'],
		}

		let id = 0
		const publication = await spyCache(async () => {
			const { doc } = await write('POST', '/api/talents', {
				enTetes: headers,
				corps: { title: 'Maquillage fictif', slug: 'maquillage-fictif', _status: 'published' },
			})
			id = doc.id
		})
		const modification = await spyCache(() =>
			write('PATCH', `/api/talents/${id}`, { enTetes: headers, corps: { description: 'Une présentation fictive.' } })
		)
		const deletion = await spyCache(() => write('DELETE', `/api/talents/${id}`, { enTetes: headers }))

		for (const refreshed of [publication, modification, deletion]) expect(targets(refreshed)).toEqual(expected)
	})
})

describe('Avec le contexte d’import : aucune invalidation, aucun mail capté', () => {
	afterAll(eraseSourceStrapi)

	test('une écriture qui porte le contexte d’import ne rafraîchit rien, même publiée', async () => {
		const { profil: profile } = await publishedArtist()
		const payload = await testPayload()

		const refreshed = await spyCache(async () => {
			await payload.update({
				collection: 'profiles',
				id: profile.id,
				data: { description: 'Reprise de l’ancien site.' },
				context: IMPORT_CONTEXT,
			})
			for (const collection of ['articles', 'talents'] as const) {
				const created = await payload.create({
					collection,
					data: { title: 'Repris', slug: `repris-${collection}`, _status: 'published' },
					context: IMPORT_CONTEXT,
				})
				await payload.update({ collection, id: created.id, data: { title: 'Repris encore' }, context: IMPORT_CONTEXT })
				await payload.delete({ collection, id: created.id, context: IMPORT_CONTEXT })
			}
			await payload.delete({ collection: 'profiles', id: profile.id, context: IMPORT_CONTEXT })
		})

		expect(targets(refreshed)).toEqual(NOTHING)
	})

	test('l’import de la source factice publie des profils et des talents : aucune page rafraîchie, aucun mail', async () => {
		await createSourceStrapi()

		const refreshed = await spyCache(() => importOnBench())

		expect(targets(refreshed)).toEqual(NOTHING)
		expect(await countMails()).toBe(0)
		// Not an empty run: the import did write public documents.
		const payload = await testPayload()
		const publicValue = async (collection: CollectionSlug, champ: string, valeur: string) =>
			(await payload.count({ collection, where: { [champ]: { equals: valeur } } })).totalDocs
		expect(await publicValue('profiles', 'status', 'published')).toBeGreaterThan(0)
		expect(await publicValue('talents', '_status', 'published')).toBeGreaterThan(0)
	})
})
