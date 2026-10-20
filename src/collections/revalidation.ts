import { revalidatePath, revalidateTag } from 'next/cache.js'
import type {
	CollectionAfterChangeHook,
	CollectionAfterDeleteHook,
	CollectionBeforeChangeHook,
	CollectionBeforeDeleteHook,
	PayloadRequest,
	RequestContext,
} from 'payload'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { estUnImport } from '../lib/contexte-import'
import { STATUT_PUBLIE } from '../lib/profile/status'
import { type Cibles, type ContenuPublic, ciblesDuChangement, type EtatPublic } from '../lib/revalidation'
import { adressesDuChangement, cleSiLEnvoiEstPermis, signalerPlusTard } from '../lib/seo/indexnow'

/**
 * The refresh of the public pages (ticket 047): when a profile, an article or a talent is created,
 * changed or deleted, the server tells Next which cached pages are stale, by the rule of
 * src/lib/revalidation.ts: the page of the document, the pages that list its collection, the
 * sitemap.
 *
 * - The public state is read from the stored row, before and after the write, in the transaction
 *   of the request: what the public is shown, whatever the request selected or may read. For an
 *   article or a talent, it is the published document, never a draft version saved over it.
 * - The import (src/lib/contexte-import.ts) refreshes nothing, and reads nothing for it.
 * - Next can only take a revalidation inside one of its requests: the REST API, the admin panel, a
 *   Server Action. A write outside of one (a script, a test, a job) is saved, and the pages keep
 *   their cache until it expires.
 * - A refresh that fails never undoes the save: it is logged, and the pages expire on their own.
 */

/** The field of the stored row that says whether the document is shown, and its public value. */
const VISIBILITE: Readonly<Record<ContenuPublic, { champ: 'status' | '_status'; valeur: string }>> = {
	profiles: { champ: 'status', valeur: STATUT_PUBLIE },
	articles: { champ: '_status', valeur: 'published' },
	talents: { champ: '_status', valeur: 'published' },
}

type LigneStockee = { id: number | string; slug?: unknown; publishable?: unknown } & Partial<
	Record<'status' | '_status', unknown>
>

/** The public state of a document, from its stored row; `null` when there is no row. */
async function lireEtatPublic(
	req: PayloadRequest,
	contenu: ContenuPublic,
	id: number | string
): Promise<EtatPublic | null> {
	const { champ, valeur } = VISIBILITE[contenu]
	const ligne = await req.payload.db.findOne<LigneStockee>({
		collection: contenu,
		req,
		select: { slug: true, [champ]: true, ...(contenu === 'profiles' && { publishable: true }) },
		where: { id: { equals: id } },
	})
	if (!ligne) return null
	const visible = ligne[champ] === valeur
	// A profile is in the sitemap when it is publishable (IndexNow, ticket 219); the others when published.
	return {
		slug: String(ligne.slug ?? ''),
		visible,
		indexable: contenu === 'profiles' ? ligne.publishable === true : visible,
	}
}

/**
 * Where the state read before a write waits for the hook that runs after it: in the context of
 * the request, which Payload hands to both hooks, nested writes included.
 */
const CLE_DU_CONTEXTE = 'etatsPublicsAvantEcriture'

function etatsRetenus(context: RequestContext): Map<string, EtatPublic | null> {
	const retenus = context[CLE_DU_CONTEXTE]
	if (retenus instanceof Map) return retenus as Map<string, EtatPublic | null>
	const nouveaux = new Map<string, EtatPublic | null>()
	context[CLE_DU_CONTEXTE] = nouveaux
	return nouveaux
}

const cle = (contenu: ContenuPublic, id: number | string) => `${contenu}:${id}`

/** The state read before the write of this document, once: `null` when none was read. */
function reprendre(context: RequestContext, contenu: ContenuPublic, id: number | string): EtatPublic | null {
	const retenus = etatsRetenus(context)
	const etat = retenus.get(cle(contenu, id)) ?? null
	retenus.delete(cle(contenu, id))
	return etat
}

