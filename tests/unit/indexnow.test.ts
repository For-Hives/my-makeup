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

const CLE = '0123456789abcdef0123456789abcdef'
const SITE = 'https://my-makeup.fr'
const ENV_DU_SITE = { INDEXNOW_KEY: CLE, NEXT_PUBLIC_SITE_URL: SITE }

const publie = (slug: string, indexable = true) => ({ slug, visible: true, indexable })
const cache = (slug: string) => ({ slug, visible: false, indexable: false })

describe('le fichier de clé', () => {
	const avant = process.env.INDEXNOW_KEY
	afterEach(() => {
		if (avant === undefined) delete process.env.INDEXNOW_KEY
		else process.env.INDEXNOW_KEY = avant
	})
	const demander = (cle: string) =>
		servirLaCle(new Request(`${SITE}/api/indexnow/${cle}`), { params: Promise.resolve({ key: cle }) })

	test('avec la variable : 200, la clé pour seul contenu', async () => {
		process.env.INDEXNOW_KEY = CLE
		const reponse = await demander(CLE)
		expect(reponse.status).toBe(200)
		expect(await reponse.text()).toBe(CLE)
		expect(reponse.headers.get('content-type')).toContain('text/plain')
	})

	test('sans la variable, ou vide, ou illisible : rien n’est servi', async () => {
		for (const valeur of [undefined, '', '   ', 'court', CLE.toUpperCase(), `${CLE}0`]) {
			if (valeur === undefined) delete process.env.INDEXNOW_KEY
			else process.env.INDEXNOW_KEY = valeur
			expect((await demander(CLE)).status).toBe(404)
			expect((await demander(valeur ?? 'x')).status).toBe(404)
		}
	})

	test('une autre clé que celle de la variable : 404', async () => {
		process.env.INDEXNOW_KEY = CLE
		expect((await demander('f'.repeat(32))).status).toBe(404)
	})
})

describe('la variable INDEXNOW_KEY', () => {
	const base = { DATABASE_URI: 'postgres://u:p@localhost:5432/base', PAYLOAD_SECRET: 'x'.repeat(40) }

	test('absente ou vide : le démarrage passe ; une valeur illisible l’arrête, sans l’écrire', () => {
		expect(() => parseServerEnv(base)).not.toThrow()
		expect(() => parseServerEnv({ ...base, INDEXNOW_KEY: '  ' })).not.toThrow()
		expect(() => parseServerEnv({ ...base, INDEXNOW_KEY: CLE })).not.toThrow()
		const erreur = (() => {
			try {
				parseServerEnv({ ...base, INDEXNOW_KEY: 'pas-une-cle-valable' })
			} catch (e) {
				return e as EnvError
			}
		})()
		expect(erreur?.variables).toEqual(['INDEXNOW_KEY'])
		expect(erreur?.message).not.toContain('pas-une-cle-valable')
	})

	test('la clé lue : 32 caractères hexadécimaux en minuscules, rien d’autre', () => {
		expect(indexNowKey(` ${CLE} `)).toBe(CLE)
		for (const faux of [undefined, '', CLE.slice(1), `${CLE}a`, CLE.toUpperCase(), 'g'.repeat(32)])
			expect(indexNowKey(faux)).toBeUndefined()
	})
})

