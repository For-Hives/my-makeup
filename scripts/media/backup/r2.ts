/**
 * The few calls of the Cloudflare REST API (v4) that the daily copy of the photos needs (ticket 278).
 *
 * Only a token is needed (`CLOUDFLARE_API_TOKEN`, given by `with-secret cloudflare -- …`), no S3 key.
 * The client has NO way to remove an object: there is no such method, and a test reads this file to
 * keep it so. Two guards run before any request leaves:
 * - an object is written in the backup bucket only (`putObject`), never in the bucket of the photos;
 * - the lifecycle rules are written on the bucket of the photos only (`putLifecycle`).
 *
 * Error messages name the operation, the bucket and the HTTP status; never a key (it may carry a
 * name), a URL or the token.
 */

import { createHash } from 'node:crypto'

export const API_URL = 'https://api.cloudflare.com/client/v4'

export class R2Error extends Error {
	override readonly name = 'R2Error'
	constructor(
		message: string,
		readonly status: number | null = null
	) {
		super(message)
	}
}

export interface StoredObject {
	key: string
	size: number
	/** Without quotes: the MD5 of the content for an object sent in one part. */
	etag: string
	lastModified: string
}

/** One rule of a bucket lifecycle, as the API reads and writes it. Unknown fields are kept as they come. */
export interface LifecycleRule {
	id: string
	enabled: boolean
	conditions?: { prefix?: string }
	deleteObjectsTransition?: unknown
	abortMultipartUploadsTransition?: unknown
	storageClassTransitions?: unknown
	[other: string]: unknown
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

export interface ClientOptions {
	token: string
	/** 32 hexadecimal characters. */
	accountId: string
	/** The bucket of the photos: read, and the only one that gets lifecycle rules. */
	sourceBucket: string
	/** The bucket of the copy: the only one an object is written to. */
	backupBucket: string
	fetcher?: Fetcher
	/** Waits between two requests (3 per second keeps under the 1 200 per 5 minutes of the API). */
	pause?: () => Promise<void>
	/** Retries after a network error, a 429 or a 5xx. */
	retries?: number
}

const RETRYABLE = new Set([429, 500, 502, 503, 504])

const asRecord = (value: unknown): Record<string, unknown> | null =>
	typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null

export const md5Hex = (bytes: Uint8Array): string => createHash('md5').update(bytes).digest('hex')

/** An ETag without its quotes (and without the weak mark). */
export const normalizeEtag = (etag: string): string => etag.replace(/^W\//, '').replaceAll('"', '')

/** An ETag that is not a bare MD5 (`<md5>-<parts>`) comes from a multipart upload. */
export const isMd5Etag = (etag: string): boolean => /^[0-9a-f]{32}$/.test(etag)

/** A key encoded segment by segment: the slashes stay separators. */
export const encodeKey = (key: string): string => {
	if (key === '') throw new R2Error('R2 : clé vide')
	return key.split('/').map(encodeURIComponent).join('/')
}

export class R2Client {
	private readonly fetcher: Fetcher
	private readonly pause: () => Promise<void>
	private readonly retries: number
	readonly sourceBucket: string
	readonly backupBucket: string

	constructor(private readonly options: ClientOptions) {
		if (options.token === '') throw new R2Error('R2 : jeton vide')
		if (!/^[0-9a-f]{32}$/.test(options.accountId)) throw new R2Error('R2 : identifiant de compte invalide')
		if (options.sourceBucket === options.backupBucket) throw new R2Error('R2 : la copie ne peut pas être la source')
		this.fetcher = options.fetcher ?? fetch
		this.pause = options.pause ?? (() => new Promise(resolve => setTimeout(resolve, 340)))
		this.retries = options.retries ?? 3
		this.sourceBucket = options.sourceBucket
		this.backupBucket = options.backupBucket
	}

	/** The client of the environment: `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_ACCOUNT_ID` (else the first account). */
	static async fromEnv(
		buckets: { sourceBucket: string; backupBucket: string },
		env: Record<string, string | undefined> = process.env,
		extra: Pick<ClientOptions, 'fetcher' | 'pause' | 'retries'> = {}
	): Promise<R2Client> {
		const token = env.CLOUDFLARE_API_TOKEN
		if (!token) throw new R2Error('R2 : CLOUDFLARE_API_TOKEN absent (lancer avec `with-secret cloudflare -- …`)')
		let accountId = env.CLOUDFLARE_ACCOUNT_ID
		if (!accountId) {
			const probe = new R2Client({ ...buckets, ...extra, token, accountId: '0'.repeat(32) })
			const body = asRecord(await (await probe.call('comptes', '-', `${API_URL}/accounts`, { method: 'GET' })).json())
			const first = Array.isArray(body?.result) ? asRecord(body.result[0]) : null
			if (typeof first?.id !== 'string') throw new R2Error('R2 comptes : aucun compte lisible')
			accountId = first.id
		}
		return new R2Client({ ...buckets, ...extra, token, accountId })
	}

	private bucketUrl(bucket: string): string {
		if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new R2Error('R2 : nom de bucket invalide')
		return `${API_URL}/accounts/${this.options.accountId}/r2/buckets/${bucket}`
	}

	private async call(
		operation: string,
		bucket: string,
		url: string,
		init: RequestInit,
		accepted: ReadonlySet<number> = new Set()
	): Promise<Response> {
		const label = `R2 ${operation} ${bucket}`
		for (let attempt = 0; ; attempt++) {
			await this.pause()
			let response: Response
			try {
				response = await this.fetcher(url, {
					...init,
					headers: { Accept: 'application/json', ...init.headers, Authorization: `Bearer ${this.options.token}` },
					signal: AbortSignal.timeout(120_000),
				})
			} catch {
				if (attempt < this.retries) continue
				throw new R2Error(`${label} : erreur réseau`)
			}
			if (response.ok || accepted.has(response.status)) return response
			if (RETRYABLE.has(response.status) && attempt < this.retries) {
				await response.body?.cancel()
				continue
			}
			throw new R2Error(`${label} : HTTP ${response.status}`, response.status)
		}
	}

	/** One page of objects (at most 1 000) of a bucket. */
	async listPage(
		bucket: string,
		options: { prefix?: string; perPage?: number; cursor?: string | null } = {}
	): Promise<{ objects: StoredObject[]; cursor: string | null }> {
		const params = new URLSearchParams({ per_page: String(options.perPage ?? 1000) })
		if (options.prefix) params.set('prefix', options.prefix)
		if (options.cursor) params.set('cursor', options.cursor)
		const response = await this.call('lister', bucket, `${this.bucketUrl(bucket)}/objects?${params}`, { method: 'GET' })
		const body = asRecord(await response.json().catch(() => null))
		if (body?.success !== true || !Array.isArray(body.result))
			throw new R2Error(`R2 lister ${bucket} : réponse illisible`)
		const objects = body.result.map((raw): StoredObject => {
			const o = asRecord(raw)
			if (typeof o?.key !== 'string' || typeof o.size !== 'number' || typeof o.etag !== 'string')
				throw new R2Error(`R2 lister ${bucket} : objet illisible`)
			return {
				key: o.key,
				size: o.size,
				etag: normalizeEtag(o.etag),
				lastModified: typeof o.last_modified === 'string' ? o.last_modified : '',
			}
		})
		const info = asRecord(body.result_info)
		return { objects, cursor: info?.is_truncated === true && typeof info.cursor === 'string' ? info.cursor : null }
	}

	/** Every object of the bucket, page after page. */
	async listAll(bucket: string, prefix?: string): Promise<StoredObject[]> {
		const all: StoredObject[] = []
		let cursor: string | null = null
		do {
			const page: { objects: StoredObject[]; cursor: string | null } = await this.listPage(bucket, {
				...(prefix ? { prefix } : {}),
				cursor,
			})
			all.push(...page.objects)
			cursor = page.cursor
		} while (cursor !== null)
		return all
	}

	/** The content of an object; nothing when it is gone. The MD5 is checked against the ETag when the ETag is one. */
	async getObject(
		bucket: string,
		key: string
	): Promise<{ bytes: Uint8Array; etag: string; contentType: string | null } | null> {
		const url = `${this.bucketUrl(bucket)}/objects/${encodeKey(key)}`
		const response = await this.call('lire', bucket, url, { method: 'GET', headers: { Accept: '*/*' } }, new Set([404]))
		if (response.status === 404) {
			await response.body?.cancel()
			return null
		}
		const bytes = new Uint8Array(await response.arrayBuffer())
		const etag = normalizeEtag(response.headers.get('etag') ?? '')
		if (isMd5Etag(etag) && md5Hex(bytes) !== etag)
			throw new R2Error(`R2 lire ${bucket} : MD5 du contenu différent de l'ETag`)
		return { bytes, etag, contentType: response.headers.get('content-type') }
	}

	/** Writes an object, in the bucket of the copy or in a scratch bucket (restore check). Refused in the bucket of the photos. */
	async putObject(
		bucket: string,
		key: string,
		bytes: Uint8Array,
		contentType: string | null
	): Promise<{ etag: string | null }> {
		if (bucket === this.options.sourceBucket)
			throw new R2Error(`R2 écrire ${bucket} : bucket des photos, écriture refusée`)
		const url = `${this.bucketUrl(bucket)}/objects/${encodeKey(key)}`
		const response = await this.call('écrire', bucket, url, {
			method: 'PUT',
			headers: { 'Content-Type': contentType ?? 'application/octet-stream' },
			body: bytes,
		})
		const result = asRecord(asRecord(await response.json().catch(() => null))?.result)
		return { etag: typeof result?.etag === 'string' ? normalizeEtag(result.etag) : null }
	}

	/** The lifecycle rules of the bucket of the photos. */
	async getLifecycle(): Promise<LifecycleRule[]> {
		const bucket = this.options.sourceBucket
		const response = await this.call(
			'règles',
			bucket,
			`${this.bucketUrl(bucket)}/lifecycle`,
			{ method: 'GET' },
			new Set([404])
		)
		if (response.status === 404) return []
		const body = asRecord(await response.json().catch(() => null))
		const rules = asRecord(body?.result)?.rules
		if (body?.success !== true || !Array.isArray(rules)) throw new R2Error(`R2 règles ${bucket} : réponse illisible`)
		return rules as LifecycleRule[]
	}

	/**
	 * Replaces ALL the rules of the bucket of the photos by `rules` (the API sets the whole list): the
	 * caller sends the rules it read plus its own (src: lifecycle.ts). Only that bucket takes rules.
	 */
	async putLifecycle(rules: LifecycleRule[]): Promise<void> {
		const bucket = this.options.sourceBucket
		await this.call('règles', bucket, `${this.bucketUrl(bucket)}/lifecycle`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ rules }),
		})
	}
}
