/**
 * The object storage of the photos as the bin reaches it (src/lib/trash.ts, ticket 045):
 * Cloudflare R2 on the site, the S3 simulator on the test bench, through the S3 API.
 *
 * `@payloadcms/storage-s3` writes the photos; this client only moves them to the bin and back.
 * It holds the only removal of an object in the whole application (`retirer`), which
 * `moveToTrash` calls once the copy in the bin is checked: a test of tests/unit fails
 * if any other file of `src/` or `scripts/` sends one.
 *
 * Nothing connects when the client is built: the first request does.
 */

import {
	CopyObjectCommand,
	DeleteObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	S3Client,
} from '@aws-sdk/client-s3'
import type { StorageEnv } from './env'
// Relative imports on purpose: this file is also loaded by the Payload CLI, outside of Next.
import type { ObjectStorage } from './trash'

/**
 * The source of a copy as the S3 API reads it: the bucket, then the key, each segment encoded.
 * A key the storage gives (letters, digits, `-`, `_`, `.`) stays as it is.
 */
export const copySource = (bucket: string, cle: string): string =>
	`${bucket}/${cle.split('/').map(encodeURIComponent).join('/')}`

/** True when the storage answered that it holds no object under this key. */
const notFound = (erreur: unknown): boolean => {
	const { name, $metadata } = (erreur ?? {}) as { name?: unknown; $metadata?: { httpStatusCode?: unknown } }
	return name === 'NotFound' || name === 'NoSuchKey' || $metadata?.httpStatusCode === 404
}

/** One object of the storage as a listing shows it. */
export interface StorageObject {
	cle: string
	/** In bytes. */
	taille: number
}

/** The client of a storage, as R2 and the simulator of the bench both read it. */
const clientOf = ({ endpoint, accessKeyId, secretAccessKey }: StorageEnv): S3Client =>
	new S3Client({
		endpoint,
		region: 'auto',
		forcePathStyle: true,
		credentials: { accessKeyId, secretAccessKey },
	})

/**
 * Every object of the bucket, bin included, by key: all the pages of the listing are read. It only
 * reads (`ListObjectsV2`): the reconciliation of ticket 137 removes nothing.
 */
export async function listStorage(env: StorageEnv): Promise<StorageObject[]> {
	const client = clientOf(env)
	const objects: StorageObject[] = []
	let suite: string | undefined
	do {
		const page = await client.send(new ListObjectsV2Command({ Bucket: env.bucket, ContinuationToken: suite }))
		for (const { Key, Size } of page.Contents ?? [])
			if (Key !== undefined) objects.push({ cle: Key, taille: Size ?? 0 })
		suite = page.IsTruncated ? page.NextContinuationToken : undefined
	} while (suite)
	return objects
}

/** The storage of this environment (`serverEnv().storage`), as the bin needs it. */
export function createObjectStorage({ endpoint, bucket, accessKeyId, secretAccessKey }: StorageEnv): ObjectStorage {
	const client = new S3Client({
		endpoint,
		// R2 answers to the region `auto`; the simulator of the bench ignores it. As src/payload.config.ts.
		region: 'auto',
		// The bucket in the path, as R2 and the simulator both read it.
		forcePathStyle: true,
		credentials: { accessKeyId, secretAccessKey },
	})
	return {
		async taille(cle) {
			try {
				const { ContentLength } = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: cle }))
				return ContentLength ?? 0
			} catch (error) {
				if (notFound(error)) return undefined
				throw error
			}
		},
		async copier(source, destination) {
			await client.send(
				new CopyObjectCommand({ Bucket: bucket, Key: destination, CopySource: copySource(bucket, source) })
			)
		},
		async retirer(cle) {
			await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: cle }))
		},
	}
}
