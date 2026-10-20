/**
 * The REST API of the application, called in a test as Next calls it: a web request handed to
 * the route of `src/app/(payload)/api/[...slug]/route.ts`. No server and no port: the request goes
 * through the same handlers, the same session check and the same access rules as on the site.
 *
 *   const { statut, corps } = await appelerRest('GET', '/api/admins/me', { enTetes: compte.session.enTetes })
 *
 * What it does not prove is the routing of Next itself (which file answers which address): an
 * end-to-end test does (docs/tests/e2e.md).
 */

import { DELETE, GET, PATCH, POST } from '@/app/(payload)/api/[...slug]/route'

const ROUTES = { DELETE, GET, PATCH, POST }
export type Method = keyof typeof ROUTES

export interface ResponseRest {
	statut: number
	/** The body read as JSON; `null` when there is none. */
	corps: unknown
	/** The body as it was sent, to look for a value anywhere in it. */
	texte: string
	/** The headers of the response, such as the `Location` of a redirection, which is never followed. */
	enTetes: Headers
}

export interface OptionsRest {
	/** The headers of a session (`compte.session.enTetes`), or nothing for an anonymous request. */
	enTetes?: Record<string, string>
	/** Sent as JSON. */
	corps?: unknown
	/**
	 * Sent as `multipart/form-data` instead of `corps`, as the admin panel and the site send a file:
	 * the file under `file`, the other fields as JSON under `_payload` (see `formulaireAvecFichier`).
	 */
	formulaire?: FormData
}

/** The site the bench serves: a session cookie is accepted from that origin only. */
function origin(): string {
	const site = process.env.NEXT_PUBLIC_SITE_URL
	if (!site) throw new Error('NEXT_PUBLIC_SITE_URL manque : lance les tests par « bun run test:integration ».')
	return site
}

/** One REST request, `chemin` starting with `/api/`, query string included. */
export async function callRest(
	methode: Method,
	chemin: string,
	{ enTetes = {}, corps, formulaire: form }: OptionsRest = {}
): Promise<ResponseRest> {
	if (!chemin.startsWith('/api/')) throw new Error(`« ${chemin} » n’est pas une adresse de l’API REST.`)
	const url = new URL(chemin, origin())
	const slug = url.pathname.slice('/api/'.length).split('/').map(decodeURIComponent)
	const request = new Request(url, {
		method: methode,
		// A form gets its Content-Type, with its boundary, from the request itself.
		headers: corps === undefined || form ? enTetes : { 'Content-Type': 'application/json', ...enTetes },
		body: form ?? (corps === undefined ? undefined : JSON.stringify(corps)),
	})
	const response = await ROUTES[methode](request, { params: Promise.resolve({ slug }) })
	const text = await response.text()
	return {
		statut: response.status,
		corps: text ? (JSON.parse(text) as unknown) : null,
		texte: text,
		enTetes: response.headers,
	}
}

/** A form that sends a file the way Payload reads it: the file under `file`, the other fields as JSON under `_payload`. */
export function formWithFile(fichier: File, champs: Record<string, unknown> = {}): FormData {
	const form = new FormData()
	form.append('file', fichier)
	form.append('_payload', JSON.stringify(champs))
	return form
}
