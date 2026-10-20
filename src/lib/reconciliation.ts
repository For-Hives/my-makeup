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
import { clesDesObjets, estEnCorbeille, type ObjetsDUnMedia } from './trash'

/** A media as the reconciliation reads it. */
export interface MediaLu extends ObjetsDUnMedia {
	id: number | string
	/** The formats of the old site, as imported: only the address of each is read. */
	strapiFormats?: unknown
	/** Set by the import only: the media was adopted from the old site, not sent in the v3. */
	strapiId?: number | null
}

export interface EntreesDuRapprochement {
	/** Every key of the storage, with its size in bytes. */
	objets: readonly { cle: string; taille: number }[]
	medias: readonly MediaLu[]
	/** The identifiers of the media a profile (main photo or gallery) or an article names. */
	mediasUtilises: ReadonlySet<string>
}

export interface Rapprochement {
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

const parNombre = (a: string, b: string) => (a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0)

/** The addresses the formats of the old site name: only their path is kept, to match a key by its end. */
function cheminsDesVignettes(medias: readonly MediaLu[]): string[] {
	const chemins: string[] = []
	for (const { strapiFormats } of medias) {
		if (!strapiFormats || typeof strapiFormats !== 'object') continue
		for (const format of Object.values(strapiFormats)) {
			const adresse = (format as { url?: unknown } | null)?.url
			if (typeof adresse !== 'string') continue
			try {
				chemins.push(decodeURIComponent(new URL(adresse, 'http://base.invalide').pathname))
			} catch {
				// An address that does not read names nothing.
			}
		}
	}
	return chemins
}

export function rapprocher({ objets, medias, mediasUtilises }: EntreesDuRapprochement): Rapprochement {
	const cles = new Set(objets.map(({ cle }) => cle))
	const nommees = new Set<string>()
	const mediasSansObjet: Rapprochement['mediasSansObjet'] = []
	const attendus = new Set<string>()
	for (const media of medias) {
		const siennes = clesDesObjets(media)
		for (const cle of siennes) nommees.add(cle)
		const manquantes = siennes.filter(cle => !cles.has(cle))
		if (manquantes.length > 0) mediasSansObjet.push({ id: String(media.id), cles: manquantes.sort() })
		if (mediasUtilises.has(String(media.id))) for (const cle of siennes) attendus.add(cle)
	}
	const vignettes = cheminsDesVignettes(medias)
	const objetsSansMedia: string[] = []
	let enCorbeille = 0
	let anciennes = 0
	for (const { cle } of objets) {
		if (estEnCorbeille(cle)) enCorbeille++
		else if (nommees.has(cle)) continue
		else if (vignettes.some(chemin => chemin === `/${cle}` || chemin.endsWith(`/${cle}`))) anciennes++
		else objetsSansMedia.push(cle)
	}
	const mediasSansProfil = medias.map(({ id }) => String(id)).filter(id => !mediasUtilises.has(id))
	const rapport = {
		objetsSansMedia: objetsSansMedia.sort(),
		mediasSansObjet: mediasSansObjet.sort((a, b) => parNombre(a.id, b.id)),
		mediasSansProfil: mediasSansProfil.sort(parNombre),
		comptes: {
			objets: objets.length,
			objetsHorsCorbeille: objets.length - enCorbeille,
			objetsEnCorbeille: enCorbeille,
			vignettesAnciennes: anciennes,
			medias: medias.length,
			mediasUtilises: medias.filter(({ id }) => mediasUtilises.has(String(id))).length,
			objetsAttendus: attendus.size,
		},
	}
	const importes = new Set(medias.filter(({ strapiId }) => strapiId != null).map(({ id }) => String(id)))
	const ecrits = (id: string) => !importes.has(id)
	return {
		...rapport,
		importes: [...importes]
			.filter(id => rapport.mediasSansProfil.includes(id) || rapport.mediasSansObjet.some(media => media.id === id))
			.sort(parNombre),
		sansOrphelinHorsImport:
			rapport.objetsSansMedia.length === 0 &&
			!rapport.mediasSansObjet.some(({ id }) => ecrits(id)) &&
			!rapport.mediasSansProfil.some(ecrits),
		sansOrphelin:
			rapport.objetsSansMedia.length === 0 &&
			rapport.mediasSansObjet.length === 0 &&
			rapport.mediasSansProfil.length === 0,
	}
}

/** The report as text for a person or a CI log: keys, identifiers and counts, nothing else. */
export function raconterLeRapprochement(rapport: Rapprochement): string {
	const { comptes } = rapport
	const lignes = [
		`Stockage : ${comptes.objets} objet(s), dont ${comptes.objetsEnCorbeille} en corbeille et ${comptes.vignettesAnciennes} vignette(s) de l'ancien site.`,
		`Base : ${comptes.medias} média(s), dont ${comptes.mediasUtilises} utilisé(s) par un profil ou un article (${comptes.objetsAttendus} objet(s) attendus).`,
		`Objets sans média : ${rapport.objetsSansMedia.length}`,
		...rapport.objetsSansMedia.map(cle => `  ${cle}`),
		`Médias sans objet : ${rapport.mediasSansObjet.length}`,
		...rapport.mediasSansObjet.map(({ id, cles }) => `  média ${id} : ${cles.join(', ')}`),
		`Médias sans profil : ${rapport.mediasSansProfil.length}`,
		...rapport.mediasSansProfil.map(id => `  média ${id}`),
		...(rapport.importes.length > 0
			? [`Dont adoptés de l'ancien site par l'import : ${rapport.importes.map(id => `média ${id}`).join(', ')}.`]
			: []),
		rapport.sansOrphelin ? '0 orphelin.' : 'Orphelins trouvés : rien n’a été supprimé.',
	]
	return lignes.join('\n')
}
