import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { CollectionSlug, Payload, Where } from 'payload'
import { boundedQuery, CONDITIONS_MAX, PRIVATE_FIELD_MESSAGE, TOO_MANY_CONDITIONS_MESSAGE } from '@/lib/bounded-query'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

/**
 * A public request that is too large, or that filters or sorts on a private field, is refused
 * before the database (ticket 048; plan 02 §7.2, U60, played through the real API). An admin
 * passes, except on the secrets of an account, which nobody filters on.
 */

type Account = Awaited<ReturnType<typeof createAccount<'maquilleuse'>>>
type Reader = { nom: string; enTetes: Record<string, string> }

let payload: Payload
let a: Account
let b: Account
let readers: { anonyme: Reader; maquilleuse: Reader; redaction: Reader; admin: Reader }
let profileA: number
let profileB: number

/** The contact details, internal note and score of A's published profile: never a filter for the public. */
const PRIVATE_OF_A = { telephone: '06 39 98 00 01', email: 'contact-a@example.test', note: 'Note interne fictive' }

beforeAll(async () => {
	payload = await testPayload()
	;[a, b] = [await createAccount('maquilleuse'), await createAccount('maquilleuse')]
	const [other, editor, admin] = [
		await createAccount('maquilleuse'),
		await createAccount('redaction'),
		await createAccount('admin'),
	]
	readers = {
		anonyme: { nom: 'anonyme', enTetes: {} },
		maquilleuse: { nom: 'une autre maquilleuse', enTetes: other.session.enTetes },
		redaction: { nom: 'redaction', enTetes: editor.session.enTetes },
		admin: { nom: 'admin', enTetes: admin.session.enTetes },
	}
	const profileOf = async (compte: Account) =>
		(await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })).docs[0]?.id ?? 0
	;[profileA, profileB] = [await profileOf(a), await profileOf(b)]
	await payload.update({
		collection: 'profiles',
		id: profileA,
		data: {
			status: 'published',
			contactDetails: { phone: PRIVATE_OF_A.telephone, email: PRIVATE_OF_A.email },
			internalNote: PRIVATE_OF_A.note,
			score: 4.5,
		},
	})
	await payload.update({ collection: 'profiles', id: profileB, data: { status: 'published', score: 2 } })
	await payload.create({
		collection: 'talents',
		data: { title: 'Talent fictif', slug: 'talent-fictif', _status: 'published' },
	})
})

afterAll(emptyBase)

/** `n` conditions on the slug, in one `or`, as a query string. */
const conditions = (n: number, prefixe = 'where[or]') =>
	Array.from({ length: n }, (_, i) => `${prefixe}[${i}][slug][equals]=slug-${i}`).join('&')

/** A REST read, with what a client sees of it. */
async function read(chemin: string, lecteur: Reader = readers.anonyme) {
	const { statut: status, corps, texte: text } = await callRest('GET', chemin, { enTetes: lecteur.enTetes })
	return {
		statut: status,
		corps: corps as { docs?: { id: number }[]; totalDocs?: number; errors?: { message: string }[] },
		texte: text,
	}
}

/** The calls the database receives while `faire` runs: none, for a request refused before it. */
async function databaseCalls(faire: () => Promise<unknown>): Promise<number> {
	const db = payload.db as unknown as Record<string, unknown>
	const spied = ['find', 'findOne', 'count', 'queryDrafts', 'findDistinct', 'updateMany', 'deleteMany'] as const
	const original = spied.map(nom => [nom, db[nom]] as const)
	let calls = 0
	for (const [name, originale] of original)
		if (typeof originale === 'function')
			db[name] = (...args: unknown[]) => {
				calls += 1
				return (originale as (...a: unknown[]) => unknown).apply(payload.db, args)
			}
	try {
		await faire().catch(() => undefined)
	} finally {
		for (const [name, originale] of original) db[name] = originale
	}
	return calls
}

