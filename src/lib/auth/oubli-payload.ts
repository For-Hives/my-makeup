import { APIError, type CollectionBeforeOperationHook } from 'payload'

/**
 * The hooks and flags of `pros` for the forgotten password (tickets 085 and 086).
 *
 * - The native REST doors of Payload, `POST /api/pros/forgot-password` and `/reset-password`, are
 *   closed: they would go around the brake of the client address and the floor of time that the
 *   site's own request has (`demanderUnLien`). 403 and the same sentence for everyone, whatever the
 *   address. The Local API, which the Server Actions use, has no `payloadAPI` of `REST`.
 * - `CONTEXTE_DE_REINITIALISATION` marks the transaction of the reset: the reset is no sign-in, and
 *   the date of the last sign-in is left alone.
 */

export const CONTEXTE_DE_REINITIALISATION = 'reinitialisationDuMotDePasse'

export const fermerLesPortesRestDeLOubli: CollectionBeforeOperationHook = ({ operation, req }) => {
	if (req.payloadAPI !== 'REST') return
	if (operation === 'forgotPassword' || operation === 'resetPassword')
		throw new APIError('Cette opération passe par les pages du site.', 403, null, true)
}
