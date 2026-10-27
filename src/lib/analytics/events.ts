/**
 * The closed catalogue of the events the pages send to Umami (ticket 143, plan 04 §3.3).
 *
 * One table, `CATALOG`, says for every event the name and each property with the values it may
 * take. The types come from it, so the compiler and the runtime check read the same words:
 * - an unknown name, a missing property, an extra property or a value out of its list does not compile;
 * - at run time `eventData` drops the whole event rather than send something half checked.
 *
 * Nothing personal ever leaves through here: every property is a value from a closed list, a
 * boolean, a small integer or the id of a profile (`pid`, public and already part of the counted
 * addresses). Typed text, names, emails and phone numbers are never sent; a value that looks like
 * an email or a phone number drops the event.
 *
 * The quote form of the profile page (issue 1003) reuses the names of plan 04 for its two ends
 * (`devis_click`, `demande_envoyee`) and adds two steps. Renaming a value later splits its series in
 * Umami: a new name or a new optional property is how the catalogue grows (docs/mesure/umami.md).
 */

import { SPECIALTY_VALUES } from '../specialty'

/** Value of `channel`: how a visitor reaches a makeup artist. */
export const CONTACT_CHANNELS = ['email', 'phone', 'instagram', 'facebook', 'linkedin', 'youtube', 'website'] as const

/**
 * Value of `where` of `cta_click`: one stable word per call to action of the site. Never renamed (it would cut
 * its series): a new link gets a new word. The page the click happened on travels in `page`, so the blocks
 * that appear on many pages (`cta_recherche`, `cta_inscription`) are told apart by it.
 */
export const CTA_PLACES = [
	// The two links of the block at the foot of the pages, the search button of the bar and the badge of the home arch.
	'cta_recherche',
	'cta_inscription',
	'nav_recherche',
	'nav_recherche_mobile',
	'accueil_explorer',
	// The bar: the logo, the sign-in and the space, then one word per link of the menus (src/components/layout/links.ts).
	'nav_logo',
	'nav_connexion',
	'nav_espace',
	'nav_particulier_pourquoi',
	'nav_particulier_trouver',
	'nav_particulier_centraliser',
	'nav_particulier_explorer',
	'nav_maquilleuse_pourquoi',
	'nav_maquilleuse_partenariats',
	'nav_solutions_particuliers',
	'nav_solutions_maquilleuses',
	'nav_blog',
	// The foot of the pages, one word per link (the columns of src/components/layout/links.ts), then its networks.
	'footer_particulier_pourquoi',
	'footer_particulier_trouver',
	'footer_particulier_centraliser',
	'footer_particulier_explorer',
	'footer_maquilleuse_pourquoi',
	'footer_maquilleuse_partenariats',
	'footer_solutions_particuliers',
	'footer_solutions_maquilleuses',
	'footer_blog',
	'footer_a_propos',
	'footer_contact',
	'footer_mentions_legales',
	'footer_cgu',
	'footer_confidentialite',
	'footer_plan_du_site',
	'footer_reseau',
	// The home page: the four buttons of the community band, and the specialties of the ribbon.
	'accueil_collab_rejoindre',
	'accueil_collab_visibilite',
	'accueil_collab_trouver',
	'accueil_collab_solution',
	'accueil_talent',
	// The other pages: the search (ideas, empty state), the zone and the specialty pages, the blog, the ranking.
	'recherche_idee',
	'recherche_vide_inscription',
	'zone_recherche',
	'talent_recherche',
	'blog_liste_recherche',
	'article_retour_blog',
	'classement_voir',
	'classement_contact',
	'devis_envoye_recherche',
	'page_connexion',
] as const

/**
 * Value of `origin` of `card_click`: the list a profile card was in outside a typed search. `plus_consultees` and
 * `classement` are the two rows of the search page before any search (`PresetKind`), `mise_en_avant` the band of the home.
 */
export const CARD_ORIGINS = ['zone', 'talent', 'mise_en_avant', 'plus_consultees', 'classement', 'blog'] as const

