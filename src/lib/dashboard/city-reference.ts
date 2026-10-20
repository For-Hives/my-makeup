/**
 * The official list of the communes of France (geo.api.gouv.fr), as the space of the makeup artist
 * asks it (ticket 123; plan 01 §3.3 P7.4). Server code: the browser never calls it (the content
 * security policy lets a page talk to its own site only), the search and the save do.
 *
 * - Two questions: the communes that look like a text typed (a name, or a postal code), and the
 *   commune of an INSEE code, which the save asks to be sure of the name and the centre it stores.
 * - All of France, overseas included: no département is filtered out.
 * - A text that looks like an address is never sent: the list is asked a name or a postal code,
 *   nothing about where she lives.
 * - The service is called by `fetch`, the one outgoing call the tests simulate
 *   (docs/tests/http-sortant.md), with its own timer: `AbortSignal.timeout` is not used.
 * - Whatever goes wrong (no answer, a status other than 200 or 404, a body that is not what the
 *   list sends) is one outcome, `panne`: the caller says so in French and changes nothing.
 */

import { z } from 'zod'
import { DEPLOYED_ORIGINS } from '../env'
import { departmentOfInseeCode, hasNameCharacters, looksLikeAnAddress } from '../profile/zone'
import { cityLabel, SEARCH_MAX, SEARCH_MIN } from './location'

/** The public address of the list. */
export const CITIES_ADDRESS = 'https://geo.api.gouv.fr'

/** The only form the address of the fake list of the bench may take: http, on this machine, a port. */
const FAKE_LIST = /^http:\/\/(?:127\.0\.0\.1|localhost):\d{1,5}$/

/**
 * Where the list is asked: the official one, or the fake list of the test bench when the bench gives
 * it (BENCH_CITIES, set by tests/support/e2e.ts for the application of the end-to-end tests,
 * which must never call the Internet). Like BENCH_IMAGES, production never sets it: a value that
 * is not exactly an http address of this machine with a port, or one given to a deployed site, is
 * refused loudly rather than followed.
 */
export function citiesAddress(variables: Readonly<Record<string, string | undefined>> = process.env): string {
	const bench = variables.BENCH_CITIES?.trim()
	if (!bench) return CITIES_ADDRESS
	if (!FAKE_LIST.test(bench)) throw new Error('BENCH_CITIES refusée. Attendu : http://127.0.0.1:PORT.')
	if (DEPLOYED_ORIGINS.includes(variables.NEXT_PUBLIC_SITE_URL ?? ''))
		throw new Error('BENCH_CITIES refusée : un site déployé ne demande que la liste officielle.')
	return bench
}

/** How long a question waits for its answer. */
export const CITIES_DELAY_MS = 5000

/** How many communes the search proposes at most. */
export const SUGGESTIONS_MAX = 8

/** A commune as the list gives it: public reference data. */
export interface OfficialCity {
	readonly nom: string
	readonly codeInsee: string
	readonly departement: string | null
	readonly latitude: number | null
	readonly longitude: number | null
}

const REQUESTED_FIELDS = 'nom,code,codeDepartement,centre'

const API_CITY = z.object({
	nom: z.string().min(1),
	code: z.string().min(1),
	codeDepartement: z.string().optional(),
	centre: z.object({ coordinates: z.tuple([z.number(), z.number()]) }).optional(),
})

function officialCity(ligne: z.infer<typeof API_CITY>): OfficialCity | null {
	const department = departmentOfInseeCode(ligne.code)
	// A code the collection would refuse is not a commune we can store.
	if (department === null) return null
	const [longitude, latitude] = ligne.centre?.coordinates ?? [null, null]
	return { nom: ligne.nom, codeInsee: ligne.code, departement: department, latitude, longitude }
}

type Response = { genre: 'ok'; corps: unknown } | { genre: 'inconnue' } | { genre: 'panne' }

