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
import { createAccount } from './account-factory'

async function adminHeaderList(): Promise<{ Cookie: string; Origin: string }> {
	return (await createAccount('admin')).session.enTetes
}

/** Creates a document through the REST API, as an admin; gives its identifier. */
export async function createContent(
	request: APIRequestContext,
	collection: 'talents' | 'articles',
	data: Record<string, unknown>
): Promise<number> {
	const response = await request.post(`/api/${collection}`, { headers: await adminHeaderList(), data })
	if (!response.ok())
		throw new Error(`La création dans « ${collection} » a répondu ${response.status()} : ${await response.text()}`)
	return ((await response.json()) as { doc: { id: number } }).doc.id
}

/** Deletes a document through the REST API, as an admin. */
export async function deleteContent(
	request: APIRequestContext,
	collection: 'talents' | 'articles',
	identifiant: number
): Promise<void> {
	await request.delete(`/api/${collection}/${identifiant}`, { headers: await adminHeaderList() })
}

const refreshed = new Set<number>()

/**
 * Has the application refresh the pages that list the profiles, once per profile for this process: a save of a
 * published profile through the application does it (its page, the search, the sitemap). The profile is
 * saved with the specialty it has, so nothing changes. Once per profile and not once per process: a profile
 * loaded after the first refresh (a spec that places its own) is not in the directory that was cached by then.
 */
export async function refreshProfilePages(
	request: APIRequestContext,
	profil: { id: number; specialite: string | null }
): Promise<void> {
	if (refreshed.has(profil.id)) return
	const response = await request.patch(`/api/profiles/${profil.id}`, {
		headers: await adminHeaderList(),
		data: { specialite: profil.specialite ?? '' },
	})
	if (!response.ok()) throw new Error(`Le rafraîchissement a répondu ${response.status()} : ${await response.text()}`)
	refreshed.add(profil.id)
}
