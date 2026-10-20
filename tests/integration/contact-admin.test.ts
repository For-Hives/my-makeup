import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { payloadStorage } from '@/lib/contact/payload-send'
import { serverEnv } from '@/lib/env'
import { createAccount } from '../support/account-factory'
import { emptySink, mailReceived } from '../support/mailpit'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

/**
 * The admin side of the contact messages (ticket 163; plan 02 E58, in its server half): the status
 * cycle kept by the collection, and the re-send of a mail in `echec`, once however many clicks. The
 * panel itself, in a browser: tests/e2e/admin-messages-contact.spec.ts. The access of every role is in
 * the matrix (tests/integration/payload-acces.test.ts).
 */

beforeAll(emptySink)
afterAll(async () => {
	await Promise.all([emptyBase(), emptySink()])
})

const unique = () => `visiteuse-${crypto.randomUUID()}@example.test`

/** A stored message, the way the form stores it. `failed`: its mail did not leave. */
async function messageEnBase(etatMail: 'failed' | 'sent' = 'failed') {
	const payload = await testPayload()
	const stockage = payloadStorage(payload)
	const email = unique()
	const id = await stockage.creer({
		prenom: 'Léa',
		nom: 'Témoin',
		email,
		telephone: '01 99 00 12 34',
		message: 'Bonjour, une question sur le site.',
	})
	await stockage.marquer(id, etatMail)
	return { id, email, payload }
}

const mailsPour = async (email: string) =>
	(await mailReceived(serverEnv().contactTo)).filter(mail => mail.repondreA.some(({ adresse }) => adresse === email))

describe('Le cycle des statuts, tenu par la collection', () => {
	test('un admin marque un message répondu, puis spam ; il ne revient pas de « répondue » à « transmise »', async () => {
		const { id } = await messageEnBase('sent')
		const { session } = await createAccount('admin')
		const enTetes = session.enTetes
		const statut = async () =>
			((await (await testPayload()).findByID({ collection: 'contact-requests', id, depth: 0 })) as { status: string })
				.status

		expect(
			(await callRest('PATCH', `/api/contact-requests/${id}`, { enTetes, corps: { status: 'answered' } })).statut
		).toBe(200)
		expect(await statut()).toBe('answered')

		const refus = await callRest('PATCH', `/api/contact-requests/${id}`, { enTetes, corps: { status: 'forwarded' } })
		expect(refus.statut).toBe(400)
		expect(refus.texte).toContain('ne peut pas passer à')
		expect(await statut()).toBe('answered')

		expect(
			(await callRest('PATCH', `/api/contact-requests/${id}`, { enTetes, corps: { status: 'spam' } })).statut
		).toBe(200)
		expect(await statut()).toBe('spam')
	})

	test('un admin ne réécrit pas la date de réception, ni ne dit « transmise » pour un email en échec', async () => {
		const { id, payload } = await messageEnBase('failed')
		const { session } = await createAccount('admin')
		const enTetes = session.enTetes
		const avant = (await payload.findByID({ collection: 'contact-requests', id, depth: 0 })).createdAt

		const date = await callRest('PATCH', `/api/contact-requests/${id}`, {
			enTetes,
			corps: { createdAt: '2000-01-01T00:00:00.000Z', status: 'answered' },
		})
		expect(date.statut).toBe(200)
		const apres = await payload.findByID({ collection: 'contact-requests', id, depth: 0 })
		expect(apres.createdAt).toBe(avant)
		expect(apres.status).toBe('answered')

		const autre = await messageEnBase('failed')
		const refus = await callRest('PATCH', `/api/contact-requests/${autre.id}`, {
			enTetes,
			corps: { status: 'forwarded' },
		})
		expect(refus.statut).toBe(400)
		expect(refus.texte).toContain('que lorsque son email est parti')
		expect(await autre.payload.findByID({ collection: 'contact-requests', id: autre.id, depth: 0 })).toMatchObject({
			status: 'new',
			mailStatus: 'failed',
		})
	})

	test('un « le mail est parti » tardif du serveur ne ramène pas un message répondu à « transmise »', async () => {
		const { id, payload } = await messageEnBase('failed')
		const { session } = await createAccount('admin')
		await callRest('PATCH', `/api/contact-requests/${id}`, {
			enTetes: session.enTetes,
			corps: { status: 'answered' },
		})

		await payloadStorage(payload).marquer(id, 'sent', 'forwarded')

		const ligne = await payload.findByID({ collection: 'contact-requests', id, depth: 0 })
		expect(ligne).toMatchObject({ status: 'answered', mailStatus: 'sent' })
	})
})

