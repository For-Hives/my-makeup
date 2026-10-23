import { APIError, type CollectionBeforeOperationHook } from 'payload'
import { log } from './auth-log'

/**
 * The hooks and flags of `pros` for the forgotten password (tickets 085 and 086).
 *
 * - The native REST doors of Payload, `POST /api/pros/forgot-password` and `/reset-password`, are
 *   closed: they would go around the brake of the client address and the floor of time that the
 *   site's own request has (`requestPasswordLink`). 403 and the same sentence for everyone, whatever the
 *   address. The Local API, which the Server Actions use, has no `payloadAPI` of `REST`.
 * - `PASSWORD_RESET_CONTEXT` marks the transaction of the reset: the reset is no sign-in, and
 *   the date of the last sign-in is left alone.
 */

export const PASSWORD_RESET_CONTEXT = 'reinitialisationDuMotDePasse'

export const closeForgotPasswordRestDoors: CollectionBeforeOperationHook = ({ operation, req }) => {
	if (req.payloadAPI !== 'REST') return
	if (operation === 'forgotPassword' || operation === 'resetPassword')
		throw new APIError('Cette opération passe par les pages du site.', 403, null, true)
}

/**
 * The same closing for `admins` (ticket 272), plus one row of the journal for each refused request.
 * The row holds a kind and a code only, never the address (the journal has no field for it), so
 * a script that knocks leaves a trace without leaving an email.
 */
export const closeAdminForgotPasswordRestDoors: CollectionBeforeOperationHook = async ({ operation, req }) => {
	if (req.payloadAPI !== 'REST') return
	if (operation !== 'forgotPassword' && operation !== 'resetPassword') return
	await log(req.payload, {
		type: operation === 'forgotPassword' ? 'forgot-password' : 'password-reset',
		code: 'inconnu',
	})
	throw new APIError('Cette opération n’est pas ouverte pour les comptes admin.', 403, null, true)
}