describe('21 conditions : refus ; 20 : réponse (U60)', () => {
	test('par REST, pour l’anonyme, une maquilleuse et la rédaction, sur chaque collection publique', async () => {
		expect(CONDITIONS_MAX).toBe(20)
		for (const reader of [readers.anonyme, readers.maquilleuse, readers.redaction])
			for (const collection of ['profiles', 'talents', 'articles'] as const) {
				const twenty = await read(`/api/${collection}?${conditions(20)}`, reader)
				expect([reader.nom, collection, twenty.statut]).toEqual([reader.nom, collection, 200])
				const twentyOne = await read(`/api/${collection}?${conditions(21)}`, reader)
				expect([reader.nom, collection, twentyOne.statut]).toEqual([reader.nom, collection, 400])
				expect(twentyOne.corps.errors?.[0]?.message).toBe(TOO_MANY_CONDITIONS_MESSAGE)
			}
	})

	test('les conditions se comptent dans les « et » et les « ou » imbriqués, et sur le décompte aussi', async () => {
		const nested = (n: number) =>
			Array.from({ length: n }, (_, i) => `where[and][0][or][${i % 2}][and][${i}][slug][equals]=s-${i}`).join('&')
		expect((await read(`/api/profiles?${nested(20)}`)).statut).toBe(200)
		expect((await read(`/api/profiles?${nested(21)}`)).statut).toBe(400)
		// Two operators on one field are two conditions.
		const twoByField = Array.from(
			{ length: 11 },
			(_, i) => `where[or][${i}][slug][equals]=s-${i}&where[or][${i}][slug][not_equals]=t-${i}`
		).join('&')
		expect((await read(`/api/profiles?${twoByField}`)).statut).toBe(400)
		expect((await read(`/api/profiles/count?${conditions(21)}`)).statut).toBe(400)
		expect((await read(`/api/profiles/count?${conditions(20)}`)).statut).toBe(200)
	})

	test('refusée avant la base : aucune requête ne part', async () => {
		expect(await databaseCalls(() => read(`/api/profiles?${conditions(21)}`))).toBe(0)
		expect(await databaseCalls(() => read(`/api/talents?${conditions(21)}`))).toBe(0)
		// The control: the same request with 20 conditions reaches the database.
		expect(await databaseCalls(() => read(`/api/profiles?${conditions(20)}`))).toBeGreaterThan(0)
	})

	test('par l’API locale avec les règles actives : de même ; le code du serveur, sans règles, n’est pas borné', async () => {
		const or = (n: number): Where => ({ or: Array.from({ length: n }, (_, i) => ({ slug: { equals: `s-${i}` } })) })
		await expect(payload.find({ collection: 'profiles', overrideAccess: false, where: or(21) })).rejects.toMatchObject({
			status: 400,
			message: TOO_MANY_CONDITIONS_MESSAGE,
		})
		expect((await payload.find({ collection: 'profiles', overrideAccess: false, where: or(20) })).totalDocs).toBe(0)
		expect((await payload.find({ collection: 'profiles', where: or(21) })).totalDocs).toBe(0)
	})

	test('un admin passe : la borne est celle de la lecture publique', async () => {
		expect((await read(`/api/profiles?${conditions(21)}`, readers.admin)).statut).toBe(200)
		expect((await read(`/api/profiles?${conditions(60)}`, readers.admin)).statut).toBe(200)
	})

	test('chaque collection porte la borne, en premier, celles que Payload ajoute lui-même comprises', () => {
		for (const { config } of Object.values(payload.collections)) {
			expect([config.slug, config.hooks.beforeOperation[0]]).toEqual([config.slug, boundedQuery])
			expect(config.hooks.beforeOperation.filter(crochet => crochet === boundedQuery)).toHaveLength(1)
		}
		expect(Object.keys(payload.collections)).toEqual(
			expect.arrayContaining([
				'admins',
				'pros',
				'profiles',
				'media',
				'talents',
				'articles',
				'payload-locked-documents',
				'payload-preferences',
			] satisfies CollectionSlug[])
		)
	})

	test('les verrous des documents, réservés aux comptes de l’administration : bornés eux aussi', async () => {
		const locks = '/api/payload-locked-documents'
		const onId = (n: number) => Array.from({ length: n }, (_, i) => `where[or][${i}][id][equals]=${i + 1}`).join('&')
		// A makeup artist no longer reaches the locks (ticket 094): 403 within the bound; above it the
		// bound answers first, as it runs before the access rules.
		expect((await read(`${locks}?${onId(20)}`, readers.maquilleuse)).statut).toBe(403)
		expect((await read(`${locks}?${onId(21)}`, readers.maquilleuse)).statut).toBe(400)
		// The newsroom is bounded, like the public; the role `admin` is not.
		expect((await read(`${locks}?${onId(20)}`, readers.redaction)).statut).toBe(200)
		const refusal = await read(`${locks}?${onId(21)}`, readers.redaction)
		expect(refusal.statut).toBe(400)
		expect(refusal.corps.errors?.[0]?.message).toBe(TOO_MANY_CONDITIONS_MESSAGE)
		expect((await read(`${locks}?${onId(30)}`, readers.admin)).statut).toBe(200)
	})
})

