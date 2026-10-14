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
 * The status (src/lib/profil/statut.ts) follows the rule while an admin has chosen nothing else:
 * an entirely empty profile is a draft, any other is published, both ways. A status an admin
 * chose (`statutChoisi`) is never overwritten, and a hidden profile stays hidden whatever the save.
 *
 * Relative imports on purpose: the collection that calls this file is also loaded by the Payload
 * CLI, outside of Next.
 */

import { estMontantDePrix } from '../prix'
import { type ChampsDuProfil, completude, villeExploitable } from './completude'
import {
	CHOIX_DU_STATUT,
	CHOIX_INITIAL,
	type ChoixDuStatut,
	STATUT_INITIAL,
	STATUTS_DU_PROFIL,
	type StatutDuProfil,
} from './statut'

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
 * The city the rule reads for a commune: its name, and only next to its INSEE code.
 *
 * Every name of the official list (14/10/2026) is a usable city for the rule as it is, but one:
 * « Pont de Montvert - Sud Mont Lozère » (48116), seven words with its spaced hyphen, over the six
 * the rule allows. A name the rule refuses is so read once more with its spaced hyphens joined, as
 * the other names of the list write them (« Pont de Montvert-Sud Mont Lozère »). A name the rule
 * reads is passed as it is; a text that is no city (« France », « Partout ») stays none.
 */
function villeDeLaCommune(commune: DocumentDuProfil['commune']): string | null {
	if (!commune?.codeInsee || typeof commune.nom !== 'string') return null
	return villeExploitable(commune.nom) ? commune.nom : commune.nom.replace(/\s+-\s+/g, '-')
}

/**
 * A document of `profils` under the names of the old site, as the single rule reads it.
 *
 * - The city is the name of the commune (ticket 041), and only a commune with its INSEE code: the
 *   server stores no other (`villeDeLaCommune`).
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
		city: villeDeLaCommune(d.commune),
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
	readonly statutChoisi?: unknown
}

const estUnStatut = (statut: unknown): statut is StatutDuProfil =>
	(STATUTS_DU_PROFIL as readonly unknown[]).includes(statut)

const estUnChoix = (choix: unknown): choix is ChoixDuStatut => (CHOIX_DU_STATUT as readonly unknown[]).includes(choix)

/**
 * The choice of the status and the status, after a save.
 *
 * - An admin chooses in `statutChoisi`: `automatique` (the rule), or a status the profile keeps
 *   whatever is saved. Only a choice that differs from the stored one changes it: a save that
 *   sends the stored choice again (the admin panel sends every field, even from a form loaded
 *   before the makeup artist's last save) leaves it as it is, and the rule decides.
 * - No API writes `statut`: the access rules drop it. Server code that writes it, rules lifted
 *   (the import, a seed, a test), makes it the choice when it differs from the stored status: a
 *   status no rule gave is a decision. A choice written in the same save wins over it.
 * - The status is the choice, or, while the choice is `automatique`, the rule: an entirely empty
 *   profile is a draft, any other is published.
 * - `masque` never comes from the rule: a hidden profile stored with no choice (from before this
 *   field) stays hidden, and keeps `masque` as its choice.
 *
 * `avant` is what was stored, nothing for a creation; `apres` is what the save holds once the
 * access rules have run. A status or a choice that is none of the known ones counts as the
 * initial one.
 */
export function statutApres({
	avant,
	apres,
	entierementVide,
}: {
	avant?: StatutStocke | null
	apres: StatutStocke
	entierementVide: boolean
}): { statut: StatutDuProfil; statutChoisi: ChoixDuStatut } {
	const statutStocke = estUnStatut(avant?.statut) ? avant.statut : STATUT_INITIAL
	const choixStocke = estUnChoix(avant?.statutChoisi) ? avant.statutChoisi : CHOIX_INITIAL
	const choixGarde: ChoixDuStatut = statutStocke === 'masque' && choixStocke === CHOIX_INITIAL ? 'masque' : choixStocke
	let statutChoisi = choixGarde
	if (estUnChoix(apres.statutChoisi) && apres.statutChoisi !== choixStocke) statutChoisi = apres.statutChoisi
	else if (estUnStatut(apres.statut) && apres.statut !== statutStocke) statutChoisi = apres.statut
	if (statutChoisi === 'automatique') return { statut: entierementVide ? 'brouillon' : 'publie', statutChoisi }
	return { statut: statutChoisi, statutChoisi }
}

/** What the server writes on a profile at every save: the state, its dates, the status. */
export type EcritureDeLEtat = EtatDuProfil &
	Record<DateDePassage, string> & { statut: StatutDuProfil; statutChoisi: ChoixDuStatut }

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
		actifDepuis: depuis('actif'),
		publiableDepuis: depuis('publiable'),
		entierementVideDepuis: depuis('entierementVide'),
		...statutApres({ avant, apres, entierementVide: etat.entierementVide }),
	}
}
