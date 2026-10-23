import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
	copyFreshness,
	isCopied,
	MANIFEST_PREFIX,
	manifestKey,
	planCopy,
	restoreCheck,
	runCopy,
} from '../../scripts/media/backup/copy'
import {
	onlyTrashRuleDiffers,
	planLifecycle,
	TRASH_RULE_ID,
	trashRule,
	trashRuleIsSet,
} from '../../scripts/media/backup/lifecycle'
import { type LifecycleRule, md5Hex, R2Client, type StoredObject } from '../../scripts/media/backup/r2'

const ACCOUNT = 'a'.repeat(32)
const SOURCE = 'my-makeup'
const BACKUP = 'my-makeup-media-backup'
const encoder = new TextEncoder()

/** A Cloudflare R2 REST API in memory: buckets of objects, lifecycle rules, and the log of every request. */
function fakeCloudflare(initial: Record<string, Record<string, string>>, rules: LifecycleRule[] = []) {
	const buckets = new Map(Object.entries(initial).map(([name, files]) => [name, new Map(Object.entries(files))]))
	const log: { method: string; bucket: string; what: string }[] = []
	let lifecycle = rules
	const fetcher = async (url: string, init: RequestInit = {}): Promise<Response> => {
		const method = init.method ?? 'GET'
		const parsed = new URL(url)
		const match = parsed.pathname.match(/\/r2\/buckets\/([^/]+)\/(objects|lifecycle)(?:\/(.+))?$/)
		if (!match) return new Response('{}', { status: 400 })
		const [, bucket = '', kind = '', rawKey] = match
		const store = buckets.get(bucket)
		log.push({ method, bucket, what: kind })
		if (kind === 'lifecycle') {
			if (method === 'PUT') lifecycle = JSON.parse(String(init.body)).rules
			return Response.json({ success: true, result: { rules: lifecycle } })
		}
		if (!store) return new Response('{}', { status: 404 })
		if (!rawKey) {
			const prefix = parsed.searchParams.get('prefix') ?? ''
			const perPage = Number(parsed.searchParams.get('per_page') ?? 1000)
			const after = parsed.searchParams.get('cursor') ?? ''
			const keys = [...store.keys()].filter(key => key.startsWith(prefix) && key > after).sort()
			const page = keys.slice(0, 2)
			void perPage
			return Response.json({
				success: true,
				result: page.map(key => ({
					key,
					size: encoder.encode(store.get(key)).byteLength,
					etag: `"${md5Hex(encoder.encode(store.get(key)))}"`,
					last_modified: '2026-10-20T00:00:00Z',
				})),
				result_info: { is_truncated: keys.length > page.length, cursor: page.at(-1) },
			})
		}
		const key = decodeURIComponent(rawKey)
		if (method === 'PUT') {
			const body = await new Response(init.body).text()
			store.set(key, body)
			return Response.json({ success: true, result: { etag: md5Hex(encoder.encode(body)) } })
		}
		if (method === 'GET') {
			const value = store.get(key)
			if (value === undefined) return new Response(null, { status: 404 })
			return new Response(value, { headers: { etag: `"${md5Hex(encoder.encode(value))}"` } })
		}
		return new Response(null, { status: 405 })
	}
	return { fetcher, buckets, log, rules: () => lifecycle }
}

const clientOf = (fake: ReturnType<typeof fakeCloudflare>) =>
	new R2Client({
		token: 't',
		accountId: ACCOUNT,
		sourceBucket: SOURCE,
		backupBucket: BACKUP,
		fetcher: fake.fetcher,
		pause: async () => {},
		retries: 0,
	})

const object = (key: string, content: string): StoredObject => ({
	key,
	size: encoder.encode(content).byteLength,
	etag: md5Hex(encoder.encode(content)),
	lastModified: '',
})

