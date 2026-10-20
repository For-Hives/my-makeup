/**
 * The official list of the communes of France (geo.api.gouv.fr), as the import asks it, and its
 * answers kept from one run to the next (docs/migration/IMPORT.md, « Les communes »).
 *
 * - Three questions: the communes of a name (`nom`), of a postal code (`codePostal`), and the
 *   commune of an INSEE code (`code`). An answer is a list of communes: their name, INSEE code,
 *   département, postal codes and centre.
 * - Every answer is kept, by its question, in a file the command names (`--communes`): a second
 *   run reads the kept answers and asks nothing again, so that two runs on the same source give the
 *   same communes, whatever the referential says in between.
 * - Offline (`--hors-ligne`), nothing is asked: a question whose answer is not kept stops the run
 *   before any write. The bench and the tests run so, with the answers of
 *   tests/fixtures/import/referentiel-du-banc.json: no test calls the Internet.
 * - A referential that does not answer, answers an error or something that is not a list of
 *   communes stops the run before any write. The answers already received stay kept.
 *
 * The questions hold a name of commune or a postal code, never a street: the import never asks
 * with what it read as an address (./communes.ts). The referential is called by `fetch`, the one
 * outgoing call the tests simulate (docs/tests/http-sortant.md).
 */

import { z } from 'zod'
import { departementDuCodeInsee } from '../../../src/lib/profile/zone'
import { ImportRefuse } from './cible'

/** The public address of the referential. */
export const ADRESSE_DU_REFERENTIEL = 'https://geo.api.gouv.fr'

/** How long the import waits for one answer. */
export const DELAI_DU_REFERENTIEL_MS = 10_000

