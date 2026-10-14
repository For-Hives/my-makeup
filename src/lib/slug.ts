/**
 * Profile URLs: /profil/<slug>, where the slug is computed from the old username.
 *
 * Ported as is from src/lib/slug.js of the old site (branch main): the same inputs give the same
 * slugs, so the URLs indexed before the switch stay the final ones. What the old code answers on
 * a fictitious set is frozen in tests/unit/fixtures/slugs-ancien-site.json.
 *
 * - slugifier: lower case ASCII, accents removed, every other character turned into a dash,
 *   dashes merged and trimmed, 70 characters at most;
 * - attribuerSlugs: unique slugs; when two usernames give the same slug, the oldest profile
 *   (createdAt, then id) keeps it and the next ones get -2, -3… A new profile never changes the
 *   slug of an older one;
 * - resoudreProfil: what /profil/<segment> serves: the profile of that slug, or a 308 to the slug
 *   from the old URL (raw username, spaces, capitals).
 *
 * Limits of a table computed from the list of the profiles, the same as on the old site:
 * - deleting a profile can move the -2 of a later one;
 * - a username equal to the slug of another profile (« zoe-lefevre-2 » created after
 *   « ZOE LEFEVRE ») serves that other profile: the slug wins, so an indexed URL never changes
 *   hands.
 */

export const SLUG_MAX = 70