/** One question to the list: its JSON, an unknown code (404), or a failure of any kind. */
async function ask(chemin: string, parametres: Record<string, string>): Promise<Response> {
	const address = new URL(chemin, citiesAddress())
	for (const [key, value] of Object.entries(parametres)) address.searchParams.set(key, value)
	const stop = new AbortController()
	const timer = setTimeout(() => stop.abort(), CITIES_DELAY_MS)
	try {
		const response = await fetch(address, { headers: { accept: 'application/json' }, signal: stop.signal })
		// The body of a 404 is a plain text: the status is read before anything is parsed.
		if (response.status === 404) return { genre: 'inconnue' }
		if (response.status !== 200) return { genre: 'panne' }
		return { genre: 'ok', corps: await response.json() }
	} catch {
		return { genre: 'panne' }
	} finally {
		clearTimeout(timer)
	}
}

/** The text typed as the list is asked it: spaces folded, or why there is nothing to ask. */
export function searchQuestion(
	texte: string
): { genre: 'nom' | 'codePostal'; valeur: string } | { genre: 'rien'; motif: 'adresse' | 'trop-court' } {
	const clean = texte.trim().replace(/\s+/g, ' ')
	if (/^\d{5}$/.test(clean)) return { genre: 'codePostal', valeur: clean }
	if (clean.length < SEARCH_MIN) return { genre: 'rien', motif: 'trop-court' }
	if (clean.length > SEARCH_MAX || looksLikeAnAddress(clean) || !hasNameCharacters(clean))
		return { genre: 'rien', motif: 'adresse' }
	return { genre: 'nom', valeur: clean }
}

export type CitiesSearch =
	| { genre: 'communes'; communes: OfficialCity[] }
	| { genre: 'rien'; motif: 'adresse' | 'trop-court' }
	| { genre: 'panne' }

/** The communes that answer a text typed: by name, or by postal code when it is five digits. */
export async function findCities(texte: string): Promise<CitiesSearch> {
	const question = searchQuestion(texte)
	if (question.genre === 'rien') return question
	const response = await ask('/communes', {
		[question.genre]: question.valeur,
		fields: REQUESTED_FIELDS,
		boost: 'population',
		limit: String(SUGGESTIONS_MAX),
	})
	if (response.genre !== 'ok') return { genre: 'panne' }
	const parsedList = z.array(API_CITY).safeParse(response.corps)
	if (!parsedList.success) return { genre: 'panne' }
	const views = new Set<string>()
	const cities: OfficialCity[] = []
	for (const row of parsedList.data) {
		const city = officialCity(row)
		if (city === null || views.has(city.codeInsee)) continue
		views.add(city.codeInsee)
		cities.push(city)
	}
	return { genre: 'communes', communes: cities.slice(0, SUGGESTIONS_MAX) }
}

export type CityFromCode = { genre: 'commune'; commune: OfficialCity } | { genre: 'inconnue' } | { genre: 'panne' }

/** The commune of an INSEE code, as the list holds it: its name, its département and its centre. */
export async function cityFromCode(codeInsee: string): Promise<CityFromCode> {
	// The code goes in the path: only a well formed one is asked.
	if (departmentOfInseeCode(codeInsee) === null) return { genre: 'inconnue' }
	const response = await ask(`/communes/${encodeURIComponent(codeInsee)}`, { fields: REQUESTED_FIELDS })
	if (response.genre !== 'ok') return response
	const parsed = API_CITY.safeParse(response.corps)
	if (!parsed.success) return { genre: 'panne' }
	const city = officialCity(parsed.data)
	// The list answered for another code than the one asked: nothing is stored from it.
	return city === null || city.codeInsee !== codeInsee ? { genre: 'panne' } : { genre: 'commune', commune: city }
}

/** A commune as the panel proposes it. */
export const suggestion = (commune: OfficialCity): { codeInsee: string; libelle: string } => ({
	codeInsee: commune.codeInsee,
	libelle: cityLabel(commune),
})