describe('où l’envoi est permis', () => {
	test('le site, avec la clé : oui', () => {
		expect(keyIfSubmitAllowed(ENV_DU_SITE)).toBe(CLE)
		expect(keyIfSubmitAllowed({ ...ENV_DU_SITE, APP_ENV: 'prod' })).toBe(CLE)
	})

	test('sans clé, sur un hôte temporaire, sur un poste, sur le banc de test : non', () => {
		expect(keyIfSubmitAllowed({ NEXT_PUBLIC_SITE_URL: SITE })).toBeUndefined()
		expect(keyIfSubmitAllowed({ ...ENV_DU_SITE, NEXT_PUBLIC_SITE_URL: 'https://v3.my-makeup.fr' })).toBeUndefined()
		expect(keyIfSubmitAllowed({ ...ENV_DU_SITE, NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3419' })).toBeUndefined()
		expect(keyIfSubmitAllowed({ INDEXNOW_KEY: CLE })).toBeUndefined()
		expect(keyIfSubmitAllowed({ ...ENV_DU_SITE, APP_ENV: 'test' })).toBeUndefined()
	})
})

describe('les adresses d’un enregistrement', () => {
	test('un profil qui devient publiable, qui cesse de l’être, qui change : son adresse définitive', () => {
		const attendu = [`${SITE}/profil/zoe-lefevre`]
		expect(changedUrls('profiles', cache('zoe-lefevre'), publie('zoe-lefevre'))).toEqual(attendu)
		expect(changedUrls('profiles', publie('zoe-lefevre'), cache('zoe-lefevre'))).toEqual(attendu)
		expect(changedUrls('profiles', publie('zoe-lefevre'), publie('zoe-lefevre'))).toEqual(attendu)
		expect(changedUrls('profiles', null, publie('zoe-lefevre'))).toEqual(attendu)
		expect(changedUrls('profiles', publie('zoe-lefevre'), null)).toEqual(attendu)
	})

	test('un profil publié mais pas publiable, ou masqué qui le reste : rien', () => {
		expect(changedUrls('profiles', publie('zoe', false), publie('zoe', false))).toEqual([])
		expect(changedUrls('profiles', cache('zoe'), cache('zoe'))).toEqual([])
		expect(changedUrls('profiles', null, null)).toEqual([])
	})

	test('une adresse qui change : l’ancienne et la nouvelle, une seule fois chacune', () => {
		expect(changedUrls('articles', publie('ancienne'), publie('nouvelle'))).toEqual([
			`${SITE}/blog/ancienne`,
			`${SITE}/blog/nouvelle`,
		])
	})

	test('un article, un talent : sa page, jamais une liste ; un brouillon qui reste brouillon : rien', () => {
		expect(changedUrls('articles', null, publie('un-article'))).toEqual([`${SITE}/blog/un-article`])
		expect(changedUrls('talents', publie('mariee'), null)).toEqual([`${SITE}/talent/mariee`])
		expect(changedUrls('talents', publie('mariee'), publie('mariee'))).toEqual([`${SITE}/talent/mariee`])
		expect(changedUrls('articles', cache('brouillon'), cache('brouillon'))).toEqual([])
	})

	test('un slug qui n’en est pas un (slug provisoire d’un profil en création) : rien', () => {
		expect(changedUrls('profiles', null, publie('_provisoire-1234'))).toEqual([])
	})
})

/** A fake endpoint: records the requests, answers what it is told. */
function fauxPointDEnvoi(status = 202) {
	const appels: { adresse: string; corps: { host: string; key: string; keyLocation: string; urlList: string[] } }[] = []
	const chercher = mock(async (adresse: string, options: RequestInit) => {
		appels.push({ adresse, corps: JSON.parse(String(options.body)) })
		return { status }
	})
	return { appels, chercher }
}

describe('la requête', () => {
	test('un envoi : l’hôte principal, la clé, son emplacement et les adresses, en https vers le point commun', async () => {
		const { appels, chercher } = fauxPointDEnvoi()
		await submitToIndexNow([`${SITE}/profil/zoe-lefevre`, `${SITE}/profil/zoe-lefevre`], CLE, chercher)
		expect(appels).toEqual([
			{
				adresse: SUBMIT_ENDPOINT,
				corps: {
					host: 'my-makeup.fr',
					key: CLE,
					keyLocation: `${SITE}/${CLE}.txt`,
					urlList: [`${SITE}/profil/zoe-lefevre`],
				},
			},
		])
		expect(SUBMIT_ENDPOINT.startsWith('https://')).toBe(true)
	})

	test('jamais d’adresse hors de l’hôte principal en https', async () => {
		const { appels, chercher } = fauxPointDEnvoi()
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
			CLE,
			chercher
		)
		expect(appels.flatMap(({ corps }) => corps.urlList)).toEqual([`${SITE}/blog/ok`])
		const vide = fauxPointDEnvoi()
		await submitToIndexNow(['https://autre.test/'], CLE, vide.chercher)
		expect(vide.appels).toEqual([])
	})

	test('plus de 10 000 adresses : plusieurs requêtes', async () => {
		const { appels, chercher } = fauxPointDEnvoi(200)
		const adresses = Array.from({ length: URLS_PER_SUBMISSION + 1 }, (_, i) => `${SITE}/profil/p-${i}`)
		await submitToIndexNow(adresses, CLE, chercher)
		expect(appels.map(({ corps }) => corps.urlList.length)).toEqual([URLS_PER_SUBMISSION, 1])
	})

	test('un refus lève une erreur qui nomme le statut, jamais la clé', async () => {
		const { chercher } = fauxPointDEnvoi(403)
		const erreur = await submitToIndexNow([`${SITE}/blog/a`], CLE, chercher).catch(e => e as Error)
		expect(erreur).toBeInstanceOf(Error)
		expect((erreur as Error).message).toContain('403')
		expect((erreur as Error).message).not.toContain(CLE)
	})

	test('les adresses d’un sitemap : celles de l’hôte principal, décodées', () => {
		const xml = `<urlset><url><loc>${SITE}/</loc></url><url><loc> ${SITE}/profil/a?x=1&amp;y=2 </loc></url>
			<url><loc>https://autre.test/x</loc></url><url><loc>${SITE}/</loc></url></urlset>`
		expect(sitemapUrls(xml)).toEqual([`${SITE}/`, `${SITE}/profil/a?x=1&y=2`])
	})
})

/** A request of Payload with the stored rows the hooks read, and a logger that records. */
function requete(lignes: Record<string, unknown>[]) {
	const findOne = mock(async () => lignes.shift() ?? null)
	const journal = { debug: mock(() => {}), info: mock(() => {}), error: mock(() => {}) }
	const req = { payload: { db: { findOne }, logger: journal } } as unknown as PayloadRequest
	return { req, journal }
}

describe('les crochets de Payload', () => {
	const avant = { cle: process.env.INDEXNOW_KEY, site: process.env.NEXT_PUBLIC_SITE_URL, appEnv: process.env.APP_ENV }
	const vraiFetch = globalThis.fetch
	let faux: ReturnType<typeof fauxPointDEnvoi>

	beforeEach(() => {
		forgetQueue()
		process.env.INDEXNOW_KEY = CLE
		process.env.NEXT_PUBLIC_SITE_URL = SITE
		delete process.env.APP_ENV
		faux = fauxPointDEnvoi()
		globalThis.fetch = faux.chercher as unknown as typeof fetch
	})
	afterEach(() => {
		forgetQueue()
		globalThis.fetch = vraiFetch
		for (const [nom, valeur] of [
			['INDEXNOW_KEY', avant.cle],
			['NEXT_PUBLIC_SITE_URL', avant.site],
			['APP_ENV', avant.appEnv],
		] as const) {
			if (valeur === undefined) delete process.env[nom]
			else process.env[nom] = valeur
		}
	})

	const HOOKS = refresh('profiles')

	async function enregistrer(req: PayloadRequest, context: RequestContext, id = 7) {
		await HOOKS.avantEcriture({ context, data: {}, operation: 'update', originalDoc: { id }, req } as never)
		await HOOKS.apresEcriture({ context, doc: { id }, operation: 'update', previousDoc: { id }, req } as never)
	}

	const ligne = (status: string, publishable: boolean) => ({ id: 7, slug: 'zoe-lefevre', status, publishable })

	test('un profil publiable modifié : une seule requête, une seule adresse, après l’attente', async () => {
		const { req, journal } = requete([ligne('published', true), ligne('published', true)])
		await enregistrer(req, {})
		// Nothing leaves while the save is still running.
		expect(faux.appels).toEqual([])
		expect(pendingUrls()).toEqual([`${SITE}/profil/zoe-lefevre`])

		await flushQueue()

		expect(faux.appels).toHaveLength(1)
		expect(faux.appels[0]?.corps.urlList).toEqual([`${SITE}/profil/zoe-lefevre`])
		expect(journal.info).toHaveBeenCalledTimes(1)
		expect(journal.error).not.toHaveBeenCalled()
	})

	test('un profil qui devient publiable, qui cesse de l’être : son adresse part', async () => {
		await enregistrer(requete([ligne('published', false), ligne('published', true)]).req, {})
		await flushQueue()
		await enregistrer(requete([ligne('published', true), ligne('published', false)]).req, {})
		await flushQueue()
		expect(faux.appels.map(({ corps }) => corps.urlList)).toEqual([
			[`${SITE}/profil/zoe-lefevre`],
			[`${SITE}/profil/zoe-lefevre`],
		])
	})

	test('un profil qui n’est pas publiable avant ni après : rien ne part', async () => {
		await enregistrer(requete([ligne('published', false), ligne('published', false)]).req, {})
		expect(pendingUrls()).toEqual([])
		await flushQueue()
		expect(faux.appels).toEqual([])
	})

	test('plusieurs enregistrements proches : une requête pour tous', async () => {
		await enregistrer(requete([ligne('published', true), ligne('published', true)]).req, {})
		const talents = refresh('talents')
		const { req } = requete([
			{ id: 3, slug: 'mariee', _status: 'published' },
			{ id: 3, slug: 'mariee', _status: 'published' },
		])
		const context = {}
		await talents.avantEcriture({ context, data: {}, operation: 'update', originalDoc: { id: 3 }, req } as never)
		await talents.apresEcriture({ context, doc: { id: 3 }, operation: 'update', previousDoc: { id: 3 }, req } as never)
		await flushQueue()
		expect(faux.appels).toHaveLength(1)
		expect(faux.appels[0]?.corps.urlList).toEqual([`${SITE}/profil/zoe-lefevre`, `${SITE}/talent/mariee`])
	})

	test('un article publié, puis retiré (supprimé) : son adresse part', async () => {
		const articles = refresh('articles')
		const { req } = requete([{ id: 4, slug: 'un-article', _status: 'published' }])
		const context = {}
		await articles.avantSuppression({ context, id: 4, req } as never)
		await articles.apresSuppression({ context, doc: { id: 4 }, id: 4, req } as never)
		await flushQueue()
		expect(faux.appels[0]?.corps.urlList).toEqual([`${SITE}/blog/un-article`])
	})

	test('pendant l’import : rien dans la file, rien ne part', async () => {
		const { req } = requete([ligne('published', true), ligne('published', true)])
		await enregistrer(req, { ...IMPORT_CONTEXT })
		expect(pendingUrls()).toEqual([])
		await flushQueue()
		expect(faux.appels).toEqual([])
	})

	test('sans clé, hors du site, sur le banc : rien ne part', async () => {
		const lignes = () => requete([ligne('published', true), ligne('published', true)]).req
		delete process.env.INDEXNOW_KEY
		await enregistrer(lignes(), {})
		process.env.INDEXNOW_KEY = CLE
		process.env.NEXT_PUBLIC_SITE_URL = 'https://v3.my-makeup.fr'
		await enregistrer(lignes(), {})
		process.env.NEXT_PUBLIC_SITE_URL = SITE
		process.env.APP_ENV = 'test'
		await enregistrer(lignes(), {})
		expect(pendingUrls()).toEqual([])
		await flushQueue()
		expect(faux.appels).toEqual([])
	})

	test('un envoi en échec n’empêche pas l’enregistrement et laisse une trace sans clé ni adresse', async () => {
		globalThis.fetch = (async () => {
			throw new Error('réseau coupé')
		}) as unknown as typeof fetch
		const { req, journal } = requete([ligne('published', true), ligne('published', true)])
		await enregistrer(req, {})
		await flushQueue()
		expect(journal.error).toHaveBeenCalledTimes(1)
		const [message] = journal.error.mock.calls[0] as unknown as [string]
		expect(message).toContain('[indexnow]')
		expect(message).not.toContain(CLE)
		expect(message).not.toContain('zoe-lefevre')
	})

	test('la file elle-même ne garde que des adresses du site', () => {
		reportLater(['https://autre.test/x', `${SITE}/blog/a`], { cle: CLE, journal: { info() {}, error() {} } })
		expect(pendingUrls()).toEqual([`${SITE}/blog/a`])
	})
})
