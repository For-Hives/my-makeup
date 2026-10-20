import { describe, expect, test } from 'bun:test'
import type { CollectionConfig, Config, Payload, PayloadRequest } from 'payload'
import {
	boundedListRead,
	boundedQueries,
	boundedQuery,
	boundedRestLimit,
	CONDITIONS_MAX,
	countConditions,
	PRIVATE_FIELD_MESSAGE,
	PRIVATE_FIELDS,
	queryPaths,
	queryRefusal,
	REST_LIMIT_DEFAULT,
	REST_LIMIT_MAX,
	SECRET_FIELDS,
	TOO_MANY_CONDITIONS_MESSAGE,
} from '@/lib/bounded-query'

/**
 * The bound of every request (ticket 048; plan 02 §7.2, U60), without a database: what a filter
 * counts, which paths it names, who is refused. The integration tests play it through the real
 * APIs (tests/integration/requetes-bornees.test.ts).
 */

type Utilisateur = PayloadRequest['user']

const admin = { id: 1, collection: 'admins', role: 'admin', email: 'admin@example.test' } as unknown as Utilisateur
const redaction = { id: 2, collection: 'admins', role: 'editor' } as unknown as Utilisateur
const maquilleuse = { id: 7, collection: 'pros', email: 'a@example.test' } as unknown as Utilisateur
const NON_ADMINS = [null, maquilleuse, redaction]

/** `n` conditions in one `or`. */
const ou = (n: number) => ({ or: Array.from({ length: n }, (_, i) => ({ slug: { equals: `s-${i}` } })) })

describe('U60 : plus de 20 conditions, refusé', () => {
	test('une condition, c’est un opérateur sur un champ, où qu’il soit', () => {
		expect(countConditions(undefined)).toBe(0)
		expect(countConditions({})).toBe(0)
		expect(countConditions({ slug: { equals: 'a' } })).toBe(1)
		expect(countConditions({ score: { greater_than: 1, less_than: 3 } })).toBe(2)
		expect(countConditions(ou(20))).toBe(20)
		expect(countConditions({ and: [ou(3), { or: [ou(2), { titre: { exists: true } }] }] })).toBe(6)
		// `AND` and `OR` in capitals, as Payload reads them too.
		expect(countConditions({ AND: [ou(2)], Or: [{ a: { equals: 1 } }] })).toBe(3)
		// A list too long for the query string parser arrives as an object with numbered keys.
		expect(countConditions({ or: { 0: { a: { equals: 1 } }, 1: { b: { equals: 2 } } } })).toBe(2)
		// A filter nested in a `contains` (the photos of a profile) counts too.
		expect(countConditions({ galerie: { contains: { and: [{ alt: { like: 'x' } }, { id: { in: [1] } }] } } })).toBe(3)
		// A malformed value still counts once: nothing is left out.
		expect(countConditions({ slug: 'a' })).toBe(1)
	})

	test('20 conditions passent ; 21 sont refusées à l’anonyme, à une maquilleuse et à la rédaction ; un admin passe', () => {
		expect(CONDITIONS_MAX).toBe(20)
		for (const user of NON_ADMINS) {
			expect(queryRefusal({ where: ou(20) }, user)).toBeUndefined()
			expect(queryRefusal({ where: ou(21) }, user)).toBe(TOO_MANY_CONDITIONS_MESSAGE)
			// The filters of the joins count with the filter of the request.
			expect(queryRefusal({ where: ou(15), joins: { liens: { where: ou(6) } } }, user)).toBe(
				TOO_MANY_CONDITIONS_MESSAGE
			)
		}
		expect(queryRefusal({ where: ou(500) }, admin)).toBeUndefined()
		expect(TOO_MANY_CONDITIONS_MESSAGE).toBe('Cette recherche compte trop de conditions : 20 au plus.')
	})
})

