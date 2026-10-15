import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload } from 'payload'
// Relative import on purpose: the bin is the one in the collections, and this file may be loaded outside of Next.
import { corbeilleRetenue } from '../../collections/corbeille'

/**
 * The deletion of an account and everything that hangs on it (ticket 141; plan 01 AUTH-13, P7.7;
 * plan 02 I36, I38). The one mechanism: the makeup artist who deletes her account uses it, and the
 * admin who deletes a fake account will use it too (ticket 167).
 *
 * In ONE transaction, under ONE hold of the bin (`corbeilleRetenue`):
 * 1. her profile, by identifier. Deleting it sends to the bin every photo of the account that
 *    nothing references any more (`menageApresSuppression`), and refreshes the public pages;
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
 * The requests of the contact form (collection `demandes`, not built yet) are anonymised by the
 * ticket that creates the collection.
 */

/** What the deletion did. `supprime: false`: the account did not exist (any more). */
export interface BilanDeSuppression {
	supprime: boolean
	/** How many profiles went with the account. */
	profils: number
}

const REGISTRE = Symbol.for('my-makeup.suppressions-en-cours')

/** Keyed by account: Next loads a module once per bundle layer, and the deletions must be one for the process. */
function enCours(): Map<string, Promise<BilanDeSuppression>> {
	const g = globalThis as { [REGISTRE]?: Map<string, Promise<BilanDeSuppression>> }
	g[REGISTRE] ??= new Map()
	return g[REGISTRE]
}

async function supprimer(payload: Payload, id: number | string): Promise<BilanDeSuppression> {
	const req = await createLocalReq({}, payload)
	const proprietaire = await initTransaction(req)
	try {
		const bilan = await corbeilleRetenue(req, `account ${id}`, async (): Promise<BilanDeSuppression> => {
			const compte = await payload.findByID({
				collection: 'pros',
				depth: 0,
				disableErrors: true,
				id,
				overrideAccess: true,
				req,
				select: {},
			})
			if (compte === null) return { supprime: false, profils: 0 }
			const { docs } = await payload.find({
				collection: 'profils',
				depth: 0,
				overrideAccess: true,
				pagination: false,
				req,
				select: {},
				where: { pro: { equals: id } },
			})
			// One by one, by identifier: the bin refuses a deletion by `where`, and never runs side by side.
			for (const profil of docs)
				await payload.delete({ collection: 'profils', depth: 0, id: profil.id, overrideAccess: true, req })
			await payload.delete({ collection: 'pros', depth: 0, id, overrideAccess: true, req })
			return { supprime: true, profils: docs.length }
		})
		if (proprietaire) await commitTransaction(req)
		return bilan
	} catch (erreur) {
		if (proprietaire) await killTransaction(req)
		throw erreur
	}
}

/** Deletes the account and all that hangs on it (see the top of this file). Throws when it could not: nothing was changed. */
export function supprimerLeCompteEtToutCeQuiEnDepend(
	payload: Payload,
	id: number | string
): Promise<BilanDeSuppression> {
	const cle = String(id)
	const deja = enCours().get(cle)
	if (deja) return deja
	const travail = supprimer(payload, id).finally(() => enCours().delete(cle))
	enCours().set(cle, travail)
	return travail
}
