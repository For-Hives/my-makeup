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
import { aLesCaracteresDUnNom, departementDuCodeInsee, ressembleAUneAdresse } from '../profil/zone'
import { libelleDeLaCommune, RECHERCHE_MAX, RECHERCHE_MIN } from './localisation'

/** The public address of the list. */
export const ADRESSE_DES_COMMUNES = 'https://geo.api.gouv.fr'

/** How long a question waits for its answer. */
export const DELAI_DES_COMMUNES_MS = 5000

/** How many communes the search proposes at most. */
export const PROPOSITIONS_MAX = 8

/** A commune as the list gives it: public reference data. */
export interface CommuneOfficielle {
	readonly nom: string
	readonly codeInsee: string
	readonly departement: string | null
	readonly latitude: number | null
	readonly longitude: number | null
}

const CHAMPS_DEMANDES = 'nom,code,codeDepartement,centre'

const COMMUNE_DE_L_API = z.object({
	nom: z.string().min(1),
	code: z.string().min(1),
	codeDepartement: z.string().optional(),
	centre: z.object({ coordinates: z.tuple([z.number(), z.number()]) }).optional(),
})

function communeOfficielle(ligne: z.infer<typeof COMMUNE_DE_L_API>): CommuneOfficielle | null {
	const departement = departementDuCodeInsee(ligne.code)
	// A code the collection would refuse is not a commune we can store.
	if (departement === null) return null
	const [longitude, latitude] = ligne.centre?.coordinates ?? [null, null]
	return { nom: ligne.nom, codeInsee: ligne.code, departement, latitude, longitude }
}

type Reponse = { genre: 'ok'; corps: unknown } | { genre: 'inconnue' } | { genre: 'panne' }

/** One question to the list: its JSON, an unknown code (404), or a failure of any kind. */
async function demander(chemin: string, parametres: Record<string, string>): Promise<Reponse> {
	const adresse = new URL(chemin, ADRESSE_DES_COMMUNES)
	for (const [cle, valeur] of Object.entries(parametres)) adresse.searchParams.set(cle, valeur)
	const arret = new AbortController()
	const minuteur = setTimeout(() => arret.abort(), DELAI_DES_COMMUNES_MS)
	try {
		const reponse = await fetch(adresse, { headers: { accept: 'application/json' }, signal: arret.signal })
		// The body of a 404 is a plain text: the status is read before anything is parsed.
		if (reponse.status === 404) return { genre: 'inconnue' }
		if (reponse.status !== 200) return { genre: 'panne' }
		return { genre: 'ok', corps: await reponse.json() }
	} catch {
		return { genre: 'panne' }
	} finally {
		clearTimeout(minuteur)
	}
}

/** The text typed as the list is asked it: spaces folded, or why there is nothing to ask. */
export function questionDeLaRecherche(
	texte: string
): { genre: 'nom' | 'codePostal'; valeur: string } | { genre: 'rien'; motif: 'adresse' | 'trop-court' } {
	const propre = texte.trim().replace(/\s+/g, ' ')
	if (/^\d{5}$/.test(propre)) return { genre: 'codePostal', valeur: propre }
	if (propre.length < RECHERCHE_MIN) return { genre: 'rien', motif: 'trop-court' }
	if (propre.length > RECHERCHE_MAX || ressembleAUneAdresse(propre) || !aLesCaracteresDUnNom(propre))
		return { genre: 'rien', motif: 'adresse' }
	return { genre: 'nom', valeur: propre }
}

export type RechercheDesCommunes =
	| { genre: 'communes'; communes: CommuneOfficielle[] }
	| { genre: 'rien'; motif: 'adresse' | 'trop-court' }
	| { genre: 'panne' }

/** The communes that answer a text typed: by name, or by postal code when it is five digits. */
export async function chercherDesCommunes(texte: string): Promise<RechercheDesCommunes> {
	const question = questionDeLaRecherche(texte)
	if (question.genre === 'rien') return question
	const reponse = await demander('/communes', {
		[question.genre]: question.valeur,
		fields: CHAMPS_DEMANDES,
		boost: 'population',
		limit: String(PROPOSITIONS_MAX),
	})
	if (reponse.genre !== 'ok') return { genre: 'panne' }
	const lues = z.array(COMMUNE_DE_L_API).safeParse(reponse.corps)
	if (!lues.success) return { genre: 'panne' }
	const vues = new Set<string>()
	const communes: CommuneOfficielle[] = []
	for (const ligne of lues.data) {
		const commune = communeOfficielle(ligne)
		if (commune === null || vues.has(commune.codeInsee)) continue
		vues.add(commune.codeInsee)
		communes.push(commune)
	}
	return { genre: 'communes', communes: communes.slice(0, PROPOSITIONS_MAX) }
}

export type CommuneDuCode =
	| { genre: 'commune'; commune: CommuneOfficielle }
	| { genre: 'inconnue' }
	| { genre: 'panne' }

/** The commune of an INSEE code, as the list holds it: its name, its département and its centre. */
export async function communeDuCode(codeInsee: string): Promise<CommuneDuCode> {
	// The code goes in the path: only a well formed one is asked.
	if (departementDuCodeInsee(codeInsee) === null) return { genre: 'inconnue' }
	const reponse = await demander(`/communes/${encodeURIComponent(codeInsee)}`, { fields: CHAMPS_DEMANDES })
	if (reponse.genre !== 'ok') return reponse
	const lue = COMMUNE_DE_L_API.safeParse(reponse.corps)
	if (!lue.success) return { genre: 'panne' }
	const commune = communeOfficielle(lue.data)
	// The list answered for another code than the one asked: nothing is stored from it.
	return commune === null || commune.codeInsee !== codeInsee ? { genre: 'panne' } : { genre: 'commune', commune }
}

/** A commune as the panel proposes it. */
export const proposition = (commune: CommuneOfficielle): { codeInsee: string; libelle: string } => ({
	codeInsee: commune.codeInsee,
	libelle: libelleDeLaCommune(commune),
})
