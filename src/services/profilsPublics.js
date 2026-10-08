/**
 * Reads of the public API for the profile pages and the sitemap (UI-06,
 * SEO-10), on the server only (getStaticProps, getServerSideProps). Errors
 * are thrown (see fetchPublicApi): during an ISR revalidation Next.js keeps
 * the last page instead of caching a 404 while the API is down.
 */
import { fetchPublicApi } from '@/services/publicApi'
import { avecPage, toutesLesPages } from '@/lib/strapi-pages'
import { tableDesSlugs } from '@/lib/slug'
import { completude } from '@/lib/profil/completude'
import { trierProfilsPublics } from '@/lib/profil/publiables'

/** What the profile page shows */
export const POPULATE_PROFIL =
	'populate=service_offers.options,network,language,image_gallery,courses,experiences,skills,main_picture'

/** What completude() needs to tell a publiable profile */
const POPULATE_COMPLETUDE =
	'populate[0]=main_picture&populate[1]=service_offers&populate[2]=network'

const lister = requete =>
	toutesLesPages(page => fetchPublicApi(avecPage(requete, page)))

/**
 * Slugs of every profile (username and creation date only).
 * @returns {Promise<import('@/lib/slug').TableDesSlugs>}
 */
export async function chargerTableDesSlugs() {
	const entrees = await lister(
		'/api/makeup-artistes?fields[0]=username&fields[1]=createdAt&sort[0]=id:asc'
	)
	return tableDesSlugs(
		entrees.map(e => ({
			id: e.id,
			username: e.attributes?.username,
			createdAt: e.attributes?.createdAt,
		}))
	)
}

/**
 * One profile by its exact username: the query of the profile page, the only
 * list of the API that keeps the email and phone she published (PR #370).
 * @param {string} username
 * @param {string} [populate]
 * @returns {Promise<object|null>} the content API entry
 */
export async function chargerProfil(username, populate = POPULATE_PROFIL) {
	const reponse = await fetchPublicApi(
		`/api/makeup-artistes?filters[username][$eq]=${encodeURIComponent(username)}&${populate}`
	)
	return reponse?.data?.[0] ?? null
}

/**
 * The publiable profiles, with their slug and their real updatedAt.
 * @param {{formulaireDevis?: boolean}} options - see completude()
 * @returns {Promise<Array<{id: number, username: string, slug: string, updatedAt: string|null}>>}
 */
export async function chargerProfilsDuSitemap(options = {}) {
	const entrees = await lister(
		`/api/makeup-artistes?fields[0]=username&fields[1]=createdAt&fields[2]=updatedAt&fields[3]=city&fields[4]=speciality&fields[5]=description&${POPULATE_COMPLETUDE}&sort[0]=id:asc`
	)
	const { publiables, aVerifier } = trierProfilsPublics(entrees, options)
	// contacts hidden in the list: read the profile alone, one at a time
	for (const profil of aVerifier) {
		const entree = await chargerProfil(profil.username, POPULATE_COMPLETUDE)
		if (entree && completude(entree.attributes, options).publiable)
			publiables.push(profil)
	}
	return publiables
}

/** Every published talent (slug, updatedAt) */
export const listerTalents = () =>
	lister('/api/talents?fields[0]=slug&fields[1]=updatedAt&sort[0]=id:asc')

/** Every published article (slug, updatedAt) */
export const listerArticles = () =>
	lister('/api/articles?fields[0]=slug&fields[1]=updatedAt&sort[0]=id:asc')
