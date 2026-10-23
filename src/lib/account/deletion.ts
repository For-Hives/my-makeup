import {
	commitTransaction,
	createLocalReq,
	initTransaction,
	killTransaction,
	type Payload,
	type PayloadRequest,
} from 'payload'
// Relative import on purpose: the bin is the one in the collections, and this file may be loaded outside of Next.
import { heldTrash } from '../../collections/trash'
import { PROFILE_VIEWS_COLLECTION } from '../views/profile-views'

/**
 * The deletion of an account and everything that hangs on it (ticket 141; plan 01 AUTH-13, P7.7;
 * plan 02 I36, I38). The one mechanism: the makeup artist who deletes her account uses it, and the
 * admin who deletes a fake account uses it too (ticket 167, `DELETE /api/pros/:id`, src/lib/account/deletion-route.ts).
 *
 * In ONE transaction, under ONE hold of the bin (`heldTrash`):
 * 1. her profile, by identifier. Deleting it sends to the bin every photo of the account that
 *    nothing references any more (`cleanupAfterDeletion`), and refreshes the public pages;
 * 2. her account. Its sessions are rows of the same document: they go with it, so that an old
 *    token opens nothing.
 * Only then do the objects move to the bin, and only then does the transaction commit. When the
 * storage fails, what had moved is put back, the transaction is rolled back, and the error
 * (503 in French) goes up: every document and every object is as it was (I38).
 *
 * Without the outer transaction each deletion would commit on its own, and a storage failure on
 * the account step would leave the profile already gone. The profile goes first: the account
 * refuses to go while a profile still names it, and the photos are found by their owner, which the
 * database clears once the account row is gone.
 *
 * Access rules are bypassed on purpose: only the callers decide that this deletion may happen
 * (the confirmation of the owner, the role of the admin). The collections keep `delete` closed to
 * the owner, so that `DELETE /api/pros/<id>` skips neither the confirmation nor the brake.
 *
 * It is safe to call twice for the same account at the same time: the second call waits for the
 * first and gives its answer. An account that is already gone is no error.
 *
 * An account that came from the old site leaves one row behind, its identifier on the old site and the day
 * (collection `deleted-accounts`, same transaction): the import reads the old site again, and without
 * this row a rerun would bring the account and its public profile back.
 *
 * The messages of the contact form (collection `contact-requests`) hold no link to an account: they are
 * addressed to the team, not to a makeup artist, so there is nothing of hers in them to anonymise.
 * The ticket that adds requests to a makeup artist adds their anonymisation here.
 *
 * The photos of an account without a profile are taken by the `beforeDelete` hook of `pros`
 * (`cleanupBeforeAccountDeletion`, src/collections/trash.ts), under the same hold of the bin.
 */

/** What the deletion did. `supprime: false`: the account did not exist (any more). */
export interface DeletionSummary {
	supprime: boolean
	/** How many profiles went with the account. */
	profils: number
}

const REGISTRY = Symbol.for('my-makeup.suppressions-en-cours')

/** Keyed by account: Next loads a module once per bundle layer, and the deletions must be one for the process. */
function inProgress(): Map<string, Promise<DeletionSummary>> {
	const g = globalThis as { [REGISTRY]?: Map<string, Promise<DeletionSummary>> }
	g[REGISTRY] ??= new Map()
	return g[REGISTRY]
}

async function rememberDeletion(payload: Payload, strapiId: number, req: PayloadRequest): Promise<void> {
	const { totalDocs } = await payload.count({
		collection: 'deleted-accounts',
		overrideAccess: true,
		req,
		where: { strapiId: { equals: strapiId } },
	})
	if (totalDocs === 0)
		await payload.create({
			collection: 'deleted-accounts',
			data: { strapiId, date: new Date().toISOString() },
			depth: 0,
			overrideAccess: true,
			req,
		})
}

async function remove(payload: Payload, id: number | string): Promise<DeletionSummary> {
	const req = await createLocalReq({}, payload)
	const owner = await initTransaction(req)
	try {
		const summary = await heldTrash(req, `account ${id}`, async (): Promise<DeletionSummary> => {
			const account = await payload.findByID({
				collection: 'pros',
				depth: 0,
				disableErrors: true,
				id,
				overrideAccess: true,
				req,
				select: { strapiId: true },
			})
			if (account === null) return { supprime: false, profils: 0 }
			const { docs } = await payload.find({
				collection: 'profiles',
				depth: 0,
				overrideAccess: true,
				pagination: false,
				req,
				select: {},
				where: { pro: { equals: id } },
			})
			// One by one, by identifier: the bin refuses a deletion by `where`, and never runs side by side.
			for (const profile of docs) {
				// Her counters of views go with her profile (ticket 1001); the daily purge would take the orphans anyway.
				await payload.delete({
					collection: PROFILE_VIEWS_COLLECTION,
					depth: 0,
					overrideAccess: true,
					req,
					where: { profile: { equals: profile.id } },
				})
				await payload.delete({ collection: 'profiles', depth: 0, id: profile.id, overrideAccess: true, req })
			}
			await payload.delete({ collection: 'pros', depth: 0, id, overrideAccess: true, req })
			// She came from the old site, which the import still reads: her identifier is kept so that a
			// rerun never brings her back. Same transaction: both happen or neither.
			if (typeof account.strapiId === 'number') await rememberDeletion(payload, account.strapiId, req)
			return { supprime: true, profils: docs.length }
		})
		if (owner) await commitTransaction(req)
		return summary
	} catch (error) {
		if (owner) await killTransaction(req)
		throw error
	}
}

/** Deletes the account and all that hangs on it (see the top of this file). Throws when it could not: nothing was changed. */
export function deleteAccountAndDependents(payload: Payload, id: number | string): Promise<DeletionSummary> {
	const key = String(id)
	const already = inProgress().get(key)
	if (already) return already
	const work = remove(payload, id).finally(() => inProgress().delete(key))
	inProgress().set(key, work)
	return work
}