/** Value of `from` of `profile_view`: where the visitor came from, told by the page she left. */
export const VIEW_ORIGINS = [
	'recherche',
	'zone',
	'talent',
	'classement',
	'blog',
	'accueil',
	'autre_page',
	'externe',
	'direct',
] as const

/** Value of `kind` of `article_link_click`: what an in-text link of an article leads to. Never the address. */
export const ARTICLE_LINK_KINDS = ['interne', 'externe', 'recherche', 'inscription', 'profil'] as const

/** Value of `network` of `share_click`: the way an article is passed on. */
export const SHARE_NETWORKS = ['email', 'linkedin', 'facebook'] as const

/** Value of `cause` of `quote_error`: why a quote request did not go through, never what was typed. */
export const QUOTE_ERROR_CAUSES = ['validation', 'trop_de_demandes', 'verification', 'indisponible', 'echec'] as const

export const SORT_KEYS = ['relevance', 'price', 'recent'] as const

/** Value of `budget` of `search_refine`: which ends of the price range the visitor set. */
export const BUDGET_USES = ['aucun', 'minimum', 'maximum', 'fourchette'] as const

export const RESULT_BUCKETS = ['0', '1-5', '6-20', '21+'] as const

/**
 * Answers to « Comment as-tu connu My Makeup ? », in the order they are shown. Nothing is stored:
 * the answer travels in this event only.
 */
export const DECLARED_ORIGINS = ['instagram', 'google', 'bouche-a-oreille', 'ecole', 'ia', 'autre'] as const

/** Codes of an authentication error shown to the visitor (the closed list of the live site). */
export const AUTH_ERROR_CODES = [
	'identifiants-invalides',
	'email-ou-nom-deja-pris',
	'nom-trop-court',
	'trop-de-tentatives',
	'service-indisponible',
	'session-expiree',
	'email-deja-avec-mot-de-passe',
	'email-non-confirme',
	'compte-bloque',
	'erreur-inconnue',
	// Sign-up refusals (ticket 146).
	'email-deja-pris',
	'email-non-envoye',
	// The returns from Google (ticket 146): the codes of `?error=` on the sign-in page.
	'google-echec',
	'google-annule',
	'google-indisponible',
	'google-email-non-verifie',
] as const

/** Value of `section` of `profile_save`: one per modal of the space, plus the onboarding. */
export const PROFILE_SECTIONS = [
	'identite',
	'description',
	'localisation',
	'reseaux',
	'competences',
	'langues',
	'formations',
	'experiences',
	'offres',
	'portfolio',
	'onboarding',
	// The cards of the space that have no modal of their own on the live site (ticket 147).
	'coordonnees',
	'disponibilite',
	'photo',
] as const

/**
 * Value of `step` of `onboarding_step` (ticket 148, issue 1009). `identite`, `zone` and `photo` are the
 * three first steps of the onboarding of the space, `contact` and `prestation` the two that follow (how
 * to reach her, her flagship offer); each is sent once the server stored the step, the first time it did.
 * `termine` keeps its meaning: it is sent once the three essential steps are stored, that is when the
 * profile became active. `verification_email` and `compte_cree` are the steps of the
 * live site: they stay listed so that its series keep their names.
 */
export const MEASURED_ONBOARDING_STEPS = [
	'verification_email',
	'compte_cree',
	'identite',
	'zone',
	'photo',
	'contact',
	'prestation',
	'termine',
] as const

export const WEB_VITALS_METRICS = ['CLS', 'FCP', 'INP', 'LCP', 'TTFB'] as const
export const NOTES_WEB_VITALS = ['good', 'needs-improvement', 'poor'] as const

/** The longest text a property keeps. */
export const TEXT_MAX = 99

/** The longest name of an event Umami keeps. */
export const NAME_MAX = 50

/* ------------------------------------------------------------------------------------------
 * The specifications: what a property may hold.
 * ---------------------------------------------------------------------------------------- */

/** The id of a profile: a number for a profile of the live site (its Strapi id), `v3-<id>` for a new one. */
export type Pid = number | `v3-${number}`

