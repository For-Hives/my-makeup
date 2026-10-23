import {
	APIError,
	type Collection,
	type CollectionBeforeOperationHook,
	type Endpoint,
	findOperation,
	headersWithCors,
	type Payload,
	type PayloadRequest,
	type Plugin,
	parseParams,
} from 'payload'
// Relative import on purpose: this file is also loaded by the Payload CLI, outside of Next.
import { isAdmin } from './access'

/**
 * Every request on a collection is bounded before it reaches the database (ticket 048; plan 02
 * §7.2, U60; plan 01 §1.2, the filters through relations that leaked the accounts of the old API).
 *
 * - **At most `CONDITIONS_MAX` conditions** in a filter, for anyone but `admin`: a condition is one
 *   operator on one field, wherever it sits in the `and` and the `or`.
 * - **Never a secret of an account** (`SECRET_FIELDS`), for anyone, `admin` included: as a
 *   filter, as a sort, through a relation (`pro.hash`) or in a nested filter.
 * - **Never a private field** (`PRIVATE_FIELDS`) for anyone but `admin`: the address of an account,
 *   the contact details, the internal note and the score of a profile.
 *
 * A field is named by any segment of a path: `pro.email`, `contactDetails.phone`,
 * `-sessions.expiresAt` all name one. The refusal is a 400 with the same French sentence whatever
 * the data: it says nothing of what the database holds, since it never asks it.
 *
 * The other private fields (the status of a profile, its account, the owner of a photo…) are
 * refused by Payload itself, which checks a filter and a sort against the reading rule of each
 * field. These two lists hold what must never pass, whatever a reading rule says.
 *
 * Code of the server that reads without the rules (`overrideAccess`) is not bounded: it is not a
 * request of a visitor.
 *
 * - **A list read over REST is capped** (ticket 071, default pending Andy's word in
 *   plans/decisions.md): for anyone but `admin`, at most `REST_LIMIT_MAX` documents, and
 *   `REST_LIMIT_DEFAULT` without a `limit`. `limit=0`, `pagination=false`, a negative or a huge
 *   `limit` no longer hand over a whole collection. The cap sits on the route (`boundedListRead`,
 *   the first `GET /` of every collection), not in `beforeOperation`: the local API, the relation
 *   checks of Payload and the population of media are not requests of a visitor and stay whole.
 */

/** The most conditions a filter holds for anyone but `admin` (U60). */
export const CONDITIONS_MAX = 20

/** The most documents a list read over REST gives for anyone but `admin`. */
export const REST_LIMIT_MAX = 100

/** The size of a page of a list read over REST without a `limit`, for anyone but `admin`. */
export const REST_LIMIT_DEFAULT = 10

/** The secrets of an account: never a filter nor a sort, for anyone. */
export const SECRET_FIELDS = [
	'hash',
	'salt',
	'sessions',
	'legacyBcrypt',
	'resetPasswordToken',
	'resetPasswordExpiration',
	'_verificationToken',
	'loginAttempts',
	'lockUntil',
	'apiKey',
	'apiKeyIndex',
] as const

/** What only `admin` filters or sorts on. */
export const PRIVATE_FIELDS = ['email', 'contactDetails', 'internalNote', 'score'] as const

export const TOO_MANY_CONDITIONS_MESSAGE = `Cette recherche compte trop de conditions : ${CONDITIONS_MAX} au plus.`
export const PRIVATE_FIELD_MESSAGE = 'Cette recherche porte sur un champ qui ne sert ni de filtre ni de tri.'

/** What a request asks of the database, as Payload hands it to an operation. */
export interface Query {
	where?: unknown
	sort?: unknown
	/** The field of a `distinct` read. */
	field?: unknown
	/** The filters and sorts of the joined collections. */
	joins?: unknown
}

const isObject = (valeur: unknown): valeur is Record<string, unknown> =>
	typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)

