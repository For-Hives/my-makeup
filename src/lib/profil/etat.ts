/**
 * Where a profile stands, as the server stores it at every save (ticket 044; plan 01 §5 P3; plan
 * 02 I20; docs/migration/SCHEMA.md §9): its completeness score, whether it is active, publishable
 * or entirely empty, the date each of these three took its current value, and the status that
 * follows from them.
 *
 * The reading itself is the single rule ported from the old site, src/lib/profil/completude.ts:
 * this file only maps a document of `profils` to the fields that rule reads (`champsDuProfil`),
 * then says what the collection stores. Nothing here computes a condition on its own.
 *
 * The status (src/lib/profil/statut.ts) follows the rule while nobody fixed it: an entirely empty
 * profile is a draft, any other is published, both ways. A status an admin set is never
 * overwritten (`statutFixe`), and a hidden profile stays hidden whatever the save.
 *
 * Relative imports on purpose: the collection that calls this file is also loaded by the Payload
 * CLI, outside of Next.
 */

import { estMontantDePrix } from '../prix'
import { type ChampsDuProfil, completude } from './completude'
import { STATUT_INITIAL, STATUTS_DU_PROFIL, type StatutDuProfil } from './statut'

/** The networks of a profile, as the collection names them. */
interface ReseauxDuDocument {
	readonly youtube?: string | null
	readonly facebook?: string | null
	readonly instagram?: string | null
	readonly siteWeb?: string | null
	readonly linkedin?: string | null
}

/**
 * What the rule reads of a document of `profils`, any field absent: the data of a save once the
 * access rules have run, or a stored document. A photo is an identifier or a media.
 */
export interface DocumentDuProfil {
	readonly prenom?: string | null
	readonly nom?: string | null
	readonly nomArtiste?: string | null
	readonly specialite?: string | null
	readonly description?: string | null
	readonly commune?: { readonly nom?: string | null; readonly codeInsee?: string | null } | null
	readonly photoPrincipale?: unknown
	readonly galerie?: readonly unknown[] | null
	readonly competences?: readonly unknown[] | null
	readonly experiences?: readonly unknown[] | null
	readonly formations?: readonly unknown[] | null
	readonly langues?: readonly unknown[] | null
	readonly prestations?: readonly ({ readonly prixAPartirDe?: number | null } | null)[] | null
	readonly reseaux?: ReseauxDuDocument | null
	readonly coordonnees?: { readonly telephone?: string | null; readonly email?: string | null } | null
	readonly contactPublic?: boolean | null
}

/**
 * A document of `profils` under the names of the old site, as the single rule reads it.
 *
 * - The city is the name of the commune (ticket 041), and only a commune with its INSEE code: the
 *   server stores no other.
 * - A photo is passed as an object, never as a bare identifier, which the rule would count as no
 *   photo; the gallery as its list.
 * - The price of an offer is its amount (`prixAPartirDe`, read from the text typed by the same
 *   rule, src/lib/prix.ts): an offer with a text and no amount (« Sur devis ») has no numeric price,
 *   as for the cards (`prixMinimal`). The options of an offer do not count, as on the old site.
 * - The phone and the email count as contact channels only when she shows them (`contactPublic`):
 *   a channel nobody sees is no channel.
 */
export function champsDuProfil(document: DocumentDuProfil | null | undefined): ChampsDuProfil {
	const d = document ?? {}
	const reseaux = d.reseaux ?? {}
	const montres = d.contactPublic === true
	return {
		first_name: d.prenom,
		last_name: d.nom,
		speciality: d.specialite,
		company_artist_name: d.nomArtiste,
		city: d.commune?.codeInsee ? d.commune.nom : null,
		description: d.description,
		main_picture: d.photoPrincipale === null || d.photoPrincipale === undefined ? null : { id: d.photoPrincipale },
		image_gallery: d.galerie ?? null,
		skills: d.competences,
		experiences: d.experiences,
		courses: d.formations,
		language: d.langues,
		service_offers: (d.prestations ?? []).map(prestation => {
			const montant = prestation?.prixAPartirDe
			return { price: estMontantDePrix(montant) ? String(montant) : null }
		}),
		network: {
			youtube: reseaux.youtube,
			facebook: reseaux.facebook,
			instagram: reseaux.instagram,
			website: reseaux.siteWeb,
			linkedin: reseaux.linkedin,
			phone: montres ? d.coordonnees?.telephone : null,
			email: montres ? d.coordonnees?.email : null,
		},
	}
}

