/**
 * Which profiles of a list of the public API go to the sitemap (SEO-10):
 * the publiable ones (completude.js), by their slug (slug.js, computed on the
 * whole list). The lists of the API hide the email and the phone (PR #370):
 * a profile that only lacks a contact channel there is returned in
 * `aVerifier`, to be read alone (the profile page query keeps the contacts
 * she published) before being counted out.
 */

import { tableDesSlugs } from '../slug.js'
import { completude, contactsMasques } from './completude.js'

/**
 * @typedef {object} ProfilPublic
 * @property {number|string} id
 * @property {string} username
 * @property {string} slug
 * @property {string|null} updatedAt
 */

/**
 * @param {object[]} entrees - every profile, content API entries
 *   (`{ id, attributes: { username, createdAt, updatedAt, … } }`)
 * @param {{formulaireDevis?: boolean}} [options] - see completude()
 * @returns {{table: import('../slug.js').TableDesSlugs, publiables: ProfilPublic[], aVerifier: ProfilPublic[]}}
 */
export function trierProfilsPublics(entrees, options = {}) {
	const liste = (Array.isArray(entrees) ? entrees : []).filter(
		e => e && e.id !== undefined && e.id !== null
	)
	const table = tableDesSlugs(
		liste.map(e => ({
			id: e.id,
			username: e.attributes?.username,
			createdAt: e.attributes?.createdAt,
		}))
	)
	const publiables = []
	const aVerifier = []
	for (const entree of liste) {
		const attributs = entree.attributes ?? {}
		const profil = {
			id: entree.id,
			username:
				typeof attributs.username === 'string' ? attributs.username : '',
			slug: table.slugParId.get(String(entree.id)),
			updatedAt: attributs.updatedAt ?? null,
		}
		if (completude(attributs, options).publiable) publiables.push(profil)
		else if (
			profil.username &&
			contactsMasques(attributs.network) &&
			completude(attributs, { ...options, formulaireDevis: true }).publiable
		)
			aVerifier.push(profil)
	}
	return { table, publiables, aVerifier }
}
