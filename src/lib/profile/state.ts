/**
 * Where a profile stands, as the server stores it at every save (ticket 044; plan 01 §5 P3; plan
 * 02 I20; docs/migration/SCHEMA.md §9): its completeness score, whether it is active, publishable
 * or entirely empty, the date each of these three took its current value, and the status that
 * follows from them.
 *
 * The reading itself is the single rule ported from the old site, src/lib/profil/completude.ts:
 * this file only maps a document of `profiles` to the fields that rule reads (`champsDuProfil`),
 * then says what the collection stores. Nothing here computes a condition on its own.
 *
 * The status (src/lib/profil/statut.ts) follows the rule while an admin has chosen nothing else:
 * an entirely empty profile is a draft, any other is published, both ways. A status an admin
 * chose (`chosenStatus`) is never overwritten, and a hidden profile stays hidden whatever the save.
 *
 * Relative imports on purpose: the collection that calls this file is also loaded by the Payload
 * CLI, outside of Next.
 */

import { estMontantDePrix } from '../prix'
import { type ChampsDuProfil, completude, villeExploitable } from './completeness'
import {
	CHOIX_DU_STATUT,
	CHOIX_INITIAL,
	type ChoixDuStatut,
	STATUT_INITIAL,
	STATUTS_DU_PROFIL,
	type StatutDuProfil,
} from './status'

/** The networks of a profile, as the collection names them. */
interface ReseauxDuDocument {
	readonly youtube?: string | null
	readonly facebook?: string | null
	readonly instagram?: string | null
	readonly website?: string | null
	readonly linkedin?: string | null
}

/**
 * What the rule reads of a document of `profiles`, any field absent: the data of a save once the
 * access rules have run, or a stored document. A photo is an identifier or a media.
 */
export interface DocumentDuProfil {
	readonly firstName?: string | null
	readonly lastName?: string | null
	readonly artistName?: string | null
	readonly specialty?: string | null
	readonly description?: string | null
	readonly city?: { readonly name?: string | null; readonly inseeCode?: string | null } | null
	readonly mainPicture?: unknown
	readonly gallery?: readonly unknown[] | null
	readonly skills?: readonly unknown[] | null
	readonly experiences?: readonly unknown[] | null
	readonly courses?: readonly unknown[] | null
	readonly languages?: readonly unknown[] | null
	readonly serviceOffers?: readonly ({ readonly priceFrom?: number | null } | null)[] | null
	readonly networks?: ReseauxDuDocument | null
	readonly contactDetails?: { readonly phone?: string | null; readonly email?: string | null } | null
	readonly publicContact?: boolean | null
}

/**
 * The city the rule reads for a commune: its name, and only next to its INSEE code.
 *
 * Every name of the official list (14/10/2026) is a usable city for the rule as it is, but one:
 * « Pont de Montvert - Sud Mont Lozère » (48116), seven words with its spaced hyphen, over the six
 * the rule allows. A name the rule refuses is so read once more with its spaced hyphens joined, as
 * the other names of the list write them (« Pont de Montvert-Sud Mont Lozère »). A name the rule
 * reads is passed as it is; a text that is no city (« France », « Partout ») stays none.
 */
function villeDeLaCommune(commune: DocumentDuProfil['city']): string | null {
	if (!commune?.inseeCode || typeof commune.name !== 'string') return null
	return villeExploitable(commune.name) ? commune.name : commune.name.replace(/\s+-\s+/g, '-')
}

/**
 * A document of `profiles` under the names of the old site, as the single rule reads it.
 *
 * - The city is the name of the commune (ticket 041), and only a commune with its INSEE code: the
 *   server stores no other (`villeDeLaCommune`).
 * - A photo is passed as an object, never as a bare identifier, which the rule would count as no
 *   photo; the gallery as its list.
 * - The price of an offer is its amount (`priceFrom`, read from the text typed by the same
 *   rule, src/lib/prix.ts): an offer with a text and no amount (« Sur devis ») has no numeric price,
 *   as for the cards (`prixMinimal`). The options of an offer do not count, as on the old site.
 * - The phone and the email count as contact channels only when she shows them (`publicContact`):
 *   a channel nobody sees is no channel.
 */
export function champsDuProfil(document: DocumentDuProfil | null | undefined): ChampsDuProfil {
	const d = document ?? {}
	const reseaux = d.networks ?? {}
	const montres = d.publicContact === true
	return {
		first_name: d.firstName,
		last_name: d.lastName,
		speciality: d.specialty,
		company_artist_name: d.artistName,
		city: villeDeLaCommune(d.city),
		description: d.description,
		main_picture: d.mainPicture === null || d.mainPicture === undefined ? null : { id: d.mainPicture },
		image_gallery: d.gallery ?? null,
		skills: d.skills,
		experiences: d.experiences,
		courses: d.courses,
		language: d.languages,
		service_offers: (d.serviceOffers ?? []).map(offre => {
			const montant = offre?.priceFrom
			return { price: estMontantDePrix(montant) ? String(montant) : null }
		}),
		network: {
			youtube: reseaux.youtube,
			facebook: reseaux.facebook,
			instagram: reseaux.instagram,
			website: reseaux.website,
			linkedin: reseaux.linkedin,
			phone: montres ? d.contactDetails?.phone : null,
			email: montres ? d.contactDetails?.email : null,
		},
	}
}