/** What the single rule says of a profile, as the collection stores it. */
export interface EtatDuProfil {
	/** Criteria met, out of 13: the progress bar of the space */
	readonly completude: number
	/** Main photo, usable city and speciality */
	readonly actif: boolean
	/** The six conditions, and not an internal account */
	readonly publiable: boolean
	/** None of the six conditions */
	readonly entierementVide: boolean
}

/** The state of a profile, by the single rule (src/lib/profil/completude.ts). */
export function etatDuProfil(document: DocumentDuProfil | null | undefined): EtatDuProfil {
	const { score, actif, publiable, entierementVide } = completude(champsDuProfil(document))
	return { completude: score, actif, publiable, entierementVide }
}

/** For each flag of the state, the field of the date it took its current value. */
export const DATES_DE_PASSAGE = {
	actif: 'actifDepuis',
	publiable: 'publiableDepuis',
	entierementVide: 'entierementVideDepuis',
} as const

type Drapeau = keyof typeof DATES_DE_PASSAGE
type DateDePassage = (typeof DATES_DE_PASSAGE)[Drapeau]

/** What the collection stores of the status, before or after a save. */
export interface StatutStocke {
	readonly statut?: unknown
	readonly statutFixe?: unknown
}

const estUnStatut = (statut: unknown): statut is StatutDuProfil =>
	(STATUTS_DU_PROFIL as readonly unknown[]).includes(statut)

/**
 * The status after a save.
 *
 * - `masque` is never changed by the rule: only an admin hides and shows a profile again.
 * - A status that changes in a save was set by an admin (or by the server writing it), since a
 *   makeup artist cannot write it: it becomes fixed (`statutFixe`), and the rule no longer moves
 *   it. A creation that gives another status than the initial draft fixes it too.
 * - An admin hands the status back to the rule by unticking `statutFixe`, in a save that leaves
 *   the status as it is: the rule applies at once.
 * - Otherwise the rule: an entirely empty profile is a draft, any other is published.
 *
 * `avant` is what was stored, nothing for a creation; `apres` is what the save holds once the
 * access rules have run. A status that is none of the three counts as the initial draft.
 */
export function statutApres({
	avant,
	apres,
	entierementVide,
}: {
	avant?: StatutStocke | null
	apres: StatutStocke
	entierementVide: boolean
}): { statut: StatutDuProfil; statutFixe: boolean } {
	const stocke = avant?.statut
	const precedent = estUnStatut(stocke) ? stocke : STATUT_INITIAL
	// A save that holds no status keeps the stored one.
	const statut = estUnStatut(apres.statut) ? apres.statut : precedent
	const statutFixe = apres.statutFixe === true || statut !== precedent
	if (statut === 'masque' || statutFixe) return { statut, statutFixe }
	return { statut: entierementVide ? 'brouillon' : 'publie', statutFixe }
}

/** What the server writes on a profile at every save: the state, its dates, the status. */
export type EcritureDeLEtat = EtatDuProfil &
	Record<DateDePassage, string> & { statut: StatutDuProfil; statutFixe: boolean }

/**
 * What a save stores, whatever the request sent on these fields: the state by the single rule; for
 * each flag, the date it took its current value (kept while the value stays, `maintenant` when it
 * changes, and at the creation); the status.
 *
 * `avant` is the stored document, nothing for a creation; `apres` is the document the save holds
 * once the access rules have run.
 */
export function etatApresSauvegarde({
	avant,
	apres,
	maintenant,
}: {
	avant?: Readonly<Partial<Record<Drapeau | DateDePassage, unknown>>> & StatutStocke
	apres: DocumentDuProfil & StatutStocke
	maintenant: Date
}): EcritureDeLEtat {
	const etat = etatDuProfil(apres)
	const depuis = (drapeau: Drapeau): string => {
		const date = avant?.[DATES_DE_PASSAGE[drapeau]]
		const garde = avant?.[drapeau] === etat[drapeau] && (typeof date === 'string' || date instanceof Date)
		return garde ? new Date(date).toISOString() : maintenant.toISOString()
	}
	return {
		...etat,
		actifDepuis: depuis('actif'),
		publiableDepuis: depuis('publiable'),
		entierementVideDepuis: depuis('entierementVide'),
		...statutApres({ avant, apres, entierementVide: etat.entierementVide }),
	}
}
