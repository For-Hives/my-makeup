import { slugsDesCartes } from '@/lib/slug'
import { chargerTableDesSlugs } from '@/services/profilsPublics'

/**
 * GET /api/slugs-des-cartes (ticket 14): String(id) → slug of every profile
 * whose slug is not her username (slugsDesCartes), what the search cards
 * need to link to the addresses of the sitemap. Read on the server from the
 * list of every profile (username and creation date), as the profile pages
 * and the sitemap do, then kept 60 s: one read of the API a minute at most,
 * whatever the number of searches.
 *
 * Not in the props of /search: a page with data is prefetched by every link
 * to it, the « Trouver une maquilleuse » of the menu on every page.
 *
 * The API down: 503, nothing kept, and the cards link to the usernames,
 * which answer a 308 to the slugs, as before.
 */

const DUREE_MS = 60 * 1000
// { promesse, lu }: the slugs read last, shared by the requests of 60 s
let derniere = null

function lireSlugs() {
	const maintenant = Date.now()
	if (derniere && maintenant - derniere.lu < DUREE_MS) return derniere.promesse
	const entree = { promesse: chargerTableDesSlugs().then(slugsDesCartes), lu: maintenant }
	derniere = entree
	// read again by the next request after a failure
	entree.promesse.catch(() => {
		if (derniere === entree) derniere = null
	})
	return entree.promesse
}

export default async function handler(req, res) {
	if (req.method !== 'GET') {
		res.setHeader('Allow', 'GET')
		return res.status(405).json({})
	}
	try {
		const slugs = await lireSlugs()
		res.setHeader('Cache-Control', 'public, max-age=60')
		return res.status(200).json(slugs)
	} catch (erreur) {
		console.warn('[slugs-des-cartes] profiles not read', erreur?.message)
		res.setHeader('Cache-Control', 'no-store')
		return res.status(503).json({})
	}
}