const LETTRES_SANS_DECOMPOSITION: Record<string, string> = {
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

const couper = (slug: string, max: number): string => (slug.length > max ? slug.slice(0, max).replace(/-+$/, '') : slug)

/**
 * @param texte - a username, a title
 * @returns '' when nothing usable is left
 */
export function slugifier(texte: unknown): string {
	if (typeof texte !== 'string' && typeof texte !== 'number') return ''
	const slug = String(texte)
		.replace(/[œŒæÆßøØłŁđĐðÐþÞ]/g, c => LETTRES_SANS_DECOMPOSITION[c] ?? c)
		.normalize('NFKD')
		// the combining marks left by the decomposition (accents, cedillas)
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
	return couper(slug, SLUG_MAX)
}

export type IdProfil = number | string

/** Slug of a profile whose username gives nothing (only emojis, empty). */
export const slugDeRepli = (id: IdProfil): string => `maquilleuse-${id}`

/**
 * The n-th candidate of a slug that is already taken: « -2 », « -3 »… The base is cut so that the
 * whole stays within 70 characters.
 */
export function slugAvecSuffixe(base: string, n: number): string {
	const suffixe = `-${n}`
	return couper(base, SLUG_MAX - suffixe.length) + suffixe
}

/** How many candidates `premierSlugLibre` asks about at once. */
const CANDIDATS_PAR_DEMANDE = 20

/**
 * The slug a new profile takes when the slugs are stored: `base` if it is free, else the first
 * free of « -2 », « -3 »… The new profile is always the newest one, so this is the rule of
 * `attribuerSlugs` (the oldest keeps the base, the next ones get the next suffix), applied to the
 * slugs already given instead of the whole list.
 *
 * @param base - a non-empty slug (`slugifier` of the name, or `slugDeRepli`)
 * @param lesquelsSontPris - which of these candidates are already taken (one query for several)
 */
export async function premierSlugLibre(
	base: string,
	lesquelsSontPris: (candidats: string[]) => Promise<ReadonlySet<string>>
): Promise<string> {
	for (let premier = 1; ; premier += CANDIDATS_PAR_DEMANDE) {
		const candidats = Array.from({ length: CANDIDATS_PAR_DEMANDE }, (_, i) =>
			premier + i === 1 ? base : slugAvecSuffixe(base, premier + i)
		)
		const pris = await lesquelsSontPris(candidats)
		const libre = candidats.find(candidat => !pris.has(candidat))
		if (libre) return libre
	}
}

/** What a slug is computed from. An entry without id is ignored. */
export interface ProfilSansSlug {
	id?: IdProfil | null
	username?: string | null
	/**
	 * ISO date string, as the old API returns it. A Date goes through toISOString() first: parsed
	 * from its default text it would lose its milliseconds, and two profiles of the same second
	 * could swap their -2.
	 */
	createdAt?: string | null
}

export interface ProfilSlug {
	id: IdProfil
	username: string
	createdAt: string | null
	slug: string
}

const horodatage = (date: string | null): number => {
	const t = date === null ? Number.NaN : Date.parse(date)
	return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
}

/**
 * Unique slugs for all the profiles (the whole list: a missing profile could change a -2).
 * @returns in creation order
 */
export function attribuerSlugs(
	profils: ReadonlyArray<ProfilSansSlug | null | undefined> | null | undefined
): ProfilSlug[] {
	const liste: ReadonlyArray<ProfilSansSlug | null | undefined> = Array.isArray(profils) ? profils : []
	const tries: Omit<ProfilSlug, 'slug'>[] = []
	for (const p of liste) {
		if (!p || p.id === undefined || p.id === null) continue
		tries.push({
			id: p.id,
			username: typeof p.username === 'string' ? p.username : '',
			createdAt: p.createdAt ?? null,
		})
	}
	tries.sort(
		(a, b) =>
			horodatage(a.createdAt) - horodatage(b.createdAt) ||
			Number(a.id) - Number(b.id) ||
			String(a.id).localeCompare(String(b.id))
	)
	const pris = new Set<string>()
	return tries.map(profil => {
		const base = slugifier(profil.username) || slugDeRepli(profil.id)
		let slug = base
		for (let n = 2; pris.has(slug); n++) slug = slugAvecSuffixe(base, n)
		pris.add(slug)
		return { ...profil, slug }
	})
}

export interface TableDesSlugs {
	parSlug: Map<string, ProfilSlug>
	/** the oldest one first */
	parUsername: Map<string, ProfilSlug>
	/** String(id) → slug */
	slugParId: Map<string, string>
}

export function tableDesSlugs(profils: Parameters<typeof attribuerSlugs>[0]): TableDesSlugs {
	const table: TableDesSlugs = {
		parSlug: new Map(),
		parUsername: new Map(),
		slugParId: new Map(),
	}
	for (const profil of attribuerSlugs(profils)) {
		table.parSlug.set(profil.slug, profil)
		if (profil.username && !table.parUsername.has(profil.username)) table.parUsername.set(profil.username, profil)
		table.slugParId.set(String(profil.id), profil.slug)
	}
	return table
}

export interface ProfilResolu {
	profil: ProfilSlug
	slug: string
	/** true: answer with a 308 to the slug */
	redirection: boolean
}

/**
 * What /profil/<segment> serves.
 * - the slug of a profile → that profile, even when the segment is also the username of another
 *   one (see the limits above);
 * - the exact username of a profile (old URL) → 308 to its slug;
 * - a variant of a slug (capitals, accents, spaces) → 308 to that slug;
 * - anything else → null (404).
 * @param segment - decoded path segment (params of the page)
 */
export function resoudreProfil(segment: unknown, table: TableDesSlugs): ProfilResolu | null {
	if (typeof segment !== 'string' || segment === '') return null
	const direct = table.parSlug.get(segment)
	if (direct) return { profil: direct, slug: direct.slug, redirection: false }
	const ancien = table.parUsername.get(segment) ?? table.parSlug.get(slugifier(segment))
	if (ancien) return { profil: ancien, slug: ancien.slug, redirection: true }
	return null
}

/** Path of a profile page. */
export const cheminProfil = (slug: string): string => `/profil/${encodeURIComponent(slug)}`

/**
 * A slug as `slugifier` writes it, the form of every address of the site: lower case ASCII
 * letters and digits, words joined by one dash, 70 characters at most. The slug of a talent or of
 * an article is written by the newsroom and must already have this form: it is refused, never
 * corrected in silence, so that an address never differs from the slug that was typed.
 */
export const estUnSlug = (texte: unknown): texte is string =>
	typeof texte === 'string' && texte !== '' && slugifier(texte) === texte
