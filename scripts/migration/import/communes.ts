/**
 * The city typed in a profile of the old site becomes a commune of the official list, with its
 * INSEE code (plan 01 §6.2 « Ville »; plan 03 SEO-24; docs/migration/SCHEMA.md §5.2; register,
 * `ville-en-commune`). All of France: the referential is geo.api.gouv.fr (./referentiel.ts).
 *
 * - The text typed is never copied into the profile: only the commune of the referential, its name,
 *   INSEE code, département and centre (rounded to about 1 km by the collection).
 * - The text is read by the rule of the old site that publishes a city (src/lib/profil/lieu-public.ts):
 *   the commune of « 74000 Annecy », of « Toulouse (31) », and of a postal address, never its street.
 *   A postal address is never imported: its commune is, and the profile is listed (`adresses`).
 * - The import asks the referential for the communes of that name and of the postal code typed,
 *   never for a street. A name that the referential gives once (in the département or with the
 *   postal code typed, when there is one) is the commune; a postal code alone that one commune
 *   holds too. A text that names several communes (« Saint-Julien »), none, or that is no commune at
 *   all (« France », « Paris, Lyon et Annecy ») leaves the zone empty, and the profile « à revoir »:
 *   it goes to the private list of review, with the communes it could be.
 * - A line of the table of decisions settles a profile « à revoir » (`communes`): the commune of its
 *   INSEE code, or none. A line that names a profile not « à revoir » is without effect.
 */

import { villeExploitable } from '../../../src/lib/profil/completude'
import { lieuPublic } from '../../../src/lib/profil/lieu-public'
import {
	aLesCaracteresDUnNom,
	coordonneeArrondie,
	departementDuCodeInsee,
	NOM_DE_COMMUNE_MAX,
	ressembleAUneAdresse,
} from '../../../src/lib/profil/zone'
import { ImportRefuse } from './cible'
import type { CommuneDuReferentiel, Referentiel } from './referentiel'

/** The commune a profile must hold, as the collection stores it (`profils.commune`). */
export interface CommuneAttendue {
	nom: string
	codeInsee: string
	departement: string | null
	latitude: number | null
	longitude: number | null
}

/** What the import looks for in a city typed: a name, a postal code, a département. Never a street. */
export interface Recherche {
	/** The name of commune asked, in lower case, « St » written « saint ». */
	nom: string | null
	codePostal: string | null
	departement: string | null
	/** The text was read as a postal address. */
	adresse: boolean
}

/** Why a city is « à revoir ». */
export type MotifARevoir = 'homonymes' | 'introuvable' | 'pas-une-commune'

/** What a city typed gives. */
export type Resolution =
	| { genre: 'vide' }
	| { genre: 'commune'; commune: CommuneDuReferentiel; adresse: boolean }
	| {
			genre: 'a-revoir'
			motif: MotifARevoir
			candidats: CommuneDuReferentiel[]
			adresse: boolean
			recherche: Recherche
	  }

/** The words of a name that many people abbreviate: « St Julien », « Ste-Foy ». */
const SAINTS: Readonly<Record<string, string>> = { st: 'saint', 'st.': 'saint', ste: 'sainte', 'ste.': 'sainte' }

/** « Paris 16e », « Lyon 3ème arrondissement »: the commune is the city. */
const ARRONDISSEMENT = /\s+\d{1,2}\s*(?:er|e|eme|ème)(?:\s+arr(?:ondissement|\.)?)?$/i

/** A name with its abbreviated « Saint » written out: « St Julien » → « saint Julien ». */
const sansAbreviation = (nom: string): string =>
	nom
		.split(/(\s+|-)/)
		.map(mot => SAINTS[mot.toLowerCase()] ?? mot)
		.join('')