describe('Filtre anonyme sur email, hash ou sessions, même par relation : refus (U60)', () => {
	test('par la relation du profil à son compte, ou de la photo à sa propriétaire : refusé, sans rien dire', async () => {
		for (const path of [
			'pro.email',
			'pro.hash',
			'pro.salt',
			'pro.sessions.id',
			'pro.legacyBcrypt',
			'pro.resetPasswordToken',
		]) {
			const targets = await read(`/api/profiles?where[${path}][equals]=${encodeURIComponent(a.email)}`)
			const other = await read(`/api/profiles?where[${path}][equals]=personne%40example.test`)
			expect([path, targets.statut]).toEqual([path, 400])
			// The same answer whether the value matches or not: nothing to learn from it.
			expect(targets.texte).toBe(other.texte)
			expect(targets.texte).not.toContain(a.email)
		}
		expect((await read(`/api/profiles?where[pro.sessions.expiresAt][exists]=true`)).statut).toBe(400)
		expect((await read(`/api/media?where[owner.email][equals]=${encodeURIComponent(a.email)}`)).statut).toBe(400)
		// Through the gallery: a filter nested in a photo of the profile.
		expect(
			(await read(`/api/profiles?where[galerie][contains][owner.email][equals]=${encodeURIComponent(a.email)}`)).statut
		).toBe(400)
		expect((await read(`/api/pros?where[email][equals]=${encodeURIComponent(a.email)}`)).statut).toBe(400)
	})

	test('un tri sur l’un d’eux : refusé de même', async () => {
		for (const sort of ['pro.email', '-pro.email', 'pro.hash', 'title,pro.sessions.id'])
			expect([sort, (await read(`/api/profiles?sort=${sort}`)).statut]).toEqual([sort, 400])
	})

	test('une maquilleuse ne filtre ni ne trie son propre compte sur son hash, son sel ou ses sessions', async () => {
		const hers = { nom: 'A', enTetes: a.session.enTetes }
		for (const request of [
			'where[hash][exists]=true',
			'where[salt][exists]=true',
			'where[sessions.id][exists]=true',
			'where[legacyBcrypt][exists]=false',
			'sort=hash',
			'sort=-sessions.expiresAt',
		])
			expect([request, (await read(`/api/pros?${request}`, hers)).statut]).toEqual([request, 400])
	})

	test('un admin non plus : les secrets d’un compte ne servent jamais de filtre ; son email, oui', async () => {
		for (const request of [
			'where[hash][exists]=true',
			'where[salt][like]=a',
			'where[sessions.id][exists]=true',
			'where[legacyBcrypt][exists]=true',
			'sort=hash',
		])
			expect([request, (await read(`/api/pros?${request}`, readers.admin)).statut]).toEqual([request, 400])
		const byEmail = await read(`/api/pros?where[email][equals]=${encodeURIComponent(a.email)}`, readers.admin)
		expect([byEmail.statut, byEmail.corps.docs?.map(({ id }) => id)]).toEqual([200, [Number(a.id)]])
	})
})

