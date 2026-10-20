import { afterAll, afterEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import type { CollectionSlug } from 'payload'
import { IMPORT_CONTEXT } from '@/lib/import-context'
import type { Profile } from '@/payload-types'
import { espionnerLeCache, type Rafraichi } from '../outils/espion-cache'
import { creerCompte } from '../outils/fabrique-comptes'
import { importerSurLeBanc } from '../outils/import'
import { compterLesMails, viderLeCapteur } from '../outils/mailpit'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'
import { creerLaSourceStrapi, effacerLaSourceStrapi } from '../outils/source-strapi'

// The bench is shared by every checkout of the machine, and a suite under load runs several times slower than alone:
// the default 5 s is passed by the heaviest tests of this file (ticket 225). The delay bounds a call that hangs, it
// is not a duration the test promises. A test that times out leaves its queries running into the next file.
setDefaultTimeout(30_000)

/**
 * Ticket 047, plan 02 I21: a publication or a change refreshes the public pages that show the
 * document (its page, the search or the blog or the home page, the plan of the site, the
 * sitemap), and the import refreshes nothing. Each write goes through Payload as the site makes
 * it, mostly by REST, inside the spy of Next's cache (tests/outils/espion-cache.ts). The rule
 * itself is tested in tests/unit/revalidation.test.ts.
 */

afterEach(async () => {
	await Promise.all([viderLaBase(), viderLeCapteur()])
})

/** What a write asks Next to refresh when it refreshes nothing. */
const RIEN = { chemins: [], etiquettes: [] }

/** The paths and tags of a spy, without the list of the calls. */
const cibles = ({ chemins, etiquettes }: Rafraichi) => ({ chemins, etiquettes })

/** What a change of a public profile refreshes: its page, the search, the plan of the site, the sitemap. */
const pagesDuProfil = (slug: string) => ({
	chemins: [`/profil/${slug}`, '/search', '/site-map', '/sitemap.xml'].sort(),
	etiquettes: [`profil:${slug}`, 'profils'],
})

/** The profile of a makeup artist, read without access control. */
async function profilDe(compte: number | string): Promise<Profile> {
	const payload = await payloadDeTest()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte } } })
	const profil = docs[0]
	if (!profil) throw new Error('La fabrique n’a pas créé le profil de la maquilleuse.')
	return profil
}

/** A makeup artist with her session, and her profile, empty: a draft. */
async function maquilleuse() {
	const compte = await creerCompte('maquilleuse')
	return { compte, profil: await profilDe(compte.id) }
}

/** A makeup artist whose profile is published: a speciality is enough. Written outside of a request of Next. */
async function maquilleusePubliee() {
	const { compte, profil } = await maquilleuse()
	const payload = await payloadDeTest()
	const publie = await payload.update({
		collection: 'profiles',
		id: profil.id,
		data: { specialty: 'Maquillage mariée' },
		depth: 0,
	})
	expect(publie.status).toBe('published')
	return { compte, profil: publie }
}

/** A REST write that must succeed. */
async function ecrire(...[methode, chemin, options]: Parameters<typeof appelerRest>) {
	const reponse = await appelerRest(methode, chemin, options)
	if (reponse.statut >= 300) throw new Error(`Écriture refusée : ${reponse.statut} ${reponse.texte}`)
	return reponse.corps as { doc: { id: number; slug: string; _status?: string } }
}