/** `and` and `or`, in any case, as Payload reads them. */
const isLink = (cle: string): boolean => ['and', 'or'].includes(cle.toLowerCase())

/** The filters an `and` or an `or` holds: a list, or an object with numbered keys once a list is too long. */
const filtersOf = (valeur: unknown): unknown[] =>
	Array.isArray(valeur) ? valeur : isObject(valeur) ? Object.values(valeur) : []

/**
 * The conditions of a filter: one per operator on a field, wherever it sits; a `contains` that
 * holds a filter of its own (the photos of a profile) adds that filter's conditions.
 */
export function countConditions(filtre: unknown): number {
	if (!isObject(filtre)) return 0
	let total = 0
	for (const [key, value] of Object.entries(filtre)) {
		if (isLink(key)) {
			for (const sub of filtersOf(value)) total += countConditions(sub)
			continue
		}
		if (!isObject(value)) {
			total += 1
			continue
		}
		for (const [operator, operande] of Object.entries(value)) {
			total += 1
			if (operator === 'contains' && isObject(operande)) total += countConditions(operande)
		}
	}
	return total
}

/** The paths of the fields a filter names, nested filters of a `contains` included. */
export function filterPaths(filtre: unknown): string[] {
	if (!isObject(filtre)) return []
	return Object.entries(filtre).flatMap(([key, value]) => {
		if (isLink(key)) return filtersOf(value).flatMap(filterPaths)
		const nested = isObject(value)
			? Object.entries(value).flatMap(([operator, operande]) =>
					operator === 'contains' && isObject(operande) ? filterPaths(operande) : []
				)
			: []
		return [key, ...nested]
	})
}

/** The paths of the fields a sort names: `-score`, `title,-score` or a list of them. */
export function sortPaths(tri: unknown): string[] {
	const fields = Array.isArray(tri) ? tri : typeof tri === 'string' ? tri.split(',') : []
	return fields
		.filter((champ): champ is string => typeof champ === 'string')
		.map(champ => champ.trim().replace(/^[-+]/, ''))
		.filter(champ => champ !== '')
}

/** Every path a request names: its filter, its sort, the field of a `distinct`, its joins. */
export function queryPaths({ where, sort, field, joins }: Query): string[] {
	const joinPaths = isObject(joins) ? Object.values(joins).filter(isObject) : []
	return [
		...filterPaths(where),
		...sortPaths(sort),
		...(typeof field === 'string' ? [field] : []),
		...joinPaths.flatMap(jointure => [...filterPaths(jointure.where), ...sortPaths(jointure.sort)]),
	]
}

/** The conditions of a request: its filter and those of its joins. */
const queryConditions = ({ where, joins }: Query): number =>
	countConditions(where) +
	(isObject(joins)
		? Object.values(joins).reduce<number>((n, j) => n + countConditions(isObject(j) ? j.where : undefined), 0)
		: 0)

/** The segments of a path: `pro.email`, `pro__email` (GraphQL's way) and `pro.email.fr` give `pro`, `email`… */
const segmentsOf = (chemin: string): string[] => chemin.replace(/__/g, '.').split('.')

/**
 * Why this request is refused to this account, or nothing when it passes (U60). `admin` passes
 * the bound and the private fields, never the secrets.
 */
export function queryRefusal(requete: Query, user: PayloadRequest['user'] | undefined): string | undefined {
	const admin = isAdmin(user)
	if (!admin && queryConditions(requete) > CONDITIONS_MAX) return TOO_MANY_CONDITIONS_MESSAGE
	const forbidden: readonly string[] = admin ? SECRET_FIELDS : [...SECRET_FIELDS, ...PRIVATE_FIELDS]
	const named = queryPaths(requete).some(chemin => segmentsOf(chemin).some(s => forbidden.includes(s)))
	return named ? PRIVATE_FIELD_MESSAGE : undefined
}

/**
 * `beforeOperation` of every collection: the first thing an operation does, before its access
 * rules and before the database. Throws a 400 when the request is refused.
 */
