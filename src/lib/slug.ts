/**
 * Profile URLs: /profil/<slug>, where the slug is computed from the old username.
 *
 * Ported as is from src/lib/slug.js of the old site (branch main): the same inputs give the same
 * slugs, so the URLs indexed before the switch stay the final ones. What the old code answers on
 * a fictitious set is frozen in tests/unit/fixtures/slugs-old-site.json.
 *
 * - slugifier: lower case ASCII, accents removed, every other character turned into a dash,
 *   dashes merged and trimmed, 70 characters at most;
 * - assignSlugs: unique slugs; when two usernames give the same slug, the oldest profile
 *   (createdAt, then id) keeps it and the next ones get -2, -3… A new profile never changes the
 *   slug of an older one;
 * - resolveProfile: what /profil/<segment> serves: the profile of that slug, or a 308 to the slug
 *   from the old URL (raw username, spaces, capitals).
 *
 * Limits of a table computed from the list of the profiles, the same as on the old site:
 * - deleting a profile can move the -2 of a later one;
 * - a username equal to the slug of another profile (« zoe-lefevre-2 » created after
 *   « ZOE LEFEVRE ») serves that other profile: the slug wins, so an indexed URL never changes
 *   hands.
 */

export const SLUG_MAX = 70

const LETTERS_WITHOUT_DECOMPOSITION: Record<string, string> = {
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

const cut = (slug: string, max: number): string => (slug.length > max ? slug.slice(0, max).replace(/-+$/, '') : slug)

/**
 * @param texte - a username, a title
 * @returns '' when nothing usable is left
 */
export function slugify(texte: unknown): string {
	if (typeof texte !== 'string' && typeof texte !== 'number') return ''
	const slug = String(texte)
		.replace(/[œŒæÆßøØłŁđĐðÐþÞ]/g, c => LETTERS_WITHOUT_DECOMPOSITION[c] ?? c)
		.normalize('NFKD')
		// the combining marks left by the decomposition (accents, cedillas)
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
	return cut(slug, SLUG_MAX)
}

export type ProfileId = number | string

/** Slug of a profile whose username gives nothing (only emojis, empty). */
export const fallbackSlug = (id: ProfileId): string => `maquilleuse-${id}`

/**
 * The n-th candidate of a slug that is already taken: « -2 », « -3 »… The base is cut so that the
 * whole stays within 70 characters.
 */
export function slugWithSuffix(base: string, n: number): string {
	const suffix = `-${n}`
	return cut(base, SLUG_MAX - suffix.length) + suffix
}

/** How many candidates `firstFreeSlug` asks about at once. */
const CANDIDATES_PER_REQUEST = 20

/**
 * The slug a new profile takes when the slugs are stored: `base` if it is free, else the first
 * free of « -2 », « -3 »… The new profile is always the newest one, so this is the rule of
 * `assignSlugs` (the oldest keeps the base, the next ones get the next suffix), applied to the
 * slugs already given instead of the whole list.
 *
 * @param base - a non-empty slug (`slugifier` of the name, or `fallbackSlug`)
 * @param lesquelsSontPris - which of these candidates are already taken (one query for several)
 */
export async function firstFreeSlug(
	base: string,
	lesquelsSontPris: (candidats: string[]) => Promise<ReadonlySet<string>>
): Promise<string> {
	for (let first = 1; ; first += CANDIDATES_PER_REQUEST) {
		const candidates = Array.from({ length: CANDIDATES_PER_REQUEST }, (_, i) =>
			first + i === 1 ? base : slugWithSuffix(base, first + i)
		)
		const taken = await lesquelsSontPris(candidates)
		const free = candidates.find(candidat => !taken.has(candidat))
		if (free) return free
	}
}

/** What a slug is computed from. An entry without id is ignored. */
export interface ProfileWithoutSlug {
	id?: ProfileId | null
	username?: string | null
	/**
	 * ISO date string, as the old API returns it. A Date goes through toISOString() first: parsed
	 * from its default text it would lose its milliseconds, and two profiles of the same second
	 * could swap their -2.
	 */
	createdAt?: string | null
}

export interface ProfileSlug {
	id: ProfileId
	username: string
	createdAt: string | null
	slug: string
}

const timestamp = (date: string | null): number => {
	const t = date === null ? Number.NaN : Date.parse(date)
	return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
}

/**
 * Unique slugs for all the profiles (the whole list: a missing profile could change a -2).
 * @returns in creation order
 */
export function assignSlugs(
	profils: ReadonlyArray<ProfileWithoutSlug | null | undefined> | null | undefined
): ProfileSlug[] {
	const list: ReadonlyArray<ProfileWithoutSlug | null | undefined> = Array.isArray(profils) ? profils : []
	const tries: Omit<ProfileSlug, 'slug'>[] = []
	for (const p of list) {
		if (!p || p.id === undefined || p.id === null) continue
		tries.push({
			id: p.id,
			username: typeof p.username === 'string' ? p.username : '',
			createdAt: p.createdAt ?? null,
		})
	}
	tries.sort(
		(a, b) =>
			timestamp(a.createdAt) - timestamp(b.createdAt) ||
			Number(a.id) - Number(b.id) ||
			String(a.id).localeCompare(String(b.id))
	)
	const taken = new Set<string>()
	return tries.map(profil => {
		const base = slugify(profil.username) || fallbackSlug(profil.id)
		let slug = base
		for (let n = 2; taken.has(slug); n++) slug = slugWithSuffix(base, n)
		taken.add(slug)
		return { ...profil, slug }
	})
}

export interface SlugTable {
	parSlug: Map<string, ProfileSlug>
	/** the oldest one first */
	parUsername: Map<string, ProfileSlug>
	/** String(id) → slug */
	slugParId: Map<string, string>
}

export function slugTable(profils: Parameters<typeof assignSlugs>[0]): SlugTable {
	const table: SlugTable = {
		parSlug: new Map(),
		parUsername: new Map(),
		slugParId: new Map(),
	}
	for (const profile of assignSlugs(profils)) {
		table.parSlug.set(profile.slug, profile)
		if (profile.username && !table.parUsername.has(profile.username)) table.parUsername.set(profile.username, profile)
		table.slugParId.set(String(profile.id), profile.slug)
	}
	return table
}

export interface ResolvedProfile {
	profil: ProfileSlug
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
export function resolveProfile(segment: unknown, table: SlugTable): ResolvedProfile | null {
	if (typeof segment !== 'string' || segment === '') return null
	const direct = table.parSlug.get(segment)
	if (direct) return { profil: direct, slug: direct.slug, redirection: false }
	const previous = table.parUsername.get(segment) ?? table.parSlug.get(slugify(segment))
	if (previous) return { profil: previous, slug: previous.slug, redirection: true }
	return null
}

/** Path of a profile page. */
export const profilePath = (slug: string): string => `/profil/${encodeURIComponent(slug)}`

/**
 * A slug as `slugifier` writes it, the form of every address of the site: lower case ASCII
 * letters and digits, words joined by one dash, 70 characters at most. The slug of a talent or of
 * an article is written by the newsroom and must already have this form: it is refused, never
 * corrected in silence, so that an address never differs from the slug that was typed.
 */
export const isSlug = (texte: unknown): texte is string =>
	typeof texte === 'string' && texte !== '' && slugify(texte) === texte
