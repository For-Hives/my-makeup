/**
 * The official list of the communes of France (geo.api.gouv.fr), as the import asks it, and its
 * answers kept from one run to the next (docs/migration/IMPORT.md, « Les communes »).
 *
 * - Three questions: the communes of a name (`nom`), of a postal code (`codePostal`), and the
 *   commune of an INSEE code (`code`). An answer is a list of communes: their name, INSEE code,
 *   département, postal codes and centre.
 * - Every answer is kept, by its question, in a file the command names (`--cities`): a second
 *   run reads the kept answers and asks nothing again, so that two runs on the same source give the
 *   same communes, whatever the referential says in between.
 * - Offline (`--offline`), nothing is asked: a question whose answer is not kept stops the run
 *   before any write. The bench and the tests run so, with the answers of
 *   tests/fixtures/import/referentiel-du-banc.json: no test calls the Internet.
 * - A referential that does not answer, answers an error or something that is not a list of
 *   communes stops the run before any write. The answers already received stay kept.
 *
 * The questions hold a name of commune or a postal code, never a street: the import never asks
 * with what it read as an address (./cities.ts). The referential is called by `fetch`, the one
 * outgoing call the tests simulate (docs/tests/http-sortant.md).
 */

import { z } from 'zod'
import { departmentOfInseeCode } from '../../../src/lib/profile/zone'
import { ImportRefuse } from './target'

/** The public address of the referential. */
export const REFERENCE_ADDRESS = 'https://geo.api.gouv.fr'

/** How long the import waits for one answer. */
export const REFERENCE_TIMEOUT_MS = 10_000

/** A commune as the referential gives it: public reference data, never a personal one. */
export interface ReferenceCity {
	nom: string
	/** The INSEE code. */
	code: string
	departement: string | null
	codesPostaux: string[]
	/** The centre of the commune, as the referential gives it; rounded when written into a profile. */
	latitude: number | null
	longitude: number | null
}

/** What the import asks the referential. */
export interface Question {
	genre: 'nom' | 'codePostal' | 'code'
	valeur: string
}

/** The key of a question among the kept answers: `nom:annecy`, `codePostal:74000`, `code:74010`. */
export const questionKey = ({ genre, valeur }: Question): string => `${genre}:${valeur}`

/** The referential, as the import reads it: one question, its communes. */
export interface Reference {
	repondre(question: Question): Promise<ReferenceCity[]>
}

/** What the referential sends for a commune, the fields the import asks for. */
const API_CITY = z.object({
	nom: z.string().min(1),
	code: z.string().min(1),
	codeDepartement: z.string().optional(),
	codesPostaux: z.array(z.string()).optional(),
	centre: z.object({ coordinates: z.tuple([z.number(), z.number()]) }).optional(),
})

const REQUESTED_FIELDS = 'nom,code,codesPostaux,codeDepartement,centre'

function apiCity(commune: z.infer<typeof API_CITY>): ReferenceCity {
	const [longitude, latitude] = commune.centre?.coordinates ?? [null, null]
	return {
		nom: commune.nom,
		code: commune.code,
		departement: commune.codeDepartement ?? departmentOfInseeCode(commune.code),
		codesPostaux: [...(commune.codesPostaux ?? [])].sort(),
		latitude,
		longitude,
	}
}

/** The referential does not answer: the run stops before any write, the answers received stay kept. */
const unavailable = (raison: string): ImportRefuse =>
	new ImportRefuse(
		[
			`Le référentiel des communes (geo.api.gouv.fr) ne répond pas : ${raison}. Rien n’est écrit.`,
			'Les réponses déjà reçues sont gardées ; relance plus tard.',
		].join(' ')
	)

/** The address of a question: `/communes?nom=…`, `/communes?codePostal=…`, `/communes/<code>`. */
function questionAddress(adresse: string, { genre, valeur }: Question): URL {
	const url = new URL(genre === 'code' ? `/communes/${encodeURIComponent(valeur)}` : '/communes', adresse)
	if (genre !== 'code') url.searchParams.set(genre, valeur)
	url.searchParams.set('fields', REQUESTED_FIELDS)
	return url
}

/**
 * The referential itself, asked by `fetch`. A commune unknown by its INSEE code (404) is an empty
 * answer; any other error stops the run (`ImportRefuse`), saying why without the question.
 */
