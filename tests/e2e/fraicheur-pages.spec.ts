import { type APIRequestContext, expect, test } from '@playwright/test'
import { placeProfile, readDemoPhoto } from '../../src/demo-data/loading'
import { DEMO_PROFILES, type DemoProfile } from '../../src/demo-data/profiles'
import { creerCompte } from '../outils/fabrique-comptes'
import { creerContenu, supprimerContenu } from '../outils/pages-publiques'
import { payloadDeTest } from '../outils/payload-test'

/**
 * The freshness of the public pages, end to end (ticket 117; plan 03 SEO-27, plan 02 I21): a change made
 * through the application is on the public pages within a minute (here: at the next visit, the tags expire
 * at once), and a page that did not change is served from the cache of Next without a query in the database.
 *
 * Each test works on a profile of its own, made for it (the profile type « actif mais pas publiable » of
 * the fictional set, under a name of its own), so the others do not see it. It is saved through the REST API
 * of the application, as the admin panel and the space do, so that the save reaches the cache of the server.
 * A write made with the Payload of the test (`payloadDeTest`) does not: that is how the tests prove that a
 * page is read from the cache, by changing the database behind its back.
 */

test.describe.configure({ mode: 'serial' })

/** Within a minute, the promise of the ticket. */
const UNE_MINUTE = 60_000

function typeDuJeu(cle: string): DemoProfile {
	const type = DEMO_PROFILES.find(autre => autre.cle === cle)
	if (!type) throw new Error(`Le profil type « ${cle} » du jeu fictif manque.`)
	return type
}

const MODELE = typeDuJeu('actif-non-publiable')
const REFERENCE = typeDuJeu('reference')

interface ProfilDeFraicheur {
	id: number
	pro: number
	slug: string
	/** A word only this profile carries in its name: the search finds it by that word. */
	mot: string
	entetes: { Cookie: string; Origin: string }
}

