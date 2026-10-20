/**
 * What the end-to-end tests do to the public pages through the running application: create a talent or an
 * article as the admin panel does, and refresh the pages that list the profiles.
 *
 * Why through the application: the pages keep their data in the cache of Next, tagged by what they read
 * (src/lib/revalidate.ts). A save that goes through the application refreshes it; a save made by the
 * test process, with its own Payload, does not reach the server's cache. A test that loaded data that way
 * asks the application to refresh, or it would read what an earlier request saw.
 */

import type { APIRequestContext } from '@playwright/test'
import { creerCompte } from './fabrique-comptes'

async function enTetesDeLAdmin(): Promise<{ Cookie: string; Origin: string }> {
	return (await creerCompte('admin')).session.enTetes
}

/** Creates a document through the REST API, as an admin; gives its identifier. */
export async function creerContenu(
	request: APIRequestContext,
	collection: 'talents' | 'articles',
	data: Record<string, unknown>
): Promise<number> {
	const reponse = await request.post(`/api/${collection}`, { headers: await enTetesDeLAdmin(), data })
	if (!reponse.ok())
		throw new Error(`La création dans « ${collection} » a répondu ${reponse.status()} : ${await reponse.text()}`)
	return ((await reponse.json()) as { doc: { id: number } }).doc.id
}

/** Deletes a document through the REST API, as an admin. */
export async function supprimerContenu(
	request: APIRequestContext,
	collection: 'talents' | 'articles',
	identifiant: number
): Promise<void> {
	await request.delete(`/api/${collection}/${identifiant}`, { headers: await enTetesDeLAdmin() })
}

let rafraichie = false

/**
 * Has the application refresh the pages that list the profiles, once for this process: a save of a
 * published profile through the application does it (its page, the search, the sitemap). The profile is
 * saved with the specialty it has, so nothing changes.
 */
export async function rafraichirLesPagesDesProfils(
	request: APIRequestContext,
	profil: { id: number; specialite: string | null }
): Promise<void> {
	if (rafraichie) return
	const reponse = await request.patch(`/api/profiles/${profil.id}`, {
		headers: await enTetesDeLAdmin(),
		data: { specialite: profil.specialite ?? '' },
	})
	if (!reponse.ok()) throw new Error(`Le rafraîchissement a répondu ${reponse.status()} : ${await reponse.text()}`)
	rafraichie = true
}
