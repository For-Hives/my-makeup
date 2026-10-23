import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

/**
 * Payload's document locks, reserved to the accounts of the admin panel (ticket 094). The access
 * matrix (payload-access.test.ts) plays who may do what; these tests play what it cannot: the lock
 * carries the account of the session, and the panel's own flow (open a document, take it over).
 */

const LOCKS = '/api/payload-locked-documents'

type Account = Awaited<ReturnType<typeof createAccount<'admin'>>>

let payload: Payload
let admin: Account
let otherAdmin: Account
let editor: Awaited<ReturnType<typeof createAccount<'redaction'>>>
let artist: Awaited<ReturnType<typeof createAccount<'maquilleuse'>>>
let talent: number

const onBehalfOf = (compte: { id: string | number }, collection: 'admins' | 'pros' = 'admins') => ({
	relationTo: collection,
	value: Number(compte.id),
})

/** The account a lock is in the name of, read in the database. */
async function holder(id: number) {
	const lock = await payload.findByID({ collection: 'payload-locked-documents', id, depth: 0 })
	return lock.user
}

beforeAll(async () => {
	payload = await testPayload()
	;[admin, otherAdmin, editor, artist] = await Promise.all([
		createAccount('admin'),
		createAccount('admin'),
		createAccount('redaction'),
		createAccount('maquilleuse'),
	])
	talent = (
		await payload.create({
			collection: 'talents',
			data: {
				title: 'Talent fictif',
				slug: `talent-${crypto.randomUUID()}`,
				description: 'Un talent fictif des verrous.',
				content: '## Un talent\n\nUn talent fictif des verrous.\n',
				_status: 'published',
			},
		})
	).id
})

afterAll(async () => {
	await emptyBase()
})

describe('Un verrou porte toujours le compte de la session (ticket 094)', () => {
	test('un admin qui envoie le compte d’un autre admin pose un verrou à son propre nom', async () => {
		const { statut: status, corps } = await callRest('POST', LOCKS, {
			enTetes: admin.session.enTetes,
			corps: { document: { relationTo: 'talents', value: talent }, user: onBehalfOf(otherAdmin) },
		})

		expect(status).toBe(201)
		const id = (corps as { doc: { id: number } }).doc.id
		expect(await holder(id)).toEqual(onBehalfOf(admin))
	})

	test('un compte redaction ne peut pas non plus poser un verrou au nom d’un admin, par REST ni par l’API locale', async () => {
		const user = {
			...(await payload.findByID({ collection: 'admins', id: Number(editor.id), depth: 0 })),
			collection: 'admins' as const,
		}

		const { statut: status, corps } = await callRest('POST', LOCKS, {
			enTetes: editor.session.enTetes,
			corps: { globalSlug: 'verrou-redaction-rest', user: onBehalfOf(admin) },
		})
		const locale = await payload.create({
			collection: 'payload-locked-documents',
			data: { globalSlug: 'verrou-redaction-locale', user: onBehalfOf(admin) },
			overrideAccess: false,
			user: user,
		})

		expect(status).toBe(201)
		expect(await holder((corps as { doc: { id: number } }).doc.id)).toEqual(onBehalfOf(editor))
		expect(await holder(locale.id)).toEqual(onBehalfOf(editor))
	})

	test('la reprise en main du panneau marche : un second admin remplace le titulaire par lui-même', async () => {
		const lock = await payload.create({
			collection: 'payload-locked-documents',
			data: { document: { relationTo: 'talents', value: talent }, user: onBehalfOf(admin) },
		})

		// What the panel sends to take a document over: the lock list, then a PATCH naming the new holder.
		const list = await callRest(
			'GET',
			`${LOCKS}?where[document.relationTo][equals]=talents&where[document.value][equals]=${talent}`,
			{ enTetes: otherAdmin.session.enTetes }
		)
		expect(list.statut).toBe(200)
		expect((list.corps as { docs: { id: number }[] }).docs.map(({ id }) => id)).toContain(lock.id)
		const retry = await callRest('PATCH', `${LOCKS}/${lock.id}`, {
			enTetes: otherAdmin.session.enTetes,
			corps: { user: onBehalfOf(otherAdmin) },
		})

		expect(retry.statut).toBe(200)
		expect(await holder(lock.id)).toEqual(onBehalfOf(otherAdmin))
		// And the lock is released by whoever holds the document.
		expect((await callRest('DELETE', `${LOCKS}/${lock.id}`, { enTetes: otherAdmin.session.enTetes })).statut).toBe(200)
	})

	test('le serveur, sans session, écrit un verrou tel quel (le panneau le pose sans passer par les règles)', async () => {
		const lock = await payload.create({
			collection: 'payload-locked-documents',
			data: { globalSlug: 'verrou-du-serveur', user: onBehalfOf(otherAdmin) },
		})

		expect(await holder(lock.id)).toEqual(onBehalfOf(otherAdmin))
	})
})

