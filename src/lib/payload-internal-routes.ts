/**
 * Payload's own collections (`payload-migrations`, the document locks...) declare `endpoints: false`, and
 * its REST handler answers 501 « Cannot GET <address> » for them, naming the internal address of the
 * server (`https://0.0.0.0:3000`). Nothing on the site uses those routes: they answer an ordinary 404, with
 * no address in the body (ticket 276).
 */
export const NOT_FOUND_BODY = { errors: [{ message: 'Introuvable.' }] }

type Handler<Args extends unknown[]> = (request: Request, ...args: Args) => Promise<Response>

export function withoutInternalRoutes<Args extends unknown[]>(handler: Handler<Args>): Handler<Args> {
	return async (request, ...args) => {
		const response = await handler(request, ...args)
		if (response.status !== 501) return response
		const notFound = Response.json(NOT_FOUND_BODY, { status: 404 })
		const cors = response.headers.get('access-control-allow-origin')
		if (cors) notFound.headers.set('access-control-allow-origin', cors)
		return notFound
	}
}
