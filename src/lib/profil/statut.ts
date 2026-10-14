/**
 * Where a profile stands for the public (plan 01 §6.1; docs/migration/SCHEMA.md, §9).
 *
 * - `brouillon`: not shown. A new profile starts here, empty; the rule of ticket 044
 *   (src/lib/profil/etat.ts) moves it to `publie` as soon as it is no longer entirely empty, and
 *   back when it is again, while an admin has chosen nothing else (`statutChoisi`).
 * - `publie`: shown. The only status the public reads (U53).
 * - `masque`: hidden by an admin. No save brings it back: only an admin does.
 *
 * No API writes the status itself: the server computes it at every save. An admin chooses it
 * (`statutChoisi`); what a makeup artist sends on either field is ignored.
 */
export const STATUTS_DU_PROFIL = ['brouillon', 'publie', 'masque'] as const
export type StatutDuProfil = (typeof STATUTS_DU_PROFIL)[number]

/** The status of a new profile: nothing is public until a rule or an admin says so. */
export const STATUT_INITIAL: StatutDuProfil = 'brouillon'

/** The one status the public reads. */
export const STATUT_PUBLIE: StatutDuProfil = 'publie'

/** What the admin panel shows for each status. */
export const LIBELLES_DES_STATUTS: Record<StatutDuProfil, string> = {
	brouillon: 'Brouillon',
	publie: 'Publié',
	masque: 'Masqué',
}

/**
 * What an admin chooses for the status of a profile (ticket 044): the rule (`automatique`), or one
 * of the three statuses, which the profile then keeps whatever is saved.
 */
export const CHOIX_DU_STATUT = ['automatique', ...STATUTS_DU_PROFIL] as const
export type ChoixDuStatut = (typeof CHOIX_DU_STATUT)[number]

/** The choice of a new profile: the rule. */
export const CHOIX_INITIAL: ChoixDuStatut = 'automatique'

/** What the admin panel shows for each choice. */
export const LIBELLES_DES_CHOIX: Record<ChoixDuStatut, string> = {
	automatique: 'Automatique : brouillon si le profil est vide, publié sinon',
	brouillon: 'Toujours brouillon',
	publie: 'Toujours publié',
	masque: 'Masqué',
}