describe('Une maquilleuse n’atteint pas les verrous (ticket 094)', () => {
	test('sur une table vide comme pleine : 403 en lecture, en pose, en changement et en retrait', async () => {
		const lock = await payload.create({
			collection: 'payload-locked-documents',
			data: { globalSlug: 'verrou-protege', user: onBehalfOf(admin) },
		})
		const headers = artist.session.enTetes

		const responses = await Promise.all([
			callRest('GET', LOCKS, { enTetes: headers }),
			callRest('GET', `${LOCKS}/${lock.id}`, { enTetes: headers }),
			callRest('POST', LOCKS, { enTetes: headers, corps: { globalSlug: 'intrus', user: onBehalfOf(admin) } }),
			callRest('PATCH', `${LOCKS}/${lock.id}`, { enTetes: headers, corps: { user: onBehalfOf(artist, 'pros') } }),
			callRest('DELETE', `${LOCKS}/${lock.id}`, { enTetes: headers }),
		])

		expect(responses.map(({ statut: status }) => status)).toEqual([403, 403, 403, 403, 403])
		expect(await holder(lock.id)).toEqual(onBehalfOf(admin))
		expect(
			(await payload.count({ collection: 'payload-locked-documents', where: { globalSlug: { equals: 'intrus' } } }))
				.totalDocs
		).toBe(0)
	})

	test('sans session : 403 aussi', async () => {
		expect((await callRest('GET', LOCKS)).statut).toBe(403)
		expect((await callRest('POST', LOCKS, { corps: { globalSlug: 'anonyme', user: onBehalfOf(admin) } })).statut).toBe(
			403
		)
	})
})

/**
 * Saving through REST checks the lock of the document first (`overrideLock` is false there, unlike the
 * Local API). Payload 3.90.2 read the lock outside the transaction of the save: a second connection
 * while the first one is held. With as many saves at once as the pool has connections (5), every save
 * held one and waited for another, for ever, and the whole application stopped answering. Payload is
 * patched (patches/payload@3.90.2.patch): the lock is read in the transaction of the save.
 */
describe('Des enregistrements simultanés par REST ne bloquent pas l’application (CI du 15/10/2026)', () => {
	/** More saves at once than the 5 connections of the pool. */
	const SIMULTANEOUS = 12

	test(`${SIMULTANEOUS} enregistrements à la fois, par l’administration : tous répondent, en quelques secondes`, async () => {
		const talents = await Promise.all(
			Array.from({ length: SIMULTANEOUS }, (_, rang) =>
				payload.create({
					collection: 'talents',
					data: {
						title: `Talent simultané ${rang}`,
						slug: `talent-simultane-${rang}-${crypto.randomUUID()}`,
						description: 'Un talent fictif des enregistrements simultanés.',
						content: '## Un talent\n\nUn talent fictif.\n',
						_status: 'published',
					},
				})
			)
		)
		const records = Promise.all(
			talents.map(({ id }, rang) =>
				callRest('PATCH', `/api/talents/${id}`, {
					enTetes: admin.session.enTetes,
					corps: { description: `Une description changée, la ${rang + 1}e.` },
				}).then(({ statut: status }) => status)
			)
		)
		const blocked = new Promise<'bloqué'>(fin => setTimeout(() => fin('bloqué'), 15_000))

		expect(await Promise.race([records, blocked])).toEqual(Array(SIMULTANEOUS).fill(200))
	}, 30_000)

	test('le verrou d’un autre compte refuse toujours l’enregistrement, et celui du titulaire le laisse passer', async () => {
		const lock = await payload.create({
			collection: 'payload-locked-documents',
			data: { document: { relationTo: 'talents', value: talent }, user: onBehalfOf(otherAdmin) },
		})
		try {
			const refuse = await callRest('PATCH', `/api/talents/${talent}`, {
				enTetes: admin.session.enTetes,
				corps: { description: 'Un enregistrement sur un talent verrouillé par un autre.' },
			})
			expect(refuse.statut).toBe(423)
			const savedHolder = await callRest('PATCH', `/api/talents/${talent}`, {
				enTetes: otherAdmin.session.enTetes,
				corps: { description: 'L’enregistrement du titulaire du verrou.' },
			})
			expect(savedHolder.statut).toBe(200)
		} finally {
			await payload.delete({ collection: 'payload-locked-documents', where: { id: { equals: lock.id } } })
		}
	})
})
