import { type Endpoint, Forbidden } from 'payload'
import { z } from 'zod'
import { isAdmin } from '../access'
import { type ChooseCityCode, chooseReviewCity } from './choose-city'

/** The body: the INSEE code of the commune, and nothing else. */
const BODY = z.strictObject({ inseeCode: z.string().regex(/^[0-9AB]{5}$/) })

const STATUS: Record<ChooseCityCode, number> = {
	'not-found': 404,
	'not-a-candidate': 400,
	'unknown-city': 400,
	'service-down': 503,
	failed: 500,
}

/**
 * `POST /api/profiles/:id/choose-city` (ticket 308): an admin picks, from the sheet of a profile, one of the
 * communes of its zone review. Only the role `admin`: an editor, a makeup artist and a visitor get a 403. The
 * body holds the INSEE code, and the code must be one of the communes of the review (src/lib/profile/choose-city.ts).
 *
 * 200 `{ ok: true }`; 400 with a sentence in French for a body or a commune that is refused; 404 for an unknown
 * profile; 503 when the official list does not answer.
 */
export const chooseCity: Endpoint = {
	path: '/:id/choose-city',
	method: 'post',
	handler: async req => {
		if (!isAdmin(req.user) || !req.user) throw new Forbidden(req.t)
		const id = Number(req.routeParams?.id)
		if (!Number.isSafeInteger(id) || id < 1)
			return Response.json({ message: 'Ce profil n’existe pas.' }, { status: 404 })

		const body = BODY.safeParse(await (req.json?.() ?? Promise.resolve(null)).catch(() => null))
		if (!body.success) return Response.json({ message: 'La demande ne nomme pas une commune valide.' }, { status: 400 })

		const result = await chooseReviewCity(req.payload, req.user, id, body.data.inseeCode)
		if (result.ok) return Response.json({ ok: true })
		return Response.json({ message: result.message }, { status: STATUS[result.code] })
	},
}
