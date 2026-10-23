/**
 * The daily incremental copy of the photos (ticket 278): every object of the bucket of the photos
 * outside of the bin (`deleted/`), new or changed, goes to the bucket of the copy; each one is read
 * with its MD5 checked against the ETag, written, and its ETag compared with the MD5 of the bytes.
 *
 * The copy never removes anything: the client has no way to (r2.ts), and an object that left the
 * bucket of the photos stays in the copy (counted as `retiredFromSource`, see the document).
 *
 * Each pass writes a dated manifest into the copy, under `_backup-manifests/`: counts and
 * fingerprints only, no key, no name. The report of Monday reads the age of the last one.
 */

import { createHash } from 'node:crypto'
import { TRASH_PREFIX } from '../../../src/lib/trash'
import { isMd5Etag, md5Hex, type R2Client, type StoredObject } from './r2'

/** Where the manifests are written, in the copy. Not a photo: left out of every comparison. */
export const MANIFEST_PREFIX = '_backup-manifests/'

/** Older than this, the last copy is reported late (hours). */
export const MAX_AGE_HOURS = 48

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

/** True for an object the copy takes: outside of the bin and not one of our manifests. */
export const isCopied = (key: string): boolean =>
	!key.startsWith(`${TRASH_PREFIX}/`) && !key.startsWith(MANIFEST_PREFIX)

export interface CopyPlan {
	toCopy: StoredObject[]
	/** Same key in the copy, other content (size, or ETag when the source one is an MD5). */
	toReplace: StoredObject[]
	same: number
	/** In the copy only: left there, never removed. */
	retiredFromSource: number
	sourceObjects: number
	sourceBytes: number
}

/** The same object, as far as a listing can tell: size, and ETag when the source ETag is a bare MD5. */
const sameObject = (source: StoredObject, copy: StoredObject): boolean =>
	source.size === copy.size && (!isMd5Etag(source.etag) || source.etag === copy.etag)

export function planCopy(source: readonly StoredObject[], copy: readonly StoredObject[]): CopyPlan {
	const inSource = source.filter(object => isCopied(object.key))
	const inCopy = new Map(copy.filter(object => isCopied(object.key)).map(object => [object.key, object]))
	const plan: CopyPlan = {
		toCopy: [],
		toReplace: [],
		same: 0,
		retiredFromSource: 0,
		sourceObjects: inSource.length,
		sourceBytes: inSource.reduce((total, object) => total + object.size, 0),
	}
	for (const object of inSource) {
		const found = inCopy.get(object.key)
		if (found === undefined) plan.toCopy.push(object)
		else if (sameObject(object, found)) plan.same++
		else plan.toReplace.push(object)
		inCopy.delete(object.key)
	}
	plan.retiredFromSource = inCopy.size
	return plan
}

/** The fingerprint of a state: SHA-256 over the sorted lines `sha256(key) size etag`. No key leaves. */
export function stateFingerprint(objects: readonly StoredObject[]): string {
	const lines = objects.map(object => `${sha256(object.key)}\t${object.size}\t${object.etag}`).sort()
	return sha256(lines.join('\n'))
}

export interface Manifest {
	version: 1
	/** ISO 8601, UTC. */
	at: string
	dryRun: boolean
	sourceObjects: number
	sourceBytes: number
	planned: { toCopy: number; toReplace: number; same: number }
	copied: number
	replaced: number
	bytesWritten: number
	vanishedDuringPass: number
	changedDuringPass: number
	errors: number
	/** Source objects that the copy lacks or holds differently once the pass is done: expected 0. */
	gaps: number
	retiredFromSource: number
	sourceFingerprint: string
	copyFingerprint: string
}

export interface RunOptions {
	apply: boolean
	now?: () => Date
	log?: (line: string) => void
}

/** The name of the manifest object of a pass: sortable, no colon. */
export const manifestKey = (at: Date): string => `${MANIFEST_PREFIX}${at.toISOString().replace(/[:.]/g, '-')}.json`

