import { type Endpoint, Forbidden } from 'payload'
import { estAdmin, identifiantPossible } from '../acces'
import { deleteAccountAndDependents } from './deletion'

/**
 * `DELETE /api/pros/:id`: the admin deletes the account of a makeup artist, a fake one for example
 * (ticket 167; plan 01 AUTH-13; plan 02 I37, E57). A collection's own routes come before Payload's,
 * so this one answers in place of the native deletion, and the panel's button « Supprimer » (which
 * asks for a confirmation first) calls it: the same cascade as the deletion by the makeup artist
 * (`deleteAccountAndDependents`), in one transaction. The native deletion of Payload
 * would leave the profile and the photos of the account behind, which is why the Local API refuses
 * an account that still has a profile (`compteSansProfilAvantSuppression`).
 *
 * Only the role `admin`: the newsroom, a makeup artist and a visitor get a 403, as on the other
 * routes of the collection, and so does an identifier no account can have. 404 when the account does
 * not exist (any more). When the storage fails nothing is deleted and the answer is a 503 in French.
 * The shape of a success is Payload's own, which the panel reads.
 */
export const deleteAccount: Endpoint = {
	path: '/:id',
	method: 'delete',
	handler: async req => {
		const id = req.routeParams?.id
		if (!estAdmin(req.user) || typeof id !== 'string' || !identifiantPossible(id)) throw new Forbidden(req.t)
		const summary = await deleteAccountAndDependents(req.payload, Number(id))
		if (!summary.supprime) return Response.json({ errors: [{ message: 'Ce compte n’existe plus.' }] }, { status: 404 })
		req.payload.logger.info(`[suppression] account ${id} deleted by an admin, ${summary.profils} profile(s) with it`)
		return Response.json({
			doc: { id: Number(id) },
			message: 'Le compte a été supprimé avec son profil et ses photos.',
		})
	},
}