/** True for the refusal of Next outside one of its requests (`E263`, « static generation store missing »). */
export const horsDUneRequeteDeNext = (erreur: unknown): boolean =>
	erreur instanceof Error && '__NEXT_ERROR_CODE' in erreur && erreur.__NEXT_ERROR_CODE === 'E263'

/**
 * Tells Next which pages are stale. A tag expires at once, rather than being served stale one last
 * time: a profile hidden, or contact details withdrawn, leave at the next visit.
 */
export function revalider(req: PayloadRequest, { chemins, etiquettes }: Cibles): void {
	if (chemins.length === 0 && etiquettes.length === 0) return
	try {
		for (const etiquette of etiquettes) revalidateTag(etiquette, { expire: 0 })
		for (const chemin of chemins) revalidatePath(chemin)
	} catch (erreur) {
		if (horsDUneRequeteDeNext(erreur)) {
			req.payload.logger.debug('[revalidation] written outside of a request of Next: no page refreshed')
			return
		}
		req.payload.logger.error({ err: erreur, msg: '[revalidation] the public pages of this write were not refreshed' })
	}
}

/**
 * Tells IndexNow about the pages of a save (ticket 219), at the place where Next is told. Nothing leaves
 * without the key, off the site itself, or during the import (which never gets here). The request leaves
 * a few seconds later and never holds the save: a failure is logged by the queue.
 */
export function signalerAuxMoteurs(
	req: PayloadRequest,
	contenu: ContenuPublic,
	avant: EtatPublic | null,
	apres: EtatPublic | null
): void {
	const cle = cleSiLEnvoiEstPermis()
	if (cle === undefined) return
	try {
		signalerPlusTard(adressesDuChangement(contenu, avant, apres), {
			cle,
			journal: {
				info: message => req.payload.logger.info(message),
				error: message => req.payload.logger.error(message),
			},
		})
	} catch (erreur) {
		req.payload.logger.error({ err: erreur, msg: '[indexnow] the addresses of this write were not queued' })
	}
}

/** The hooks of the refresh of one collection, to add to its own. */
export interface HooksDeRafraichissement {
	/** `beforeChange`: reads the public state before an update. */
	avantEcriture: CollectionBeforeChangeHook
	/** `afterChange`, after the hooks that change the document (the fallback slug of a profile). */
	apresEcriture: CollectionAfterChangeHook
	/** `beforeDelete`: reads the public state before a deletion. */
	avantSuppression: CollectionBeforeDeleteHook
	/** `afterDelete`. */
	apresSuppression: CollectionAfterDeleteHook
}

export function rafraichissement(contenu: ContenuPublic): HooksDeRafraichissement {
	return {
		avantEcriture: async ({ context, data, operation, originalDoc, req }) => {
			const id = originalDoc?.id
			if (estUnImport(context) || operation !== 'update' || id === undefined) return data
			etatsRetenus(context).set(cle(contenu, id), await lireEtatPublic(req, contenu, id))
			return data
		},
		apresEcriture: async ({ context, doc, operation, req }) => {
			if (estUnImport(context)) return doc
			const avant = operation === 'create' ? null : reprendre(context, contenu, doc.id)
			const apres = await lireEtatPublic(req, contenu, doc.id)
			revalider(req, ciblesDuChangement(contenu, avant, apres))
			signalerAuxMoteurs(req, contenu, avant, apres)
			return doc
		},
		avantSuppression: async ({ context, id, req }) => {
			if (estUnImport(context)) return
			etatsRetenus(context).set(cle(contenu, id), await lireEtatPublic(req, contenu, id))
		},
		apresSuppression: ({ context, doc, id, req }) => {
			if (estUnImport(context)) return doc
			const avant = reprendre(context, contenu, id)
			revalider(req, ciblesDuChangement(contenu, avant, null))
			signalerAuxMoteurs(req, contenu, avant, null)
			return doc
		},
	}
}
