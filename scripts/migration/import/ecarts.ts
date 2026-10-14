/**
 * Where each transformation of the import is written, so that every difference between the source
 * and the target reads against a rule (docs/migration/IMPORT.md, « Le rapport »):
 *
 * - a key of the register of intended changes (docs/migration/CHANGEMENTS-VOULUS.md), for what a
 *   page or a makeup artist can notice;
 * - a section of the frozen schema (docs/migration/SCHEMA.md), for a rule that changes no page.
 *
 * tests/unit/import-comptes.test.ts checks that each one exists in its document.
 */
export const REFERENCES = {
	/** The login: edge spaces removed, lower case (SCHEMA.md §1 and §5.1). */
	emailEnMinuscules: 'SCHEMA.md §5.1 (email)',
	/** A password of the old site that is not a complete bcrypt hash gives no legacy hash (§5.1). */
	hashIncomplet: 'SCHEMA.md §5.1 (password)',
	/** Every taken account is confirmed, as the accounts of the old site are. */
	compteConfirme: 'confirmation-email',
	/** The slug of a profile: the rule of the old site, computed from its username, then stored. */
	slugStocke: 'slug-stocke',
	/** A profile entirely empty at the source is a draft. */
	profilVideEnBrouillon: 'profils-vides-brouillon',
	/** The city typed becomes a commune of the official list, never an address; the text is not copied. */
	villeEnCommune: 'ville-en-commune',
	/** An availability never set (`null`) is « available ». */
	disponibiliteParDefaut: 'disponibilite-par-defaut',
	/** The 13 empty profiles left without an account by the spam of 10/10/2026 are not taken. */
	profilsDuSpam: 'profils-spam-non-repris',
	/** The size of an adopted file is the one of its object in the storage, in bytes, not the rounded one of Strapi (§8). */
	tailleEnOctets: 'SCHEMA.md §8 (size)',
	/** A designated file that is not an image is not adopted: its profile or its article loses it. */
	fichiersNonImages: 'fichiers-non-images-non-repris',
} as const

export type Reference = (typeof REFERENCES)[keyof typeof REFERENCES]