type SpecPid = { readonly type: 'pid' }
type SpecBoolean = { readonly type: 'boolean' }
type SpecInteger = { readonly type: 'int'; readonly min: number; readonly max: number }
type SpecNumber = { readonly type: 'number'; readonly min: number }
type SpecList<V extends string> = { readonly type: 'enum'; readonly values: readonly V[] }
/** A path: it starts with « / », has no query and no hash, and is cut at 99 characters. */
type SpecPath = { readonly type: 'path' }
/** A code of a département (`74`, `2A`, `971`) or `unknown`. */
type SpecZone = { readonly type: 'zone' }
/** A property an event may leave out (added later to an event that already existed: its old uses stay valid). */
type Optional = { readonly optional: true }

type Spec = (SpecPid | SpecBoolean | SpecInteger | SpecNumber | SpecList<string> | SpecPath | SpecZone) & {
	readonly optional?: true
}

const pid: SpecPid = { type: 'pid' }
const booleanSpec: SpecBoolean = { type: 'boolean' }
const integer = (min: number, max: number): SpecInteger => ({ type: 'int', min, max })
const oneOf = <const V extends string>(values: readonly V[]): SpecList<V> => ({ type: 'enum', values })
/** The code of a département of the list, `2A`/`2B` for Corsica, or `unknown`: what the server already computed for the count of searches. */
const zoneCode: SpecZone = { type: 'zone' }
const pathSpec: SpecPath = { type: 'path' }
const optional = <S extends Spec>(spec: S): S & Optional => ({ ...spec, optional: true })

/** What a specification lets through, as a TypeScript type. */
type Value<S> = S extends SpecPid
	? Pid
	: S extends SpecBoolean
		? boolean
		: S extends SpecInteger | SpecNumber
			? number
			: S extends SpecList<infer V>
				? V
				: S extends SpecPath | SpecZone
					? string
					: never

/**
 * The catalogue. A name is `snake_case`, 50 characters at most; `web-vitals` is the one exception,
 * kept as it is because the weekly report already counts that series.
 */