describe('U60 : un filtre ou un tri sur email, hash ou sessions, refusé', () => {
	test('les chemins d’une requête : son filtre, imbriqué ou non, son tri, son champ distinct, ses jointures', () => {
		expect(
			queryPaths({
				where: { and: [{ slug: { equals: 'a' } }, { gallery: { contains: { 'owner.email': { equals: 'x' } } } }] },
				sort: '-score,title',
				field: 'contactDetails.phone',
				joins: { liens: { where: { 'pro.hash': { exists: true } }, sort: ['-sessions.expiresAt'] } },
			})
		).toEqual([
			'slug',
			'gallery',
			'owner.email',
			'score',
			'title',
			'contactDetails.phone',
			'pro.hash',
			'sessions.expiresAt',
		])
		expect(queryPaths({ where: undefined, sort: undefined })).toEqual([])
	})

	test('email, hash, sessions, directement ou par une relation : refusés à tout autre qu’un admin', () => {
		for (const user of NON_ADMINS)
			for (const chemin of [
				'email',
				'pro.email',
				'owner.email',
				'hash',
				'pro.hash',
				'sessions.id',
				'pro__sessions__id',
			])
				for (const requete of [{ where: { [chemin]: { equals: 'x' } } }, { sort: chemin }, { sort: `-${chemin}` }])
					expect([chemin, queryRefusal(requete, user)]).toEqual([chemin, PRIVATE_FIELD_MESSAGE])
	})

	test('les secrets d’un compte : refusés à tous, admin compris ; l’email d’un compte, l’admin le filtre', () => {
		for (const secret of SECRET_FIELDS) {
			expect([secret, queryRefusal({ where: { [secret]: { exists: true } } }, admin)]).toEqual([
				secret,
				PRIVATE_FIELD_MESSAGE,
			])
			expect([secret, queryRefusal({ sort: `pro.${secret}` }, admin)]).toEqual([secret, PRIVATE_FIELD_MESSAGE])
		}
		expect(queryRefusal({ where: { email: { equals: 'a@example.test' } } }, admin)).toBeUndefined()
		expect(SECRET_FIELDS).toEqual(expect.arrayContaining(['hash', 'salt', 'sessions', 'legacyBcrypt']))
	})

	test('coordonnées, note interne et score : refusés à tout autre qu’un admin, en filtre comme en tri', () => {
		expect([...PRIVATE_FIELDS].sort()).toEqual(['contactDetails', 'email', 'internalNote', 'score'])
		for (const chemin of ['contactDetails.phone', 'contactDetails.email', 'contactDetails', 'internalNote', 'score']) {
			for (const user of NON_ADMINS) {
				expect(queryRefusal({ where: { [chemin]: { like: '06' } } }, user)).toBe(PRIVATE_FIELD_MESSAGE)
				expect(queryRefusal({ sort: `slug,-${chemin}` }, user)).toBe(PRIVATE_FIELD_MESSAGE)
				expect(queryRefusal({ field: chemin }, user)).toBe(PRIVATE_FIELD_MESSAGE)
			}
			expect(queryRefusal({ where: { [chemin]: { like: '06' } }, sort: `-${chemin}` }, admin)).toBeUndefined()
		}
	})

	test('un champ public, ou un nom qui ne fait que contenir un mot interdit, passe', () => {
		for (const user of [...NON_ADMINS, admin]) {
			expect(queryRefusal({ where: { slug: { equals: 'a' } }, sort: '-createdAt' }, user)).toBeUndefined()
			expect(queryRefusal({ where: { scoreur: { exists: true }, emails: { exists: true } } }, user)).toBeUndefined()
		}
	})
})

