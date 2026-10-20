import { afterAll, describe, expect, test } from 'bun:test'
import { compterLesDocuments, compterLesLignes, payloadDeTest, viderLaBase } from '../support/payload-test'

/** A made-up account document: the skeleton has no other collection to write in yet. */
const compteFictif = (nom: string) => ({
	email: `${nom}-${crypto.randomUUID()}@example.test`,
	password: crypto.randomUUID(),
	role: 'admin' as const,
})

describe('Test coquille : Payload écrit dans la base du banc, puis la remet à zéro', () => {
	afterAll(viderLaBase)

	test('crée un document, le relit, vide la base', async () => {
		const payload = await payloadDeTest()
		const donnees = compteFictif('coquille')

		const cree = await payload.create({ collection: 'admins', data: donnees })
		const relu = await payload.findByID({ collection: 'admins', id: cree.id })

		expect(relu.email).toBe(donnees.email)
		expect(relu.id).toBe(cree.id)

		await viderLaBase()

		expect((await payload.find({ collection: 'admins' })).totalDocs).toBe(0)
	})

	test('après remise à zéro, toutes les collections sont vides, et les tables qu’elles cachent aussi', async () => {
		const payload = await payloadDeTest()
		// Something in every table a run can leave rows in: an account and its session, a
		// preference, a lock on a document, a stored key.
		const donnees = compteFictif('remise-a-zero')
		const compte = await payload.create({ collection: 'admins', data: donnees })
		const proprietaire = { relationTo: 'admins', value: compte.id } as const
		await payload.login({ collection: 'admins', data: donnees })
		await payload.create({
			collection: 'payload-preferences',
			data: { key: 'banc', user: proprietaire, value: { vu: true } },
			// A preference belongs to whoever asks for it: Payload reads its owner from the request.
			user: { ...compte, collection: 'admins' },
		})
		await payload.create({
			collection: 'payload-locked-documents',
			data: { document: proprietaire, user: proprietaire },
		})
		await payload.create({ collection: 'payload-kv', data: { key: 'banc', data: { vu: true } } })

		const avant = await compterLesLignes()
		expect(Object.values(avant).filter(lignes => lignes > 0).length).toBeGreaterThanOrEqual(5)

		await viderLaBase()

		const documents = await compterLesDocuments()
		expect(Object.keys(documents)).toContain('admins')
		// Every collection of the configuration but the bookkeeping of the migrations.
		expect(Object.keys(documents).length).toBe(payload.config.collections.length - 1)
		expect(Object.entries(documents).filter(([, compte]) => compte !== 0)).toEqual([])
		expect(Object.entries(await compterLesLignes()).filter(([, lignes]) => lignes !== 0)).toEqual([])
	})

	test('après remise à zéro, la base repart comme neuve : les identifiants reprennent à 1, le schéma est intact', async () => {
		const payload = await payloadDeTest()
		await payload.create({ collection: 'admins', data: compteFictif('avant') })
		await viderLaBase()

		const premier = await payload.create({ collection: 'admins', data: compteFictif('apres') })

		expect(premier.id).toBe(1)
		// Payload still knows its schema: the line it keeps about it survived the reset.
		const { rows } = await payload.db.pool.query('SELECT name FROM payload_migrations')
		expect(rows.length).toBeGreaterThan(0)
	})

	test('une seconde remise à zéro sur une base déjà vide ne fait rien', async () => {
		await viderLaBase()
		await viderLaBase()

		expect(Object.values(await compterLesDocuments()).every(compte => compte === 0)).toBe(true)
	})
})
