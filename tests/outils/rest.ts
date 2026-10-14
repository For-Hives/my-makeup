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
export type Methode = keyof typeof ROUTES

export interface ReponseRest {
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
function origine(): string {
	const site = process.env.NEXT_PUBLIC_SITE_URL
	if (!site) throw new Error('NEXT_PUBLIC_SITE_URL manque : lance les tests par « bun run test:integration ».')
	return site
}

/** One REST request, `chemin` starting with `/api/`, query string included. */
export async function appelerRest(
	methode: Methode,
	chemin: string,
	{ enTetes = {}, corps, formulaire }: OptionsRest = {}
): Promise<ReponseRest> {
	if (!chemin.startsWith('/api/')) throw new Error(`« ${chemin} » n’est pas une adresse de l’API REST.`)
	const adresse = new URL(chemin, origine())
	const slug = adresse.pathname.slice('/api/'.length).split('/').map(decodeURIComponent)
	const requete = new Request(adresse, {
		method: methode,
		// A form gets its Content-Type, with its boundary, from the request itself.
		headers: corps === undefined || formulaire ? enTetes : { 'Content-Type': 'application/json', ...enTetes },
		body: formulaire ?? (corps === undefined ? undefined : JSON.stringify(corps)),
	})
	const reponse = await ROUTES[methode](requete, { params: Promise.resolve({ slug }) })
	const texte = await reponse.text()
	return {
		statut: reponse.status,
		corps: texte ? (JSON.parse(texte) as unknown) : null,
		texte,
		enTetes: reponse.headers,
	}
}

/** A form that sends a file the way Payload reads it: the file under `file`, the other fields as JSON under `_payload`. */
export function formulaireAvecFichier(fichier: File, champs: Record<string, unknown> = {}): FormData {
	const formulaire = new FormData()
	formulaire.append('file', fichier)
	formulaire.append('_payload', JSON.stringify(champs))
	return formulaire
}