export const CATALOG = {
	// 1. A link to a way of reaching the artist, on a public profile (ticket 144).
	contact_click: { pid, channel: oneOf(CONTACT_CHANNELS) },
	// 4-6, 8. The search, the calls to action and the 404 (ticket 145). Never the words typed: `has_word` says only that
	// some were, `zone` is the code of the département the search points at (or `unknown`).
	search_submit: {
		has_city: booleanSpec,
		results: oneOf(RESULT_BUCKETS),
		from: oneOf(['formulaire', 'lien']),
		has_word: optional(booleanSpec),
		zone: optional(zoneCode),
	},
	search_result_click: { rank: integer(1, 999), pid },
	// `accueil_explorer`: the badge « Explorer les maquilleuses » on the arch of the home hero (26/10/2026). `page`: the
	// route the click happened on (never a profile or an address typed).
	cta_click: { where: oneOf(CTA_PLACES), page: optional(pathSpec) },
	platform_contact_submit: { ok: booleanSpec, status: integer(0, 599) },
	// `path`: the address that was not found, with the profile and talent names left out (27/10/2026).
	not_found: { kind: oneOf(['profil', 'talent', 'blog', 'autre']), path: optional(pathSpec) },
	// 9-12. Sign-up and sign-in (ticket 146). `code` is « ok » on a success.
	signup_start: { method: oneOf(['email', 'google']) },
	login_result: {
		method: oneOf(['email', 'google']),
		ok: booleanSpec,
		code: oneOf(['ok', ...AUTH_ERROR_CODES]),
	},
	auth_error: { code: oneOf(AUTH_ERROR_CODES) },
	session_expired: { where: oneOf(['api_401', 'jwt_expire', 'middleware']) },
	// 13-15, 18, 19. The space of the makeup artist (ticket 147).
	profile_save: { section: oneOf(PROFILE_SECTIONS), ok: booleanSpec },
	profile_visibility: { public: booleanSpec },
	upload_error: { kind: oneOf(['size', 'type', 'server']) },
	profile_publiable: {},
	account_delete: {},
	// 16-17. The onboarding (ticket 148).
	onboarding_step: { step: oneOf(MEASURED_ONBOARDING_STEPS) },
	onboarding_source: { source: oneOf(DECLARED_ORIGINS) },
	// 20-21. New in the v3: the reveal of a phone number, and an error boundary. `route`: the pattern of the page that
	// broke (`/profil/[slug]`), never the address.
	contact_reveal: { pid, channel: oneOf(CONTACT_CHANNELS) },
	app_error: {
		scope: oneOf(['site', 'espace', 'global']),
		code: oneOf(['render', 'chunk_load', 'unknown']),
		route: optional(pathSpec),
	},
	// 27/10/2026: the funnels of the visitor. A search that was narrowed (a filter or a sort in the address), the click
	// on a profile card outside a typed search, the view of a profile and the steps of its quote form.
	search_refine: {
		results: oneOf(RESULT_BUCKETS),
		budget: oneOf(BUDGET_USES),
		sort: oneOf(SORT_KEYS),
		specialty: optional(oneOf(SPECIALTY_VALUES)),
	},
	card_click: { origin: oneOf(CARD_ORIGINS), rank: integer(1, 999), pid },
	profile_view: { pid, from: oneOf(VIEW_ORIGINS) },
	devis_click: { pid, from: oneOf(['profil']) },
	quote_submit: { pid },
	demande_envoyee: { pid, source: oneOf(['profil']) },
	quote_error: { pid, cause: oneOf(QUOTE_ERROR_CAUSES) },
	// 27/10/2026: the funnel of the makeup artist. The wall of verification is shown for a new address and for one that
	// already has an account alike (ticket 083), so `signup_wall` counts requests, not accounts created.
	signup_wall: {},
	email_confirmed: {},
	profile_indexable: {},
	// 27/10/2026: the content. One name for each depth, so that a funnel can chain them; `page` is the route of the article.
	article_depth_50: { page: pathSpec },
	article_depth_90: { page: pathSpec },
	article_link_click: { kind: oneOf(ARTICLE_LINK_KINDS), page: pathSpec },
	share_click: { network: oneOf(SHARE_NETWORKS), page: pathSpec },
	// A technical event, outside the 21: the field Web Vitals of every page load (ticket 143).
	'web-vitals': {
		name: oneOf(WEB_VITALS_METRICS),
		value: { type: 'number', min: 0 } satisfies SpecNumber,
		rating: oneOf(NOTES_WEB_VITALS),
		page: { type: 'path' } satisfies SpecPath,
	},
} as const satisfies Record<string, Record<string, Spec>>

export type EventName = keyof typeof CATALOG

type OptionalKeys<E> = { [K in keyof E]: E[K] extends Optional ? K : never }[keyof E]

type Properties<E> = keyof E extends never
	? Record<string, never>
	: { -readonly [K in Exclude<keyof E, OptionalKeys<E>>]: Value<E[K]> } & {
			-readonly [K in OptionalKeys<E>]?: Value<E[K]>
		}

/** The type of the properties of every event, by name. */
export type MyMakeupEvents = { [N in EventName]: Properties<(typeof CATALOG)[N]> }

/* ------------------------------------------------------------------------------------------
 * The check at run time.
 * ---------------------------------------------------------------------------------------- */

/** What Umami receives: flat values. */
export type EventData = Record<string, string | number | boolean>

const NUMERIC_PID = /^[1-9]\d{0,8}$/
const PID_V3 = /^v3-[1-9]\d{0,8}$/
const ZONE = /^(?:2[AB]|\d{2,3}|unknown)$/
const LONG_DIGIT_RUN = /(\d[\s.\-()]*){9,}/

/** True when a text looks like personal data: an email address, or a phone number (9 digits or more). */
export function looksLikePersonalData(valeur: string): boolean {
	return valeur.includes('@') || LONG_DIGIT_RUN.test(valeur)
}

