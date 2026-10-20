/**
 * The client of the object storage of the bench (S3Mock): a test puts an object there, reads it
 * back, lists what the application wrote, and empties the bucket when it is done.
 *
 *   await deposerUnObjet('photos/une.webp', octets, { type: 'image/webp' })
 *   const objet = await lireUnObjet('photos/une.webp')
 *   expect(await listerLesObjets('photos/')).toEqual([{ cle: 'photos/une.webp', taille: octets.length }])
 *
 * The storage that is read and emptied is the one of the bench instance this process was started
 * for, and no other: a local address, and a bucket whose name ends with « -test ».
 *
 * The requests are plain S3 calls with the bucket in the path, and they are not signed: S3Mock
 * checks neither a signature nor a right. This client is a tool of the tests, not the way the
 * application reaches its storage.
 *
 * Only `fetch` and Node's own modules: no API of bun.
 */

import { servicesDuBanc, type Variables } from './bench'
import {
	demanderAuBanc,
	enTexte,
	exigerVariablesDuBanc,
	type ReponseDuBanc,
	reponseInattendue,
	type ServiceDuBanc,
} from './bench-request'
import { verifierStockage } from './environment-guard'

/** The storage of one bench instance: where it answers, and the bucket the tests write in. */
export interface Stockage extends ServiceDuBanc {
	adresse: string
	bucket: string
}

/** An object read back from the storage. */
export interface Objet {
	cle: string
	octets: Uint8Array
	/** The content type it was put with. */
	type: string
}

/** One line of a listing. */
export interface ObjetListe {
	cle: string
	/** In bytes. */
	taille: number
}

export interface Options {
	/** Replaced in a unit test only. By default: the storage of the bench, checked against the environment. */
	stockage?: Stockage
}

const SERVICE = 'stockage d’objets'

/** How many objects are deleted at once when the bucket is emptied. */
const SUPPRESSIONS_DE_FRONT = 20

/** The storage of the bench this process works on. Throws `BancRefuse` when the environment does not point at it. */
export function stockageDuBanc(variables: Variables = process.env): Stockage {
	const { instance, environnement } = exigerVariablesDuBanc(SERVICE, ['S3_ENDPOINT', 'S3_BUCKET'], variables)
	const { adresse, bucket } = servicesDuBanc(environnement).stockage
	return { service: SERVICE, instance, adresse, bucket }
}

/**
 * The path of a key in an address. A « . » or « .. » segment is refused: `fetch` would resolve
 * it, and the request would leave the bucket.
 */
function cheminDe(cle: string): string {
	const segments = cle.split('/')
	if (cle === '' || cle.startsWith('/') || segments.some(segment => segment === '.' || segment === '..'))
		throw new Error(
			'Clé d’objet refusée : elle ne peut être vide, ni commencer par « / », ni contenir un segment « . » ou « .. ».'
		)
	return segments.map(encodeURIComponent).join('/')
}

/** One request to the bucket. The target is checked first: local and « -test », or nothing is asked. */
async function demander(stockage: Stockage, suite: string, requete?: RequestInit): Promise<ReponseDuBanc> {
	verifierStockage({ S3_ENDPOINT: stockage.adresse, S3_BUCKET: stockage.bucket })
	return demanderAuBanc(stockage, `${stockage.adresse}/${encodeURIComponent(stockage.bucket)}${suite}`, requete)
}

/** Puts an object in the bucket, in place of the one that had this key. */
export async function deposerUnObjet(
	cle: string,
	contenu: string | Uint8Array,
	{ stockage = stockageDuBanc(), type = 'application/octet-stream' }: Options & { type?: string } = {}
): Promise<void> {
	const reponse = await demander(stockage, `/${cheminDe(cle)}`, {
		method: 'PUT',
		headers: { 'Content-Type': type },
		// Copied into a buffer of their own: `fetch` is typed to refuse bytes that may sit on a shared one.
		body: typeof contenu === 'string' ? contenu : new Blob([Uint8Array.from(contenu)]),
	})
	if (reponse.statut !== 200) throw reponseInattendue(stockage, 'déposer un objet', reponse)
}

/** The object that has this key, or nothing when the bucket holds none. */
export async function lireUnObjet(
	cle: string,
	{ stockage = stockageDuBanc() }: Options = {}
): Promise<Objet | undefined> {
	const reponse = await demander(stockage, `/${cheminDe(cle)}`)
	if (reponse.statut === 404 && enTexte(reponse).includes('<Code>NoSuchKey</Code>')) return undefined
	if (reponse.statut !== 200) throw reponseInattendue(stockage, 'lire un objet', reponse)
	return { cle, octets: reponse.octets, type: reponse.entetes.get('content-type') ?? '' }
}

/** Deletes the object that has this key. Deleting a key the bucket does not hold is not an error. */
export async function supprimerUnObjet(cle: string, { stockage = stockageDuBanc() }: Options = {}): Promise<void> {
	const reponse = await demander(stockage, `/${cheminDe(cle)}`, { method: 'DELETE' })
	if (reponse.statut !== 204) throw reponseInattendue(stockage, 'supprimer un objet', reponse)
}

const balise = (xml: string, nom: string): string | undefined => new RegExp(`<${nom}>([^<]*)</${nom}>`).exec(xml)?.[1]

/**
 * The objects of the bucket whose key starts with `prefixe`, in the order of their keys. Every
 * one of them: the storage answers by pages, and all the pages are read.
 */
export async function listerLesObjets(
	prefixe = '',
	{ stockage = stockageDuBanc(), parPage = 1000 }: Options & { parPage?: number } = {}
): Promise<ObjetListe[]> {
	const objets: ObjetListe[] = []
	let suite: string | undefined
	do {
		const parametres = new URLSearchParams({
			'list-type': '2',
			// Keys come back percent-encoded: a key may hold a character XML cannot.
			'encoding-type': 'url',
			'max-keys': String(parPage),
			prefix: prefixe,
			...(suite && { 'continuation-token': suite }),
		})
		const reponse = await demander(stockage, `?${parametres}`)
		if (reponse.statut !== 200) throw reponseInattendue(stockage, 'lister les objets', reponse)
		const xml = enTexte(reponse)
		for (const [, contenu = ''] of xml.matchAll(/<Contents>(.*?)<\/Contents>/gs)) {
			const cle = balise(contenu, 'Key')
			const taille = Number(balise(contenu, 'Size'))
			if (cle === undefined || !Number.isInteger(taille))
				throw new Error(`Le ${stockage.service} du banc « ${stockage.instance.nom} » a rendu une liste illisible.`)
			objets.push({ cle: decodeURIComponent(cle.replaceAll('+', ' ')), taille })
		}
		suite = balise(xml, 'IsTruncated') === 'true' ? balise(xml, 'NextContinuationToken') : undefined
	} while (suite)
	return objets
}

/** Reset: deletes every object of the bucket. The bucket itself stays. */
export async function viderLeStockage({ stockage = stockageDuBanc() }: Options = {}): Promise<void> {
	const cles = (await listerLesObjets('', { stockage })).map(({ cle }) => cle)
	for (let debut = 0; debut < cles.length; debut += SUPPRESSIONS_DE_FRONT)
		await Promise.all(cles.slice(debut, debut + SUPPRESSIONS_DE_FRONT).map(cle => supprimerUnObjet(cle, { stockage })))
}
