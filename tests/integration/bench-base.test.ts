import { afterAll, describe, expect, test } from 'bun:test'
import { countDocuments, countLines, emptyBase, testPayload } from '../support/payload-test'

/** A made-up account document: the skeleton has no other collection to write in yet. */
const fictionalAccount = (nom: string) => ({
	email: `${nom}-${crypto.randomUUID()}@example.test`,
	password: crypto.randomUUID(),
	role: 'admin' as const,
})

describe('Test coquille : Payload écrit dans la base du banc, puis la remet à zéro', () => {
	afterAll(emptyBase)

	test('crée un document, le relit, vide la base', async () => {
		const payload = await testPayload()
		const data = fictionalAccount('coquille')

		const created = await payload.create({ collection: 'admins', data: data })
		const reread = await payload.findByID({ collection: 'admins', id: created.id })

		expect(reread.email).toBe(data.email)
		expect(reread.id).toBe(created.id)

		await emptyBase()

		expect((await payload.find({ collection: 'admins' })).totalDocs).toBe(0)
	})

	test('après remise à zéro, toutes les collections sont vides, et les tables qu’elles cachent aussi', async () => {
		const payload = await testPayload()
		// Something in every table a run can leave rows in: an account and its session, a
		// preference, a lock on a document, a stored key.
		const data = fictionalAccount('remise-a-zero')
		const account = await payload.create({ collection: 'admins', data: data })
		const owner = { relationTo: 'admins', value: account.id } as const
		await payload.login({ collection: 'admins', data: data })
		await payload.create({
			collection: 'payload-preferences',
			data: { key: 'banc', user: owner, value: { vu: true } },
			// A preference belongs to whoever asks for it: Payload reads its owner from the request.
			user: { ...account, collection: 'admins' },
		})
		await payload.create({
			collection: 'payload-locked-documents',
			data: { document: owner, user: owner },
		})
		await payload.create({ collection: 'payload-kv', data: { key: 'banc', data: { vu: true } } })

		const before = await countLines()
		expect(Object.values(before).filter(lignes => lignes > 0).length).toBeGreaterThanOrEqual(5)

		await emptyBase()

		const documents = await countDocuments()
		expect(Object.keys(documents)).toContain('admins')
		// Every collection of the configuration but the bookkeeping of the migrations.
		expect(Object.keys(documents).length).toBe(payload.config.collections.length - 1)
		expect(Object.entries(documents).filter(([, account]) => account !== 0)).toEqual([])
		expect(Object.entries(await countLines()).filter(([, lignes]) => lignes !== 0)).toEqual([])
	})

	test('après remise à zéro, la base repart comme neuve : les identifiants reprennent à 1, le schéma est intact', async () => {
		const payload = await testPayload()
		await payload.create({ collection: 'admins', data: fictionalAccount('avant') })
		await emptyBase()

		const first = await payload.create({ collection: 'admins', data: fictionalAccount('apres') })

		expect(first.id).toBe(1)
		// Payload still knows its schema: the line it keeps about it survived the reset.
		const { rows } = await payload.db.pool.query('SELECT name FROM payload_migrations')
		expect(rows.length).toBeGreaterThan(0)
	})

	test('une seconde remise à zéro sur une base déjà vide ne fait rien', async () => {
		await emptyBase()
		await emptyBase()

		expect(Object.values(await countDocuments()).every(compte => compte === 0)).toBe(true)
	})
})
