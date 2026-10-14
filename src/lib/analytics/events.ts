/**
 * The closed catalogue of the events the pages send to Umami (ticket 143, plan 04 §3.3).
 *
 * One table, `CATALOGUE`, says for every event the name and each property with the values it may
 * take. The types come from it, so the compiler and the runtime check read the same words:
 * - an unknown name, a missing property, an extra property or a value out of its list does not compile;
 * - at run time `donneesDEvenement` drops the whole event rather than send something half checked.
 *
 * Nothing personal ever leaves through here: every property is a value from a closed list, a
 * boolean, a small integer or the id of a profile (`pid`, public and already part of the counted
 * addresses). Typed text, names, emails and phone numbers are never sent; a value that looks like
 * an email or a phone number drops the event.
 *
 * The events of the quote form (`devis_click`, `demande_envoyee`) are not in it: the form is out of
 * the project (decisions of 08/10). Renaming a value later splits its series in Umami.
 */

/** Value of `channel`: how a visitor reaches a makeup artist. */
export const CANAUX_DE_CONTACT = ['email', 'phone', 'instagram', 'facebook', 'linkedin', 'youtube', 'website'] as const

export const TRANCHES_DE_RESULTATS = ['0', '1-5', '6-20', '21+'] as const

/**
 * Answers to « Comment as-tu connu My Makeup ? », in the order they are shown. Nothing is stored:
 * the answer travels in this event only.
 */
export const ORIGINES_DECLAREES = ['instagram', 'google', 'bouche-a-oreille', 'ecole', 'ia', 'autre'] as const

/** Codes of an authentication error shown to the visitor (the closed list of the live site). */
export const CODES_D_ERREUR_D_AUTHENTIFICATION = [
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
] as const

/** Value of `section` of `profile_save`: one per modal of the space, plus the onboarding. */
export const SECTIONS_DE_PROFIL = [
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
] as const

export const METRIQUES_WEB_VITALS = ['CLS', 'FCP', 'INP', 'LCP', 'TTFB'] as const
export const NOTES_WEB_VITALS = ['good', 'needs-improvement', 'poor'] as const

/** The longest text a property keeps. */
export const TEXTE_MAX = 99

/** The longest name of an event Umami keeps. */
export const NOM_MAX = 50

/* ------------------------------------------------------------------------------------------
 * The specifications: what a property may hold.
 * ---------------------------------------------------------------------------------------- */

/** The id of a profile: a number for a profile of the live site (its Strapi id), `v3-<id>` for a new one. */
export type Pid = number | `v3-${number}`

type SpecPid = { readonly type: 'pid' }
type SpecBooleen = { readonly type: 'boolean' }
type SpecEntier = { readonly type: 'int'; readonly min: number; readonly max: number }
type SpecNombre = { readonly type: 'number'; readonly min: number }
type SpecListe<V extends string> = { readonly type: 'enum'; readonly values: readonly V[] }
/** A path: it starts with « / », has no query and no hash, and is cut at 99 characters. */
type SpecChemin = { readonly type: 'path' }

type Spec = SpecPid | SpecBooleen | SpecEntier | SpecNombre | SpecListe<string> | SpecChemin

const pid: SpecPid = { type: 'pid' }
const booleen: SpecBooleen = { type: 'boolean' }
const entier = (min: number, max: number): SpecEntier => ({ type: 'int', min, max })
const parmi = <const V extends string>(values: readonly V[]): SpecListe<V> => ({ type: 'enum', values })

/** What a specification lets through, as a TypeScript type. */
type Valeur<S> = S extends SpecPid
	? Pid
	: S extends SpecBooleen
		? boolean
		: S extends SpecEntier | SpecNombre
			? number
			: S extends SpecListe<infer V>
				? V
				: S extends SpecChemin
					? string
					: never

/**
 * The catalogue. A name is `snake_case`, 50 characters at most; `web-vitals` is the one exception,
 * kept as it is because the weekly report already counts that series.
 */
export const CATALOGUE = {
	// 1. A link to a way of reaching the artist, on a public profile (ticket 144).
	contact_click: { pid, channel: parmi(CANAUX_DE_CONTACT) },
	// 4-6, 8. The search, the calls to action and the 404 (ticket 145). Never the words typed.
	search_submit: { has_city: booleen, results: parmi(TRANCHES_DE_RESULTATS), from: parmi(['formulaire', 'lien']) },
	search_result_click: { rank: entier(1, 999), pid },
	cta_click: { where: parmi(['cta_recherche', 'cta_inscription', 'nav_recherche', 'nav_recherche_mobile']) },
	platform_contact_submit: { ok: booleen, status: entier(0, 599) },
	not_found: { kind: parmi(['profil', 'talent', 'blog', 'autre']) },
	// 9-12. Sign-up and sign-in (ticket 146). `code` is « ok » on a success.
	signup_start: { method: parmi(['email', 'google']) },
	login_result: {
		method: parmi(['email', 'google']),
		ok: booleen,
		code: parmi(['ok', ...CODES_D_ERREUR_D_AUTHENTIFICATION]),
	},
	auth_error: { code: parmi(CODES_D_ERREUR_D_AUTHENTIFICATION) },
	session_expired: { where: parmi(['api_401', 'jwt_expire', 'middleware']) },
	// 13-15, 18, 19. The space of the makeup artist (ticket 147).
	profile_save: { section: parmi(SECTIONS_DE_PROFIL), ok: booleen },
	profile_visibility: { public: booleen },
	upload_error: { kind: parmi(['size', 'type', 'server']) },
	profile_publiable: {},
	account_delete: {},
	// 16-17. The onboarding (ticket 148).
	onboarding_step: { step: parmi(['verification_email', 'compte_cree', 'termine']) },
	onboarding_source: { source: parmi(ORIGINES_DECLAREES) },
	// 20-21. New in the v3: the reveal of a phone number, and an error boundary.
	contact_reveal: { pid, channel: parmi(CANAUX_DE_CONTACT) },
	app_error: { scope: parmi(['site', 'espace', 'global']), code: parmi(['render', 'chunk_load', 'unknown']) },
	// A technical event, outside the 21: the field Web Vitals of every page load (ticket 143).
	'web-vitals': {
		name: parmi(METRIQUES_WEB_VITALS),
		value: { type: 'number', min: 0 } satisfies SpecNombre,
		rating: parmi(NOTES_WEB_VITALS),
		page: { type: 'path' } satisfies SpecChemin,
	},
} as const satisfies Record<string, Record<string, Spec>>

