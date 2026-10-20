import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { PayloadRequest, RequestContext } from 'payload'
import { GET as servirLaCle } from '@/app/api/indexnow/[key]/route'
import { refresh } from '../../src/collections/revalidate'
import { type EnvError, parseServerEnv } from '../../src/lib/env'
import { IMPORT_CONTEXT } from '../../src/lib/import-context'
import {
	changedUrls,
	flushQueue,
	forgetQueue,
	indexNowKey,
	keyIfSubmitAllowed,
	pendingUrls,
	reportLater,
	SUBMIT_ENDPOINT,
	sitemapUrls,
	submitToIndexNow,
	URLS_PER_SUBMISSION,
} from '../../src/lib/seo/indexnow'

/**
 * Ticket 219 (plan 03 SEO-28): the key file, the addresses a save sends, and the places they leave
 * from, with a fake endpoint. Nothing here reaches the network.
 */

const KEY = '0123456789abcdef0123456789abcdef'
const SITE = 'https://my-makeup.fr'
const SITE_ENV = { INDEXNOW_KEY: KEY, NEXT_PUBLIC_SITE_URL: SITE }

const published = (slug: string, indexable = true) => ({ slug, visible: true, indexable })
const cache = (slug: string) => ({ slug, visible: false, indexable: false })

describe('le fichier de clé', () => {
	const before = process.env.INDEXNOW_KEY
	afterEach(() => {
		if (before === undefined) delete process.env.INDEXNOW_KEY
		else process.env.INDEXNOW_KEY = before
	})
	const makeRequest = (cle: string) =>
		servirLaCle(new Request(`${SITE}/api/indexnow/${cle}`), { params: Promise.resolve({ key: cle }) })

	test('avec la variable : 200, la clé pour seul contenu', async () => {
		process.env.INDEXNOW_KEY = KEY
		const response = await makeRequest(KEY)
		expect(response.status).toBe(200)
		expect(await response.text()).toBe(KEY)
		expect(response.headers.get('content-type')).toContain('text/plain')
	})

	test('sans la variable, ou vide, ou illisible : rien n’est servi', async () => {
		for (const value of [undefined, '', '   ', 'court', KEY.toUpperCase(), `${KEY}0`]) {
			if (value === undefined) delete process.env.INDEXNOW_KEY
			else process.env.INDEXNOW_KEY = value
			expect((await makeRequest(KEY)).status).toBe(404)
			expect((await makeRequest(value ?? 'x')).status).toBe(404)
		}
	})

	test('une autre clé que celle de la variable : 404', async () => {
		process.env.INDEXNOW_KEY = KEY
		expect((await makeRequest('f'.repeat(32))).status).toBe(404)
	})
})

describe('la variable INDEXNOW_KEY', () => {
	const base = { DATABASE_URI: 'postgres://u:p@localhost:5432/base', PAYLOAD_SECRET: 'x'.repeat(40) }

	test('absente ou vide : le démarrage passe ; une valeur illisible l’arrête, sans l’écrire', () => {
		expect(() => parseServerEnv(base)).not.toThrow()
		expect(() => parseServerEnv({ ...base, INDEXNOW_KEY: '  ' })).not.toThrow()
		expect(() => parseServerEnv({ ...base, INDEXNOW_KEY: KEY })).not.toThrow()
		const error = (() => {
			try {
				parseServerEnv({ ...base, INDEXNOW_KEY: 'pas-une-cle-valable' })
			} catch (e) {
				return e as EnvError
			}
		})()
		expect(error?.variables).toEqual(['INDEXNOW_KEY'])
		expect(error?.message).not.toContain('pas-une-cle-valable')
	})

	test('la clé lue : 32 caractères hexadécimaux en minuscules, rien d’autre', () => {
		expect(indexNowKey(` ${KEY} `)).toBe(KEY)
		for (const fake of [undefined, '', KEY.slice(1), `${KEY}a`, KEY.toUpperCase(), 'g'.repeat(32)])
			expect(indexNowKey(fake)).toBeUndefined()
	})
})

