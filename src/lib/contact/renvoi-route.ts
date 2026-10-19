import { type Endpoint, Forbidden } from 'payload'
import { estAdmin } from '../acces'
import { envoiEmailDePayload } from '../emails/envoi'
import { serverEnv } from '../env'
import { stockageDePayload } from './envoi-payload'
import { renvoyerLEmailDUnMessage, stockageDuRenvoiDePayload } from './renvoi'

/**
 * `POST /api/demandes/:id/resend`: an admin sends again the mail of a contact message whose mail failed
 * (ticket 163). The button of the panel calls it. Only the role `admin`: a `redaction` account, a makeup
 * artist and a visitor get a 403, as on every route of the collection.
 *
 * The answer holds a state and no sentence of the visitor's: 200 with `etatMail` (`envoye` or `echec`),
 * 404 when the message does not exist, 409 when its mail is not in `echec` (already sent, or being sent by
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
		if (resultat.ok) return Response.json({ etatMail: resultat.etatMail })
		return Response.json({ code: resultat.code }, { status: resultat.code === 'introuvable' ? 404 : 409 })
	},
}