/** One pass of the copy. Without `apply`, it only plans: no write, no manifest. */
export async function runCopy(client: R2Client, options: RunOptions): Promise<Manifest> {
	const now = options.now ?? (() => new Date())
	const log = options.log ?? (() => {})
	const source = (await client.listAll(client.sourceBucket)).filter(object => isCopied(object.key))
	const plan = planCopy(source, await client.listAll(client.backupBucket))
	log(`À copier ${plan.toCopy.length}, à remplacer ${plan.toReplace.length}, déjà identiques ${plan.same}.`)

	const counts = { copied: 0, replaced: 0, bytesWritten: 0, vanished: 0, changed: 0, errors: 0 }
	const wrote = new Set<string>()
	if (options.apply) {
		const jobs = [
			...plan.toCopy.map(object => ({ object, replace: false })),
			...plan.toReplace.map(object => ({ object, replace: true })),
		]
		for (const { object, replace } of jobs) {
			try {
				const read = await client.getObject(client.sourceBucket, object.key)
				if (read === null) {
					counts.vanished++
					continue
				}
				const digest = md5Hex(read.bytes)
				if (read.bytes.byteLength !== object.size || (isMd5Etag(object.etag) && digest !== object.etag))
					counts.changed++
				const put = await client.putObject(client.backupBucket, object.key, read.bytes, read.contentType)
				if (put.etag !== null && put.etag !== digest) throw new Error('etag mismatch')
				counts.bytesWritten += read.bytes.byteLength
				counts[replace ? 'replaced' : 'copied']++
				wrote.add(object.key)
			} catch {
				// The message may carry a key: only the count is kept.
				counts.errors++
			}
		}
	}

	// The check: list the copy again and compare every object of the source listing.
	const after = (await client.listAll(client.backupBucket)).filter(object => isCopied(object.key))
	const inCopy = new Map(after.map(object => [object.key, object]))
	const gaps = source.filter(object => {
		const found = inCopy.get(object.key)
		return found === undefined || !sameObject(object, found)
	}).length

	const at = now()
	const manifest: Manifest = {
		version: 1,
		at: at.toISOString(),
		dryRun: !options.apply,
		sourceObjects: plan.sourceObjects,
		sourceBytes: plan.sourceBytes,
		planned: { toCopy: plan.toCopy.length, toReplace: plan.toReplace.length, same: plan.same },
		copied: counts.copied,
		replaced: counts.replaced,
		bytesWritten: counts.bytesWritten,
		vanishedDuringPass: counts.vanished,
		changedDuringPass: counts.changed,
		errors: counts.errors,
		gaps,
		retiredFromSource: plan.retiredFromSource,
		sourceFingerprint: stateFingerprint(source),
		copyFingerprint: stateFingerprint(source.flatMap(object => inCopy.get(object.key) ?? [])),
	}
	if (options.apply) {
		const body = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`)
		await client.putObject(client.backupBucket, manifestKey(at), body, 'application/json')
	}
	return manifest
}

export interface Freshness {
	/** ISO 8601 of the last pass; null when the copy holds no manifest. */
	lastPassAt: string | null
	ageHours: number | null
	stale: boolean
}

/** The age of the last pass, read from the newest manifest name of the copy. Late beyond 48 hours, or when there is none. */
export async function copyFreshness(client: R2Client, now: Date = new Date()): Promise<Freshness> {
	const manifests = (await client.listAll(client.backupBucket, MANIFEST_PREFIX)).map(object => object.key).sort()
	const newest = manifests.at(-1)
	const match = newest?.match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json$/)
	if (!match) return { lastPassAt: null, ageHours: null, stale: true }
	const at = new Date(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`)
	if (Number.isNaN(at.getTime())) return { lastPassAt: null, ageHours: null, stale: true }
	const ageHours = (now.getTime() - at.getTime()) / 3_600_000
	return { lastPassAt: at.toISOString(), ageHours: Math.round(ageHours * 10) / 10, stale: ageHours > MAX_AGE_HOURS }
}

export interface RestoreResult {
	/** SHA-256 of the key: the key itself may carry a name. */
	keyFingerprint: string
	size: number
	md5: string
	identical: boolean
}

/** Restores one object of the copy into a scratch bucket and reads it back: same size, same MD5. */
export async function restoreCheck(client: R2Client, key: string, scratchBucket: string): Promise<RestoreResult> {
	if (scratchBucket === client.sourceBucket || scratchBucket === client.backupBucket)
		throw new Error('Le compartiment d’essai doit être un compartiment jetable, ni la source ni la copie.')
	const original = await client.getObject(client.backupBucket, key)
	if (original === null) throw new Error('Cet objet n’est pas dans la copie.')
	await client.putObject(scratchBucket, key, original.bytes, original.contentType)
	const back = await client.getObject(scratchBucket, key)
	const md5 = md5Hex(original.bytes)
	return {
		keyFingerprint: sha256(key),
		size: original.bytes.byteLength,
		md5,
		identical: back !== null && back.bytes.byteLength === original.bytes.byteLength && md5Hex(back.bytes) === md5,
	}
}