/** A commune as the referential gives it: public reference data, never a personal one. */
export interface CommuneDuReferentiel {
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
export const cleDeLaQuestion = ({ genre, valeur }: Question): string => `${genre}:${valeur}`

/** The referential, as the import reads it: one question, its communes. */
export interface Referentiel {
	repondre(question: Question): Promise<CommuneDuReferentiel[]>
}

/** What the referential sends for a commune, the fields the import asks for. */
const COMMUNE_DE_L_API = z.object({
	nom: z.string().min(1),
	code: z.string().min(1),
	codeDepartement: z.string().optional(),
	codesPostaux: z.array(z.string()).optional(),
	centre: z.object({ coordinates: z.tuple([z.number(), z.number()]) }).optional(),
})

const CHAMPS_DEMANDES = 'nom,code,codesPostaux,codeDepartement,centre'

function communeDeLApi(commune: z.infer<typeof COMMUNE_DE_L_API>): CommuneDuReferentiel {
	const [longitude, latitude] = commune.centre?.coordinates ?? [null, null]
	return {
		nom: commune.nom,
		code: commune.code,
		departement: commune.codeDepartement ?? departementDuCodeInsee(commune.code),
		codesPostaux: [...(commune.codesPostaux ?? [])].sort(),
		latitude,
		longitude,
	}
}

/** The referential does not answer: the run stops before any write, the answers received stay kept. */
const indisponible = (raison: string): ImportRefuse =>
	new ImportRefuse(
		[
			`Le référentiel des communes (geo.api.gouv.fr) ne répond pas : ${raison}. Rien n’est écrit.`,
			'Les réponses déjà reçues sont gardées ; relance plus tard.',
		].join(' ')
	)

/** The address of a question: `/communes?nom=…`, `/communes?codePostal=…`, `/communes/<code>`. */
function adresseDeLaQuestion(adresse: string, { genre, valeur }: Question): URL {
	const url = new URL(genre === 'code' ? `/communes/${encodeURIComponent(valeur)}` : '/communes', adresse)
	if (genre !== 'code') url.searchParams.set(genre, valeur)
	url.searchParams.set('fields', CHAMPS_DEMANDES)
	return url
}

/**
 * The referential itself, asked by `fetch`. A commune unknown by its INSEE code (404) is an empty
 * answer; any other error stops the run (`ImportRefuse`), saying why without the question.
 */
export function referentielGeoApi({
	adresse = ADRESSE_DU_REFERENTIEL,
	delaiMs = DELAI_DU_REFERENTIEL_MS,
}: {
	adresse?: string
	delaiMs?: number
} = {}): Referentiel {
	return {
		async repondre(question) {
			// A timer and an AbortController: `AbortSignal.timeout` is not kept by every path of
			// `fetch` under bun (docs/tests/http-sortant.md, « Limites »).
			const arret = new AbortController()
			const minuteur = setTimeout(() => arret.abort(), delaiMs)
			let corps: unknown
			try {
				const reponse = await fetch(adresseDeLaQuestion(adresse, question), {
					headers: { accept: 'application/json' },
					signal: arret.signal,
				})
				if (question.genre === 'code' && reponse.status === 404) return []
				if (!reponse.ok) throw indisponible(`réponse ${reponse.status}`)
				corps = await reponse.json().catch(() => undefined)
			} catch (erreur) {
				if (erreur instanceof ImportRefuse) throw erreur
				throw indisponible(arret.signal.aborted ? `pas de réponse en ${delaiMs / 1000} s` : 'réseau injoignable')
			} finally {
				clearTimeout(minuteur)
			}
			const lu = (question.genre === 'code' ? COMMUNE_DE_L_API : z.array(COMMUNE_DE_L_API)).safeParse(corps)
			if (!lu.success) throw indisponible('sa réponse n’est pas une liste de communes')
			return (Array.isArray(lu.data) ? lu.data : [lu.data]).map(communeDeLApi)
		},
	}
}

/** The kept answers, by the key of their question. */
export type ReponsesGardees = Map<string, CommuneDuReferentiel[]>

const COMMUNE_GARDEE = z
	.object({
		nom: z.string(),
		code: z.string(),
		departement: z.string().nullable(),
		codesPostaux: z.array(z.string()),
		latitude: z.number().nullable(),
		longitude: z.number().nullable(),
	})
	.strict()

const FICHIER_DES_REPONSES = z
	.object({
		version: z.literal(1),
		source: z.literal(ADRESSE_DU_REFERENTIEL),
		reponses: z.record(z.string().regex(/^(?:nom|codePostal|code):\S/), z.array(COMMUNE_GARDEE)),
	})
	.strict()

/** The kept answers read from the text of their file, or `ImportRefuse` with what is wrong. */
export function lireLesReponses(texte: string): ReponsesGardees {
	let json: unknown
	try {
		json = JSON.parse(texte)
	} catch {
		throw new ImportRefuse(
			'Le fichier des réponses du référentiel des communes n’est pas un JSON valide : rien n’est écrit.'
		)
	}
	const lu = FICHIER_DES_REPONSES.safeParse(json)
	if (!lu.success)
		throw new ImportRefuse(
			'Le fichier des réponses du référentiel des communes n’a pas la forme attendue : rien n’est écrit.'
		)
	return new Map(Object.entries(lu.data.reponses))
}

/** The kept answers as the text of their file: the questions sorted, so that two runs write the same file. */
export function reponsesEnTexte(reponses: ReponsesGardees): string {
	const triees = Object.fromEntries([...reponses.entries()].sort(([a], [b]) => a.localeCompare(b)))
	return `${JSON.stringify({ version: 1, source: ADRESSE_DU_REFERENTIEL, reponses: triees }, null, '\t')}\n`
}

/** A referential that keeps its answers, and says how many it received during the run. */
export interface ReferentielGarde extends Referentiel {
	readonly reponses: ReponsesGardees
	/** Answers received during this run, added to the kept ones. */
	nouvelles(): number
}

/**
 * The referential through its kept answers: a kept answer is read, never asked again; another
 * question goes to `referentiel` and its answer is kept. Offline (`referentiel` is `null`), such a
 * question stops the run before any write.
 */
export function referentielGarde(reponses: ReponsesGardees, referentiel: Referentiel | null): ReferentielGarde {
	let nouvelles = 0
	return {
		reponses,
		nouvelles: () => nouvelles,
		async repondre(question) {
			const cle = cleDeLaQuestion(question)
			const gardee = reponses.get(cle)
			if (gardee) return gardee
			if (!referentiel)
				throw new ImportRefuse(
					[
						'Hors ligne (--hors-ligne), une réponse du référentiel des communes n’est pas dans le fichier des réponses gardées :',
						'rien n’est écrit. Relance sans --hors-ligne pour la demander au référentiel.',
					].join(' ')
				)
			const reponse = await referentiel.repondre(question)
			reponses.set(cle, reponse)
			nouvelles++
			return reponse
		},
	}
}