describe('Filtre ou tri sur coordonnées, note interne ou score : refus sans fuite ; un admin passe', () => {
	/** Each filter twice: on the stored value, and on a value nobody has. */
	const FILTERS: [string, string, string][] = [
		['contactDetails.phone', PRIVATE_OF_A.telephone, '01 00 00 00 00'],
		['contactDetails.email', PRIVATE_OF_A.email, 'personne@example.test'],
		['internalNote', PRIVATE_OF_A.note, 'Aucune note'],
		['score', '4.5', '1'],
	]

	test('l’anonyme, une maquilleuse, la rédaction : refusés, la même réponse que la valeur existe ou non', async () => {
		for (const reader of [readers.anonyme, readers.maquilleuse, readers.redaction])
			for (const [field, exists, absente] of FILTERS)
				for (const operator of ['equals', 'like']) {
					const targets = await read(`/api/profiles?where[${field}][${operator}]=${encodeURIComponent(exists)}`, reader)
					const other = await read(`/api/profiles?where[${field}][${operator}]=${encodeURIComponent(absente)}`, reader)
					expect([reader.nom, field, operator, targets.statut]).toEqual([reader.nom, field, operator, 400])
					expect(targets.texte).toBe(other.texte)
					expect(targets.corps.errors?.[0]?.message).toBe(PRIVATE_FIELD_MESSAGE)
					for (const value of Object.values(PRIVATE_OF_A)) expect(targets.texte).not.toContain(value)
				}
	})

	test('un tri sur le score ou les coordonnées : refusé, rien de l’ordre ne sort', async () => {
		for (const reader of [readers.anonyme, readers.maquilleuse, readers.redaction])
			for (const sort of ['score', '-score', 'contactDetails.phone', 'internalNote', 'slug,-score'])
				expect([reader.nom, sort, (await read(`/api/profiles?sort=${sort}`, reader)).statut]).toEqual([
					reader.nom,
					sort,
					400,
				])
	})

	test('les autres champs privés du profil ne servent pas non plus de filtre ni de tri au public (Payload)', async () => {
		for (const field of [
			'status',
			'reason',
			'verified',
			'siret',
			'pro',
			'strapiId',
			'legacyUsername',
			'publicContact',
		]) {
			expect([field, (await read(`/api/profiles?where[${field}][exists]=true`)).statut]).toEqual([field, 400])
			expect([field, (await read(`/api/profiles?sort=-${field}`)).statut]).toEqual([field, 400])
		}
	})

	test('par l’API locale avec les règles actives : de même', async () => {
		await expect(
			payload.find({ collection: 'profiles', overrideAccess: false, where: { score: { greater_than: 3 } } })
		).rejects.toMatchObject({ status: 400 })
		await expect(payload.find({ collection: 'profiles', overrideAccess: false, sort: '-score' })).rejects.toMatchObject(
			{
				status: 400,
			}
		)
	})

	test('un admin filtre et trie sur eux', async () => {
		const idsOf = async (chemin: string) => (await read(chemin, readers.admin)).corps.docs?.map(({ id }) => id)
		expect(await idsOf('/api/profiles?where[score][greater_than]=3')).toEqual([profileA])
		expect(await idsOf('/api/profiles?sort=-score&where[score][exists]=true')).toEqual([profileA, profileB])
		expect(await idsOf('/api/profiles?sort=score&where[score][exists]=true')).toEqual([profileB, profileA])
		expect(
			await idsOf(`/api/profiles?where[contactDetails.phone][equals]=${encodeURIComponent(PRIVATE_OF_A.telephone)}`)
		).toEqual([profileA])
		expect(await idsOf('/api/profiles?where[internalNote][like]=fictive')).toEqual([profileA])
	})
})

describe('Un identifiant qu’aucun document ne peut porter : refusé avant la base, jamais une erreur 500', () => {
	const IMPOSSIBLE = ['abc', '1e999', '99999999999', '1.5']

	test('lire un compte, un talent ou un article par cet identifiant : 403 pour chacun', async () => {
		for (const reader of [readers.anonyme, readers.maquilleuse, readers.redaction, readers.admin])
			for (const collection of ['pros', 'admins', 'talents', 'articles'])
				for (const id of IMPOSSIBLE)
					expect([reader.nom, collection, id, (await read(`/api/${collection}/${id}`, reader)).statut]).toEqual([
						reader.nom,
						collection,
						id,
						403,
					])
	})

	test('modifier ou supprimer par cet identifiant : refusé (403), ou par Payload lui-même (400) quand il n’y lit aucun nombre', async () => {
		const writers = [readers.maquilleuse, readers.redaction, readers.admin]
		for (const reader of writers)
			for (const collection of ['profiles', 'pros', 'admins', 'talents', 'articles'])
				for (const id of IMPOSSIBLE) {
					const modification = await callRest('PATCH', `/api/${collection}/${id}`, {
						enTetes: reader.enTetes,
						corps: { title: 'Titre fictif' },
					})
					const deletion = await callRest('DELETE', `/api/${collection}/${id}`, { enTetes: reader.enTetes })
					for (const { statut: status } of [modification, deletion])
						expect([reader.nom, collection, id, [400, 403].includes(status)]).toEqual([
							reader.nom,
							collection,
							id,
							true,
						])
				}
	})
})

describe('Le champ « profil » des comptes (une jointure) dans une adresse saisie à la main : jamais une erreur 500 (ticket 224)', () => {
	test('un admin le filtre (200) ; tout autre lecteur est refusé (400 ou 403), jamais 500', async () => {
		const path = '/api/pros?where[profile][exists]=true'

		expect((await read(path, readers.admin)).statut).toBe(200)
		for (const reader of [readers.anonyme, readers.maquilleuse, readers.redaction])
			expect([reader.nom, [400, 403].includes((await read(path, reader)).statut)]).toEqual([reader.nom, true])
	})
})
