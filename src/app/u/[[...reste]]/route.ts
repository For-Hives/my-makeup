// Every other path under /u answers 404: the dashboard, the login and the rest of the API of the
// instance are never served (ticket 111). `/u` itself comes here too.
export const dynamic = 'force-dynamic'

const absent = () =>
	new Response('Introuvable\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })

export const GET = absent
export const POST = absent
export const PUT = absent
export const PATCH = absent
export const DELETE = absent