describe('La borne, posée sur chaque collection et jouée avant la base', () => {
	/** The hook as Payload calls it. */
	const appeler = (args: Record<string, unknown>, user: Utilisateur | null, overrideAccess?: boolean): unknown =>
		boundedQuery({
			args,
			collection: {} as never,
			context: {},
			operation: 'read',
			overrideAccess,
			req: { user } as PayloadRequest,
		} as never)

	test('une requête refusée lève une erreur 400, au message public et en français', () => {
		for (const [args, message] of [
			[{ where: ou(21) }, TOO_MANY_CONDITIONS_MESSAGE],
			[{ sort: '-score' }, PRIVATE_FIELD_MESSAGE],
		] as const) {
			let erreur: unknown
			try {
				appeler(args, null)
			} catch (e) {
				erreur = e
			}
			expect(erreur).toMatchObject({ status: 400, message, isPublic: true })
		}
		expect(PRIVATE_FIELD_MESSAGE).toBe('Cette recherche porte sur un champ qui ne sert ni de filtre ni de tri.')
	})

	test('une requête qui passe est rendue telle quelle ; le code du serveur, sans règles, n’est pas borné', () => {
		const args = { where: ou(3), sort: 'slug' }
		expect(appeler(args, null)).toBe(args)
		expect(appeler({ where: ou(21), sort: '-score' }, null, true)).toEqual({ where: ou(21), sort: '-score' })
		expect(appeler({ where: ou(21), overrideAccess: true }, null)).toEqual({ where: ou(21), overrideAccess: true })
		// No filter at all (a creation, a login): nothing to bound.
		expect(appeler({ data: { email: 'a@example.test' } }, null)).toEqual({ data: { email: 'a@example.test' } })
	})

	test('le greffon la place en premier dans chaque collection, et garde les crochets qui y étaient', async () => {
		const autre = () => undefined
		const config = {
			collections: [
				{ slug: 'a', fields: [] },
				{ slug: 'b', fields: [], hooks: { beforeOperation: [autre], afterChange: [autre] } },
			] satisfies CollectionConfig[],
		} as unknown as Config
		const borne = await boundedQueries(config)
		expect(borne.collections?.map(({ slug, hooks }) => [slug, hooks?.beforeOperation])).toEqual([
			['a', [boundedQuery]],
			['b', [boundedQuery, autre]],
		])
		expect(borne.collections?.[1]?.hooks?.afterChange).toEqual([autre])
	})

	test('une fois Payload construit, ses propres collections la reçoivent aussi, une fois, puis l’onInit de la configuration tourne', async () => {
		const autre = () => undefined
		const ordre: string[] = []
		const config = {
			collections: [],
			onInit: () => {
				ordre.push('onInit de la configuration')
			},
		} as unknown as Config
		const borne = await boundedQueries(config)
		const collection = (beforeOperation: unknown[]) => ({ config: { hooks: { beforeOperation } } })
		const collections = {
			profiles: collection([boundedQuery, autre]),
			'payload-locked-documents': collection([]),
			'payload-preferences': collection([autre]),
		}
		await borne.onInit?.({ collections } as unknown as Payload)
		await borne.onInit?.({ collections } as unknown as Payload)
		expect(Object.entries(collections).map(([slug, { config }]) => [slug, config.hooks.beforeOperation])).toEqual([
			['profiles', [boundedQuery, autre]],
			['payload-locked-documents', [boundedQuery]],
			['payload-preferences', [boundedQuery, autre]],
		])
		expect(ordre).toEqual(['onInit de la configuration', 'onInit de la configuration'])
		// Without an `onInit` of its own, the configuration gets only the bound.
		const seule = await boundedQueries({ collections: [] } as unknown as Config)
		const vide = { collections: { 'payload-kv': collection([]) } }
		await seule.onInit?.(vide as unknown as Payload)
		expect(vide.collections['payload-kv'].config.hooks.beforeOperation).toEqual([boundedQuery])
	})
})

describe('Ticket 071 : la lecture en liste par REST est plafonnée', () => {
	test('sans limit, 10 ; 0, négative ou au-dessus de 100, 100 ; entre les deux, la valeur', () => {
		expect([REST_LIMIT_DEFAULT, REST_LIMIT_MAX]).toEqual([10, 100])
		expect(boundedRestLimit(undefined)).toBe(10)
		expect(boundedRestLimit('abc')).toBe(10)
		expect(boundedRestLimit(Number.NaN)).toBe(10)
		for (const limite of [0, -1, 101, 1000]) expect(boundedRestLimit(limite)).toBe(100)
	})

	test('le greffon met l’endpoint en tête de chaque collection, une fois, et respecte « endpoints: false »', async () => {
		const autre = { method: 'get', path: '/', handler: () => new Response() } as const
		const borne = await boundedQueries({
			collections: [{ slug: 'a' }, { slug: 'b', endpoints: [autre] }, { slug: 'c', endpoints: false }],
		} as unknown as Config)
		expect(borne.collections?.map(({ slug, endpoints }) => [slug, endpoints])).toEqual([
			['a', [boundedListRead]],
			['b', [boundedListRead, autre]],
			['c', false],
		])
	})

	test('après onInit, c’est le premier GET / de chaque collection de Payload, sans doublon', async () => {
		const borne = await boundedQueries({ collections: [] } as unknown as Config)
		const defaut = { method: 'get', path: '/', handler: () => new Response() }
		const collections = {
			profils: { config: { hooks: { beforeOperation: [] }, endpoints: [boundedListRead, defaut] } },
			'payload-locked-documents': { config: { hooks: { beforeOperation: [] }, endpoints: [defaut] } },
		}
		await borne.onInit?.({ collections } as unknown as Payload)
		await borne.onInit?.({ collections } as unknown as Payload)
		for (const { config } of Object.values(collections)) {
			const premier = (config.endpoints as { method: string; path: string }[]).find(
				e => e.method === 'get' && e.path === '/'
			)
			expect(premier).toBe(boundedListRead)
			expect(config.endpoints.filter(e => e === boundedListRead)).toHaveLength(1)
		}
	})
})