describe('Un profil publié modifié rafraîchit sa page, la recherche et le sitemap (I21)', () => {
	test('la maquilleuse change sa description : sa page, la recherche, le plan du site et le sitemap, expirés tout de suite', async () => {
		const { compte, profil } = await maquilleusePubliee()

		const rafraichi = await espionnerLeCache(() =>
			ecrire('PATCH', `/api/profiles/${profil.id}`, {
				enTetes: compte.session.enTetes,
				corps: { description: 'Une description fictive, changée par la maquilleuse.' },
			})
		)

		expect(cibles(rafraichi)).toEqual(pagesDuProfil(profil.slug))
		for (const { fonction, option } of rafraichi.appels)
			expect(option).toEqual(fonction === 'revalidateTag' ? { expire: 0 } : undefined)
	})

	test('la réponse ne choisit qu’un champ : les pages sont rafraîchies quand même', async () => {
		const { compte, profil } = await maquilleusePubliee()

		const rafraichi = await espionnerLeCache(() =>
			ecrire('PATCH', `/api/profiles/${profil.id}?select[description]=true`, {
				enTetes: compte.session.enTetes,
				corps: { description: 'Une autre description fictive.' },
			})
		)

		expect(cibles(rafraichi)).toEqual(pagesDuProfil(profil.slug))
	})

	test('un brouillon qui devient publié, à son premier champ rempli : ses pages', async () => {
		const { compte, profil } = await maquilleuse()
		expect(profil.status).toBe('draft')

		const rafraichi = await espionnerLeCache(() =>
			ecrire('PATCH', `/api/profiles/${profil.id}`, {
				enTetes: compte.session.enTetes,
				corps: { specialty: 'Maquillage artistique' },
			})
		)

		expect(cibles(rafraichi)).toEqual(pagesDuProfil(profil.slug))
	})

	test('l’admin masque un profil publié, puis le supprime : ses pages, à chaque fois', async () => {
		const [admin, { profil }] = await Promise.all([creerCompte('admin'), maquilleusePubliee()])
		const enTetes = admin.session.enTetes

		const masque = await espionnerLeCache(() =>
			ecrire('PATCH', `/api/profiles/${profil.id}`, { enTetes, corps: { chosenStatus: 'hidden', reason: 'Test' } })
		)
		expect(cibles(masque)).toEqual(pagesDuProfil(profil.slug))

		// Shown again, then deleted while published.
		await ecrire('PATCH', `/api/profiles/${profil.id}`, { enTetes, corps: { chosenStatus: 'automatic' } })
		const supprime = await espionnerLeCache(() => ecrire('DELETE', `/api/profiles/${profil.id}`, { enTetes }))
		expect(cibles(supprime)).toEqual(pagesDuProfil(profil.slug))
	})

	test('hors d’une requête de Next (un script, l’API locale), l’enregistrement passe sans rafraîchir', async () => {
		const { profil } = await maquilleusePubliee()
		const payload = await payloadDeTest()

		const apres = await payload.update({
			collection: 'profiles',
			id: profil.id,
			data: { description: 'Écrite par un script.' },
			depth: 0,
		})

		expect(apres).toMatchObject({ status: 'published', description: 'Écrite par un script.' })
	})
})

describe('Un brouillon qui reste brouillon ne rafraîchit rien', () => {
	test('un profil entièrement vide qui reçoit un prénom reste un brouillon : rien', async () => {
		const { compte, profil } = await maquilleuse()

		const rafraichi = await espionnerLeCache(() =>
			ecrire('PATCH', `/api/profiles/${profil.id}`, { enTetes: compte.session.enTetes, corps: { firstName: 'Zoé' } })
		)

		expect((await profilDe(compte.id)).status).toBe('draft')
		expect(cibles(rafraichi)).toEqual(RIEN)
	})

	test('un profil masqué que la maquilleuse modifie reste masqué : rien', async () => {
		const [admin, { compte, profil }] = await Promise.all([creerCompte('admin'), maquilleusePubliee()])
		await ecrire('PATCH', `/api/profiles/${profil.id}`, {
			enTetes: admin.session.enTetes,
			corps: { chosenStatus: 'hidden', reason: 'Test' },
		})

		const rafraichi = await espionnerLeCache(() =>
			ecrire('PATCH', `/api/profiles/${profil.id}`, {
				enTetes: compte.session.enTetes,
				corps: { description: 'Changée pendant le masquage.' },
			})
		)

		expect((await profilDe(compte.id)).status).toBe('hidden')
		expect(cibles(rafraichi)).toEqual(RIEN)
	})

	test('un article et un talent créés en brouillon, enregistrés en brouillon, avec ou sans ?draft=true : rien', async () => {
		const redaction = await creerCompte('redaction')
		const enTetes = redaction.session.enTetes

		const rafraichi = await espionnerLeCache(async () => {
			for (const [collection, slug] of [
				['articles', 'un-brouillon-fictif'],
				['talents', 'un-talent-en-brouillon'],
			] as const) {
				const { doc } = await ecrire('POST', `/api/${collection}?draft=true`, {
					enTetes,
					corps: { title: 'Un brouillon fictif', slug, _status: 'draft' },
				})
				await ecrire('PATCH', `/api/${collection}/${doc.id}?draft=true`, { enTetes, corps: { title: 'Encore' } })
				await ecrire('PATCH', `/api/${collection}/${doc.id}`, {
					enTetes,
					corps: { title: 'Toujours', _status: 'draft' },
				})
			}
		})

		expect(cibles(rafraichi)).toEqual(RIEN)
	})
})

