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

import { benchServices, type Variables } from './bench'
import {
	type BenchResponse,
	type BenchService,
	inText,
	requestBench,
	requireBenchVariables,
	unexpectedResponse,
} from './bench-request'
import { checkStorage } from './environment-guard'

/** The storage of one bench instance: where it answers, and the bucket the tests write in. */
export interface ObjectStorage extends BenchService {
	adresse: string
	bucket: string
}

/** An object read back from the storage. */
export interface StorageObject {
	cle: string
	octets: Uint8Array
	/** The content type it was put with. */
	type: string
}

/** One line of a listing. */
export interface ObjectList {
	cle: string
	/** In bytes. */
	taille: number
}

export interface Options {
	/** Replaced in a unit test only. By default: the storage of the bench, checked against the environment. */
	stockage?: ObjectStorage
}

const SERVICE = 'stockage d’objets'

/** How many objects are deleted at once when the bucket is emptied. */
const FRONT_DELETIONS = 20

/** The storage of the bench this process works on. Throws `BancRefuse` when the environment does not point at it. */
export function benchStorage(variables: Variables = process.env): ObjectStorage {
	const { instance, environnement: environment } = requireBenchVariables(
		SERVICE,
		['S3_ENDPOINT', 'S3_BUCKET'],
		variables
	)
	const { adresse: url, bucket } = benchServices(environment).stockage
	return { service: SERVICE, instance, adresse: url, bucket }
}

/**
 * The path of a key in an address. A « . » or « .. » segment is refused: `fetch` would resolve
 * it, and the request would leave the bucket.
 */
function pathOf(cle: string): string {
	const segments = cle.split('/')
	if (cle === '' || cle.startsWith('/') || segments.some(segment => segment === '.' || segment === '..'))
		throw new Error(
			'Clé d’objet refusée : elle ne peut être vide, ni commencer par « / », ni contenir un segment « . » ou « .. ».'
		)
	return segments.map(encodeURIComponent).join('/')
}

/** One request to the bucket. The target is checked first: local and « -test », or nothing is asked. */
async function makeRequest(stockage: ObjectStorage, suite: string, requete?: RequestInit): Promise<BenchResponse> {
	checkStorage({ S3_ENDPOINT: stockage.adresse, S3_BUCKET: stockage.bucket })
	return requestBench(stockage, `${stockage.adresse}/${encodeURIComponent(stockage.bucket)}${suite}`, requete)
}

/** Puts an object in the bucket, in place of the one that had this key. */
export async function dropObject(
	cle: string,
	contenu: string | Uint8Array,
	{ stockage = benchStorage(), type = 'application/octet-stream' }: Options & { type?: string } = {}
): Promise<void> {
	const response = await makeRequest(stockage, `/${pathOf(cle)}`, {
		method: 'PUT',
		headers: { 'Content-Type': type },
		// Copied into a buffer of their own: `fetch` is typed to refuse bytes that may sit on a shared one.
		body: typeof contenu === 'string' ? contenu : new Blob([Uint8Array.from(contenu)]),
	})
	if (response.statut !== 200) throw unexpectedResponse(stockage, 'déposer un objet', response)
}

/** The object that has this key, or nothing when the bucket holds none. */
export async function readObject(
	cle: string,
	{ stockage = benchStorage() }: Options = {}
): Promise<StorageObject | undefined> {
	const response = await makeRequest(stockage, `/${pathOf(cle)}`)
	if (response.statut === 404 && inText(response).includes('<Code>NoSuchKey</Code>')) return undefined
	if (response.statut !== 200) throw unexpectedResponse(stockage, 'lire un objet', response)
	return { cle, octets: response.octets, type: response.entetes.get('content-type') ?? '' }
}

/** Deletes the object that has this key. Deleting a key the bucket does not hold is not an error. */
export async function deleteObject(cle: string, { stockage = benchStorage() }: Options = {}): Promise<void> {
	const response = await makeRequest(stockage, `/${pathOf(cle)}`, { method: 'DELETE' })
	if (response.statut !== 204) throw unexpectedResponse(stockage, 'supprimer un objet', response)
}

const tag = (xml: string, nom: string): string | undefined => new RegExp(`<${nom}>([^<]*)</${nom}>`).exec(xml)?.[1]

/**
 * The objects of the bucket whose key starts with `prefixe`, in the order of their keys. Every
 * one of them: the storage answers by pages, and all the pages are read.
 */
export async function listObjects(
	prefixe = '',
	{ stockage = benchStorage(), parPage = 1000 }: Options & { parPage?: number } = {}
): Promise<ObjectList[]> {
	const objects: ObjectList[] = []
	let suite: string | undefined
	do {
		const parameters = new URLSearchParams({
			'list-type': '2',
			// Keys come back percent-encoded: a key may hold a character XML cannot.
			'encoding-type': 'url',
			'max-keys': String(parPage),
			prefix: prefixe,
			...(suite && { 'continuation-token': suite }),
		})
		const response = await makeRequest(stockage, `?${parameters}`)
		if (response.statut !== 200) throw unexpectedResponse(stockage, 'lister les objets', response)
		const xml = inText(response)
		for (const [, content = ''] of xml.matchAll(/<Contents>(.*?)<\/Contents>/gs)) {
			const key = tag(content, 'Key')
			const size = Number(tag(content, 'Size'))
			if (key === undefined || !Number.isInteger(size))
				throw new Error(`Le ${stockage.service} du banc « ${stockage.instance.nom} » a rendu une liste illisible.`)
			objects.push({ cle: decodeURIComponent(key.replaceAll('+', ' ')), taille: size })
		}
		suite = tag(xml, 'IsTruncated') === 'true' ? tag(xml, 'NextContinuationToken') : undefined
	} while (suite)
	return objects
}

/** Reset: deletes every object of the bucket. The bucket itself stays. */
export async function emptyStorage({ stockage = benchStorage() }: Options = {}): Promise<void> {
	const keys = (await listObjects('', { stockage })).map(({ cle: key }) => key)
	for (let startedAt = 0; startedAt < keys.length; startedAt += FRONT_DELETIONS)
		await Promise.all(keys.slice(startedAt, startedAt + FRONT_DELETIONS).map(cle => deleteObject(cle, { stockage })))
}
