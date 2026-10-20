/**
 * The dry reconciliation of the object storage and the database (ticket 137; plan 02 §7.3 I27 and
 * §10.1 point 5). It compares what the storage holds with what the `media` documents say it
 * should hold, and names the differences. It decides nothing and removes nothing: it reads two
 * lists and returns a report. The full control before any purge (tickets 197 and 205) reuses it.
 *
 * Three kinds of orphans, each named by what identifies it, never by what it contains:
 * - an object without a media: a key of the storage no document names;
 * - a media without an object: a document whose original or derived object is missing;
 * - a media without a profile: a document no profile (photo or gallery) and no article uses.
 *
 * The bin (`deleted/`) is counted apart: it is not an orphan, it waits for the rule of the storage
 * that empties it. The thumbnails of the old site (`strapiFormats`) are counted apart too: they
 * stay where they are and belong to no document of the v3 (src/lib/trash.ts).
 */
import { isInTrash, type MediaObjects, objectKeys } from './trash'

/** A media as the reconciliation reads it. */
export interface ReadMedia extends MediaObjects {
	id: number | string
	/** The formats of the old site, as imported: only the address of each is read. */
	strapiFormats?: unknown
	/** Set by the import only: the media was adopted from the old site, not sent in the v3. */
	strapiId?: number | null
}

export interface ReconciliationInput {
	/** Every key of the storage, with its size in bytes. */
	objets: readonly { cle: string; taille: number }[]
	medias: readonly ReadMedia[]
	/** The identifiers of the media a profile (main photo or gallery) or an article names. */
	mediasUtilises: ReadonlySet<string>
}

export interface Reconciliation {
	/** Keys of the storage that no media names, outside the bin and the old thumbnails. Sorted. */
	objetsSansMedia: string[]
	/** The media whose object is missing, with the missing keys. Sorted by identifier. */
	mediasSansObjet: { id: string; cles: string[] }[]
	/** The identifiers of the media nothing uses. Sorted. */
	mediasSansProfil: string[]
	comptes: {
		objets: number
		objetsHorsCorbeille: number
		/** Objects under `deleted/`: counted, never listed as orphans. */
		objetsEnCorbeille: number
		/** Objects that are the thumbnails of the old site. */
		vignettesAnciennes: number
		medias: number
		mediasUtilises: number
		/** Objects the media that something uses should hold. */
		objetsAttendus: number
	}
	/**
	 * The identifiers, among the media listed above, that the import adopted from the old site. Their
	 * state comes from the old data (the « 404 connus » of the import report, the profiles it did not
	 * take), not from what the v3 wrote.
	 */
	importes: string[]
	/** True when the three lists are empty. */
	sansOrphelin: boolean
	/** True when the three lists hold nothing but media the import adopted: what the v3 wrote has no orphan. */
	sansOrphelinHorsImport: boolean
}

const byNumber = (a: string, b: string) => (a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0)

/** The addresses the formats of the old site name: only their path is kept, to match a key by its end. */
function thumbnailPaths(medias: readonly ReadMedia[]): string[] {
	const paths: string[] = []
	for (const { strapiFormats } of medias) {
		if (!strapiFormats || typeof strapiFormats !== 'object') continue
		for (const format of Object.values(strapiFormats)) {
			const url = (format as { url?: unknown } | null)?.url
			if (typeof url !== 'string') continue
			try {
				paths.push(decodeURIComponent(new URL(url, 'http://base.invalide').pathname))
			} catch {
				// An address that does not read names nothing.
			}
		}
	}
	return paths
}

export function reconcile({ objets, medias, mediasUtilises }: ReconciliationInput): Reconciliation {
	const keys = new Set(objets.map(({ cle: key }) => key))
	const named = new Set<string>()
	const mediaWithoutObject: Reconciliation['mediasSansObjet'] = []
	const expected = new Set<string>()
	for (const media of medias) {
		const own = objectKeys(media)
		for (const key of own) named.add(key)
		const missing = own.filter(cle => !keys.has(cle))
		if (missing.length > 0) mediaWithoutObject.push({ id: String(media.id), cles: missing.sort() })
		if (mediasUtilises.has(String(media.id))) for (const key of own) expected.add(key)
	}
	const thumbnails = thumbnailPaths(medias)
	const objectsWithoutMedia: string[] = []
	let inTrash = 0
	let previous = 0
	for (const { cle: key } of objets) {
		if (isInTrash(key)) inTrash++
		else if (named.has(key)) continue
		else if (thumbnails.some(chemin => chemin === `/${key}` || chemin.endsWith(`/${key}`))) previous++
		else objectsWithoutMedia.push(key)
	}
	const mediaWithoutProfile = medias.map(({ id }) => String(id)).filter(id => !mediasUtilises.has(id))
	const report = {
		objetsSansMedia: objectsWithoutMedia.sort(),
		mediasSansObjet: mediaWithoutObject.sort((a, b) => byNumber(a.id, b.id)),
		mediasSansProfil: mediaWithoutProfile.sort(byNumber),
		comptes: {
			objets: objets.length,
			objetsHorsCorbeille: objets.length - inTrash,
			objetsEnCorbeille: inTrash,
			vignettesAnciennes: previous,
			medias: medias.length,
			mediasUtilises: medias.filter(({ id }) => mediasUtilises.has(String(id))).length,
			objetsAttendus: expected.size,
		},
	}
	const imported = new Set(medias.filter(({ strapiId }) => strapiId != null).map(({ id }) => String(id)))
	const written = (id: string) => !imported.has(id)
	return {
		...report,
		importes: [...imported]
			.filter(id => report.mediasSansProfil.includes(id) || report.mediasSansObjet.some(media => media.id === id))
			.sort(byNumber),
		sansOrphelinHorsImport:
			report.objetsSansMedia.length === 0 &&
			!report.mediasSansObjet.some(({ id }) => written(id)) &&
			!report.mediasSansProfil.some(written),
		sansOrphelin:
			report.objetsSansMedia.length === 0 &&
			report.mediasSansObjet.length === 0 &&
			report.mediasSansProfil.length === 0,
	}
}

/** The report as text for a person or a CI log: keys, identifiers and counts, nothing else. */
export function describeReconciliation(rapport: Reconciliation): string {
	const { comptes: accounts } = rapport
	const rows = [
		`Stockage : ${accounts.objets} objet(s), dont ${accounts.objetsEnCorbeille} en corbeille et ${accounts.vignettesAnciennes} vignette(s) de l'ancien site.`,
		`Base : ${accounts.medias} média(s), dont ${accounts.mediasUtilises} utilisé(s) par un profil ou un article (${accounts.objetsAttendus} objet(s) attendus).`,
		`Objets sans média : ${rapport.objetsSansMedia.length}`,
		...rapport.objetsSansMedia.map(cle => `  ${cle}`),
		`Médias sans objet : ${rapport.mediasSansObjet.length}`,
		...rapport.mediasSansObjet.map(({ id, cles: keys }) => `  média ${id} : ${keys.join(', ')}`),
		`Médias sans profil : ${rapport.mediasSansProfil.length}`,
		...rapport.mediasSansProfil.map(id => `  média ${id}`),
		...(rapport.importes.length > 0
			? [`Dont adoptés de l'ancien site par l'import : ${rapport.importes.map(id => `média ${id}`).join(', ')}.`]
			: []),
		rapport.sansOrphelin ? '0 orphelin.' : 'Orphelins trouvés : rien n’a été supprimé.',
	]
	return rows.join('\n')
}