describe('Un article ou un talent publié, modifié, retiré : ses pages', () => {
	const pagesDeLArticle = (...slugs: string[]) => ({
		chemins: [...slugs.map(slug => `/blog/${slug}`), '/blog', '/site-map', '/sitemap.xml'].sort(),
		etiquettes: [...slugs.map(slug => `article:${slug}`), 'articles'].sort(),
	})

	test('publié, puis son adresse changée : sa page, puis l’ancienne et la nouvelle, le blog et les plans', async () => {
		const redaction = await creerCompte('redaction')
		const enTetes = redaction.session.enTetes

		let id = 0
		const publication = await espionnerLeCache(async () => {
			const { doc } = await ecrire('POST', '/api/articles', {
				enTetes,
				corps: { title: 'Un article fictif', slug: 'un-article-fictif', _status: 'published' },
			})
			id = doc.id
		})
		expect(cibles(publication)).toEqual(pagesDeLArticle('un-article-fictif'))

		const adresse = await espionnerLeCache(() =>
			ecrire('PATCH', `/api/articles/${id}`, { enTetes, corps: { slug: 'un-article-renomme' } })
		)
		expect(cibles(adresse)).toEqual(pagesDeLArticle('un-article-fictif', 'un-article-renomme'))
	})

	test('retiré alors qu’un brouillon plus récent l’attend : sa page quand même', async () => {
		const redaction = await creerCompte('redaction')
		const enTetes = redaction.session.enTetes
		const { doc } = await ecrire('POST', '/api/articles', {
			enTetes,
			corps: { title: 'Un article fictif', slug: 'un-article-fictif', _status: 'published' },
		})
		// A draft version saved over the published article: the latest version is now a draft.
		await ecrire('PATCH', `/api/articles/${doc.id}?draft=true`, { enTetes, corps: { title: 'Un titre en cours' } })

		const retrait = await espionnerLeCache(() =>
			ecrire('PATCH', `/api/articles/${doc.id}`, { enTetes, corps: { _status: 'draft' } })
		)

		expect((await appelerRest('GET', `/api/articles/${doc.id}`)).statut).toBe(404)
		expect(cibles(retrait)).toEqual(pagesDeLArticle('un-article-fictif'))
	})

	test('un talent publié, modifié, puis supprimé : sa page, l’accueil et les plans, à chaque fois', async () => {
		const redaction = await creerCompte('redaction')
		const enTetes = redaction.session.enTetes
		const attendu = {
			chemins: ['/', '/site-map', '/sitemap.xml', '/talent/maquillage-fictif'].sort(),
			etiquettes: ['talent:maquillage-fictif', 'talents'],
		}

		let id = 0
		const publication = await espionnerLeCache(async () => {
			const { doc } = await ecrire('POST', '/api/talents', {
				enTetes,
				corps: { title: 'Maquillage fictif', slug: 'maquillage-fictif', _status: 'published' },
			})
			id = doc.id
		})
		const modification = await espionnerLeCache(() =>
			ecrire('PATCH', `/api/talents/${id}`, { enTetes, corps: { description: 'Une présentation fictive.' } })
		)
		const suppression = await espionnerLeCache(() => ecrire('DELETE', `/api/talents/${id}`, { enTetes }))

		for (const rafraichi of [publication, modification, suppression]) expect(cibles(rafraichi)).toEqual(attendu)
	})
})

describe('Avec le contexte d’import : aucune invalidation, aucun mail capté', () => {
	afterAll(effacerLaSourceStrapi)

	test('une écriture qui porte le contexte d’import ne rafraîchit rien, même publiée', async () => {
		const { profil } = await maquilleusePubliee()
		const payload = await payloadDeTest()

		const rafraichi = await espionnerLeCache(async () => {
			await payload.update({
				collection: 'profiles',
				id: profil.id,
				data: { description: 'Reprise de l’ancien site.' },
				context: IMPORT_CONTEXT,
			})
			for (const collection of ['articles', 'talents'] as const) {
				const cree = await payload.create({
					collection,
					data: { title: 'Repris', slug: `repris-${collection}`, _status: 'published' },
					context: IMPORT_CONTEXT,
				})
				await payload.update({ collection, id: cree.id, data: { title: 'Repris encore' }, context: IMPORT_CONTEXT })
				await payload.delete({ collection, id: cree.id, context: IMPORT_CONTEXT })
			}
			await payload.delete({ collection: 'profiles', id: profil.id, context: IMPORT_CONTEXT })
		})

		expect(cibles(rafraichi)).toEqual(RIEN)
	})

	test('l’import de la source factice publie des profils et des talents : aucune page rafraîchie, aucun mail', async () => {
		await creerLaSourceStrapi()

		const rafraichi = await espionnerLeCache(() => importerSurLeBanc())

		expect(cibles(rafraichi)).toEqual(RIEN)
		expect(await compterLesMails()).toBe(0)
		// Not an empty run: the import did write public documents.
		const payload = await payloadDeTest()
		const publics = async (collection: CollectionSlug, champ: string, valeur: string) =>
			(await payload.count({ collection, where: { [champ]: { equals: valeur } } })).totalDocs
		expect(await publics('profiles', 'status', 'published')).toBeGreaterThan(0)
		expect(await publics('talents', '_status', 'published')).toBeGreaterThan(0)
	})
})