describe('La règle de la corbeille (ticket 278)', () => {
	const defaultRule: LifecycleRule = {
		id: 'Default Multipart Abort',
		enabled: true,
		conditions: { prefix: '' },
		abortMultipartUploadsTransition: { condition: { maxAge: 604_800, type: 'Age' } },
	}

	test('la règle vise le préfixe deleted/ seul et supprime à 30 jours', () => {
		expect(trashRule()).toEqual({
			id: TRASH_RULE_ID,
			enabled: true,
			conditions: { prefix: 'deleted/' },
			deleteObjectsTransition: { condition: { maxAge: 30 * 86_400, type: 'Age' } },
		})
	})

	test('elle s’ajoute sans toucher à la règle existante, et la relecture le montre', () => {
		const plan = planLifecycle([defaultRule])
		expect(plan.action).toBe('add')
		expect(plan.rules).toEqual([defaultRule, trashRule()])
		expect(onlyTrashRuleDiffers([defaultRule], plan.rules)).toBe(true)
		expect(trashRuleIsSet(plan.rules)).toBe(true)
	})

	test('déjà posée : rien à faire ; corrigée si elle diffère', () => {
		expect(planLifecycle([defaultRule, trashRule()]).action).toBe('none')
		const wrong = { ...trashRule(), deleteObjectsTransition: { condition: { maxAge: 86_400, type: 'Age' } } }
		const plan = planLifecycle([wrong, defaultRule])
		expect(plan.action).toBe('update')
		expect(plan.rules).toEqual([trashRule(), defaultRule])
	})

	test('une autre règle qui supprime hors de deleted/ est signalée et bloque', () => {
		const risky: LifecycleRule = {
			id: 'Old media',
			enabled: true,
			conditions: { prefix: 'media/' },
			deleteObjectsTransition: { condition: { maxAge: 100, type: 'Age' } },
		}
		expect(planLifecycle([defaultRule, risky]).dangerousRules).toEqual(['Old media'])
		expect(planLifecycle([defaultRule]).dangerousRules).toEqual([])
	})

	test('une relecture où une autre règle a changé est refusée', () => {
		expect(onlyTrashRuleDiffers([defaultRule], [{ ...defaultRule, enabled: false }, trashRule()])).toBe(false)
		expect(onlyTrashRuleDiffers([defaultRule], [trashRule()])).toBe(false)
	})
})

describe('Le plan de la copie', () => {
	test('les objets de deleted/ et les manifestes ne sont jamais copiés', () => {
		expect(isCopied('media/a.webp')).toBe(true)
		expect(isCopied('deleted/media/a.webp')).toBe(false)
		expect(isCopied(`${MANIFEST_PREFIX}x.json`)).toBe(false)
	})

	test('nouveaux, changés, identiques, retirés de la source', () => {
		const source = [
			object('media/new.webp', 'n'),
			object('media/changed.webp', 'v2'),
			object('media/same.webp', 's'),
			object('deleted/media/gone.webp', 'g'),
		]
		const copy = [object('media/changed.webp', 'v1'), object('media/same.webp', 's'), object('media/retired.webp', 'r')]
		const plan = planCopy(source, copy)
		expect(plan.toCopy.map(o => o.key)).toEqual(['media/new.webp'])
		expect(plan.toReplace.map(o => o.key)).toEqual(['media/changed.webp'])
		expect(plan.same).toBe(1)
		expect(plan.retiredFromSource).toBe(1)
		expect(plan.sourceObjects).toBe(3)
	})
})

describe('Une passe de la copie', () => {
	const now = () => new Date('2026-10-22T03:00:00.123Z')

	test('à blanc : rien n’est écrit, pas de manifeste', async () => {
		const fake = fakeCloudflare({ [SOURCE]: { 'media/a.webp': 'a' }, [BACKUP]: {} })
		const manifest = await runCopy(clientOf(fake), { apply: false, now })
		expect(manifest.dryRun).toBe(true)
		expect(manifest.planned.toCopy).toBe(1)
		expect(fake.buckets.get(BACKUP)?.size).toBe(0)
		expect(fake.log.some(entry => entry.method === 'PUT')).toBe(false)
	})

	test('copie les nouveaux, hors deleted/, vérifie, écrit le manifeste daté sans clé', async () => {
		const fake = fakeCloudflare({
			[SOURCE]: { 'media/a.webp': 'a', 'media/b.webp': 'bb', 'old-root.png': 'cc', 'deleted/media/c.webp': 'c' },
			[BACKUP]: {},
		})
		const manifest = await runCopy(clientOf(fake), { apply: true, now })
		const backup = fake.buckets.get(BACKUP)
		expect([...(backup?.keys() ?? [])].sort()).toEqual([
			'_backup-manifests/2026-10-22T03-00-00-123Z.json',
			'media/a.webp',
			'media/b.webp',
			'old-root.png',
		])
		expect(manifest).toMatchObject({ copied: 3, replaced: 0, errors: 0, gaps: 0, bytesWritten: 5, sourceObjects: 3 })
		expect(manifest.sourceFingerprint).toBe(manifest.copyFingerprint)
		const written = backup?.get(manifestKey(now())) ?? ''
		expect(written).not.toContain('media/')
		expect(JSON.parse(written).at).toBe('2026-10-22T03:00:00.123Z')
	})

	test('second passage : rien à copier ; un objet changé est remplacé ; un retiré reste dans la copie', async () => {
		const fake = fakeCloudflare({
			[SOURCE]: { 'media/a.webp': 'a1', 'media/b.webp': 'b' },
			[BACKUP]: { 'media/a.webp': 'a0', 'media/b.webp': 'b', 'media/retired.webp': 'r' },
		})
		const manifest = await runCopy(clientOf(fake), { apply: true, now })
		expect(manifest).toMatchObject({ copied: 0, replaced: 1, retiredFromSource: 1, gaps: 0 })
		expect(fake.buckets.get(BACKUP)?.get('media/a.webp')).toBe('a1')
		expect(fake.buckets.get(BACKUP)?.get('media/retired.webp')).toBe('r')
	})

	test('jamais de suppression, jamais d’écriture dans la source', async () => {
		const fake = fakeCloudflare({ [SOURCE]: { 'media/a.webp': 'a' }, [BACKUP]: { 'media/x.webp': 'x' } })
		await runCopy(clientOf(fake), { apply: true, now })
		expect(fake.log.filter(entry => entry.method === 'DELETE')).toEqual([])
		expect(fake.log.filter(entry => entry.method === 'PUT' && entry.bucket === SOURCE)).toEqual([])
	})

	test('le client refuse d’écrire dans le compartiment des photos', async () => {
		const fake = fakeCloudflare({ [SOURCE]: {}, [BACKUP]: {} })
		await expect(clientOf(fake).putObject(SOURCE, 'media/a.webp', encoder.encode('a'), null)).rejects.toThrow(
			'écriture refusée'
		)
		expect(fake.log).toEqual([])
	})

	test('un contenu qui ne correspond pas à l’ETag est une erreur comptée, sans clé dans la sortie', async () => {
		const fake = fakeCloudflare({ [SOURCE]: { 'media/a.webp': 'a', 'media/b.webp': 'b' }, [BACKUP]: {} })
		const inner = fake.fetcher
		const lying = async (url: string, init?: RequestInit) => {
			const response = await inner(url, init)
			return url.includes('/objects/media%2Fa') || url.endsWith('/objects/media/a.webp')
				? new Response('tampered', { headers: { etag: `"${md5Hex(encoder.encode('a'))}"` } })
				: response
		}
		const client = new R2Client({
			token: 't',
			accountId: ACCOUNT,
			sourceBucket: SOURCE,
			backupBucket: BACKUP,
			fetcher: lying,
			pause: async () => {},
			retries: 0,
		})
		const manifest = await runCopy(client, { apply: true, now })
		expect(manifest.errors).toBe(1)
		expect(manifest.gaps).toBe(1)
		expect(JSON.stringify(manifest)).not.toContain('media/')
	})
})

