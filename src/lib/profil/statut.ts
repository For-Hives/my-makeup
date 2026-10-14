/**
 * Where a profile stands for the public (plan 01 §6.1; docs/migration/SCHEMA.md, §9).
 *
 * - `brouillon`: not shown. A new profile starts here, empty; the rule of ticket 044
 *   (src/lib/profil/etat.ts) moves it to `publie` as soon as it is no longer entirely empty, and
 *   back when it is again, unless an admin fixed the status (`statutFixe`).
 * - `publie`: shown. The only status the public reads (U53).
 * - `masque`: hidden by an admin. No save brings it back: only an admin does.
 *
 * Only an admin writes it through an API: what a makeup artist sends is ignored.
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