/** A name as it is compared with the referential's: no accent, no case, hyphens and apostrophes as spaces. */
export function nomCompare(nom: string): string {
	return sansAbreviation(nom)
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/œ/gi, 'oe')
		.replace(/æ/gi, 'ae')
		.toLowerCase()
		.replace(/[\s'’-]+/g, ' ')
		.trim()
}

/** The last postal code of a text: five digits alone. */
const CODE_POSTAL = /(?<!\d)\d{5}(?!\d)/g

/**
 * What the import looks for in a city typed, or `null` for an empty city. The name is the commune
 * the old site would publish (src/lib/profil/lieu-public.ts), and only when it can be the name of a
 * commune: letters, no more than six words, nothing that looks like an address, a list or a
 * sentence. A city that is not one for the old site (« France », « 74 ») gives no name.
 */
export function rechercheDeLaVille(ville: string | null): Recherche | null {
	const texte = ville?.trim() ?? ''
	if (texte === '') return null
	const lieu = lieuPublic(texte)
	const codePostal = [...texte.matchAll(CODE_POSTAL)].at(-1)?.[0] ?? null
	const nom = sansAbreviation(lieu.commune.replace(ARRONDISSEMENT, '')).replace(/\s+/g, ' ').trim()
	const cherchable =
		villeExploitable(texte) &&
		/\p{L}/u.test(nom) &&
		nom.length <= NOM_DE_COMMUNE_MAX &&
		nom.split(' ').length <= 6 &&
		aLesCaracteresDUnNom(nom) &&
		!ressembleAUneAdresse(nom)
	return {
		nom: cherchable ? nom.toLowerCase() : null,
		codePostal,
		departement: lieu.departement,
		adresse: lieu.adresse,
	}
}

const unique = (communes: readonly CommuneDuReferentiel[]): CommuneDuReferentiel[] =>
	communes.filter((commune, rang) => communes.findIndex(({ code }) => code === commune.code) === rang)

/** How many communes the review shows for a name the referential does not give as it is. */
const SUGGESTIONS = 5

/**
 * What a city typed gives, asking the referential for the communes of its name and of its postal
 * code (see the top of this file).
 */
export async function resoudreLaVille(ville: string | null, referentiel: Referentiel): Promise<Resolution> {
	const recherche = rechercheDeLaVille(ville)
	if (!recherche) return { genre: 'vide' }
	const { nom, codePostal, departement, adresse } = recherche
	const aRevoir = (motif: MotifARevoir, candidats: CommuneDuReferentiel[]): Resolution => ({
		genre: 'a-revoir',
		motif,
		candidats: unique(candidats),
		adresse,
		recherche,
	})
	const commune = (trouvee: CommuneDuReferentiel): Resolution => ({ genre: 'commune', commune: trouvee, adresse })

	const reponseDuNom = nom ? await referentiel.repondre({ genre: 'nom', valeur: nom }) : []
	const duNom = nom ? reponseDuNom.filter(c => nomCompare(c.nom) === nomCompare(nom)) : []
	const duCode = codePostal ? await referentiel.repondre({ genre: 'codePostal', valeur: codePostal }) : []

	if (!nom && !codePostal) return aRevoir('pas-une-commune', [])
	if (codePostal && !nom) {
		const [seule] = duCode
		if (seule && duCode.length === 1) return commune(seule)
		return aRevoir(duCode.length > 1 ? 'homonymes' : 'introuvable', duCode)
	}
	if (codePostal) {
		const croisees = duNom.filter(c => duCode.some(({ code }) => code === c.code))
		const [seule] = croisees
		if (seule && croisees.length === 1) return commune(seule)
		if (croisees.length > 1) return aRevoir('homonymes', croisees)
		// The name is no commune of today (a former commune, merged since), and one commune holds the postal code.
		const [duCodeSeule] = duCode
		if (duNom.length === 0 && duCodeSeule && duCode.length === 1) return commune(duCodeSeule)
		return aRevoir('introuvable', [...duNom, ...duCode, ...reponseDuNom.slice(0, SUGGESTIONS)])
	}
	const retenues = departement ? duNom.filter(c => c.departement === departement) : duNom
	const [seule] = retenues
	if (seule && retenues.length === 1) return commune(seule)
	if (retenues.length > 1) return aRevoir('homonymes', retenues)
	return aRevoir('introuvable', [...duNom, ...reponseDuNom.slice(0, SUGGESTIONS)])
}

/** The commune of the referential as the profile stores it: the centre rounded to about 1 km. */
export function communeAttendue(commune: CommuneDuReferentiel): CommuneAttendue {
	const arrondie = (valeur: number | null): number | null =>
		valeur === null ? null : (coordonneeArrondie(valeur) as number)
	return {
		nom: commune.nom,
		codeInsee: commune.code,
		departement: departementDuCodeInsee(commune.code),
		latitude: arrondie(commune.latitude),
		longitude: arrondie(commune.longitude),
	}
}

/** A profile « à revoir », as the private list of review gives it: never the text typed. */
export interface CasARevoir {
	profil: number
	motif: MotifARevoir
	/** The text was read as a postal address: its street was never asked nor kept. */
	adresse: boolean
	/** What the import asked the referential. */
	recherche: Recherche
	/** The communes it could be, from the referential. */
	candidats: Pick<CommuneDuReferentiel, 'nom' | 'code' | 'departement' | 'codesPostaux'>[]
}

/** A line of the table of decisions for a profile « à revoir »: the commune of this INSEE code, or none. */
export interface DecisionDeCommune {
	profil: number
	codeInsee: string | null
}

/** What the communes of a run give, in numbers and identifiers. */
export interface BilanDesCommunes {
	/** Profiles taken whose city is not empty at the source. */
	villesRenseignees: number
	/** Among them, the profiles that hold a commune. */
	rattachees: number
	/** `rattachees` out of `villesRenseignees`, in percent, to one decimal (plan 03 SEO-24; target 90 %). */
	part: number | null
	/** Profiles taken that are not entirely empty at the source. */
	profilsNonVides: number
	/** Among them, the profiles that hold a commune. */
	profilsNonVidesAvecCommune: number
	/** Profiles « à revoir », by identifier: their zone stays empty. */
	aRevoir: number[]
	/** Profiles whose city was a postal address: its commune is taken, never its street. */
	adresses: number[]
	/** Profiles « à revoir » settled by a line of the table of decisions. */
	decidees: number[]
}

export interface CommunesDesProfils {
	/** For each profile taken, its commune, or `null`. */
	communes: Map<number, CommuneAttendue | null>
	/** The private list of review: the profiles « à revoir », with what was asked and the communes they could be. */
	revue: CasARevoir[]
	bilan: BilanDesCommunes
	/** Lines of the table that name no profile « à revoir »: without effect. */
	sansObjet: number
}

/**
 * The commune of each profile taken, asked to the referential, and the lines of the table of
 * decisions applied to the profiles « à revoir ». A line that gives an INSEE code the referential
 * does not know stops the run before any write (`ImportRefuse`).
 */
export async function communesDesProfils(
	profils: readonly { id: number; city: string | null; videALaSource: boolean }[],
	referentiel: Referentiel,
	decisions: readonly DecisionDeCommune[] = []
): Promise<CommunesDesProfils> {
	const communes = new Map<number, CommuneAttendue | null>()
	const aRevoir = new Map<number, Extract<Resolution, { genre: 'a-revoir' }>>()
	const adresses: number[] = []
	for (const { id, city } of [...profils].sort((a, b) => a.id - b.id)) {
		const resolution = await resoudreLaVille(city, referentiel)
		if (resolution.genre !== 'vide' && resolution.adresse) adresses.push(id)
		if (resolution.genre === 'a-revoir') aRevoir.set(id, resolution)
		communes.set(id, resolution.genre === 'commune' ? communeAttendue(resolution.commune) : null)
	}

	const decidees: number[] = []
	let sansObjet = 0
	for (const { profil, codeInsee } of decisions) {
		const cas = aRevoir.get(profil)
		if (!cas) {
			sansObjet++
			continue
		}
		let choisie: CommuneDuReferentiel | undefined
		if (codeInsee !== null) {
			choisie =
				cas.candidats.find(({ code }) => code === codeInsee) ??
				(await referentiel.repondre({ genre: 'code', valeur: codeInsee }))[0]
			if (!choisie)
				throw new ImportRefuse(
					`La table de décision donne au profil ${profil} une commune que le référentiel ne connaît pas (code INSEE ${codeInsee}) : rien n’est écrit.`
				)
		}
		communes.set(profil, choisie ? communeAttendue(choisie) : null)
		aRevoir.delete(profil)
		decidees.push(profil)
	}

	const renseignees = profils.filter(({ city }) => (city?.trim() ?? '') !== '')
	const rattachees = renseignees.filter(({ id }) => communes.get(id)).length
	const nonVides = profils.filter(({ videALaSource }) => !videALaSource)
	return {
		communes,
		revue: [...aRevoir.entries()].map(([profil, { motif, adresse, recherche, candidats }]) => ({
			profil,
			motif,
			adresse,
			recherche,
			candidats: candidats.map(({ nom, code, departement, codesPostaux }) => ({
				nom,
				code,
				departement,
				codesPostaux,
			})),
		})),
		bilan: {
			villesRenseignees: renseignees.length,
			rattachees,
			part: renseignees.length === 0 ? null : Math.round((rattachees / renseignees.length) * 1000) / 10,
			profilsNonVides: nonVides.length,
			profilsNonVidesAvecCommune: nonVides.filter(({ id }) => communes.get(id)).length,
			aRevoir: [...aRevoir.keys()],
			adresses,
			decidees: decidees.sort((a, b) => a - b),
		},
		sansObjet,
	}
}
