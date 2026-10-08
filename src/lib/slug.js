/**
 * Profile URLs (SEO-10, plans/03 §5): /profil/<slug>, where the slug is
 * computed from the username, the same way here and in the v3 import, so the
 * URLs indexed from November are the final ones.
 *
 * - slugifier: lower case ASCII, accents removed, every other character
 *   turned into a dash, dashes merged and trimmed, 70 characters at most;
 * - attribuerSlugs: unique slugs; when two usernames give the same slug, the
 *   oldest profile (createdAt, then id) keeps it and the next ones get -2,
 *   -3… A new profile never changes the slug of an older one;
 * - resoudreProfil: what /profil/<segment> serves: the profile of that slug,
 *   or a 308 to the slug from the old URL (raw username, spaces, capitals).
 *
 * Nothing is stored in Strapi: the table is computed from the list of the
 * profiles (username, createdAt) each time a page or the sitemap needs it.
 * Deleting a profile can move the -2 of a later one; there was no collision in
 * production on 2026-10-08 (100 profiles, 72 usernames to normalise).
 */

export const SLUG_MAX = 70

const LETTRES_SANS_DECOMPOSITION = {
	œ: 'oe',
	Œ: 'oe',
	æ: 'ae',
	Æ: 'ae',
	ß: 'ss',
	ø: 'o',
	Ø: 'o',
	ł: 'l',
	Ł: 'l',
	đ: 'd',
	Đ: 'd',
	ð: 'd',
	Ð: 'd',
	þ: 'th',
	Þ: 'th',
}

const couper = (slug, max) =>
	slug.length > max ? slug.slice(0, max).replace(/-+$/, '') : slug

/**
 * @param {unknown} texte - a username, a title
 * @returns {string} '' when nothing usable is left
 */
export function slugifier(texte) {
	if (typeof texte !== 'string' && typeof texte !== 'number') return ''
	const slug = String(texte)
		.replace(/[œŒæÆßøØłŁđĐðÐþÞ]/g, c => LETTRES_SANS_DECOMPOSITION[c])
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
	return couper(slug, SLUG_MAX)
}

/**
 * Slug of a profile whose username gives nothing (only emojis, empty).
 * @param {number|string} id
 * @returns {string}
 */
export const slugDeRepli = id => `maquilleuse-${id}`

const horodatage = date => {
	const t = Date.parse(date)
	return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
}

/**
 * @typedef {object} ProfilSlug
 * @property {number|string} id - Strapi id
 * @property {string} username
 * @property {string} [createdAt] - ISO date
 * @property {string} slug
 */

/**
 * Unique slugs for all the profiles (the whole list: a missing profile could
 * change a -2).
 * @param {Array<{id: number|string, username?: string|null, createdAt?: string|null}>} profils
 * @returns {ProfilSlug[]} in creation order
 */
export function attribuerSlugs(profils) {
	const tries = (Array.isArray(profils) ? profils : [])
		.filter(p => p && p.id !== undefined && p.id !== null)
		.map(p => ({
			id: p.id,
			username: typeof p.username === 'string' ? p.username : '',
			createdAt: p.createdAt ?? null,
		}))
		.sort(
			(a, b) =>
				horodatage(a.createdAt) - horodatage(b.createdAt) ||
				Number(a.id) - Number(b.id) ||
				String(a.id).localeCompare(String(b.id))
		)
	const pris = new Set()
	return tries.map(profil => {
		const base = slugifier(profil.username) || slugDeRepli(profil.id)
		let slug = base
		for (let n = 2; pris.has(slug); n++) {
			const suffixe = `-${n}`
			slug = couper(base, SLUG_MAX - suffixe.length) + suffixe
		}
		pris.add(slug)
		return { ...profil, slug }
	})
}

/**
 * @typedef {object} TableDesSlugs
 * @property {Map<string, ProfilSlug>} parSlug
 * @property {Map<string, ProfilSlug>} parUsername - the oldest one first
 * @property {Map<string, string>} slugParId - String(id) → slug
 */

/**
 * @param {Parameters<typeof attribuerSlugs>[0]} profils
 * @returns {TableDesSlugs}
 */
export function tableDesSlugs(profils) {
	const table = {
		parSlug: new Map(),
		parUsername: new Map(),
		slugParId: new Map(),
	}
	for (const profil of attribuerSlugs(profils)) {
		table.parSlug.set(profil.slug, profil)
		if (profil.username && !table.parUsername.has(profil.username))
			table.parUsername.set(profil.username, profil)
		table.slugParId.set(String(profil.id), profil.slug)
	}
	return table
}

/**
 * What /profil/<segment> serves.
 * - the slug of a profile → that profile;
 * - the exact username of a profile (old URL) → 308 to its slug;
 * - a variant of a slug (capitals, accents, spaces) → 308 to that slug;
 * - anything else → null (404).
 * @param {unknown} segment - decoded path segment (params of the page)
 * @param {TableDesSlugs} table
 * @returns {{profil: ProfilSlug, slug: string, redirection: boolean}|null}
 */
export function resoudreProfil(segment, table) {
	if (typeof segment !== 'string' || segment === '') return null
	const direct = table.parSlug.get(segment)
	if (direct) return { profil: direct, slug: direct.slug, redirection: false }
	const ancien =
		table.parUsername.get(segment) ?? table.parSlug.get(slugifier(segment))
	if (ancien) return { profil: ancien, slug: ancien.slug, redirection: true }
	return null
}

/**
 * Path of a profile page.
 * @param {string} slug
 * @returns {string}
 */
export const cheminProfil = slug => `/profil/${encodeURIComponent(slug)}`