export function geoApiReference({
	adresse = REFERENCE_ADDRESS,
	delaiMs = REFERENCE_TIMEOUT_MS,
}: {
	adresse?: string
	delaiMs?: number
} = {}): Reference {
	return {
		async repondre(question) {
			// A timer and an AbortController: `AbortSignal.timeout` is not kept by every path of
			// `fetch` under bun (docs/tests/http-sortant.md, « Limites »).
			const halt = new AbortController()
			const timer = setTimeout(() => halt.abort(), delaiMs)
			let corps: unknown
			try {
				const response = await fetch(questionAddress(adresse, question), {
					headers: { accept: 'application/json' },
					signal: halt.signal,
				})
				if (question.genre === 'code' && response.status === 404) return []
				if (!response.ok) throw unavailable(`réponse ${response.status}`)
				corps = await response.json().catch(() => undefined)
			} catch (error) {
				if (error instanceof ImportRefuse) throw error
				throw unavailable(halt.signal.aborted ? `pas de réponse en ${delaiMs / 1000} s` : 'réseau injoignable')
			} finally {
				clearTimeout(timer)
			}
			const read = (question.genre === 'code' ? API_CITY : z.array(API_CITY)).safeParse(corps)
			if (!read.success) throw unavailable('sa réponse n’est pas une liste de communes')
			return (Array.isArray(read.data) ? read.data : [read.data]).map(apiCity)
		},
	}
}

/** The kept answers, by the key of their question. */
export type KeptAnswers = Map<string, ReferenceCity[]>

const KEPT_CITY = z
	.object({
		nom: z.string(),
		code: z.string(),
		departement: z.string().nullable(),
		codesPostaux: z.array(z.string()),
		latitude: z.number().nullable(),
		longitude: z.number().nullable(),
	})
	.strict()

const ANSWERS_FILE = z
	.object({
		version: z.literal(1),
		source: z.literal(REFERENCE_ADDRESS),
		reponses: z.record(z.string().regex(/^(?:nom|codePostal|code):\S/), z.array(KEPT_CITY)),
	})
	.strict()

/** The kept answers read from the text of their file, or `ImportRefuse` with what is wrong. */
export function readAnswers(texte: string): KeptAnswers {
	let json: unknown
	try {
		json = JSON.parse(texte)
	} catch {
		throw new ImportRefuse(
			'Le fichier des réponses du référentiel des communes n’est pas un JSON valide : rien n’est écrit.'
		)
	}
	const read = ANSWERS_FILE.safeParse(json)
	if (!read.success)
		throw new ImportRefuse(
			'Le fichier des réponses du référentiel des communes n’a pas la forme attendue : rien n’est écrit.'
		)
	return new Map(Object.entries(read.data.reponses))
}

/** The kept answers as the text of their file: the questions sorted, so that two runs write the same file. */
export function answersAsText(reponses: KeptAnswers): string {
	const sorted = Object.fromEntries([...reponses.entries()].sort(([a], [b]) => a.localeCompare(b)))
	return `${JSON.stringify({ version: 1, source: REFERENCE_ADDRESS, reponses: sorted }, null, '\t')}\n`
}

/** A referential that keeps its answers, and says how many it received during the run. */
export interface KeptReference extends Reference {
	readonly reponses: KeptAnswers
	/** Answers received during this run, added to the kept ones. */
	nouvelles(): number
}

/**
 * The referential through its kept answers: a kept answer is read, never asked again; another
 * question goes to `referentiel` and its answer is kept. Offline (`referentiel` is `null`), such a
 * question stops the run before any write.
 */
export function keptReference(reponses: KeptAnswers, referentiel: Reference | null): KeptReference {
	let fresh = 0
	return {
		reponses,
		nouvelles: () => fresh,
		async repondre(question) {
			const key = questionKey(question)
			const kept = reponses.get(key)
			if (kept) return kept
			if (!referentiel)
				throw new ImportRefuse(
					[
						'Hors ligne (--offline), une réponse du référentiel des communes n’est pas dans le fichier des réponses gardées :',
						'rien n’est écrit. Relance sans --offline pour la demander au référentiel.',
					].join(' ')
				)
			const response = await referentiel.repondre(question)
			reponses.set(key, response)
			fresh++
			return response
		},
	}
}
