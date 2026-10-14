import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'

/**
 * Payload's document locks, reserved to the accounts of the admin panel (ticket 094). The access
 * matrix (payload-acces.test.ts) plays who may do what; these tests play what it cannot: the lock
 * carries the account of the session, and the panel's own flow (open a document, take it over).
 */

const VERROUS = '/api/payload-locked-documents'

type Compte = Awaited<ReturnType<typeof creerCompte<'admin'>>>

let payload: Payload
let admin: Compte
let autreAdmin: Compte
let redaction: Compte
let maquilleuse: Awaited<ReturnType<typeof creerCompte<'maquilleuse'>>>
let talent: number

const auNomDe = (compte: { id: string | number }, collection = 'admins') => ({
	relationTo: collection,
	value: Number(compte.id),
})

/** The account a lock is in the name of, read in the database. */
async function titulaire(id: number) {
	const verrou = await payload.findByID({ collection: 'payload-locked-documents', id, depth: 0 })
	return verrou.user
}

beforeAll(async () => {
	payload = await payloadDeTest()
	;[admin, autreAdmin, redaction, maquilleuse] = await Promise.all([
		creerCompte('admin'),
		creerCompte('admin'),
		creerCompte('redaction'),
		creerCompte('maquilleuse'),
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
	await viderLaBase()
})

describe('Un verrou porte toujours le compte de la session (ticket 094)', () => {
	test('un admin qui envoie le compte d’un autre admin pose un verrou à son propre nom', async () => {
		const { statut, corps } = await appelerRest('POST', VERROUS, {
			enTetes: admin.session.enTetes,
			corps: { document: { relationTo: 'talents', value: talent }, user: auNomDe(autreAdmin) },
		})

		expect(statut).toBe(201)
		const id = (corps as { doc: { id: number } }).doc.id
		expect(await titulaire(id)).toEqual(auNomDe(admin))
	})

	test('un compte redaction ne peut pas non plus poser un verrou au nom d’un admin, par REST ni par l’API locale', async () => {
		const utilisateur = {
			...(await payload.findByID({ collection: 'admins', id: Number(redaction.id), depth: 0 })),
			collection: 'admins' as const,
		}

		const { statut, corps } = await appelerRest('POST', VERROUS, {
			enTetes: redaction.session.enTetes,
			corps: { globalSlug: 'verrou-redaction-rest', user: auNomDe(admin) },
		})
		const locale = await payload.create({
			collection: 'payload-locked-documents',
			data: { globalSlug: 'verrou-redaction-locale', user: auNomDe(admin) },
			overrideAccess: false,
			user: utilisateur,
		})

		expect(statut).toBe(201)
		expect(await titulaire((corps as { doc: { id: number } }).doc.id)).toEqual(auNomDe(redaction))
		expect(await titulaire(locale.id)).toEqual(auNomDe(redaction))
	})

	test('la reprise en main du panneau marche : un second admin remplace le titulaire par lui-même', async () => {
		const verrou = await payload.create({
			collection: 'payload-locked-documents',
			data: { document: { relationTo: 'talents', value: talent }, user: auNomDe(admin) },
		})

		// What the panel sends to take a document over: the lock list, then a PATCH naming the new holder.
		const liste = await appelerRest(
			'GET',
			`${VERROUS}?where[document.relationTo][equals]=talents&where[document.value][equals]=${talent}`,
			{ enTetes: autreAdmin.session.enTetes }
		)
		expect(liste.statut).toBe(200)
		expect((liste.corps as { docs: { id: number }[] }).docs.map(({ id }) => id)).toContain(verrou.id)
		const reprise = await appelerRest('PATCH', `${VERROUS}/${verrou.id}`, {
			enTetes: autreAdmin.session.enTetes,
			corps: { user: auNomDe(autreAdmin) },
		})

		expect(reprise.statut).toBe(200)
		expect(await titulaire(verrou.id)).toEqual(auNomDe(autreAdmin))
		// And the lock is released by whoever holds the document.
		expect(
			(await appelerRest('DELETE', `${VERROUS}/${verrou.id}`, { enTetes: autreAdmin.session.enTetes })).statut
		).toBe(200)
	})

	test('le serveur, sans session, écrit un verrou tel quel (le panneau le pose sans passer par les règles)', async () => {
		const verrou = await payload.create({
			collection: 'payload-locked-documents',
			data: { globalSlug: 'verrou-du-serveur', user: auNomDe(autreAdmin) },
		})

		expect(await titulaire(verrou.id)).toEqual(auNomDe(autreAdmin))
	})
})

describe('Une maquilleuse n’atteint pas les verrous (ticket 094)', () => {
	test('sur une table vide comme pleine : 403 en lecture, en pose, en changement et en retrait', async () => {
		const verrou = await payload.create({
			collection: 'payload-locked-documents',
			data: { globalSlug: 'verrou-protege', user: auNomDe(admin) },
		})
		const enTetes = maquilleuse.session.enTetes

		const reponses = await Promise.all([
			appelerRest('GET', VERROUS, { enTetes }),
			appelerRest('GET', `${VERROUS}/${verrou.id}`, { enTetes }),
			appelerRest('POST', VERROUS, { enTetes, corps: { globalSlug: 'intrus', user: auNomDe(admin) } }),
			appelerRest('PATCH', `${VERROUS}/${verrou.id}`, { enTetes, corps: { user: auNomDe(maquilleuse, 'pros') } }),
			appelerRest('DELETE', `${VERROUS}/${verrou.id}`, { enTetes }),
		])

		expect(reponses.map(({ statut }) => statut)).toEqual([403, 403, 403, 403, 403])
		expect(await titulaire(verrou.id)).toEqual(auNomDe(admin))
		expect(
			(await payload.count({ collection: 'payload-locked-documents', where: { globalSlug: { equals: 'intrus' } } }))
				.totalDocs
		).toBe(0)
	})

	test('sans session : 403 aussi', async () => {
		expect((await appelerRest('GET', VERROUS)).statut).toBe(403)
		expect(
			(await appelerRest('POST', VERROUS, { corps: { globalSlug: 'anonyme', user: auNomDe(admin) } })).statut
		).toBe(403)
	})
})