describe('L’âge de la dernière copie', () => {
	const at = new Date('2026-10-22T03:00:00.123Z')

	test('aucun manifeste : en retard', async () => {
		const fake = fakeCloudflare({ [SOURCE]: {}, [BACKUP]: {} })
		expect(await copyFreshness(clientOf(fake), at)).toEqual({ lastPassAt: null, ageHours: null, stale: true })
	})

	test('le plus récent des manifestes fait foi ; 48 heures pile : à jour, au-delà : alerte', async () => {
		const fake = fakeCloudflare({
			[SOURCE]: {},
			[BACKUP]: { [manifestKey(new Date('2026-10-19T03:00:00.123Z'))]: '{}', [manifestKey(at)]: '{}' },
		})
		const client = clientOf(fake)
		expect(await copyFreshness(client, new Date('2026-10-24T03:00:00.123Z'))).toEqual({
			lastPassAt: at.toISOString(),
			ageHours: 48,
			stale: false,
		})
		expect((await copyFreshness(client, new Date('2026-10-24T03:00:01.123Z'))).stale).toBe(true)
	})
})

describe('La restauration d’essai', () => {
	test('un objet de la copie revient identique dans un compartiment jetable', async () => {
		const fake = fakeCloudflare({ [SOURCE]: {}, [BACKUP]: { 'media/a.webp': 'contenu' }, 'scratch-restore': {} })
		const result = await restoreCheck(clientOf(fake), 'media/a.webp', 'scratch-restore')
		expect(result).toMatchObject({ identical: true, size: 7, md5: md5Hex(encoder.encode('contenu')) })
		expect(result.keyFingerprint).toMatch(/^[0-9a-f]{64}$/)
		expect(fake.buckets.get('scratch-restore')?.get('media/a.webp')).toBe('contenu')
	})

	test('refusée vers la source ou vers la copie', async () => {
		const fake = fakeCloudflare({ [SOURCE]: {}, [BACKUP]: { 'media/a.webp': 'a' } })
		await expect(restoreCheck(clientOf(fake), 'media/a.webp', SOURCE)).rejects.toThrow('jetable')
		await expect(restoreCheck(clientOf(fake), 'media/a.webp', BACKUP)).rejects.toThrow('jetable')
	})
})

describe('Le client n’a aucun moyen de supprimer', () => {
	test('ni méthode DELETE, ni commande de suppression, dans les fichiers de la copie', () => {
		for (const file of ['r2.ts', 'copy.ts', 'lifecycle.ts', '../backup.ts']) {
			const text = readFileSync(path.join(import.meta.dir, '../../scripts/media/backup', file), 'utf8')
			expect(text).not.toMatch(/['"]DELETE['"]|DeleteObject|\.deleteObjects?\s*\(|\.retirer\s*\(/)
		}
	})
})