export const boundedQuery: CollectionBeforeOperationHook = ({ args, overrideAccess, req }) => {
	if (overrideAccess ?? (args as { overrideAccess?: boolean }).overrideAccess) return args
	const refusal = queryRefusal(args as Query, req.user)
	if (refusal) throw new APIError(refusal, 400, null, true)
	return args
}

/**
 * The `limit` a list read over REST is given for anyone but `admin`: absent (or not a number) is
 * `REST_LIMIT_DEFAULT`; 0, negative or above `REST_LIMIT_MAX` is `REST_LIMIT_MAX`.
 */
export function boundedRestLimit(limite: unknown): number {
	if (typeof limite !== 'number' || !Number.isFinite(limite)) return REST_LIMIT_DEFAULT
	return limite <= 0 || limite > REST_LIMIT_MAX ? REST_LIMIT_MAX : Math.trunc(limite)
}

/**
 * `GET /` of a collection, the list read, bounded: Payload's own handler with the cap above for
 * anyone but `admin`, which is read as it asks. The access rules and the bounds of
 * `boundedQuery` apply as ever.
 */
export const boundedListRead: Endpoint = {
	method: 'get',
	path: '/',
	handler: async req => {
		const slug = req.routeParams?.collection
		const collections: Partial<Record<string, Collection>> = req.payload.collections
		const collection = typeof slug === 'string' ? collections[slug] : undefined
		if (!collection) return Response.json({ message: 'Route not found' }, { status: 404 })
		const { depth, draft, joins, limit, page, pagination, populate, select, sort, trash, where } = parseParams(
			req.query
		)
		const bound = !isAdmin(req.user)
		// query-keys: ignore the REST route passes the keys of the request as they come, no key is written here
		const result = await findOperation({
			collection,
			depth,
			draft,
			joins,
			limit: bound ? boundedRestLimit(limit) : limit,
			page,
			pagination: bound ? true : pagination,
			populate,
			req,
			select,
			sort,
			trash,
			where,
		})
		return Response.json(result, { headers: headersWithCors({ headers: new Headers(), req }), status: 200 })
	},
}

/** `boundedListRead` first in the endpoints of a collection, unless it is there or endpoints are off. */
const withBoundedRead = (endpoints: Endpoint[] | false | undefined): Endpoint[] | false =>
	endpoints === false
		? false
		: endpoints?.includes(boundedListRead)
			? endpoints
			: [boundedListRead, ...(endpoints ?? [])]

/**
 * Puts `boundedQuery` and the bounded list read first in every collection Payload built that does not have them yet: Payload's
 * own collections (document locks, preferences, migrations), which it adds after the plugins. The
 * document locks are open to any account (ticket 094): bounded too.
 */
export function boundPayloadCollections(payload: Pick<Payload, 'collections'>): void {
	for (const { config } of Object.values(payload.collections)) {
		const brackets = config.hooks.beforeOperation
		if (!brackets.includes(boundedQuery)) brackets.unshift(boundedQuery)
		const endpoints = withBoundedRead(config.endpoints)
		if (endpoints !== config.endpoints) config.endpoints = endpoints
	}
}

/**
 * Puts `boundedQuery` first in the `beforeOperation` of every collection of the configuration,
 * those of later tickets included; once Payload is built (`onInit`, before any request), in its
 * own collections too (`boundPayloadCollections`). The `onInit` of the configuration runs
 * afterwards, as it was.
 */
export const boundedQueries: Plugin = config => ({
	...config,
	collections: config.collections?.map(collection => ({
		...collection,
		hooks: {
			...collection.hooks,
			beforeOperation: [boundedQuery, ...(collection.hooks?.beforeOperation ?? [])],
		},
		endpoints: withBoundedRead(collection.endpoints),
	})),
	onInit: async payload => {
		boundPayloadCollections(payload)
		await config.onInit?.(payload)
	},
})
