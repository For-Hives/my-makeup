import { type Endpoint, Forbidden } from 'payload'
import { estAdmin } from '../acces'
import { envoiEmailDePayload } from '../emails/send'
import { serverEnv } from '../env'
import { stockageDePayload } from './payload-send'
import { renvoyerLEmailDUnMessage, stockageDuRenvoiDePayload } from './resend'

/**
 * `POST /api/contact-requests/:id/resend`: an admin sends again the mail of a contact message whose mail failed
 * (ticket 163). The button of the panel calls it. Only the role `admin`: a `editor` account, a makeup
 * artist and a visitor get a 403, as on every route of the collection.
 *
 * The answer holds a state and no sentence of the visitor's: 200 with `mailStatus` (`sent` or `failed`),
 * 404 when the message does not exist, 409 when its mail is not in `failed` (already sent, or being sent by
 * another click).
 */
export const renvoyerLEmail: Endpoint = {
	path: '/:id/resend',
	method: 'post',
	handler: async req => {
		if (!estAdmin(req.user)) throw new Forbidden(req.t)
		const id = Number(req.routeParams?.id)
		if (!Number.isSafeInteger(id) || id < 1) return Response.json({ code: 'introuvable' }, { status: 404 })

		const { payload } = req
		const env = serverEnv()
		const resultat = await renvoyerLEmailDUnMessage(id, {
			relecture: stockageDuRenvoiDePayload(payload),
			stockage: stockageDePayload(payload),
			envoyer: envoiEmailDePayload(payload, env),
			destinataire: env.contactTo,
			journal: {
				info: ligne => payload.logger.info({ msg: ligne }),
				erreur: ligne => payload.logger.error({ msg: ligne }),
			},
		})
		if (resultat.ok) return Response.json({ mailStatus: resultat.etatMail === 'envoye' ? 'sent' : 'failed' })
		return Response.json({ code: resultat.code }, { status: resultat.code === 'introuvable' ? 404 : 409 })
	},
}