function normalize(spec: Spec, valeur: unknown): string | number | boolean | undefined {
	switch (spec.type) {
		case 'pid': {
			const text = typeof valeur === 'number' ? String(valeur) : valeur
			if (typeof text !== 'string') return undefined
			if (PID_V3.test(text)) return text
			// A Strapi id travels as a number: the series of the live site are numbers too.
			return NUMERIC_PID.test(text) ? Number(text) : undefined
		}
		case 'int':
			return Number.isInteger(valeur) && (valeur as number) >= spec.min && (valeur as number) <= spec.max
				? (valeur as number)
				: undefined
		case 'number':
			return typeof valeur === 'number' && Number.isFinite(valeur) && valeur >= spec.min ? valeur : undefined
		case 'boolean':
			return typeof valeur === 'boolean' ? valeur : undefined
		case 'enum':
			return typeof valeur === 'string' && spec.values.includes(valeur) ? valeur : undefined
		case 'path': {
			if (typeof valeur !== 'string' || !valeur.startsWith('/')) return undefined
			return (valeur.split(/[?#]/)[0] ?? '').slice(0, TEXT_MAX)
		}
		case 'zone':
			return typeof valeur === 'string' && ZONE.test(valeur) ? valeur : undefined
	}
}

/**
 * Checks an event against the catalogue and gives its flat, normalized properties, or `null` when
 * anything is off: an unknown name, a property the event does not have, a missing one, a value out
 * of its list, a text that looks personal.
 */
export function eventData(nom: string, proprietes: unknown = {}): EventData | null {
	if (!Object.hasOwn(CATALOG, nom) || nom.length > NAME_MAX) return null
	if (proprietes === null || typeof proprietes !== 'object' || Array.isArray(proprietes)) return null
	const specs: Record<string, Spec> = CATALOG[nom as EventName]
	const received = proprietes as Record<string, unknown>
	if (Object.keys(received).some(cle => !Object.hasOwn(specs, cle))) return null
	const data: EventData = {}
	for (const [key, spec] of Object.entries(specs)) {
		// A property added to an event later may be left out: the uses of before stay valid.
		if (spec.optional === true && received[key] === undefined) continue
		const value = normalize(spec, received[key])
		if (value === undefined) return null
		if (typeof value === 'string' && looksLikePersonalData(value)) return null
		data[key] = typeof value === 'string' ? value.slice(0, TEXT_MAX) : value
	}
	return data
}

/* ------------------------------------------------------------------------------------------
 * The Web Vitals: from the metric of next/web-vitals to the properties of the event.
 * ---------------------------------------------------------------------------------------- */

/** web.dev thresholds: good up to the first value, poor above the second. */
const THRESHOLDS: Record<(typeof WEB_VITALS_METRICS)[number], readonly [number, number]> = {
	CLS: [0.1, 0.25],
	FCP: [1800, 3000],
	INP: [200, 500],
	LCP: [2500, 4000],
	TTFB: [800, 1800],
}

/** What `useReportWebVitals` gives; the rest of the metric is not read. */
export interface WebVitalMetric {
	name: string
	value: number
	rating?: string | undefined
}

/**
 * The properties of `web-vitals` for a metric, or `null` for a metric the site does not send (FID,
 * the custom marks of Next.js) or an invalid value. CLS keeps 3 decimals, the others are whole
 * milliseconds. The rating comes from the metric, else from the thresholds.
 */
export function webVitalProperties(metrique: WebVitalMetric, page: string): MyMakeupEvents['web-vitals'] | null {
	const name = WEB_VITALS_METRICS.find(candidat => candidat === metrique.name)
	if (name === undefined || !Number.isFinite(metrique.value) || metrique.value < 0 || !page.startsWith('/')) return null
	const [good, poor] = THRESHOLDS[name]
	const note = NOTES_WEB_VITALS.find(candidate => candidate === metrique.rating)
	return {
		name: name,
		value: name === 'CLS' ? Math.round(metrique.value * 1000) / 1000 : Math.round(metrique.value),
		rating: note ?? (metrique.value <= good ? 'good' : metrique.value <= poor ? 'needs-improvement' : 'poor'),
		page: (page.split(/[?#]/)[0] ?? '').slice(0, TEXT_MAX),
	}
}