/** What the single rule says of a profile, as the collection stores it. */
export interface EtatDuProfil {
	/** Criteria met, out of 13: the progress bar of the space */
	readonly completeness: number
	/** Main photo, usable city and speciality */
	readonly active: boolean
	/** The six conditions, and not an internal account */
	readonly publishable: boolean
	/** None of the six conditions */
	readonly fullyEmpty: boolean
}

/** The state of a profile, by the single rule (src/lib/profil/completude.ts). */
export function etatDuProfil(document: DocumentDuProfil | null | undefined): EtatDuProfil {
	const { score, actif, publiable, entierementVide } = completude(champsDuProfil(document))
	return { completeness: score, active: actif, publishable: publiable, fullyEmpty: entierementVide }
}

/** For each flag of the state, the field of the date it took its current value. */
export const DATES_DE_PASSAGE = {
	active: 'activeSince',
	publishable: 'publishableSince',
	fullyEmpty: 'fullyEmptySince',
} as const

type Drapeau = keyof typeof DATES_DE_PASSAGE
type DateDePassage = (typeof DATES_DE_PASSAGE)[Drapeau]

/** What the collection stores of the status, before or after a save. */
export interface StatutStocke {
	readonly status?: unknown
	readonly chosenStatus?: unknown
}

const estUnStatut = (statut: unknown): statut is StatutDuProfil =>
	(STATUTS_DU_PROFIL as readonly unknown[]).includes(statut)

const estUnChoix = (choix: unknown): choix is ChoixDuStatut => (CHOIX_DU_STATUT as readonly unknown[]).includes(choix)

/**
 * The choice of the status and the status, after a save.
 *
 * - An admin chooses in `chosenStatus`: `automatic` (the rule), or a status the profile keeps
 *   whatever is saved. Only a choice that differs from the stored one changes it: a save that
 *   sends the stored choice again (the admin panel sends every field, even from a form loaded
 *   before the makeup artist's last save) leaves it as it is, and the rule decides.
 * - No API writes `status`: the access rules drop it. Server code that writes it, rules lifted
 *   (the import, a seed, a test), makes it the choice when it differs from the stored status: a
 *   status no rule gave is a decision. A choice written in the same save wins over it.
 * - The status is the choice, or, while the choice is `automatic`, the rule: an entirely empty
 *   profile is a draft, any other is published.
 * - `hidden` never comes from the rule: a hidden profile stored with no choice (from before this
 *   field) stays hidden, and keeps `hidden` as its choice.
 *
 * `avant` is what was stored, nothing for a creation; `apres` is what the save holds once the
 * access rules have run. A status or a choice that is none of the known ones counts as the
 * initial one.
 */
export function statutApres({
	avant,
	apres,
	fullyEmpty,
}: {
	avant?: StatutStocke | null
	apres: StatutStocke
	fullyEmpty: boolean
}): { status: StatutDuProfil; chosenStatus: ChoixDuStatut } {
	const statutStocke = estUnStatut(avant?.status) ? avant.status : STATUT_INITIAL
	const choixStocke = estUnChoix(avant?.chosenStatus) ? avant.chosenStatus : CHOIX_INITIAL
	const choixGarde: ChoixDuStatut = statutStocke === 'hidden' && choixStocke === CHOIX_INITIAL ? 'hidden' : choixStocke
	let chosenStatus = choixGarde
	if (estUnChoix(apres.chosenStatus) && apres.chosenStatus !== choixStocke) chosenStatus = apres.chosenStatus
	else if (estUnStatut(apres.status) && apres.status !== statutStocke) chosenStatus = apres.status
	if (chosenStatus === 'automatic') return { status: fullyEmpty ? 'draft' : 'published', chosenStatus }
	return { status: chosenStatus, chosenStatus }
}

/** What the server writes on a profile at every save: the state, its dates, the status. */
export type EcritureDeLEtat = EtatDuProfil &
	Record<DateDePassage, string> & { status: StatutDuProfil; chosenStatus: ChoixDuStatut }

/**
 * What a save stores, whatever the request sent on these fields: the state by the single rule; for
 * each flag, the date it took its current value (kept while the value stays, `maintenant` when it
 * changes, and at the creation); the choice of the status and the status.
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
		activeSince: depuis('active'),
		publishableSince: depuis('publishable'),
		fullyEmptySince: depuis('fullyEmpty'),
		...statutApres({ avant, apres, fullyEmpty: etat.fullyEmpty }),
	}
}
