/**
 * The closed lists of a contact message (tickets 158 and 159), shared by the collection `demandes`
 * and the server code that writes it. Pure.
 *
 * `statut` follows the message: `nouvelle` when it is stored, `transmise` once the mail to the team
 * has left. The other states of plan 01 (answered, spam) arrive with the admin screens (ticket 163).
 * `etatMail` says where the mail stands, apart from the message: `en-attente` while it is sent,
 * `envoye`, or `echec` when the relay did not take it (the message stays, an admin can see it).
 */

export const TYPES_DE_DEMANDE = ['contact'] as const
export type TypeDeDemande = (typeof TYPES_DE_DEMANDE)[number]

export const STATUTS_DE_DEMANDE = ['nouvelle', 'transmise'] as const
export type StatutDeDemande = (typeof STATUTS_DE_DEMANDE)[number]

export const ETATS_DU_MAIL = ['en-attente', 'envoye', 'echec'] as const
export type EtatDuMail = (typeof ETATS_DU_MAIL)[number]