export type NomEvenement = keyof typeof CATALOGUE

type Proprietes<E> = keyof E extends never ? Record<string, never> : { -readonly [K in keyof E]: Valeur<E[K]> }

/** The type of the properties of every event, by name. */
export type EvenementsMyMakeup = { [N in NomEvenement]: Proprietes<(typeof CATALOGUE)[N]> }

/* ------------------------------------------------------------------------------------------
 * The check at run time.
 * ---------------------------------------------------------------------------------------- */

/** What Umami receives: flat values. */
export type DonneesDEvenement = Record<string, string | number | boolean>

const PID_NUMERIQUE = /^[1-9]\d{0,8}$/
const PID_V3 = /^v3-[1-9]\d{0,8}$/
const LONGUE_SUITE_DE_CHIFFRES = /(\d[\s.\-()]*){9,}/

/** True when a text looks like personal data: an email address, or a phone number (9 digits or more). */
export function ressembleADesDonneesPersonnelles(valeur: string): boolean {
	return valeur.includes('@') || LONGUE_SUITE_DE_CHIFFRES.test(valeur)
}

function normaliser(spec: Spec, valeur: unknown): string | number | boolean | undefined {
	switch (spec.type) {
		case 'pid': {
			const texte = typeof valeur === 'number' ? String(valeur) : valeur
			if (typeof texte !== 'string') return undefined
			if (PID_V3.test(texte)) return texte
			// A Strapi id travels as a number: the series of the live site are numbers too.
			return PID_NUMERIQUE.test(texte) ? Number(texte) : undefined
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
			return (valeur.split(/[?#]/)[0] ?? '').slice(0, TEXTE_MAX)
		}
	}
}

/**
 * Checks an event against the catalogue and gives its flat, normalized properties, or `null` when
 * anything is off: an unknown name, a property the event does not have, a missing one, a value out
 * of its list, a text that looks personal.
 */
export function donneesDEvenement(nom: string, proprietes: unknown = {}): DonneesDEvenement | null {
	if (!Object.hasOwn(CATALOGUE, nom) || nom.length > NOM_MAX) return null
	if (proprietes === null || typeof proprietes !== 'object' || Array.isArray(proprietes)) return null
	const specs: Record<string, Spec> = CATALOGUE[nom as NomEvenement]
	const recues = proprietes as Record<string, unknown>
	if (Object.keys(recues).some(cle => !Object.hasOwn(specs, cle))) return null
	const donnees: DonneesDEvenement = {}
	for (const [cle, spec] of Object.entries(specs)) {
		const valeur = normaliser(spec, recues[cle])
		if (valeur === undefined) return null
		if (typeof valeur === 'string' && ressembleADesDonneesPersonnelles(valeur)) return null
		donnees[cle] = typeof valeur === 'string' ? valeur.slice(0, TEXTE_MAX) : valeur
	}
	return donnees
}

/* ------------------------------------------------------------------------------------------
 * The Web Vitals: from the metric of next/web-vitals to the properties of the event.
 * ---------------------------------------------------------------------------------------- */

/** web.dev thresholds: good up to the first value, poor above the second. */
const SEUILS: Record<(typeof METRIQUES_WEB_VITALS)[number], readonly [number, number]> = {
	CLS: [0.1, 0.25],
	FCP: [1800, 3000],
	INP: [200, 500],
	LCP: [2500, 4000],
	TTFB: [800, 1800],
}

/** What `useReportWebVitals` gives; the rest of the metric is not read. */
export interface MetriqueWebVital {
	name: string
	value: number
	rating?: string | undefined
}

/**
 * The properties of `web-vitals` for a metric, or `null` for a metric the site does not send (FID,
 * the custom marks of Next.js) or an invalid value. CLS keeps 3 decimals, the others are whole
 * milliseconds. The rating comes from the metric, else from the thresholds.
 */
export function proprietesDeWebVital(
	metrique: MetriqueWebVital,
	page: string
): EvenementsMyMakeup['web-vitals'] | null {
	const nom = METRIQUES_WEB_VITALS.find(candidat => candidat === metrique.name)
	if (nom === undefined || !Number.isFinite(metrique.value) || metrique.value < 0 || !page.startsWith('/')) return null
	const [bon, mauvais] = SEUILS[nom]
	const note = NOTES_WEB_VITALS.find(candidate => candidate === metrique.rating)
	return {
		name: nom,
		value: nom === 'CLS' ? Math.round(metrique.value * 1000) / 1000 : Math.round(metrique.value),
		rating: note ?? (metrique.value <= bon ? 'good' : metrique.value <= mauvais ? 'needs-improvement' : 'poor'),
		page: (page.split(/[?#]/)[0] ?? '').slice(0, TEXTE_MAX),
	}
}