/** A profile of its own: visible, but not publishable (its offers have no price). */
async function poserUnProfil(): Promise<ProfilDeFraicheur> {
	const suffixe = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`
	const mot = `Fraicheur${suffixe}`
	const type: DemoProfile = {
		...MODELE,
		cle: `essai-fraicheur-${suffixe}`,
		compte: { email: `essai-fraicheur-${suffixe}@example.test`, nom: `Essai ${mot}` },
		profil: { ...MODELE.profil, firstName: 'Essai', lastName: mot, artistName: `Essai ${mot} Maquillage` },
		photos: { principale: MODELE.photos.principale, galerie: [] },
	}
	const pose = await placeProfile(await payloadDeTest(), type, readDemoPhoto, false)
	const admin = await creerCompte('admin')
	return { id: pose.profil, pro: pose.compte, slug: pose.slug, mot, entetes: admin.session.enTetes }
}

/** Takes the profile away through the application, and its photo: the lists forget it at once. */
async function retirerLeProfil(request: APIRequestContext, profil: ProfilDeFraicheur): Promise<void> {
	await request.delete(`/api/profiles/${profil.id}`, { headers: profil.entetes })
	await request.delete(`/api/pros/${profil.pro}`, { headers: profil.entetes })
	const payload = await payloadDeTest()
	await payload.delete({ collection: 'media', where: { owner: { equals: profil.pro } } }).catch(() => undefined)
}

async function enregistrer(request: APIRequestContext, profil: ProfilDeFraicheur, data: Record<string, unknown>) {
	const reponse = await request.patch(`/api/profiles/${profil.id}`, { headers: profil.entetes, data })
	if (!reponse.ok()) throw new Error(`L’enregistrement a répondu ${reponse.status()} : ${await reponse.text()}`)
}

/** What the page of the profile says, in its HTML. */
async function lirePage(request: APIRequestContext, slug: string) {
	const reponse = await request.get(`/profil/${slug}`, { maxRedirects: 0 })
	const html = await reponse.text()
	return {
		statut: reponse.status(),
		html,
		noindex:
			/<meta name="robots" content="[^"]*noindex/i.test(html) ||
			/noindex/i.test(reponse.headers()['x-robots-tag'] ?? ''),
		canonique: /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1] ?? null,
	}
}

const dansLeSitemap = async (request: APIRequestContext, slug: string) =>
	(await (await request.get('/sitemap.xml')).text()).includes(`/profil/${slug}<`)

const dansLaRecherche = async (request: APIRequestContext, mot: string, slug: string) =>
	(await (await request.get(`/search?search=${mot}`)).text()).includes(`/profil/${slug}"`)

const dansLePlan = async (request: APIRequestContext, slug: string) =>
	(await (await request.get('/site-map')).text()).includes(`/profil/${slug}"`)

test.describe('Fraîcheur des pages publiques (117)', () => {
	test('une description modifiée est visible en moins d’une minute', async ({ request }) => {
		test.setTimeout(180_000)
		const profil = await poserUnProfil()
		try {
			// A first visit puts the page in the cache.
			const avant = await lirePage(request, profil.slug)
			expect(avant.statut).toBe(200)
			expect(avant.html).toContain('Maquilleuse à Annecy, je compose chaque maquillage')

			await enregistrer(request, profil, {
				description: `Une description fictive changée pour l’essai de fraîcheur ${profil.mot}, assez longue pour être lue.`,
			})

			await expect
				.poll(async () => (await lirePage(request, profil.slug)).html.includes(`l’essai de fraîcheur ${profil.mot}`), {
					timeout: UNE_MINUTE,
				})
				.toBe(true)
			expect((await lirePage(request, profil.slug)).html).not.toContain(
				'Maquilleuse à Annecy, je compose chaque maquillage'
			)
		} finally {
			await retirerLeProfil(request, profil)
		}
	})

	test('un profil masqué répond 404 et sort de la recherche, du plan du site et du sitemap', async ({ request }) => {
		test.setTimeout(180_000)
		const profil = await poserUnProfil()
		try {
			// Publishable: it is in the three lists.
			await enregistrer(request, profil, { serviceOffers: REFERENCE.profil.serviceOffers })
			await expect.poll(() => dansLeSitemap(request, profil.slug), { timeout: UNE_MINUTE }).toBe(true)
			await expect.poll(() => dansLaRecherche(request, profil.mot, profil.slug), { timeout: UNE_MINUTE }).toBe(true)
			await expect.poll(() => dansLePlan(request, profil.slug), { timeout: UNE_MINUTE }).toBe(true)
			expect((await lirePage(request, profil.slug)).statut).toBe(200)

			await enregistrer(request, profil, { chosenStatus: 'hidden' })

			await expect.poll(async () => (await lirePage(request, profil.slug)).statut, { timeout: UNE_MINUTE }).toBe(404)
			await expect.poll(() => dansLaRecherche(request, profil.mot, profil.slug), { timeout: UNE_MINUTE }).toBe(false)
			await expect.poll(() => dansLePlan(request, profil.slug), { timeout: UNE_MINUTE }).toBe(false)
			await expect.poll(() => dansLeSitemap(request, profil.slug), { timeout: UNE_MINUTE }).toBe(false)
		} finally {
			await retirerLeProfil(request, profil)
		}
	})

	test('un profil devenu publiable entre dans le sitemap et perd son noindex', async ({ request }) => {
		test.setTimeout(180_000)
		const profil = await poserUnProfil()
		try {
			// Visible and not publishable: the page answers, in noindex, without a canonical address.
			const avant = await lirePage(request, profil.slug)
			expect(avant.statut).toBe(200)
			expect(avant.noindex).toBe(true)
			expect(avant.canonique).toBeNull()
			expect(await dansLeSitemap(request, profil.slug)).toBe(false)

			await enregistrer(request, profil, { serviceOffers: REFERENCE.profil.serviceOffers })

			await expect.poll(() => dansLeSitemap(request, profil.slug), { timeout: UNE_MINUTE }).toBe(true)
			await expect.poll(async () => (await lirePage(request, profil.slug)).noindex, { timeout: UNE_MINUTE }).toBe(false)
			expect((await lirePage(request, profil.slug)).canonique).toBe(`https://my-makeup.fr/profil/${profil.slug}`)
		} finally {
			await retirerLeProfil(request, profil)
		}
	})

	test('deux lectures d’une page inchangée ne demandent rien à la base', async ({ request }) => {
		test.setTimeout(180_000)
		const profil = await poserUnProfil()
		try {
			await enregistrer(request, profil, { serviceOffers: REFERENCE.profil.serviceOffers })
			const nom = (await lirePage(request, profil.slug)).html.match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1]
			expect(nom).toContain(profil.mot)

			// The page is in the cache. The database is then changed behind the back of the application (the
			// Payload of the test is no request of Next, so nothing is refreshed): a page that read the database
			// again would show it.
			const payload = await payloadDeTest()
			const silencieux = `Description écrite en coulisse ${profil.mot}, que la base a et que la page ne doit pas montrer.`
			await payload.update({ collection: 'profiles', id: profil.id, data: { description: silencieux }, depth: 0 })
			const enBase = await payload.findByID({
				collection: 'profiles',
				id: profil.id,
				depth: 0,
				select: { description: true },
			})
			expect(enBase.description).toBe(silencieux)

			for (let lecture = 0; lecture < 2; lecture += 1) {
				const page = await lirePage(request, profil.slug)
				expect(page.statut).toBe(200)
				expect(page.html).not.toContain('Description écrite en coulisse')
			}

			// A save through the application refreshes it: the database is read again, and says what it holds.
			await enregistrer(request, profil, { specialty: 'Maquillage artistique' })
			await expect
				.poll(async () => (await lirePage(request, profil.slug)).html.includes('Description écrite en coulisse'), {
					timeout: UNE_MINUTE,
				})
				.toBe(true)
		} finally {
			await retirerLeProfil(request, profil)
		}
	})

	test('un talent et un article sont servis du cache, et une modification publiée les rafraîchit', async ({
		request,
	}) => {
		test.setTimeout(180_000)
		const suffixe = Date.now().toString(36)
		const talent = `essai-fraicheur-talent-${suffixe}`
		const article = `essai-fraicheur-article-${suffixe}`
		const idTalent = await creerContenu(request, 'talents', {
			title: `Essai ${talent}`,
			slug: talent,
			description: 'Présentation de départ.',
			_status: 'published',
		})
		const idArticle = await creerContenu(request, 'articles', {
			title: `Essai ${article}`,
			slug: article,
			excerpt: 'Extrait de départ.',
			_status: 'published',
		})
		try {
			const payload = await payloadDeTest()
			for (const [chemin, collection, id, champ, depart] of [
				[`/talent/${talent}`, 'talents', idTalent, 'description', 'Présentation de départ.'],
				[`/blog/${article}`, 'articles', idArticle, 'excerpt', 'Extrait de départ.'],
			] as const) {
				expect(await (await request.get(chemin)).text(), chemin).toContain(depart)
				// Behind the back of the application: a cached page does not show it.
				await payload.update({ collection, id, data: { [champ]: 'Texte écrit en coulisse.' }, depth: 0 })
				for (let lecture = 0; lecture < 2; lecture += 1)
					expect(await (await request.get(chemin)).text(), chemin).toContain(depart)
				// Through the application: it shows within a minute.
				const reponse = await request.patch(`/api/${collection}/${id}`, {
					headers: (await creerCompte('admin')).session.enTetes,
					data: { [champ]: 'Texte changé par la rédaction.' },
				})
				expect(reponse.ok(), chemin).toBe(true)
				await expect
					.poll(async () => (await (await request.get(chemin)).text()).includes('Texte changé par la rédaction.'), {
						timeout: UNE_MINUTE,
					})
					.toBe(true)
			}
		} finally {
			await supprimerContenu(request, 'talents', idTalent)
			await supprimerContenu(request, 'articles', idArticle)
		}
	})
})