describe('E58 (côté serveur) : le renvoi de l’email d’un message en échec', () => {
	test('l’admin renvoie : un mail vers l’équipe, réponse vers la visiteuse, la ligne passe à envoyé et transmise', async () => {
		const { id, email, payload } = await messageEnBase('failed')
		const { session } = await createAccount('admin')

		const reponse = await callRest('POST', `/api/contact-requests/${id}/resend`, { enTetes: session.enTetes })

		expect(reponse.statut).toBe(200)
		expect(reponse.corps).toEqual({ mailStatus: 'sent' })
		const mails = await mailsPour(email)
		expect(mails).toHaveLength(1)
		expect(mails[0]?.sujet).toBe('Nouveau message de contact')
		expect(mails[0]?.texte).toContain('une question sur le site.')
		expect(await payload.findByID({ collection: 'contact-requests', id, depth: 0 })).toMatchObject({
			status: 'forwarded',
			mailStatus: 'sent',
		})
	})

	test('double clic : deux demandes en même temps, un seul email, l’autre apprend que le message n’est plus en échec', async () => {
		const { id, email } = await messageEnBase('failed')
		const { session } = await createAccount('admin')

		const [a, b] = await Promise.all([
			callRest('POST', `/api/contact-requests/${id}/resend`, { enTetes: session.enTetes }),
			callRest('POST', `/api/contact-requests/${id}/resend`, { enTetes: session.enTetes }),
		])

		expect([a.statut, b.statut].sort()).toEqual([200, 409])
		expect(await mailsPour(email)).toHaveLength(1)
		// A click that comes later still sends nothing.
		expect((await callRest('POST', `/api/contact-requests/${id}/resend`, { enTetes: session.enTetes })).statut).toBe(
			409
		)
		expect(await mailsPour(email)).toHaveLength(1)
	})

	test('un message dont l’email est déjà parti ne repart pas ; un message inconnu répond 404', async () => {
		const { id, email } = await messageEnBase('sent')
		const { session } = await createAccount('admin')

		expect((await callRest('POST', `/api/contact-requests/${id}/resend`, { enTetes: session.enTetes })).statut).toBe(
			409
		)
		expect(
			(await callRest('POST', `/api/contact-requests/${id + 100000}/resend`, { enTetes: session.enTetes })).statut
		).toBe(404)
		expect((await callRest('POST', '/api/contact-requests/abc/resend', { enTetes: session.enTetes })).statut).toBe(404)
		expect(await mailsPour(email)).toEqual([])
	})

	test('ni la rédaction, ni une maquilleuse, ni un visiteur ne renvoient : 403, aucun mail', async () => {
		const { id, email } = await messageEnBase('failed')
		const [redaction, maquilleuse] = await Promise.all([createAccount('redaction'), createAccount('maquilleuse')])

		for (const enTetes of [redaction.session.enTetes, maquilleuse.session.enTetes, undefined])
			expect((await callRest('POST', `/api/contact-requests/${id}/resend`, enTetes ? { enTetes } : {})).statut).toBe(
				403
			)

		expect(await mailsPour(email)).toEqual([])
		const ligne = await (await testPayload()).findByID({ collection: 'contact-requests', id, depth: 0 })
		expect(ligne.mailStatus).toBe('failed')
	})
})