describe('où l’envoi est permis', () => {
	test('le site, avec la clé : oui', () => {
		expect(keyIfSubmitAllowed(SITE_ENV)).toBe(KEY)
		expect(keyIfSubmitAllowed({ ...SITE_ENV, APP_ENV: 'prod' })).toBe(KEY)
	})

	test('sans clé, sur un hôte temporaire, sur un poste, sur le banc de test : non', () => {
		expect(keyIfSubmitAllowed({ NEXT_PUBLIC_SITE_URL: SITE })).toBeUndefined()
		expect(keyIfSubmitAllowed({ ...SITE_ENV, NEXT_PUBLIC_SITE_URL: 'https://v3.my-makeup.fr' })).toBeUndefined()
		expect(keyIfSubmitAllowed({ ...SITE_ENV, NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3419' })).toBeUndefined()
		expect(keyIfSubmitAllowed({ INDEXNOW_KEY: KEY })).toBeUndefined()
		expect(keyIfSubmitAllowed({ ...SITE_ENV, APP_ENV: 'test' })).toBeUndefined()
	})
})

describe('les adresses d’un enregistrement', () => {
	test('un profil qui devient publiable, qui cesse de l’être, qui change : son adresse définitive', () => {
		const expected = [`${SITE}/profil/zoe-lefevre`]
		expect(changedUrls('profiles', cache('zoe-lefevre'), published('zoe-lefevre'))).toEqual(expected)
		expect(changedUrls('profiles', published('zoe-lefevre'), cache('zoe-lefevre'))).toEqual(expected)
		expect(changedUrls('profiles', published('zoe-lefevre'), published('zoe-lefevre'))).toEqual(expected)
		expect(changedUrls('profiles', null, published('zoe-lefevre'))).toEqual(expected)
		expect(changedUrls('profiles', published('zoe-lefevre'), null)).toEqual(expected)
	})

	test('un profil publié mais pas publiable, ou masqué qui le reste : rien', () => {
		expect(changedUrls('profiles', published('zoe', false), published('zoe', false))).toEqual([])
		expect(changedUrls('profiles', cache('zoe'), cache('zoe'))).toEqual([])
		expect(changedUrls('profiles', null, null)).toEqual([])
	})

	test('une adresse qui change : l’ancienne et la nouvelle, une seule fois chacune', () => {
		expect(changedUrls('articles', published('ancienne'), published('nouvelle'))).toEqual([
			`${SITE}/blog/ancienne`,
			`${SITE}/blog/nouvelle`,
		])
	})

	test('un article, un talent : sa page, jamais une liste ; un brouillon qui reste brouillon : rien', () => {
		expect(changedUrls('articles', null, published('un-article'))).toEqual([`${SITE}/blog/un-article`])
		expect(changedUrls('talents', published('mariee'), null)).toEqual([`${SITE}/talent/mariee`])
		expect(changedUrls('talents', published('mariee'), published('mariee'))).toEqual([`${SITE}/talent/mariee`])
		expect(changedUrls('articles', cache('brouillon'), cache('brouillon'))).toEqual([])
	})

	test('un slug qui n’en est pas un (slug provisoire d’un profil en création) : rien', () => {
		expect(changedUrls('profiles', null, published('_provisoire-1234'))).toEqual([])
	})
})

/** A fake endpoint: records the requests, answers what it is told. */
function uploadFakePoint(status = 202) {
	const calls: { adresse: string; corps: { host: string; key: string; keyLocation: string; urlList: string[] } }[] = []
	const find = mock(async (adresse: string, options: RequestInit) => {
		calls.push({ adresse, corps: JSON.parse(String(options.body)) })
		return { status }
	})
	return { appels: calls, chercher: find }
}

describe('la requête', () => {
	test('un envoi : l’hôte principal, la clé, son emplacement et les adresses, en https vers le point commun', async () => {
		const { appels: calls, chercher: find } = uploadFakePoint()
		await submitToIndexNow([`${SITE}/profil/zoe-lefevre`, `${SITE}/profil/zoe-lefevre`], KEY, find)
		expect(calls).toEqual([
			{
				adresse: SUBMIT_ENDPOINT,
				corps: {
					host: 'my-makeup.fr',
					key: KEY,
					keyLocation: `${SITE}/${KEY}.txt`,
					urlList: [`${SITE}/profil/zoe-lefevre`],
				},
			},
		])
		expect(SUBMIT_ENDPOINT.startsWith('https://')).toBe(true)
	})

	test('jamais d’adresse hors de l’hôte principal en https', async () => {
		const { appels: calls, chercher: find } = uploadFakePoint()
		await submitToIndexNow(
			[
				`${SITE}/blog/ok`,
				'http://my-makeup.fr/blog/http',
				'https://www.my-makeup.fr/blog/www',
				'https://v3.my-makeup.fr/blog/temporaire',
				'https://my-makeup.fr.exemple.test/blog/piege',
				'https://autre.test/blog/autre',
				'pas une adresse',
			],
			KEY,
			find
		)
		expect(calls.flatMap(({ corps }) => corps.urlList)).toEqual([`${SITE}/blog/ok`])
		const empty = uploadFakePoint()
		await submitToIndexNow(['https://autre.test/'], KEY, empty.chercher)
		expect(empty.appels).toEqual([])
	})

	test('plus de 10 000 adresses : plusieurs requêtes', async () => {
		const { appels: calls, chercher: find } = uploadFakePoint(200)
		const urls = Array.from({ length: URLS_PER_SUBMISSION + 1 }, (_, i) => `${SITE}/profil/p-${i}`)
		await submitToIndexNow(urls, KEY, find)
		expect(calls.map(({ corps }) => corps.urlList.length)).toEqual([URLS_PER_SUBMISSION, 1])
	})

	test('un refus lève une erreur qui nomme le statut, jamais la clé', async () => {
		const { chercher: find } = uploadFakePoint(403)
		const error = await submitToIndexNow([`${SITE}/blog/a`], KEY, find).catch(e => e as Error)
		expect(error).toBeInstanceOf(Error)
		expect((error as Error).message).toContain('403')
		expect((error as Error).message).not.toContain(KEY)
	})

	test('les adresses d’un sitemap : celles de l’hôte principal, décodées', () => {
		const xml = `<urlset><url><loc>${SITE}/</loc></url><url><loc> ${SITE}/profil/a?x=1&amp;y=2 </loc></url>
			<url><loc>https://autre.test/x</loc></url><url><loc>${SITE}/</loc></url></urlset>`
		expect(sitemapUrls(xml)).toEqual([`${SITE}/`, `${SITE}/profil/a?x=1&y=2`])
	})
})

/** A request of Payload with the stored rows the hooks read, and a logger that records. */
function request(lignes: Record<string, unknown>[]) {
	const findOne = mock(async () => lignes.shift() ?? null)
	const log = { debug: mock(() => {}), info: mock(() => {}), error: mock(() => {}) }
	const req = { payload: { db: { findOne }, logger: log } } as unknown as PayloadRequest
	return { req, journal: log }
}

describe('les crochets de Payload', () => {
	const before = { cle: process.env.INDEXNOW_KEY, site: process.env.NEXT_PUBLIC_SITE_URL, appEnv: process.env.APP_ENV }
	const trueFetch = globalThis.fetch
	let fake: ReturnType<typeof uploadFakePoint>

	beforeEach(() => {
		forgetQueue()
		process.env.INDEXNOW_KEY = KEY
		process.env.NEXT_PUBLIC_SITE_URL = SITE
		delete process.env.APP_ENV
		fake = uploadFakePoint()
		globalThis.fetch = fake.chercher as unknown as typeof fetch
	})
	afterEach(() => {
		forgetQueue()
		globalThis.fetch = trueFetch
		for (const [name, value] of [
			['INDEXNOW_KEY', before.cle],
			['NEXT_PUBLIC_SITE_URL', before.site],
			['APP_ENV', before.appEnv],
		] as const) {
			if (value === undefined) delete process.env[name]
			else process.env[name] = value
		}
	})

	const HOOKS = refresh('profiles')

	async function save(req: PayloadRequest, context: RequestContext, id = 7) {
		await HOOKS.avantEcriture({ context, data: {}, operation: 'update', originalDoc: { id }, req } as never)
		await HOOKS.apresEcriture({ context, doc: { id }, operation: 'update', previousDoc: { id }, req } as never)
	}

	const line = (status: string, publishable: boolean) => ({ id: 7, slug: 'zoe-lefevre', status, publishable })

	test('un profil publiable modifié : une seule requête, une seule adresse, après l’attente', async () => {
		const { req, journal: log } = request([line('published', true), line('published', true)])
		await save(req, {})
		// Nothing leaves while the save is still running.
		expect(fake.appels).toEqual([])
		expect(pendingUrls()).toEqual([`${SITE}/profil/zoe-lefevre`])

		await flushQueue()

		expect(fake.appels).toHaveLength(1)
		expect(fake.appels[0]?.corps.urlList).toEqual([`${SITE}/profil/zoe-lefevre`])
		expect(log.info).toHaveBeenCalledTimes(1)
		expect(log.error).not.toHaveBeenCalled()
	})

	test('un profil qui devient publiable, qui cesse de l’être : son adresse part', async () => {
		await save(request([line('published', false), line('published', true)]).req, {})
		await flushQueue()
		await save(request([line('published', true), line('published', false)]).req, {})
		await flushQueue()
		expect(fake.appels.map(({ corps }) => corps.urlList)).toEqual([
			[`${SITE}/profil/zoe-lefevre`],
			[`${SITE}/profil/zoe-lefevre`],
		])
	})

	test('un profil qui n’est pas publiable avant ni après : rien ne part', async () => {
		await save(request([line('published', false), line('published', false)]).req, {})
		expect(pendingUrls()).toEqual([])
		await flushQueue()
		expect(fake.appels).toEqual([])
	})

	test('plusieurs enregistrements proches : une requête pour tous', async () => {
		await save(request([line('published', true), line('published', true)]).req, {})
		const talents = refresh('talents')
		const { req } = request([
			{ id: 3, slug: 'mariee', _status: 'published' },
			{ id: 3, slug: 'mariee', _status: 'published' },
		])
		const context = {}
		await talents.avantEcriture({ context, data: {}, operation: 'update', originalDoc: { id: 3 }, req } as never)
		await talents.apresEcriture({ context, doc: { id: 3 }, operation: 'update', previousDoc: { id: 3 }, req } as never)
		await flushQueue()
		expect(fake.appels).toHaveLength(1)
		expect(fake.appels[0]?.corps.urlList).toEqual([`${SITE}/profil/zoe-lefevre`, `${SITE}/talent/mariee`])
	})

	test('un article publié, puis retiré (supprimé) : son adresse part', async () => {
		const articles = refresh('articles')
		const { req } = request([{ id: 4, slug: 'un-article', _status: 'published' }])
		const context = {}
		await articles.avantSuppression({ context, id: 4, req } as never)
		await articles.apresSuppression({ context, doc: { id: 4 }, id: 4, req } as never)
		await flushQueue()
		expect(fake.appels[0]?.corps.urlList).toEqual([`${SITE}/blog/un-article`])
	})

	test('pendant l’import : rien dans la file, rien ne part', async () => {
		const { req } = request([line('published', true), line('published', true)])
		await save(req, { ...IMPORT_CONTEXT })
		expect(pendingUrls()).toEqual([])
		await flushQueue()
		expect(fake.appels).toEqual([])
	})

	test('sans clé, hors du site, sur le banc : rien ne part', async () => {
		const lines = () => request([line('published', true), line('published', true)]).req
		delete process.env.INDEXNOW_KEY
		await save(lines(), {})
		process.env.INDEXNOW_KEY = KEY
		process.env.NEXT_PUBLIC_SITE_URL = 'https://v3.my-makeup.fr'
		await save(lines(), {})
		process.env.NEXT_PUBLIC_SITE_URL = SITE
		process.env.APP_ENV = 'test'
		await save(lines(), {})
		expect(pendingUrls()).toEqual([])
		await flushQueue()
		expect(fake.appels).toEqual([])
	})

	test('un envoi en échec n’empêche pas l’enregistrement et laisse une trace sans clé ni adresse', async () => {
		globalThis.fetch = (async () => {
			throw new Error('réseau coupé')
		}) as unknown as typeof fetch
		const { req, journal: log } = request([line('published', true), line('published', true)])
		await save(req, {})
		await flushQueue()
		expect(log.error).toHaveBeenCalledTimes(1)
		const [message] = log.error.mock.calls[0] as unknown as [string]
		expect(message).toContain('[indexnow]')
		expect(message).not.toContain(KEY)
		expect(message).not.toContain('zoe-lefevre')
	})

	test('la file elle-même ne garde que des adresses du site', () => {
		reportLater(['https://autre.test/x', `${SITE}/blog/a`], { cle: KEY, journal: { info() {}, error() {} } })
		expect(pendingUrls()).toEqual([`${SITE}/blog/a`])
	})
})
